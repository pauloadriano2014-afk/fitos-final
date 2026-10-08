// lib/workoutDiff.ts
// 🛠️ (9 out 2026) COMPARAÇÃO ANTES/DEPOIS de um treino: o coach ajusta a ficha (ex.: "sem tempo no treino") e o aluno precisa saber, em palavras simples, o que mudou.
// Tudo aqui é função pura (sem banco): a rota que salva o treino (PUT /api/workout/[id]) entrega as linhas de antes e de depois e o dicionário id -> nome.
//
// Linha de exercício = o mesmo formato que o "Montar treino" grava (WorkoutExercise): { exerciseId, day, sets, reps, restTime, technique (JSON: { t, b: blocos, o }) }.

export interface DiffRow { exerciseId: string; day?: string | null; sets?: number | string | null; reps?: string | null; restTime?: number | string | null; technique?: string | null }

export type ChangeType = 'REMOVED' | 'ADDED' | 'SETS' | 'REST' | 'TECHNIQUE';
export interface Change { type: ChangeType; day: string; exerciseId: string; exercise: string; from?: string | number | null; to?: string | number | null; text: string }

export interface DayEstimate { day: string; before: number; after: number }
export interface WorkoutDiff { changes: Change[]; lines: string[]; estimate: DayEstimate[]; days: string[]; hasChanges: boolean }

const EXEC_SECONDS = 40;                 // tempo médio de uma série em si (o descanso vem à parte)

const norm = (s: any) => String(s ?? '').trim().toUpperCase();
const num = (v: any): number => { const n = parseInt(String(v), 10); return Number.isFinite(n) ? n : 0; };

const TECH_LABEL: Record<string, string> = { BISET: 'bi-set', TRISET: 'tri-set', DROPSET: 'drop-set', RESTPAUSE: 'rest-pause', GVT: 'GVT', CLUSTERSET: 'cluster', '21': 'método 21', CIRCUITO: 'circuito' };
const techLabel = (t: string) => TECH_LABEL[norm(t).replace(/[\s_-]/g, '')] || String(t).trim().toLowerCase();

interface Parsed { blocks: Array<{ sets: number; rest: number; technique: string }>; totalSets: number; rest: number; technique: string }

/** Lê a linha: séries totais (soma dos blocos), descanso do 1º bloco e a técnica (a do 1º bloco que tiver uma). */
export function parseRow(r: DiffRow): Parsed {
  let blocks: Parsed['blocks'] = [];
  try {
    const j = typeof r.technique === 'string' && r.technique.trim().startsWith('{') ? JSON.parse(r.technique) : null;
    if (j && Array.isArray(j.b)) blocks = j.b.map((b: any) => ({ sets: num(b?.sets), rest: num(b?.restTime), technique: String(b?.technique || '').trim() }));
    if (j && !blocks.length && j.t) blocks = [{ sets: num(r.sets), rest: num(r.restTime), technique: String(j.t) }];
  } catch { /* técnica em texto simples */ }
  if (!blocks.length) blocks = [{ sets: num(r.sets), rest: num(r.restTime), technique: typeof r.technique === 'string' && !r.technique.trim().startsWith('{') ? r.technique.trim() : '' }];
  const totalSets = blocks.reduce((s, b) => s + b.sets, 0) || num(r.sets);
  const technique = blocks.map((b) => b.technique).find((t) => t) || '';
  return { blocks, totalSets, rest: blocks[0].rest || num(r.restTime), technique };
}

const keyOf = (r: DiffRow, n: number) => `${norm(r.day)}|${r.exerciseId}|${n}`;   // n = ocorrência (o mesmo exercício duas vezes no dia)

function indexRows(rows: DiffRow[]): Map<string, DiffRow> {
  const seen = new Map<string, number>();
  const out = new Map<string, DiffRow>();
  for (const r of rows) {
    const base = `${norm(r.day)}|${r.exerciseId}`;
    const n = seen.get(base) || 0; seen.set(base, n + 1);
    out.set(keyOf(r, n), r);
  }
  return out;
}

/** Minutos estimados de um dia: séries × (execução + descanso). Cardio (ids em `cardio`) conta as "séries" como minutos. */
export function estimateMinutes(rows: DiffRow[], day: string, cardio: Set<string> = new Set()): number {
  let sec = 0;
  for (const r of rows) {
    if (norm(r.day) !== norm(day)) continue;
    const p = parseRow(r);
    if (cardio.has(r.exerciseId)) { sec += (p.totalSets || num(r.sets)) * 60; continue; }
    const rest = p.blocks.reduce((s, b) => s + b.sets * (b.rest || p.rest), 0) || p.totalSets * p.rest;
    sec += p.totalSets * EXEC_SECONDS + rest;
  }
  return Math.round(sec / 60);
}

