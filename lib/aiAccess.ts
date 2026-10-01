// lib/aiAccess.ts
// 🔒 (1 out 2026) Quem pode usar o quê entre os recursos de IA do coach.
//
//   - MONTAGEM POR IA (gerar treino, gerar dieta, protocolo de corrida): só o TIME MASTER (Paulo/Adri). Coach parceiro não usa: é o que mais custa
//     (modelos grandes, respostas longas) e não entra na mensalidade do parceiro.
//   - CRIAÇÃO POR VOZ (treino e dieta): liberada pra todo coach ativo (ADMIN/COACH). É o coach quem dita e confere; a IA só transcreve e organiza.
//
// A trava é aqui no servidor (o botão some no app, mas quem manda é o servidor). Pra liberar a montagem por IA a um parceiro específico no futuro,
// é só incluir o id dele em AI_BUILDER_EXTRA_IDS (e no src/constants/aiAccess.js do app, pra o botão aparecer).
import { NextResponse } from 'next/server';
import { isMasterId, type AuthUser } from '@/lib/auth';

export const AI_BUILDER_EXTRA_IDS: string[] = [];
export const AI_BUILDER_LOCKED_MESSAGE = 'A montagem por IA é exclusiva do time master. Use a criação por voz ou monte manualmente.';

export const canUseAiBuilder = (user: AuthUser | null | undefined) => !!user && (isMasterId(user.id) || AI_BUILDER_EXTRA_IDS.includes(user.id));

/** 403 padrão das rotas de montagem por IA (o app reconhece pelo `code`). */
export const aiBuilderLocked = () => NextResponse.json({ error: AI_BUILDER_LOCKED_MESSAGE, code: 'AI_BUILDER_LOCKED' }, { status: 403 });

/**
 * O usuário pode usar recursos de coach (ex.: criação por voz)? ADMIN (inclui master) ou COACH com conta ativa.
 * Aluno, coach pausado/excluído e usuário que não existe mais ficam de fora. `db` = prisma.
 */
export async function isActiveCoach(db: any, user: AuthUser | null | undefined): Promise<boolean> {
  if (!user) return false;
  if (isMasterId(user.id)) return true;
  let row: any = null;
  try { row = await db.user.findUnique({ where: { id: user.id }, select: { role: true, accountStatus: true, active: true } }); }
  catch { return false; }   // na dúvida (banco fora do ar), nega
  if (!row) return false;
  if (row.role === 'ADMIN') return row.active !== false;
  return row.role === 'COACH' && row.accountStatus === 'ACTIVE' && row.active !== false;
}

export const coachOnly = () => NextResponse.json({ error: 'Recurso disponível apenas para coaches com a conta ativa.', code: 'COACH_ONLY' }, { status: 403 });
