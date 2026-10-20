// lib/coachAi.ts
// 🤖 (20 out 2026) MONTAGEM POR IA para o COACH PARCEIRO: liberada pelo master, coach a coach (chaves `iaTreino` e `iaDieta`, ver lib/coachFeatures.ts), com LIMITE MENSAL e regras de qualidade.
// O time master (Paulo/Adri) não tem limite nem checagem. Tudo aqui é puro ou recebe o `db` (Prisma) por parâmetro, para testar sem banco.
//
//   • Quem pode: coach com a conta ativa + chave ligada + o tipo de coach cobre o assunto (Personal não monta dieta; Nutri não monta treino; Elite os dois).
//   • Limite mensal (mês de Brasília), contado no AiLog do próprio coach: treino = `gerar-treino:<motor>`, dieta = `gerar-dieta:<motor>` (uma linha por ABA de dieta gerada).
//     Geração que falhou (`:falhou`) e a que usa a chave OpenAI do próprio coach (`:OWN_KEY`) NÃO contam. Padrão: 30 treinos e 60 abas de dieta por mês;
//     troca sem mexer no código com as variáveis COACH_AI_LIMIT_TREINO e COACH_AI_LIMIT_DIETA no Render.
//   • Motor: o coach parceiro só usa o mais barato (Gemini Flash no treino, Google na dieta). Modelos caros continuam do master (a trava está nas rotas e em lib/ai/workoutGen.ts).
//   • Qualidade: antes de gerar, `workoutReadiness`/`dietReadiness` apontam o que impede (bloqueia) e o que merece atenção (avisa). O app mostra isso como "ANTES DE GERAR".
import { NextResponse } from 'next/server';
import { isMasterId, type AuthUser } from '@/lib/auth';
import { coachHasFeature, type FeatureKey } from '@/lib/coachFeatures';
import { AI_BUILDER_EXTRA_IDS, isActiveCoach } from '@/lib/aiAccess';

export type AiKind = 'treino' | 'dieta';
export const AI_FEATURE: Record<AiKind, FeatureKey> = { treino: 'iaTreino', dieta: 'iaDieta' };
export const AI_LOG_PREFIX: Record<AiKind, string> = { treino: 'gerar-treino:', dieta: 'gerar-dieta:' };
export const DEFAULT_LIMITS: Record<AiKind, number> = { treino: 30, dieta: 60 };
export const KIND_LABEL: Record<AiKind, string> = { treino: 'treinos', dieta: 'dietas (abas)' };

const num = (v: unknown, fallback: number) => { const n = Number(v); return Number.isFinite(n) && n >= 0 ? Math.floor(n) : fallback; };

/** Limite mensal do coach. Personal só treino, Nutri só dieta, Elite os dois (0 = o plano dele não inclui). */
export function limitsFor(coachPlan: string | null | undefined, env: Record<string, string | undefined> = process.env): Record<AiKind, number> {
  const t = num(env.COACH_AI_LIMIT_TREINO, DEFAULT_LIMITS.treino), d = num(env.COACH_AI_LIMIT_DIETA, DEFAULT_LIMITS.dieta);
  switch (String(coachPlan ?? 'PERSONAL').toUpperCase()) {
    case 'NUTRICIONISTA': return { treino: 0, dieta: d };
    case 'ELITE': return { treino: t, dieta: d };
    default: return { treino: t, dieta: 0 };
  }
}

export const PLAN_NAME: Record<string, string> = { PERSONAL: 'Personal', NUTRICIONISTA: 'Nutri', ELITE: 'Elite' };

/** Primeiro instante do mês em Brasília (UTC-3, sem horário de verão), como Date. */
export function monthStartBR(now: Date = new Date()): Date {
  const br = new Date(now.getTime() - 3 * 3600 * 1000);
  return new Date(Date.UTC(br.getUTCFullYear(), br.getUTCMonth(), 1, 3, 0, 0));
}
export function nextMonthStartBR(now: Date = new Date()): Date {
  const br = new Date(now.getTime() - 3 * 3600 * 1000);
  return new Date(Date.UTC(br.getUTCFullYear(), br.getUTCMonth() + 1, 1, 3, 0, 0));
}
const dm = (d: Date) => { const b = new Date(d.getTime() - 3 * 3600 * 1000); return `${String(b.getUTCDate()).padStart(2, '0')}/${String(b.getUTCMonth() + 1).padStart(2, '0')}`; };

