// lib/monthlyReport.ts
// 📅 (7 out 2026) RELATÓRIO MENSAL do aluno: um resumo dos últimos N dias (padrão 30) com o que ele realmente fez: treinos, volume de carga, recordes, músculos
// trabalhados, cardio, dieta e peso/fotos. Serve para o aluno ver e compartilhar (Story/PDF) e para o coach usar na conversa de renovação.
//
// Regra de ouro (a mesma do feedback da semana, lib/weeklyFacts.ts): os NÚMEROS e as FRASES vêm daqui (código), nunca de IA. Nada é inventado: sem dado, a parte some.
// Sem mudança de banco: tudo é calculado na hora a partir do histórico. Funções puras (sem banco) + um carregador que recebe o `db` (Prisma) por parâmetro, para testar.
//
// Pontos de honestidade:
//   • O app guarda as REPETIÇÕES PRESCRITAS (não as feitas): o "volume" (carga × repetições) é uma ESTIMATIVA e o relatório diz isso.
//   • Recorde = a maior carga (total, em kg) do período MAIOR que a maior carga de TODO o histórico anterior daquele exercício. Exercício novo não conta como recorde.
//   • Cardio e mobilidade ficam fora de volume, recordes e músculos (o campo "carga" deles são minutos).
import { addDays, mondayOf } from '@/lib/weeklyFeedback';
import { brtYmd, diffDays, ddmm } from '@/lib/weeklyFacts';
import { activeWorkoutsForWeek } from '@/lib/weeklyFactsLoader';

const BRT_OFFSET_MS = 3 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
export const MIN_DAYS = 7;
export const MAX_DAYS = 92;
export const DEFAULT_DAYS = 30;
export const MAX_RECORDS = 5;
export const MAX_MUSCLES = 6;
/** Poucas refeições registradas não dizem nada: abaixo disso a dieta não entra nos destaques. */
export const MIN_MEALS_FOR_DIET = 5;

/** Quantidade de dias pedida: inteiro de 7 a 92; vazio, texto ou fora da faixa = 30. */
export function cleanDays(v: unknown): number {
  const n = Math.round(Number(String(v ?? '').replace(',', '.')));
  if (!Number.isFinite(n) || n < MIN_DAYS || n > MAX_DAYS) return DEFAULT_DAYS;
  return n;
}

// ───────────── entrada (linhas já lidas do banco) ─────────────
export type DetailIn = {
  exerciseId: string; exerciseName?: string | null; setNumber?: number; weight?: number | null; reps?: string | null;
  cardioSeconds?: number | null; cardioKcal?: number | null;
};
export type HistoryIn = { id?: string; date: Date | string; duration?: number | null; rpe?: number | null; details?: DetailIn[] | null };
export type CheckInIn = { id?: string; date: Date | string; weight?: number | null; photoFront?: string | null; photoSide?: string | null; photoBack?: string | null };
export type MonthlyInput = {
  now: Date;
  days: number;
  student: { name?: string | null; coachId?: string | null; dietModule?: boolean | null };
  histories: HistoryIn[];
  prevHistories: HistoryIn[];
  /** maior carga (total, kg) de cada exercício ANTES do período */
  baselineMax: Record<string, number>;
  /** id do exercício -> categoria ("Peito", "Cardio"...) */
  categories: Record<string, string>;
  checkins: CheckInIn[];
  mealLogs?: Array<{ date: string; status: string }> | null;
  daily?: Array<{ date: string; adherence?: string | null }> | null;
  /** dias de treino por semana que o plano ativo pede (null = não dá para saber) */
  plannedPerWeek?: number | null;
};

// ───────────── saída ─────────────
export type Photo = { date: string; front: string | null; side: string | null; back: string | null };
export type Highlight = { key: string; icon: string; text: string; tone: 'good' | 'neutral' | 'warn' };
export type MonthlyReport = {
  v: 1;
  empty: boolean;
  period: { start: string; end: string; days: number; weeks: number; label: string };
  student: { name: string | null; coachId: string | null };
  training: {
    sessions: number; trainedDays: number; perWeek: number[]; activeWeeks: number; avgPerWeek: number;
    plannedPerWeek: number | null; adherencePct: number | null;
    totalMinutes: number; avgMinutes: number | null; avgRpe: number | null;
    prevSessions: number; sessionsDelta: number | null;
  };
  volume: { totalKg: number; prevKg: number; changePct: number | null; sets: number };
  records: Array<{ exerciseId: string; name: string; from: number; to: number; gain: number }>;
  muscles: Array<{ group: string; sets: number }>;
  cardio: { sessions: number; minutes: number; kcal: number };
  diet: { meals: number; followed: number; substituted: number; skipped: number; free: number; followedPct: number | null; dayYes: number; dayPartial: number; dayNo: number } | null;
  body: { weightStart: number | null; weightEnd: number | null; delta: number | null; checkIns: number; before: Photo | null; after: Photo | null };
  highlights: Highlight[];
};

