// lib/studentLoads.ts
// 🏋️ (18 out 2026) AS CARGAS DE CADA EXERCÍCIO DO ALUNO, SEPARADAS POR FASE, para o editor do coach (Montar treino).
// Para cada exercício que o aluno já fez devolve:
//   • refs.NORMAL / refs.DELOAD / refs.CHOQUE: o treino MAIS RECENTE feito em cada fase (data, cargas por série, maior carga);
//   • series: os últimos treinos (qualquer fase, do mais velho para o mais novo) para o mini-gráfico, cada ponto com a fase;
//   • suggestion: a sugestão de carga do aluno (a MESMA regra do app do aluno, só com treinos normais; ver lib/loadSuggest.ts);
//   • raiseBase: "subir a base" depois de um choque bem-sucedido (só SUGESTÃO: o coach aceita ou não; nada muda sozinho).
// Regra de ouro: o histórico guarda a carga TOTAL (`weight`) + `perSide` só para mostrar do jeito que o aluno anotou (lib/exerciseLoad.ts).
// ATENÇÃO (como o app do aluno grava): na semana de deload/choque o aluno VÊ a carga já multiplicada (40 -> 32 no deload) e, ao finalizar, o app devolve a carga
// digitada para a BASE (32 / 0,8 = 40) antes de enviar. Então `weight` é sempre "equivalente à base". Para mostrar ao coach o que o aluno de fato levantou numa
// semana especial, multiplicamos de volta pelo multiplicador gravado no treino (`intensityApplied`): 40 × 0,8 = 32 no deload; 40 × 1,1 = 44 no choque.
// Treino antigo (sem `intensityApplied`) fica como está (equivalente à base, que é o certo para o Puxar cargas).
// Tudo aqui é função pura (recebe o histórico já lido); a rota só lê o banco e chama isto.
import { cleanPhase, isNormalPhase, LoadPhase } from '@/lib/loadPhase';
import { cleanEffort, sessionsOf, suggestLoad, Suggestion } from '@/lib/loadSuggest';

export const SERIES_LIMIT = 8;
/** Choque mais velho que isso não gera sugestão de subir a base (o aluno já voltou ao normal há muito tempo). */
export const RAISE_MAX_DAYS = 35;

type DetailRow = {
  exerciseId: string; exerciseName?: string | null; setNumber: number; weight: number;
  perSide?: boolean | null; effort?: string | null; cardioSeconds?: number | null; cardioKcal?: number | null;
};
export type HistoryRow = { date: Date | string; loadPhase?: string | null; intensityApplied?: number | null; details?: DetailRow[] | null };

export type RefSet = { setNumber: number; weight: number; perSide: boolean };
/** `sets`/`top` = o que o aluno de fato levantou (deload e choque já multiplicados); `baseTop` = a maior carga equivalente à base (o que o histórico guarda). Na fase normal são iguais. */
export type PhaseRef = { date: string; sets: RefSet[]; top: number; baseTop: number; perSide: boolean; effort: string | null; multiplier: number };
export type SeriesPoint = { date: string; phase: LoadPhase; top: number; perSide: boolean };
export type RaiseBase = { to: number; from: number; perSide: boolean; date: string };
export type ExerciseLoads = {
  name: string | null;
  refs: Partial<Record<LoadPhase, PhaseRef>>;
  series: SeriesPoint[];
  suggestion: Suggestion | null;
  raiseBase: RaiseBase | null;
};

const round1 = (n: number) => Math.round(n * 10) / 10;
const iso = (d: Date | string) => { const t = new Date(d); return Number.isFinite(t.getTime()) ? t.toISOString() : ''; };
const phaseOfRow = (h: HistoryRow): LoadPhase => (isNormalPhase(h.loadPhase) ? 'NORMAL' : (cleanPhase(h.loadPhase) as LoadPhase));