export function diffWorkout(before: DiffRow[], after: DiffRow[], names: Record<string, string> = {}, opts: { cardio?: Set<string> } = {}): WorkoutDiff {
  const nm = (id: string) => names[id] || 'exercício';
  const B = indexRows(before), A = indexRows(after);
  const changes: Change[] = [];
  const dayLabel = (d: any) => String(d ?? '').trim() || 'Treino';

  for (const [k, b] of B) {
    const a = A.get(k);
    const day = dayLabel(b.day);
    if (!a) {
      changes.push({ type: 'REMOVED', day, exerciseId: b.exerciseId, exercise: nm(b.exerciseId), text: `Tirei ${nm(b.exerciseId)}` });
      continue;
    }
    const pb = parseRow(b), pa = parseRow(a);
    const cardio = opts.cardio && opts.cardio.has(b.exerciseId);
    if (pb.totalSets !== pa.totalSets) changes.push({ type: 'SETS', day, exerciseId: b.exerciseId, exercise: nm(b.exerciseId), from: pb.totalSets, to: pa.totalSets, text: `${nm(b.exerciseId)}: ${pb.totalSets} → ${pa.totalSets}${cardio ? ' min' : ' séries'}` });
    if (!cardio && pb.rest !== pa.rest && (pb.rest || pa.rest)) changes.push({ type: 'REST', day, exerciseId: b.exerciseId, exercise: nm(b.exerciseId), from: pb.rest, to: pa.rest, text: `${nm(b.exerciseId)}: descanso de ${pb.rest}s para ${pa.rest}s` });
    if (norm(pb.technique) !== norm(pa.technique)) changes.push({ type: 'TECHNIQUE', day, exerciseId: b.exerciseId, exercise: nm(b.exerciseId), from: pb.technique || null, to: pa.technique || null, text: pa.technique ? `${nm(b.exerciseId)}: agora em ${techLabel(pa.technique)}` : `${nm(b.exerciseId)}: sem ${techLabel(pb.technique)}` });
  }
  for (const [k, a] of A) {
    if (!B.has(k)) changes.push({ type: 'ADDED', day: dayLabel(a.day), exerciseId: a.exerciseId, exercise: nm(a.exerciseId), text: `Incluí ${nm(a.exerciseId)}` });
  }

  const days = [...new Set(changes.map((c) => c.day))];
  const estimate: DayEstimate[] = days.map((d) => ({ day: d, before: estimateMinutes(before, d, opts.cardio), after: estimateMinutes(after, d, opts.cardio) })).filter((e) => e.before > 0 && e.after > 0 && e.before !== e.after);

  return { changes, lines: summaryLines(changes), estimate, days, hasChanges: changes.length > 0 };
}

const join = (xs: string[]) => (xs.length <= 1 ? xs.join('') : xs.slice(0, -1).join(', ') + ' e ' + xs[xs.length - 1]);

/** Frases curtas e agrupadas ("Tirei A, B e C") para o aluno ler de uma vez. */
export function summaryLines(changes: Change[]): string[] {
  const out: string[] = [];
  const by = (t: ChangeType) => changes.filter((c) => c.type === t);
  const uniq = (xs: string[]) => [...new Set(xs)];
  const removed = by('REMOVED'), added = by('ADDED'), sets = by('SETS'), rest = by('REST'), tech = by('TECHNIQUE');
  if (removed.length) out.push(`Tirei ${join(uniq(removed.map((c) => c.exercise)))}.`);
  if (sets.length) out.push(`Menos séries: ${join(sets.map((c) => `${c.exercise} (${c.from}→${c.to})`))}.`);
  if (rest.length) out.push(`Descanso ajustado: ${join(rest.map((c) => `${c.exercise} (${c.from}s→${c.to}s)`))}.`);
  if (tech.length) out.push(`Técnica: ${join(tech.map((c) => (c.to ? `${c.exercise} em ${techLabel(String(c.to))}` : `${c.exercise} sem ${techLabel(String(c.from))}`)))}.`);
  if (added.length) out.push(`Incluí ${join(uniq(added.map((c) => c.exercise)))}.`);
  return out;
}

const firstName = (n?: string | null) => String(n || '').trim().split(/\s+/)[0] || '';

/** Texto sugerido ao aluno depois de ajustar o treino (o coach revisa e edita antes de enviar). */
export function buildAdjustmentMessage(o: { studentName?: string | null; day?: string | null; diff: Pick<WorkoutDiff, 'lines' | 'estimate'>; followUp?: boolean }): { title: string; body: string } {
  const day = String(o.day || '').trim();
  const dayTxt = day ? (day.length <= 3 ? `treino ${day.toUpperCase()}` : day) : 'treino';
  const hi = firstName(o.studentName);
  const est = o.diff.estimate.find((e) => !day || norm(e.day) === norm(day)) || o.diff.estimate[0];
  const parts: string[] = [`${hi ? `Oi, ${hi}! ` : ''}Ajustei o seu ${dayTxt} para caber no seu tempo.`];
  if (o.diff.lines.length) parts.push(o.diff.lines.map((l) => `• ${l}`).join('\n'));
  if (est) parts.push(`Tempo estimado: de ${est.before} para ${est.after} min.`);
  if (o.followUp !== false) parts.push('Se ainda faltar tempo, marque "não deu tempo" quando finalizar o treino que eu ajusto de novo. 💪');
  return { title: `Ajustei o seu ${dayTxt}`, body: parts.join('\n\n') };
}