// ───────────── pequenas funções de apoio ─────────────
const round1 = (n: number) => Math.round(n * 10) / 10;
const toNum = (v: unknown): number => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
/** "1.234" / "12,5" (ponto de milhar, vírgula decimal). */
export const fmtInt = (n: number) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
export const fmtDec = (n: number) => String(round1(n)).replace('.', ',');
/** "40" / "42,5" */
const fmtKgNum = (n: number) => String(Math.round(n * 100) / 100).replace('.', ',');

const CARDIO_RE = /cardio|aer[oó]bic/i;
const SKIP_MUSCLE_RE = /cardio|aer[oó]bic|mobilidade|alongamento/i;
const isCardioRow = (d: DetailIn, categories: Record<string, string>) => d.cardioSeconds != null || d.cardioKcal != null || CARDIO_RE.test(categories[d.exerciseId] || '');
const isNonStrength = (d: DetailIn, categories: Record<string, string>) => isCardioRow(d, categories) || SKIP_MUSCLE_RE.test(categories[d.exerciseId] || '');

/**
 * Repetições de uma série a partir do texto PRESCRITO ("12", "8-12", "10/8/6"): faixa = ponto médio, senão o primeiro número; sem número = 10.
 * (O app só guarda a repetição prescrita; por isso o volume é uma estimativa.)
 */
export function repsCount(reps: unknown): number {
  const nums = (String(reps ?? '').match(/\d+/g) || []).map(Number).filter((n) => n > 0 && n <= 200);
  if (!nums.length) return 10;
  if (/\d\s*-\s*\d/.test(String(reps)) && nums.length >= 2) return Math.round((nums[0] + nums[1]) / 2);
  return nums[0];
}

/** Volume (kg × repetições) e quantidade de séries de força de um conjunto de treinos. */
export function volumeOf(histories: HistoryIn[], categories: Record<string, string>): { kg: number; sets: number } {
  let kg = 0, sets = 0;
  for (const h of histories) {
    for (const d of h.details || []) {
      if (isNonStrength(d, categories)) continue;
      sets++;
      const w = toNum(d.weight);
      if (w > 0) kg += w * repsCount(d.reps);
    }
  }
  return { kg: Math.round(kg), sets };
}

/** "07/09 a 06/10" */
const periodLabel = (start: string, end: string) => `${ddmm(start)} a ${ddmm(end)}`;

function photoOf(c: CheckInIn): Photo | null {
  if (!c.photoFront && !c.photoSide && !c.photoBack) return null;
  return { date: brtYmd(c.date), front: c.photoFront || null, side: c.photoSide || null, back: c.photoBack || null };
}