/** Um treino de UM exercício (séries com carga > 0). Cardio devolve null (o "peso" ali são minutos). */
function sessionOf(h: HistoryRow, exerciseId: string): { ref: PhaseRef; phase: LoadPhase } | null {
  const rows = (h.details || []).filter((d) => d.exerciseId === exerciseId);
  if (rows.length === 0) return null;
  if (rows.some((d) => d.cardioSeconds != null || d.cardioKcal != null)) return null;
  const phase = phaseOfRow(h);
  // multiplicador só vale em semana especial e só se foi gravado (treino antigo = 1: continua equivalente à base)
  const m = phase !== 'NORMAL' && Number(h.intensityApplied) > 0 ? Number(h.intensityApplied) : 1;
  const raw = rows
    .filter((d) => Number(d.weight) > 0)
    .map((d) => ({ setNumber: d.setNumber, weight: Number(d.weight), perSide: d.perSide === true }))
    .sort((a, b) => a.setNumber - b.setNumber);
  if (raw.length === 0) return null;
  const sets = raw.map((s) => ({ ...s, weight: m === 1 ? s.weight : round1(s.weight * m) }));
  const top = Math.max(...sets.map((s) => s.weight));
  const baseTop = Math.max(...raw.map((s) => s.weight));
  const effort = cleanEffort(rows.find((d) => cleanEffort(d.effort))?.effort) || null;
  return { phase, ref: { date: iso(h.date), sets, top, baseTop, perSide: sets.every((s) => s.perSide), effort, multiplier: m } };
}

/** "Subir a base": o aluno fez o choque com carga acima da normal e sem achar pesado demais. Sugestão para o coach aceitar. */
export function raiseFromChoque(refs: ExerciseLoads['refs'], now: Date): RaiseBase | null {
  const c = refs.CHOQUE; const n = refs.NORMAL;
  if (!c || c.effort === 'PESADO') return null;
  const days = (now.getTime() - new Date(c.date).getTime()) / 86400000;
  if (!(days >= 0 && days <= RAISE_MAX_DAYS)) return null;
  const base = n ? n.top : 0;
  if (!(c.top > base)) return null;   // `c.top` = o que o aluno de fato levantou no choque (já multiplicado)
  return { to: c.top, from: base, perSide: c.perSide, date: c.date };
}

/**
 * As cargas por exercício a partir do histórico (do mais novo para o mais velho, como o banco devolve).
 * `onlyIds` (opcional) limita aos exercícios pedidos. `step` = salto fixo do coach para a sugestão (null = automático).
 */
export function buildStudentLoads(
  history: HistoryRow[],
  opts: { now?: Date; step?: number | null; onlyIds?: string[] | null; suggest?: boolean } = {},
): Record<string, ExerciseLoads> {
  const now = opts.now || new Date();
  const want = opts.onlyIds && opts.onlyIds.length ? new Set(opts.onlyIds) : null;
  const ids = new Map<string, string | null>();
  for (const h of history || []) for (const d of h.details || []) {
    if (!d.exerciseId || (want && !want.has(d.exerciseId))) continue;
    if (!ids.has(d.exerciseId)) ids.set(d.exerciseId, d.exerciseName || null);
  }
  const out: Record<string, ExerciseLoads> = {};
  for (const [id, name] of ids) {
    const refs: ExerciseLoads['refs'] = {};
    const pts: SeriesPoint[] = [];
    for (const h of history || []) {
      const s = sessionOf(h, id);
      if (!s) continue;
      if (!refs[s.phase]) refs[s.phase] = s.ref;          // o primeiro de cada fase é o mais recente
      if (pts.length < SERIES_LIMIT) pts.push({ date: s.ref.date, phase: s.phase, top: s.ref.top, perSide: s.ref.perSide });
    }
    if (pts.length === 0) continue;                         // só cardio ou sem carga: nada a mostrar
    out[id] = {
      name,
      refs,
      series: pts.reverse(),
      suggestion: opts.suggest === false ? null : suggestLoad(sessionsOf(history, id), { now, step: opts.step ?? null }),
      raiseBase: raiseFromChoque(refs, now),
    };
  }
  return out;
}
