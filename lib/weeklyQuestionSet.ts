// lib/weeklyQuestionSet.ts
// 🗂️ (1 out 2026) O conjunto de perguntas do feedback da semana de UM aluno: montado uma vez por semana (cron de segunda ou 1ª abertura do card),
// guardado em WeeklyQuestionSet e usado também pra validar a resposta -- o que o aluno viu é exatamente o que vale.
//
// Passos: dados reais da semana (weeklyFactsLoader) -> perguntas (weeklyQuestions) -> refino do Haiku (weeklyAI, opcional) -> grava.
// Qualquer falha cai pra versão mais simples: sem dados = perguntas de sempre; sem IA = perguntas por regras. Nunca deixa o aluno sem formulário.
import { isMissingTable, type Question } from '@/lib/weeklyFeedback';
import { loadWeeklyFacts } from '@/lib/weeklyFactsLoader';
import { buildWeeklyQuestions } from '@/lib/weeklyQuestions';
import { applyRefinement, refineWithAI, WEEKLY_AI_MODEL, type AiOptions } from '@/lib/weeklyAI';
import type { WeeklyFacts } from '@/lib/weeklyFacts';

export type QuestionSet = { questions: Question[]; intro: string | null; facts: WeeklyFacts | null; source: 'AI' | 'RULES'; model: string | null; persisted: boolean };
export type EnsureOptions = { weekStart: string; now?: Date; ai?: AiOptions | false };

const fromRow = (row: any): QuestionSet => ({
  questions: Array.isArray(row.questions) ? (row.questions as Question[]) : [],
  intro: row.intro || null,
  facts: (row.facts as WeeklyFacts) || null,
  source: row.source === 'AI' ? 'AI' : 'RULES',
  model: row.model || null,
  persisted: true,
});

/** Só lê (não gera): usado pra mostrar o painel do coach sem disparar a IA. */
export async function findQuestionSet(db: any, userId: string, weekStart: string): Promise<QuestionSet | null> {
  try {
    const row = await db.weeklyQuestionSet.findUnique({ where: { userId_weekStart: { userId, weekStart } } });
    return row ? fromRow(row) : null;
  } catch (e) {
    if (isMissingTable(e)) return null;
    throw e;
  }
}

export async function ensureQuestionSet(db: any, student: { id: string; name?: string | null; dietModule?: boolean | null }, o: EnsureOptions): Promise<QuestionSet> {
  const { weekStart } = o;
  const now = o.now || new Date();
  let tableMissing = false;

  try {
    const row = await db.weeklyQuestionSet.findUnique({ where: { userId_weekStart: { userId: student.id, weekStart } } });
    if (row) return fromRow(row);
  } catch (e) {
    if (!isMissingTable(e)) throw e;
    tableMissing = true;   // deploy antes do `prisma db push`: monta na hora, sem guardar
  }

  // dados reais da semana (falhou? segue sem eles: perguntas de sempre)
  let facts: WeeklyFacts | null = null;
  try { facts = await loadWeeklyFacts(db, student, weekStart, now); }
  catch (e: any) { console.warn('[weeklyQuestionSet] sem os dados da semana, usando perguntas de sempre:', e?.message || e); }

  let limitations: string[] | null = null, sleepQuality: string | null = null;
  if (!facts) {
    try {
      const a = await db.anamnese.findFirst({ where: { userId: student.id }, orderBy: { createdAt: 'desc' }, select: { limitacoes: true, sleepQuality: true } });
      limitations = a?.limitacoes ?? null; sleepQuality = a?.sleepQuality ?? null;
    } catch { /* sem anamnese: só as perguntas de sempre */ }
  }

  let questions = buildWeeklyQuestions({ facts, limitations, sleepQuality, dietModule: student.dietModule });
  let intro: string | null = null;
  let source: 'AI' | 'RULES' = 'RULES';
  let model: string | null = null;

  if (facts && o.ai !== false) {
    const r = await refineWithAI({ name: student.name, facts, questions, options: o.ai || undefined });
    if (r) {
      questions = applyRefinement(questions, r);
      intro = r.intro;
      source = 'AI'; model = r.model || WEEKLY_AI_MODEL;
      db.aiLog?.create?.({ data: { userId: student.id, question: `weekly-feedback:${weekStart}`, answer: JSON.stringify({ intro: r.intro, labels: r.labels, followUps: r.followUps, usage: r.usage }).slice(0, 4000) } })?.catch?.(() => {});
    }
  }

  const set: QuestionSet = { questions, intro, facts, source, model, persisted: false };
  if (tableMissing) return set;

  try {
    await db.weeklyQuestionSet.create({ data: { userId: student.id, weekStart, questions: questions as any, intro, facts: (facts as any) ?? undefined, source, model } });
    return { ...set, persisted: true };
  } catch (e: any) {
    if (e?.code === 'P2002') {   // duas aberturas ao mesmo tempo: vale a que gravou primeiro
      const row = await db.weeklyQuestionSet.findUnique({ where: { userId_weekStart: { userId: student.id, weekStart } } }).catch(() => null);
      if (row) return fromRow(row);
    }
    if (!isMissingTable(e)) console.warn('[weeklyQuestionSet] não consegui guardar o conjunto de perguntas:', e?.message || e);
    return set;
  }
}