// ───────────── o relatório ─────────────
export function computeMonthlyReport(inp: MonthlyInput): MonthlyReport {
  const days = cleanDays(inp.days);
  const end = brtYmd(inp.now);
  const start = addDays(end, -(days - 1));
  const weeks = Math.ceil(days / 7);
  const cats = inp.categories || {};

  // ── treino ──
  const sessions = inp.histories.length;
  const perWeek = Array.from({ length: weeks }, () => 0);
  const dayset = new Set<string>();
  for (const h of inp.histories) {
    const ymd = brtYmd(h.date);
    dayset.add(ymd);
    const idx = Math.min(weeks - 1, Math.max(0, Math.floor(diffDays(start, ymd) / 7)));
    perWeek[idx]++;
  }
  const durations = inp.histories.map((h) => toNum(h.duration)).filter((n) => n > 0);
  const rpes = inp.histories.map((h) => toNum(h.rpe)).filter((n) => n > 0);
  const planned = inp.plannedPerWeek && inp.plannedPerWeek > 0 ? inp.plannedPerWeek : null;
  const avgPerWeek = round1(sessions / (days / 7));
  const prevSessions = inp.prevHistories.length;
  const training: MonthlyReport['training'] = {
    sessions, trainedDays: dayset.size, perWeek, activeWeeks: perWeek.filter((n) => n > 0).length, avgPerWeek,
    plannedPerWeek: planned,
    adherencePct: planned ? Math.min(100, Math.round((sessions / (planned * (days / 7))) * 100)) : null,
    totalMinutes: durations.reduce((a, b) => a + b, 0),
    avgMinutes: durations.length ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length) : null,
    avgRpe: rpes.length ? round1(rpes.reduce((a, b) => a + b, 0) / rpes.length) : null,
    prevSessions, sessionsDelta: prevSessions > 0 ? sessions - prevSessions : null,
  };

  // ── volume ──
  const cur = volumeOf(inp.histories, cats);
  const prev = volumeOf(inp.prevHistories, cats);
  const volume: MonthlyReport['volume'] = { totalKg: cur.kg, prevKg: prev.kg, changePct: prev.kg > 0 ? Math.round(((cur.kg - prev.kg) / prev.kg) * 100) : null, sets: cur.sets };

  // ── recordes: maior carga do período x maior de todo o histórico anterior ──
  const winMax = new Map<string, { name: string; kg: number }>();
  for (const h of inp.histories) {
    for (const d of h.details || []) {
      if (isNonStrength(d, cats)) continue;
      const w = toNum(d.weight);
      if (w <= 0) continue;
      const c = winMax.get(d.exerciseId);
      if (!c || w > c.kg) winMax.set(d.exerciseId, { name: String(d.exerciseName || '').trim() || 'Exercício', kg: w });
    }
  }
  const records: MonthlyReport['records'] = [];
  winMax.forEach((v, exerciseId) => {
    const base = toNum(inp.baselineMax[exerciseId]);
    if (base > 0 && v.kg > base + 0.01) records.push({ exerciseId, name: v.name, from: base, to: v.kg, gain: Math.round((v.kg - base) * 100) / 100 });
  });
  records.sort((a, b) => b.gain - a.gain || a.name.localeCompare(b.name, 'pt-BR'));
  records.splice(MAX_RECORDS);

  // ── músculos: séries por categoria (só força) ──
  const bySets = new Map<string, number>();
  for (const h of inp.histories) {
    for (const d of h.details || []) {
      if (isNonStrength(d, cats)) continue;
      const g = String(cats[d.exerciseId] || '').trim();
      if (!g) continue;
      bySets.set(g, (bySets.get(g) || 0) + 1);
    }
  }
  const muscles = [...bySets.entries()].map(([group, sets]) => ({ group, sets })).sort((a, b) => b.sets - a.sets || a.group.localeCompare(b.group, 'pt-BR')).slice(0, MAX_MUSCLES);

  // ── cardio: tempo e calorias de verdade; cardio antigo (sem tempo exato) usa o "peso" que eram os minutos ──
  let cardioMin = 0, cardioKcal = 0; const cardioSess = new Set<number>();
  inp.histories.forEach((h, i) => {
    for (const d of h.details || []) {
      if (!isCardioRow(d, cats)) continue;
      cardioSess.add(i);
      if (d.cardioSeconds != null) cardioMin += toNum(d.cardioSeconds) / 60;
      else if (CARDIO_RE.test(cats[d.exerciseId] || '')) cardioMin += toNum(d.weight);
      cardioKcal += toNum(d.cardioKcal);
    }
  });
  const cardio = { sessions: cardioSess.size, minutes: Math.round(cardioMin), kcal: Math.round(cardioKcal) };

  // ── dieta ──
  let diet: MonthlyReport['diet'] = null;
  if (inp.student.dietModule && (inp.mealLogs || inp.daily)) {
    const count = (s: string) => (inp.mealLogs || []).filter((m) => m.status === s).length;
    const adh = (s: string) => (inp.daily || []).filter((x) => String(x.adherence || '').toUpperCase() === s).length;
    const followed = count('SEGUIU'), substituted = count('SUBSTITUIU'), skipped = count('PULOU'), free = count('LIVRE');
    const meals = followed + substituted + skipped + free;
    const counted = followed + substituted + skipped;   // refeição livre não conta a favor nem contra
    diet = { meals, followed, substituted, skipped, free, followedPct: counted > 0 ? Math.round(((followed + substituted) / counted) * 100) : null, dayYes: adh('SIM'), dayPartial: adh('PARCIAL'), dayNo: adh('NAO') };
    if (meals === 0 && diet.dayYes + diet.dayPartial + diet.dayNo === 0) diet = null;
  }

  // ── corpo: peso e fotos dos check-ins do período ──
  const cis = [...inp.checkins].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  const weighed = cis.filter((c) => toNum(c.weight) > 0);
  const wStart = weighed.length >= 2 ? toNum(weighed[0].weight) : null;
  const wEnd = weighed.length >= 2 ? toNum(weighed[weighed.length - 1].weight) : null;
  const withPhoto = cis.filter((c) => photoOf(c));
  const body: MonthlyReport['body'] = {
    weightStart: wStart, weightEnd: wEnd, delta: wStart !== null && wEnd !== null ? round1(wEnd - wStart) : null, checkIns: cis.length,
    before: withPhoto.length >= 2 ? photoOf(withPhoto[0]) : null, after: withPhoto.length >= 2 ? photoOf(withPhoto[withPhoto.length - 1]) : null,
  };

  const report: MonthlyReport = {
    v: 1, empty: sessions === 0,
    period: { start, end, days, weeks, label: periodLabel(start, end) },
    student: { name: inp.student.name ? String(inp.student.name) : null, coachId: inp.student.coachId || null },
    training, volume, records, muscles, cardio, diet, body, highlights: [],
  };
  report.highlights = buildHighlights(report);
  return report;
}

