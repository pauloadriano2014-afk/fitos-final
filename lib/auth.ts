// lib/auth.ts
// 🔐 Autenticação real via token assinado (JWT) — criada em 27 ago 2026 pra
// fechar o buraco onde toda rota confiava cegamente em coachId/userId/adminId
// vindos do próprio corpo/query da requisição, sem verificar nada no servidor.
//
// A partir de agora, o login (auth/login/route.ts) assina um token e devolve
// junto do `user`. O app deve guardar esse token e mandar em toda chamada
// sensível no header:
//     Authorization: Bearer <token>
//
// As rotas usam getAuthUser()/requireAuth()/requireMaster() abaixo pra saber
// quem está chamando de verdade, em vez de confiar em `adminId`/`coachId` do
// body — que qualquer cliente pode forjar.
import jwt from 'jsonwebtoken';
import { NextResponse } from 'next/server';
import { MASTER_IDS } from './masterIds';

// ⚠️ Em produção isso PRECISA vir de uma env var (JWT_SECRET) configurada no
// Render — sem isso, qualquer um que leia o código-fonte consegue forjar
// tokens válidos. O valor abaixo é só um fallback pra não quebrar localmente
// se alguém esquecer de configurar em dev.
const JWT_SECRET = process.env.JWT_SECRET || 'dev-only-troque-isso-configurando-JWT_SECRET-no-env';

if (!process.env.JWT_SECRET) {
  console.error('[auth] ⚠️ JWT_SECRET não está configurado no ambiente — defina essa variável no Render (e no .env local) com um valor aleatório longo e único.');
}

export type AuthUser = {
  id: string;
  role: string;
  coachId: string | null;
};

// Assina um token pro usuário autenticado. Chamado só no login.
export function signAuthToken(user: AuthUser): string {
  return jwt.sign(user, JWT_SECRET, { expiresIn: '180d' });
}

// Lê e verifica o header Authorization de uma requisição. Retorna null se não
// houver token, ou se o token for inválido/expirado/forjado.
export function getAuthUser(req: Request): AuthUser | null {
  try {
    const header = req.headers.get('authorization') || req.headers.get('Authorization') || '';
    if (!header.startsWith('Bearer ')) return null;
    const token = header.slice('Bearer '.length).trim();
    if (!token) return null;
    const decoded = jwt.verify(token, JWT_SECRET) as any;
    if (!decoded?.id) return null;
    return { id: decoded.id, role: decoded.role, coachId: decoded.coachId ?? null };
  } catch {
    return null;
  }
}

export function isMasterId(id: string | null | undefined): boolean {
  return !!id && MASTER_IDS.includes(id);
}

// true se quem chamou pode agir sobre o coach-alvo: é o próprio coach, ou é
// do time master (Paulo/Adri sempre têm passe livre).
export function canActAsCoach(authUser: AuthUser | null, targetCoachId: string | null | undefined): boolean {
  if (!authUser || !targetCoachId) return false;
  return authUser.id === targetCoachId || isMasterId(authUser.id);
}

// true se quem chamou pode ver/mexer nos dados de um ALUNO específico:
// é o próprio aluno, é o coach dono desse aluno, ou é do time master.
// Use quando a rota lida com dado de um userId específico (dieta, treino,
// check-in, corrida, anamnese, etc.) — targetCoachId é o coachId do aluno
// alvo (não o coachId de quem está chamando).
export function canAccessStudent(
  authUser: AuthUser | null,
  targetUserId: string | null | undefined,
  targetCoachId?: string | null
): boolean {
  if (!authUser || !targetUserId) return false;
  if (authUser.id === targetUserId) return true;
  if (isMasterId(authUser.id)) return true;
  if (targetCoachId && authUser.id === targetCoachId) return true;
  return false;
}

// Exige um token válido. Uso:
//   const auth = requireAuth(req);
//   if ('response' in auth) return auth.response;
//   const authUser = auth.user;
export function requireAuth(req: Request): { user: AuthUser } | { response: NextResponse } {
  const user = getAuthUser(req);
  if (!user) {
    return { response: NextResponse.json({ error: 'Não autenticado. Faça login novamente.' }, { status: 401 }) };
  }
  return { user };
}

// Exige um token válido E que o usuário seja Paulo ou Adri.
export function requireMaster(req: Request): { user: AuthUser } | { response: NextResponse } {
  const auth = requireAuth(req);
  if ('response' in auth) return auth;
  if (!isMasterId(auth.user.id)) {
    return { response: NextResponse.json({ error: 'Acesso restrito ao time master.' }, { status: 403 }) };
  }
  return { user: auth.user };
}
