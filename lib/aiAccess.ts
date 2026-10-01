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

// ─── IA do FEEDBACK SEMANAL ───────────────────────────────────────────────────────────────────────
// A saudação/reescrita/perguntas abertas do Haiku (lib/weeklyAI.ts) só entram para os alunos de coach do TIME MASTER ou do plano ELITE.
// Os demais (PERSONAL e NUTRICIONISTA) recebem as MESMAS perguntas montadas por regras (dados da semana + anamnese), sem custo de IA.
// (O "colar a resposta do WhatsApp" não passa por aqui: continua liberado pra todo coach, só roda quando ele pede.)
export const FEEDBACK_AI_EXTRA_IDS: string[] = [];
export const FEEDBACK_AI_PLANS = ['ELITE'];

const feedbackAiCache = new Map<string, { ok: boolean; until: number }>();
const FEEDBACK_AI_TTL_MS = 60_000;

/** O coach (dono do aluno) tem direito à IA do feedback semanal? `db` = prisma. Guarda a resposta por 1 min (o cron consulta por aluno). */
export async function feedbackAiAllowed(db: any, coachId: string | null | undefined): Promise<boolean> {
  if (!coachId) return false;
  if (isMasterId(coachId) || FEEDBACK_AI_EXTRA_IDS.includes(coachId)) return true;
  const hit = feedbackAiCache.get(coachId);
  if (hit && hit.until > Date.now()) return hit.ok;
  let ok = false;
  try {
    const row = await db.user.findUnique({ where: { id: coachId }, select: { coachPlan: true, accountStatus: true } });
    ok = !!row && FEEDBACK_AI_PLANS.includes(String(row.coachPlan || '')) && (!row.accountStatus || row.accountStatus === 'ACTIVE');
  } catch { ok = false; }   // na dúvida, sem IA (as perguntas por regras funcionam igual)
  feedbackAiCache.set(coachId, { ok, until: Date.now() + FEEDBACK_AI_TTL_MS });
  return ok;
}

/** Opções da IA do feedback pro aluno desse coach: as pedidas, ou `false` (sem IA) quando o plano do coach não inclui. */
export async function feedbackAiOptions<T extends object>(db: any, coachId: string | null | undefined, options: T): Promise<T | false> {
  return (await feedbackAiAllowed(db, coachId)) ? options : false;
}

/** Só pros testes: esquece o que foi guardado. */
export const resetFeedbackAiCache = () => feedbackAiCache.clear();