// ───────────── frases do relatório (código, nunca IA) ─────────────
export function buildHighlights(r: MonthlyReport): Highlight[] {
  const out: Highlight[] = [];
  const t = r.training;
  if (t.sessions === 0) {
    out.push({ key: 'training', icon: 'dumbbell', text: 'Nenhum treino registrado neste período.', tone: 'warn' });
    return out;
  }
  const times = t.sessions === 1 ? '1 vez' : `${t.sessions} vezes`;
  const wk = r.period.weeks === 1 ? '1 semana' : `${r.period.weeks} semanas`;
  let tr = `Treinou ${times} em ${wk} (média de ${fmtDec(t.avgPerWeek)} por semana)`;
  if (t.adherencePct !== null) tr += ` · ${t.adherencePct}% do plano`;
  out.push({ key: 'training', icon: 'dumbbell', text: tr, tone: t.adherencePct !== null ? (t.adherencePct >= 80 ? 'good' : t.adherencePct < 50 ? 'warn' : 'neutral') : 'neutral' });

  if (r.records.length) {
    const n = r.records.length;
    const list = r.records.slice(0, 2).map((x) => `${x.name} ${fmtKgNum(x.from)} → ${fmtKgNum(x.to)} kg`).join(' · ');
    out.push({ key: 'records', icon: 'trophy-outline', text: `${n} ${n === 1 ? 'recorde' : 'recordes'} de carga: ${list}${n > 2 ? ' e mais' : ''}`, tone: 'good' });
  }
  if (r.volume.totalKg > 0) {
    const vol = r.volume.totalKg >= 1000 ? `${fmtDec(r.volume.totalKg / 1000)} toneladas` : `${fmtInt(r.volume.totalKg)} kg`;
    const cmp = r.volume.changePct === null ? '' : ` (${r.volume.changePct >= 0 ? '+' : '−'}${Math.abs(r.volume.changePct)}% em relação ao período anterior)`;
    out.push({ key: 'volume', icon: 'weight-lifter', text: `Volume de treino (estimado): ${vol}${cmp}`, tone: r.volume.changePct !== null && r.volume.changePct < 0 ? 'warn' : 'good' });
  }
  if (r.cardio.minutes > 0 || r.cardio.kcal > 0) {
    out.push({ key: 'cardio', icon: 'heart-pulse', text: `Cardio: ${fmtInt(r.cardio.minutes)} min${r.cardio.kcal > 0 ? ` · ${fmtInt(r.cardio.kcal)} kcal` : ''}`, tone: 'neutral' });
  }
  if (r.diet && r.diet.followedPct !== null && r.diet.followed + r.diet.substituted + r.diet.skipped >= MIN_MEALS_FOR_DIET) {
    out.push({ key: 'diet', icon: 'food-apple-outline', text: `Dieta: seguiu ${r.diet.followedPct}% das refeições registradas`, tone: r.diet.followedPct >= 80 ? 'good' : r.diet.followedPct < 50 ? 'warn' : 'neutral' });
  }
  if (r.body.delta !== null && r.body.weightStart !== null && r.body.weightEnd !== null) {
    const d = r.body.delta;
    out.push({ key: 'body', icon: 'scale-bathroom', text: `Peso: ${fmtDec(r.body.weightStart)} → ${fmtDec(r.body.weightEnd)} kg (${d > 0 ? '+' : d < 0 ? '−' : ''}${fmtDec(Math.abs(d))} kg)`, tone: 'neutral' });
  }
  return out;
}

