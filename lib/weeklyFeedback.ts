// lib/weeklyFeedback.ts
// 💜 (1 out 2026) FEEDBACK DA SEMANA -- o mini-questionário "PA ELITE" que o time mandava por WhatsApp, agora dentro do app.
//
// Como funciona:
//   - Toda SEGUNDA-FEIRA o aluno vê um card na Início (e recebe um push, pelo cron) pedindo o feedback da semana que PASSOU (segunda a domingo).
//   - Uma resposta por aluno por semana (WeeklyFeedback @@unique [userId, weekStart]); weekStart = a segunda da semana AVALIADA.
//   - As 6 perguntas de sempre + até 2 extras montadas a partir da anamnese do aluno (limitação, dieta, sono).
//   - Cada resposta gera `score` (a dedicação 0-10) e `flags` (alertas pro coach priorizar: dor, aderência baixa...).
//   - O coach vê tudo em "Feedback da semana" (quem respondeu, quem não, quem tem alerta, o que ele ainda não respondeu) e cobra quem não respondeu.
//
// Fuso: Brasília fixo em UTC-3 (o Brasil não tem horário de verão desde 2019). Funções puras, sem banco -- testadas em separado.

const BRT_OFFSET_MS = 3 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

// ─── semana (segunda a domingo, horário de Brasília) ──────────────────────────────────────────────
const pad = (n: number) => String(n).padStart(2, '0');
const ymdOf = (t: Date) => `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;
const parseYmd = (s: string) => { const [y, m, d] = s.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d)); };

/** Ano e mês (1-12) de hoje no horário de Brasília. */
export function brtYearMonth(now: Date): { year: number; month: number } {
  const t = new Date(now.getTime() - BRT_OFFSET_MS);
  return { year: t.getUTCFullYear(), month: t.getUTCMonth() + 1 };
}

/** Segunda-feira ("AAAA-MM-DD") da semana, no horário de Brasília, que contém o instante `now`. */
export function mondayOf(now: Date): string {
  const t = new Date(now.getTime() - BRT_OFFSET_MS);          // relógio de Brasília lido como UTC
  const dow = t.getUTCDay();                                   // 0 = domingo
  const back = (dow + 6) % 7;                                  // dias desde a segunda
  return ymdOf(new Date(t.getTime() - back * DAY_MS));
}

export function addDays(ymd: string, n: number): string {
  return ymdOf(new Date(parseYmd(ymd).getTime() + n * DAY_MS));
}

/** A semana que o aluno avalia agora: a anterior à semana corrente (na segunda, "como foi a semana que passou"). */
export function evaluatedWeekStart(now: Date): string {
  return addDays(mondayOf(now), -7);
}

/** Instantes (UTC) de início (segunda 00:00 BRT) e fim (próxima segunda 00:00 BRT, exclusivo) da semana. */
export function weekRange(weekStart: string): { start: Date; end: Date } {
  const start = new Date(parseYmd(weekStart).getTime() + BRT_OFFSET_MS);
  return { start, end: new Date(start.getTime() + 7 * DAY_MS) };
}

export const isWeekStart = (s: unknown): s is string => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && mondayOf(new Date(parseYmd(s).getTime() + BRT_OFFSET_MS)) === s;

/** "22/09 a 28/09" */
export function weekLabel(weekStart: string): string {
  const f = (s: string) => `${s.slice(8, 10)}/${s.slice(5, 7)}`;
  return `${f(weekStart)} a ${f(addDays(weekStart, 6))}`;
}

// ─── perguntas ────────────────────────────────────────────────────────────────────────────────────
export type Option = { value: string; label: string };
export type Question = {
  id: string;
  kind: 'choice' | 'scale' | 'text';
  label: string;
  hint?: string;
  optional?: boolean;
  options?: Option[];
  /** pergunta de texto que abre quando a resposta é um destes valores (ex.: "Sim" -> "qual exercício?") */
  textWhen?: { values: string[]; label: string; required?: boolean };
  min?: number;
  max?: number;
};

export const MAX_TEXT = 600;

export type QuestionContext = {
  limitations?: string[] | null;
  dietModule?: boolean | null;
  sleepQuality?: string | null;
  /** quantas perguntas extras (da anamnese) entram -- 2 por padrão; o modo "com dados da semana" usa mais */
  extrasLimit?: number;
  /** além da nota da dieta (0-10), pergunta o que mais atrapalhou */
  dietIssue?: boolean;
};

const NO_LIMITATION = /^(nenhum|nenhuma|n[aã]o|sem|nada|n\/a)/i;
const POOR_SLEEP = /^(regular|ruim|p[eé]ssimo)/i;

/** As 6 perguntas do questionário do WhatsApp + até 2 extras da anamnese (limitação > dieta > sono). */
export function buildQuestions(ctx: QuestionContext = {}): Question[] {
  const base: Question[] = [
    { id: 'trained', kind: 'choice', label: '🏋️ Treinos: conseguiu cumprir o planejado?', options: [
      { value: 'ALL', label: 'Cumpri tudo' }, { value: 'MOST', label: 'Quase tudo' }, { value: 'PART', label: 'Cumpri parte' }, { value: 'LITTLE', label: 'Pouco ou nada' },
    ] },
    { id: 'performance', kind: 'choice', label: '📈 Desempenho: evoluiu nas cargas/repetições?', options: [
      { value: 'BETTER', label: 'Evoluí' }, { value: 'SAME', label: 'Mantive' }, { value: 'WORSE', label: 'Regredi' }, { value: 'NOLOG', label: 'Não registrei' },
    ] },
    { id: 'difficulty', kind: 'choice', label: '⚠️ Dificuldade: sentiu dor, desconforto ou dificuldade em algum exercício?', options: [
      { value: 'NO', label: 'Não' }, { value: 'YES', label: 'Sim' },
    ], textWhen: { values: ['YES'], label: 'Qual exercício e o que você sentiu?', required: true } },
    { id: 'energy', kind: 'choice', label: '💪 Disposição: como está sua energia e recuperação?', options: [
      { value: 'GREAT', label: 'Ótima' }, { value: 'GOOD', label: 'Boa' }, { value: 'OK', label: 'Regular' }, { value: 'BAD', label: 'Ruim' },
    ] },
    { id: 'protocol', kind: 'text', optional: true, label: '🎯 Protocolo: tem algo que você gostaria que ajustássemos?', hint: 'Treino, dieta, horários... (opcional)' },
  ];

  const extras: Question[] = [];
  const limits = (ctx.limitations || []).map((l) => String(l || '').trim()).filter((l) => l && !NO_LIMITATION.test(l));
  if (limits.length) {
    extras.push({ id: 'limitation', kind: 'choice', label: `🩹 Sua limitação (${limits.slice(0, 2).join(', ')}) incomodou nessa semana?`, options: [
      { value: 'NO', label: 'Não' }, { value: 'LITTLE', label: 'Um pouco' }, { value: 'MUCH', label: 'Sim, bastante' },
    ], textWhen: { values: ['LITTLE', 'MUCH'], label: 'Em que momento?', required: false } });
  }
  if (ctx.dietModule) {
    extras.push({ id: 'diet', kind: 'scale', min: 0, max: 10, label: '🍽️ Dieta: de 0 a 10, quanto você seguiu o plano alimentar?' });
    if (ctx.dietIssue) {
      extras.push({ id: 'diet_issue', kind: 'choice', label: '🥗 O que mais atrapalhou a dieta nessa semana?', options: [
        { value: 'NONE', label: 'Nada, segui bem' }, { value: 'OUT', label: 'Refeições fora de casa / eventos' }, { value: 'HUNGER', label: 'Fome ou ansiedade' },
        { value: 'TIME', label: 'Falta de tempo / rotina' }, { value: 'DISLIKE', label: 'Enjoei ou não gosto de algo do plano' }, { value: 'OTHER', label: 'Outro motivo' },
      ], textWhen: { values: ['OUT', 'HUNGER', 'TIME', 'DISLIKE', 'OTHER'], label: 'Quer contar mais? (opcional)', required: false } });
    }
  }
  if (ctx.sleepQuality && POOR_SLEEP.test(String(ctx.sleepQuality))) {
    extras.push({ id: 'sleep', kind: 'choice', label: '😴 Como foi seu sono essa semana?', options: [
      { value: 'BETTER', label: 'Melhor que de costume' }, { value: 'SAME', label: 'Igual' }, { value: 'WORSE', label: 'Pior' },
    ] });
  }

  return [...base, ...extras.slice(0, ctx.extrasLimit ?? 2), { id: 'effort', kind: 'scale', min: 0, max: 10, label: '⭐ De 0 a 10, como você avalia sua dedicação essa semana?' }];
}

// ─── validação e resumo ───────────────────────────────────────────────────────────────────────────
export type Answers = Record<string, string | number>;

export function validateAnswers(questions: Question[], raw: unknown): { ok: true; clean: Answers } | { ok: false; error: string; field: string } {
  const src = raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const clean: Answers = {};
  for (const q of questions) {
    const v = src[q.id];
    const empty = v === undefined || v === null || v === '';
    if (q.kind === 'text') {
      if (empty) { if (q.optional) continue; return { ok: false, error: 'Responda esta pergunta.', field: q.id }; }
      if (typeof v !== 'string') return { ok: false, error: 'Resposta inválida.', field: q.id };
      const t = v.trim().slice(0, MAX_TEXT); if (t) clean[q.id] = t; else if (!q.optional) return { ok: false, error: 'Responda esta pergunta.', field: q.id };
      continue;
    }
    if (empty) { if (q.optional) continue; return { ok: false, error: 'Responda todas as perguntas.', field: q.id }; }
    if (q.kind === 'scale') {
      const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN;
      if (!Number.isInteger(n) || n < (q.min ?? 0) || n > (q.max ?? 10)) return { ok: false, error: 'Nota inválida.', field: q.id };
      clean[q.id] = n;
      continue;
    }
    // choice
    if (typeof v !== 'string' || !(q.options || []).some((o) => o.value === v)) return { ok: false, error: 'Opção inválida.', field: q.id };
    clean[q.id] = v;
    if (q.textWhen && q.textWhen.values.includes(v)) {
      const tv = src[`${q.id}_text`];
      const t = typeof tv === 'string' ? tv.trim().slice(0, MAX_TEXT) : '';
      if (t) clean[`${q.id}_text`] = t;
      else if (q.textWhen.required) return { ok: false, error: 'Conte um pouco mais.', field: `${q.id}_text` };
    }
  }
  return { ok: true, clean };
}

export type Flag = 'PAIN' | 'LOW_ADHERENCE' | 'LOW_ENERGY' | 'LOW_EFFORT' | 'REGRESSED' | 'ADJUST' | 'LOW_LOGGED' | 'CHECKIN_LATE' | 'MOTIVATION';
export const FLAG_LABELS: Record<Flag, string> = {
  PAIN: 'Dor / desconforto', LOW_ADHERENCE: 'Treinou pouco', LOW_ENERGY: 'Pouca energia', LOW_EFFORT: 'Dedicação baixa', REGRESSED: 'Regrediu nas cargas', ADJUST: 'Pediu ajuste',
  LOW_LOGGED: 'Registrou poucos treinos', CHECKIN_LATE: 'Check-in atrasado', MOTIVATION: 'Desmotivação',
};
/** Alertas que merecem o coach olhar primeiro. */
export const ATTENTION_FLAGS: Flag[] = ['PAIN', 'LOW_ADHERENCE', 'LOW_ENERGY', 'LOW_EFFORT', 'LOW_LOGGED'];

/** Sinais objetivos (calculados dos registros, não do que o aluno respondeu) que também viram alerta. */
export type ObjectiveSignals = { lowLogged?: boolean; checkinLate?: boolean };

export function deriveSummary(answers: Answers, signals: ObjectiveSignals = {}): { score: number | null; flags: Flag[] } {
  const flags: Flag[] = [];
  const a = answers;
  if (a.difficulty === 'YES' || a.limitation === 'MUCH' || a.training_gap === 'PAIN') flags.push('PAIN');
  if (a.trained === 'PART' || a.trained === 'LITTLE') flags.push('LOW_ADHERENCE');
  if (a.energy === 'BAD') flags.push('LOW_ENERGY');
  const score = typeof a.effort === 'number' ? a.effort : null;
  if (score !== null && score <= 4) flags.push('LOW_EFFORT');
  if (a.performance === 'WORSE') flags.push('REGRESSED');
  if (typeof a.protocol === 'string' && a.protocol.trim()) flags.push('ADJUST');
  if (signals.lowLogged) flags.push('LOW_LOGGED');
  if (signals.checkinLate) flags.push('CHECKIN_LATE');
  if (a.training_gap === 'MOTIV') flags.push('MOTIVATION');
  return { score, flags };
}

export const needsAttention = (flags: string[] | null | undefined) => (flags || []).some((f) => (ATTENTION_FLAGS as string[]).includes(f));

/** Respostas prontas pra exibir ao coach: [{ label, value, text? }] a partir do snapshot das perguntas. */
export function answersView(questions: Question[] | null | undefined, answers: Answers | null | undefined): Array<{ id: string; label: string; value: string; text?: string }> {
  const out: Array<{ id: string; label: string; value: string; text?: string }> = [];
  for (const q of questions || []) {
    const v = (answers || {})[q.id];
    if (v === undefined || v === null || v === '') continue;
    let value = String(v);
    if (q.kind === 'scale') value = `${v}/${q.max ?? 10}`;
    else if (q.kind === 'choice') value = (q.options || []).find((o) => o.value === v)?.label || String(v);
    const text = (answers || {})[`${q.id}_text`];
    out.push({ id: q.id, label: q.label, value, ...(typeof text === 'string' && text ? { text } : {}) });
  }
  return out;
}

type DueUser = { createdAt?: Date | string | null; coachId?: string | null; active?: boolean | null; accountStatus?: string | null; role?: string | null };

/** O aluno entra no feedback da semana `weekStart` (a avaliada)? Tem coach, está ativo e já estava na plataforma até o fim dessa semana. */
export function isDueStudentForWeek(u: DueUser, weekStart: string): boolean {
  if (!u || !u.coachId) return false;
  if (u.active === false || u.accountStatus === 'DELETED') return false;
  if (u.role && u.role !== 'USER') return false;
  const created = u.createdAt ? new Date(u.createdAt) : null;
  return !created || created.getTime() < weekRange(weekStart).end.getTime();
}

/** O aluno deve ser perguntado agora (segunda a domingo seguintes à semana avaliada)? */
export const isDueStudent = (u: DueUser, now: Date) => isDueStudentForWeek(u, evaluatedWeekStart(now));

/** Tabela ainda não criada no banco (deploy antes do `prisma db push`): as rotas respondem "indisponível" em vez de quebrar. */
export const isMissingTable = (e: any) => e?.code === 'P2021' || e?.code === 'P2022' || /does not exist/i.test(String(e?.message || ''));

export const shortName = (full?: string | null) => {
  const parts = String(full || '').trim().split(/\s+/).filter(Boolean);
  return parts.length === 0 ? 'Um aluno' : parts.length === 1 ? parts[0] : `${parts[0]} ${parts[1]}`;
};