/** Quantas gerações do mês já foram usadas (só as que deram certo e usaram a IA do servidor). */
export async function countUsage(db: any, coachId: string, kind: AiKind, now: Date = new Date()): Promise<number> {
  try {
    return await db.aiLog.count({
      where: {
        userId: coachId,
        createdAt: { gte: monthStartBR(now) },
        question: { startsWith: AI_LOG_PREFIX[kind] },
        NOT: [{ question: { endsWith: ':falhou' } }, { question: { endsWith: ':OWN_KEY' } }],
      },
    });
  } catch { return 0; }
}

export interface AiUsage { used: number; limit: number; left: number; resetsAt: string; resetsOn: string }

export type AiGate =
  | { ok: true; master: boolean; usage: AiUsage | null }
  | { ok: false; status: number; body: { error: string; code: string; used?: number; limit?: number; resetsAt?: string } };

/** Pode este usuário gerar `kind` por IA agora? (não conta a geração: quem conta é o AiLog gravado pela própria rota ao terminar.) */
export async function checkCoachAi(db: any, user: AuthUser | null | undefined, kind: AiKind, now: Date = new Date()): Promise<AiGate> {
  if (!user) return { ok: false, status: 401, body: { error: 'Não autenticado.', code: 'NO_AUTH' } };
  if (isMasterId(user.id)) return { ok: true, master: true, usage: null };
  if (AI_BUILDER_EXTRA_IDS.includes(user.id)) return { ok: true, master: true, usage: null };   // exceção antiga, por id, sem limite (lista vazia hoje)
  if (!(await isActiveCoach(db, user))) return { ok: false, status: 403, body: { error: 'Recurso disponível apenas para coaches com a conta ativa.', code: 'COACH_ONLY' } };
  if (!(await coachHasFeature(db, user.id, AI_FEATURE[kind]))) {
    return { ok: false, status: 403, body: { error: `A montagem de ${kind === 'treino' ? 'treino' : 'dieta'} por IA ainda não está liberada para a sua conta. Fale com a equipe PA Elite.`, code: 'AI_BUILDER_LOCKED' } };
  }
  let plan: string | null = 'PERSONAL';
  try { const row: any = await db.user.findUnique({ where: { id: user.id }, select: { coachPlan: true } }); plan = row?.coachPlan ?? 'PERSONAL'; } catch { /* fica Personal */ }
  const limit = limitsFor(plan)[kind];
  if (limit <= 0) {
    const name = PLAN_NAME[String(plan).toUpperCase()] || 'atual';
    return { ok: false, status: 403, body: { error: `O seu plano (${name}) não inclui ${kind === 'treino' ? 'treino' : 'dieta'} por IA.`, code: 'AI_NOT_IN_PLAN' } };
  }
  const used = await countUsage(db, user.id, kind, now);
  const reset = nextMonthStartBR(now);
  const usage: AiUsage = { used, limit, left: Math.max(0, limit - used), resetsAt: reset.toISOString(), resetsOn: dm(reset) };
  if (used >= limit) {
    return { ok: false, status: 429, body: { error: `Você usou os ${limit} ${KIND_LABEL[kind]} por IA deste mês. Volta a liberar em ${usage.resetsOn}. Monte à mão ou por voz enquanto isso.`, code: 'AI_QUOTA', used, limit, resetsAt: usage.resetsAt } };
  }
  return { ok: true, master: false, usage };
}

export const gateResponse = (g: Extract<AiGate, { ok: false }>) => NextResponse.json(g.body, { status: g.status });

// ─── PRONTIDÃO: o que conferir ANTES de gerar ─────────────────────────────────────────────────────────────────────────
export interface Readiness { ok: boolean; blockers: string[]; warnings: string[] }
const arr = (v: any): any[] => (Array.isArray(v) ? v : []);
const filled = (v: any) => (typeof v === 'string' ? v.trim().length > 0 : Array.isArray(v) ? v.length > 0 : v != null);
const MIN_LIBRARY = 20, GOOD_LIBRARY = 60;

/** Altura vem em cm (175) ou em metros (1.75): aceita as duas. */
const heightOk = (h: any) => { const n = Number(h); return (n >= 1.0 && n <= 2.5) || (n >= 100 && n <= 250); };
const weightOk = (w: any) => { const n = Number(w); return n >= 30 && n <= 300; };