// ───────────── carregador (banco) ─────────────
const aux = <T>(p: Promise<T>, fallback: T): Promise<T> => p.catch(() => fallback);

/** Instante (UTC) em que o dia "AAAA-MM-DD" começa em Brasília. */
export function startOfBrtDay(ymd: string): Date {
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d) + BRT_OFFSET_MS);
}

export async function loadMonthlyReport(db: any, student: { id: string; name?: string | null; coachId?: string | null; dietModule?: boolean | null }, opts: { days?: unknown; now?: Date } = {}): Promise<MonthlyReport> {
  const now = opts.now || new Date();
  const days = cleanDays(opts.days);
  const endYmd = brtYmd(now);
  const startYmd = addDays(endYmd, -(days - 1));
  const start = startOfBrtDay(startYmd);
  const end = new Date(start.getTime() + days * DAY_MS);
  const prevStart = new Date(start.getTime() - days * DAY_MS);
  const select = { id: true, date: true, duration: true, rpe: true, details: { select: { exerciseId: true, exerciseName: true, setNumber: true, weight: true, reps: true, cardioSeconds: true, cardioKcal: true } } };

  // ── núcleo: se falhar, o erro SOBE (melhor não responder do que dizer "0 treinos" por uma falha de banco) ──
  const [histories, prevHistories, baseRows]: any[][] = await Promise.all([
    db.workoutHistory.findMany({ where: { userId: student.id, date: { gte: start, lt: end } }, orderBy: { date: 'asc' }, select }),
    db.workoutHistory.findMany({ where: { userId: student.id, date: { gte: prevStart, lt: start } }, orderBy: { date: 'asc' }, select }),
    db.exerciseHistory.groupBy({ by: ['exerciseId'], where: { workoutHistory: { userId: student.id, date: { lt: start } }, weight: { gt: 0 } }, _max: { weight: true } }),
  ]);
  const ids = new Set<string>();
  [...histories, ...prevHistories].forEach((h: any) => (h.details || []).forEach((d: any) => ids.add(d.exerciseId)));
  const exRows: any[] = ids.size ? await db.exercise.findMany({ where: { id: { in: [...ids] } }, select: { id: true, category: true } }) : [];

  // ── auxiliares: se falharem, aquela parte simplesmente fica de fora ──
  const [checkins, mealLogs, daily, workouts]: any[] = await Promise.all([
    aux(db.checkIn.findMany({ where: { userId: student.id, date: { gte: start, lt: end } }, orderBy: { date: 'asc' }, select: { id: true, date: true, weight: true, photoFront: true, photoSide: true, photoBack: true } }), []),
    student.dietModule ? aux(db.dietMealLog.findMany({ where: { userId: student.id, date: { gte: startYmd, lte: endYmd } }, select: { date: true, status: true } }), null) : Promise.resolve(null),
    student.dietModule ? aux(db.dailyCheckin.findMany({ where: { studentId: student.id, date: { gte: startYmd, lte: endYmd } }, select: { date: true, dietAdherence: true } }), null) : Promise.resolve(null),
    aux(db.workout.findMany({ where: { userId: student.id, archived: false }, select: { id: true, startDate: true, createdAt: true, endDate: true, archived: true, alternateSlot: true, exercises: { select: { day: true, exerciseId: true } } } }), null),
  ]);

  let plannedPerWeek: number | null = null;
  if (workouts) {
    const visible = activeWorkoutsForWeek(workouts, mondayOf(now));
    const planDays = new Set<string>();
    visible.forEach((w: any) => (w.exercises || []).forEach((e: any) => {
      const day = String(e.day || '').trim().toUpperCase();
      if (day && day !== 'OFF' && !day.includes('DESCANSO')) planDays.add(day);
    }));
    plannedPerWeek = planDays.size || null;
  }

  const baselineMax: Record<string, number> = {};
  baseRows.forEach((r: any) => { const w = toNum(r?._max?.weight); if (r?.exerciseId && w > 0) baselineMax[r.exerciseId] = w; });
  const categories: Record<string, string> = {};
  exRows.forEach((e: any) => { if (e?.id) categories[e.id] = String(e.category || ''); });

  return computeMonthlyReport({
    now, days, student, histories, prevHistories, baselineMax, categories, checkins,
    mealLogs, daily: daily ? daily.map((x: any) => ({ date: x.date, adherence: x.dietAdherence })) : null, plannedPerWeek,
  });
}