export function workoutReadiness(i: { anamnese: any | null; libraryCount: number; hasPreviousWorkout?: boolean }): Readiness {
  const blockers: string[] = [], warnings: string[] = [];
  const a = i.anamnese;
  if (!a) blockers.push('O aluno ainda não respondeu a anamnese. Sem ela a IA monta um treino genérico: peça para ele preencher (ou preencha por ele) antes de gerar.');
  else {
    if (!weightOk(a.peso) || !heightOk(a.altura)) blockers.push('Peso ou altura do aluno estão faltando ou parecem errados na anamnese. Corrija antes de gerar.');
    if (!filled(a.objetivo)) blockers.push('A anamnese não tem o objetivo do aluno. Sem ele a IA não sabe se é emagrecimento, hipertrofia ou saúde.');
    if (!filled(a.nivel)) warnings.push('Nível de treino não informado: a IA vai assumir iniciante.');
    if (arr(a.limitacoes).length || arr(a.cirurgias).length) warnings.push('O aluno tem limitações ou cirurgias na anamnese. Confira cada exercício do rascunho antes de salvar.');
    if (!arr(a.equipamentos).length && !arr(a.equipamentosCasa).length) warnings.push('Nenhum equipamento informado na anamnese: confira se os exercícios cabem no local de treino.');
  }
  if (i.libraryCount < MIN_LIBRARY) blockers.push(`A sua biblioteca tem só ${i.libraryCount} exercícios. A IA só escolhe entre eles: cadastre ou importe pelo menos ${MIN_LIBRARY} (o ideal é ${GOOD_LIBRARY}+).`);
  else if (i.libraryCount < GOOD_LIBRARY) warnings.push(`A sua biblioteca tem ${i.libraryCount} exercícios. Com menos de ${GOOD_LIBRARY} o treino pode repetir muito os mesmos.`);
  if (i.hasPreviousWorkout === false) warnings.push('É o primeiro treino do aluno: comece com cargas leves e confira o volume.');
  return { ok: blockers.length === 0, blockers, warnings };
}

export function dietReadiness(a: any | null): Readiness {
  const blockers: string[] = [], warnings: string[] = [];
  if (!a) { blockers.push('O aluno ainda não respondeu a anamnese. A dieta precisa do peso, da altura, do objetivo e da rotina dele.'); return { ok: false, blockers, warnings }; }
  if (!weightOk(a.peso) || !heightOk(a.altura)) blockers.push('Peso ou altura do aluno estão faltando ou parecem errados na anamnese. As calorias e os macros saem desses dois números: corrija antes de gerar.');
  if (!filled(a.objetivo)) blockers.push('A anamnese não tem o objetivo do aluno (emagrecer, ganhar massa, manter). A meta de calorias depende dele.');
  if (!(Number(a.mealsPerDay) > 0)) warnings.push('Não consta quantas refeições o aluno faz por dia: a IA vai escolher sozinha.');
  if (!filled(a.wakeUpTime) || !filled(a.sleepTime)) warnings.push('Faltam os horários de acordar e dormir: os horários das refeições podem ficar fora da rotina dele.');
  if (!filled(a.foodAversions) && !filled(a.foodPreferences) && !arr(a.favoriteFoodIds).length) warnings.push('O aluno não disse o que gosta nem o que não come. Revise as refeições para tirar o que ele recusa.');
  if (arr(a.healthConditions).length || arr(a.medications).length || a.bariatric === true) warnings.push('O aluno tem condição de saúde, remédio ou cirurgia bariátrica. A IA não substitui a avaliação do profissional: revise a dieta inteira antes de enviar.');
  return { ok: blockers.length === 0, blockers, warnings };
}

/** 403 padrão quando o coach não tem a chave do recurso (null = pode seguir). Master sempre passa. */
export async function lockedByFeature(db: any, user: AuthUser | null | undefined, feature: FeatureKey, what: string): Promise<NextResponse | null> {
  if (!user) return NextResponse.json({ error: 'Não autenticado.', code: 'NO_AUTH' }, { status: 401 });
  if (isMasterId(user.id)) return null;
  if (await coachHasFeature(db, user.id, feature)) return null;
  return NextResponse.json({ error: `${what} ainda não está liberado para a sua conta. Fale com a equipe PA Elite.`, code: 'FEATURE_LOCKED', feature }, { status: 403 });
}
