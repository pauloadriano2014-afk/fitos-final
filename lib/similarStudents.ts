// lib/similarStudents.ts
// 🧬 (18 out 2026) ALUNOS PARECIDOS + COMPARAÇÃO DE TREINO (etapa 1 da "inteligência do assistente": SÓ REGRAS, sem IA e sem custo).
// Para um aluno (o "destino"), o servidor procura na carteira do MESMO coach alunos-referência que:
//   • entram nas análises (lib/insightsScope.ts: ativos, com treino feito, não são teste) e são do MESMO GÊNERO (nunca se compara homem com mulher);
//   • se parecem pela anamnese: objetivo (30), nível (20), frequência semanal (15), local de treino (15), limitações (10), tempo disponível (10) = 100 pontos;
//   • e têm uma ROTINA EXECUTADA na mesma fase do destino: quem ainda não teve rotina compara com as rotinas 1 a 3 dos outros (não com a 10ª);
//     quem está na rotina k compara com as rotinas k-1 a k+1. "Rotina" = ficha (Workout) que o aluno de fato treinou (MIN_ROUTINE_SESSIONS treinos feitos).
// Depois, `compareWorkouts` marca em cada exercício da rotina de origem o que NÃO serve para o destino: aparelho que ele disse não ter, articulação com
// limitação (JOELHO/LOMBAR/OMBRO) e ambiente de treino diferente. Tudo é função pura, menos `findSimilar` e `loadComparison` (só LEEM).
import { loadInsightsPool, parseGender, Gender, PoolStudent } from '@/lib/insightsScope';
import { LEVEL_ORDER, LEVEL_LABEL, LevelKey, parseLevel, computeLevel } from '@/lib/studentLevel';
import { JOINT_BY_TEXT } from '@/lib/autoPlanQuality';
import { deriveTrainingEnvironment } from '@/lib/ai/splitPresets';
import { ownStudentScope } from '@/lib/agendaStore';
import { unavailableExerciseIds } from '@/lib/equipment';
import { pickSwap, nameKey, type LibEx, type SwapTarget } from '@/lib/exerciseSwap';
import { visibleLibraryWhere } from '@/lib/exerciseVisibility';

export const MIN_ROUTINE_SESSIONS = 3;   // treinos feitos para uma ficha contar como "rotina"
export const MIN_SCORE = 40;             // abaixo disso não é "parecido"
export const MAX_SIMILAR = 5;
export const WEIGHTS = { objective: 30, level: 20, frequency: 15, place: 15, limits: 10, time: 10 } as const;

const norm = (s: any) => String(s ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
const arr = (v: any): string[] => (Array.isArray(v) ? v.map((x) => String(x)) : []);
const isNone = (s: string) => /^(nenhum|nenhuma|nao|nenhum\/nenhuma)$/.test(norm(s)) || !norm(s);
const real = (v: any) => arr(v).filter((x) => !isNone(x));
const jaccard = (a: string[], b: string[]) => { const A = new Set(a), B = new Set(b); if (!A.size && !B.size) return 1; let i = 0; A.forEach((x) => { if (B.has(x)) i++; }); return i / (A.size + B.size - i); };

// ─────────────────────────── perfil pela anamnese ───────────────────────────
export type ObjectiveKey = 'EMAGRECIMENTO' | 'HIPERTROFIA' | 'CONDICIONAMENTO' | 'OUTRO';
export function objectiveKey(raw: any): ObjectiveKey {
  const s = norm(raw);
  if (/emagrec|perda|perder|gordura|secar|defin/.test(s)) return 'EMAGRECIMENTO';
  if (/hipertrof|massa|ganho|muscul|volume|forca/.test(s)) return 'HIPERTROFIA';
  if (/condicion|saude|resist|bem.?estar|qualidade|mobilidade|fôlego|folego/.test(s)) return 'CONDICIONAMENTO';
  return 'OUTRO';
}
export type Place = 'ACADEMIA' | 'CONDOMINIO' | 'CASA';
export function placesOf(equipamentos: any): Place[] {
  const out = new Set<Place>();
  for (const e of arr(equipamentos).map(norm)) {
    if (e.includes('condominio')) out.add('CONDOMINIO'); else if (e.includes('casa')) out.add('CASA'); else if (e.includes('academia')) out.add('ACADEMIA');
  }
  return [...out].sort();
}
export function jointRisksOf(limits: string[]): string[] {
  const out = new Set<string>();
  for (const l of limits) for (const [re, joint] of JOINT_BY_TEXT) if (re.test(norm(l))) out.add(joint);
  return [...out].sort();
}
export interface Profile {
  objective: ObjectiveKey; objectiveText: string; level: LevelKey; freq: number | null; minutes: number | null;
  places: Place[]; limits: string[]; limitKeys: string[]; jointRisks: string[]; env: string;
}
export function buildProfile(anamnese: any, level: LevelKey): Profile {
  const a = anamnese || {};
  const limits = [...real(a.limitacoes), ...real(a.cirurgias)];
  const jointRisks = jointRisksOf(limits);
  return {
    objective: objectiveKey(a.objetivo), objectiveText: String(a.objetivo || ''), level,
    freq: Number.isFinite(Number(a.frequencia)) && Number(a.frequencia) > 0 ? Number(a.frequencia) : null,
    minutes: Number.isFinite(Number(a.tempoDisponivel)) && Number(a.tempoDisponivel) > 0 ? Number(a.tempoDisponivel) : null,
    places: placesOf(a.equipamentos), limits, limitKeys: [...new Set([...jointRisks, ...limits.map(norm)])], jointRisks,
    env: deriveTrainingEnvironment(arr(a.equipamentos) as any),
  };
}

export interface Similarity { score: number; reasons: string[] }
/** Quanto o aluno-referência se parece com o destino (0–100) e os motivos em português simples. */
export function scoreSimilarity(t: Profile, r: Profile): Similarity {
  let score = 0; const reasons: string[] = [];
  if (t.objective === r.objective && t.objective !== 'OUTRO') { score += WEIGHTS.objective; reasons.push(`mesmo objetivo (${t.objectiveText || r.objectiveText})`); }
  else if (t.objective === 'OUTRO' && r.objective === 'OUTRO' && norm(t.objectiveText) && norm(t.objectiveText) === norm(r.objectiveText)) { score += WEIGHTS.objective; reasons.push(`mesmo objetivo (${t.objectiveText})`); }
  const dl = Math.abs(LEVEL_ORDER.indexOf(t.level) - LEVEL_ORDER.indexOf(r.level));
  if (dl === 0) { score += WEIGHTS.level; reasons.push(`mesmo nível (${LEVEL_LABEL[t.level]})`); } else if (dl === 1) { score += WEIGHTS.level / 2; reasons.push('nível próximo'); }
  if (t.freq != null && r.freq != null) {
    const d = Math.abs(t.freq - r.freq);
    if (d === 0) { score += WEIGHTS.frequency; reasons.push(`treina ${t.freq}x por semana, igual`); } else if (d === 1) { score += WEIGHTS.frequency / 2; reasons.push('frequência semanal próxima'); }
  }
  if (t.places.length || r.places.length) {
    const j = jaccard(t.places, r.places);
    if (j > 0) { score += Math.round(WEIGHTS.place * j); if (j === 1) reasons.push('mesmo local de treino'); else reasons.push('local de treino parecido'); }
  }
  if (!t.limitKeys.length && !r.limitKeys.length) { score += WEIGHTS.limits; }
  else if (!t.limitKeys.length) { score += WEIGHTS.limits / 2; }
  else { const j = jaccard(t.limitKeys, r.limitKeys); if (j > 0) { score += Math.round(WEIGHTS.limits * j); reasons.push(`mesma limitação (${t.limits.join(', ')})`); } }
  if (t.minutes != null && r.minutes != null && Math.abs(t.minutes - r.minutes) <= 15) { score += WEIGHTS.time; reasons.push('tempo de treino parecido'); }
  return { score: Math.round(score), reasons };
}

// ─────────────────────────── rotinas (fichas treinadas) ───────────────────────────
export interface WorkoutRow { id: string; name: string; createdAt: Date | string; endDate?: Date | string | null; archived?: boolean | null }
export interface HistoryRow { date: Date | string; workoutId?: string | null }
export interface Routine { id: string; name: string; createdAt: Date; endDate: Date | null; archived: boolean; sessions: number; ordinal: number | null }
const ts = (d: any) => new Date(d).getTime();

/** Ordena as fichas, conta os treinos de cada uma e numera (1ª, 2ª…) só as que foram de fato treinadas. Treino pelo `workoutId` quando existe; sem ele, vale a ficha mais nova criada até aquele dia. */
export function buildRoutines(workouts: WorkoutRow[], history: HistoryRow[]): Routine[] {
  const ws = (workouts || []).filter((w) => w && w.id && !Number.isNaN(ts(w.createdAt))).slice().sort((a, b) => ts(a.createdAt) - ts(b.createdAt) || String(a.id).localeCompare(String(b.id)));
  const byId = new Map(ws.map((w) => [w.id, 0]));
  for (const h of history || []) {
    const when = ts(h.date); if (Number.isNaN(when)) continue;
    if (h.workoutId && byId.has(h.workoutId)) { byId.set(h.workoutId, (byId.get(h.workoutId) || 0) + 1); continue; }
    let owner: WorkoutRow | null = null;
    for (const w of ws) { if (ts(w.createdAt) <= when) owner = w; else break; }
    if (owner) byId.set(owner.id, (byId.get(owner.id) || 0) + 1);
  }
  let n = 0;
  return ws.map((w) => {
    const sessions = byId.get(w.id) || 0;
    const ordinal = sessions >= MIN_ROUTINE_SESSIONS ? ++n : null;
    return { id: w.id, name: w.name, createdAt: new Date(w.createdAt), endDate: w.endDate ? new Date(w.endDate) : null, archived: !!w.archived, sessions, ordinal };
  });
}
/** Em qual rotina o destino está entrando (1 = ainda não treinou nenhuma). */
export const nextOrdinal = (routines: Routine[]) => routines.filter((r) => r.ordinal != null).length + 1;
/** Faixa de rotinas dos outros alunos que servem para quem está entrando na rotina k: a 1ª..3ª para quem é novo; k-1..k+1 para os demais. */
export const ordinalWindow = (k: number): [number, number] => (k <= 1 ? [1, 3] : [k - 1, k + 1]);
/** A melhor rotina do aluno-referência para o destino (a mais próxima de k; empate: a mais treinada) e as outras da faixa. */
export function pickRoutine(routines: Routine[], k: number): { best: Routine | null; others: Routine[] } {
  const [lo, hi] = ordinalWindow(k);
  const c = routines.filter((r) => r.ordinal != null && r.ordinal >= lo && r.ordinal <= hi).sort((a, b) => Math.abs((a.ordinal as number) - k) - Math.abs((b.ordinal as number) - k) || b.sessions - a.sessions || (a.ordinal as number) - (b.ordinal as number));
  return { best: c[0] || null, others: c.slice(1) };
}

// ─────────────────────────── alunos parecidos ───────────────────────────
export interface SimilarItem {
  studentId: string; name: string; gender: Gender | null; score: number; reasons: string[];
  level: { level: LevelKey; label: string } | null; sessions: number;
  routine: { id: string; name: string; ordinal: number; sessions: number; archived: boolean };
  others: { id: string; name: string; ordinal: number; sessions: number }[];
}
/** Aluno parecido para o PANORAMA: todas as rotinas que ele já treinou (não só as da faixa), usado para estatísticas do grupo. */
export interface PanoramaSource { studentId: string; name: string; level: LevelKey; score: number; routines: { id: string; ordinal: number; sessions: number }[] }
export interface SimilarResult {
  ok: boolean; reason?: 'SEM_GENERO' | 'NAO_ENCONTRADO';
  target?: { id: string; name: string; gender: Gender; level: { level: LevelKey; label: string }; routinesDone: number; nextOrdinal: number; window: [number, number]; limits: string[]; places: Place[]; objective: string };
  similar: SimilarItem[];
  pool: { considered: number; withoutRoutine: number; belowScore: number };
  panorama?: PanoramaSource[];   // só com `wide: true`
}

type Db = any;
const newest = <T extends { userId: string; createdAt: any }>(rows: T[]) => { const m = new Map<string, T>(); for (const r of rows) { const c = m.get(r.userId); if (!c || ts(r.createdAt) > ts(c.createdAt)) m.set(r.userId, r); } return m; };
const group = <T extends { userId: string }>(rows: T[]) => { const m = new Map<string, T[]>(); for (const r of rows) { if (!m.has(r.userId)) m.set(r.userId, []); m.get(r.userId)!.push(r); } return m; };

export async function findSimilar(db: Db, coachId: string, targetId: string, now: Date = new Date(), o: { wide?: boolean } = {}): Promise<SimilarResult> {
  const empty = { considered: 0, withoutRoutine: 0, belowScore: 0 };
  const t: any = await db.user.findFirst({ where: { id: targetId, role: 'USER', AND: [ownStudentScope(coachId)] }, select: { id: true, name: true, gender: true, level: true, startDate: true, createdAt: true } });
  if (!t) return { ok: false, reason: 'NAO_ENCONTRADO', similar: [], pool: empty };
  const gender = parseGender(t.gender);
  if (!gender) return { ok: false, reason: 'SEM_GENERO', similar: [], pool: empty };

  const pool = await loadInsightsPool(db, coachId, now);
  const refs: PoolStudent[] = pool.included.filter((s) => s.gender === gender && s.id !== targetId);
  const ids = [targetId, ...refs.map((r) => r.id)];
  const [anams, wks, hist] = await Promise.all([
    db.anamnese.findMany({ where: { userId: { in: ids } }, select: { userId: true, createdAt: true, objetivo: true, nivel: true, frequencia: true, tempoDisponivel: true, limitacoes: true, cirurgias: true, equipamentos: true } }),
    db.workout.findMany({ where: { userId: { in: ids } }, select: { id: true, userId: true, name: true, createdAt: true, endDate: true, archived: true } }),
    db.workoutHistory.findMany({ where: { userId: { in: ids } }, select: { userId: true, date: true, workoutId: true } }),
  ]);
  const A = newest(anams as any[]); const W = group(wks as any[]); const H = group(hist as any[]);

  const tSess = (H.get(targetId) || []).length;
  const tLevel = computeLevel({ entry: parseLevel(t.level) || parseLevel(A.get(targetId)?.nivel) || 'INICIANTE', startDate: t.startDate || t.createdAt, sessions: tSess, now });
  const tProfile = buildProfile(A.get(targetId), tLevel.level);
  const tRoutines = buildRoutines((W.get(targetId) || []) as any, (H.get(targetId) || []) as any);
  const k = nextOrdinal(tRoutines);

  let withoutRoutine = 0, belowScore = 0; const similar: SimilarItem[] = []; const wide: PanoramaSource[] = [];
  for (const r of refs) {
    const rLevel = r.level ? r.level.level : 'INICIANTE';
    const sim = scoreSimilarity(tProfile, buildProfile(A.get(r.id), rLevel));
    if (sim.score < MIN_SCORE) { belowScore++; continue; }
    const all = buildRoutines((W.get(r.id) || []) as any, (H.get(r.id) || []) as any);
    if (o.wide) { const done = all.filter((x) => x.ordinal != null); if (done.length) wide.push({ studentId: r.id, name: r.name, level: rLevel, score: sim.score, routines: done.map((x) => ({ id: x.id, ordinal: x.ordinal as number, sessions: x.sessions })) }); }
    const picked = pickRoutine(all, k);
    if (!picked.best) { withoutRoutine++; continue; }
    const b = picked.best;
    similar.push({
      studentId: r.id, name: r.name, gender: r.gender, score: sim.score, reasons: sim.reasons,
      level: r.level ? { level: r.level.level, label: r.level.label } : null, sessions: r.sessions,
      routine: { id: b.id, name: b.name, ordinal: b.ordinal as number, sessions: b.sessions, archived: b.archived },
      others: picked.others.map((o) => ({ id: o.id, name: o.name, ordinal: o.ordinal as number, sessions: o.sessions })),
    });
  }
  similar.sort((a, b) => b.score - a.score || b.routine.sessions - a.routine.sessions || a.name.localeCompare(b.name, 'pt-BR'));
  return {
    ok: true,
    target: { id: t.id, name: t.name || 'Aluno', gender, level: { level: tLevel.level, label: tLevel.label }, routinesDone: k - 1, nextOrdinal: k, window: ordinalWindow(k), limits: tProfile.limits, places: tProfile.places, objective: tProfile.objectiveText },
    similar: similar.slice(0, MAX_SIMILAR),
    pool: { considered: refs.length, withoutRoutine, belowScore },
    ...(o.wide ? { panorama: wide.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name, 'pt-BR')) } : {}),
  };
}

// ─────────────────────────── comparação de treino ───────────────────────────
export type Flag = 'SEM_APARELHO' | 'LIMITACAO' | 'AMBIENTE' | 'NIVEL';
export const FLAG_LABEL: Record<Flag, string> = { SEM_APARELHO: 'aluno não tem o aparelho', LIMITACAO: 'risco para a limitação do aluno', AMBIENTE: 'não combina com o local de treino', NIVEL: 'avançado para o nível do aluno' };

// ───────────── adequação ao NÍVEL (sem IA) ─────────────
// Regra simples e editável: técnicas e exercícios que pedem mais experiência do que o aluno de destino tem. Bi-set fica fora (é comum em iniciante).
const ADVANCED_TECH: Record<LevelKey, string[]> = {
  INICIANTE: ['DROPSET', 'RESTPAUSE', 'CLUSTERSET', '21', 'TRISET', 'GVT', '1.5REPS', '15REPS', 'TUT'],
  INTERMEDIARIO: ['CLUSTERSET', '21', 'GVT'],
  AVANCADO: [],
};
const COMPLEX_FOR_BEGINNER: RegExp[] = [/levantamento terra/, /agachamento (livre|frontal|bulgaro|sumo|hack livre)/, /\bbarra fixa\b(?!.*(assist|gravitron|graviton))/, /\b(mergulho|paralela)\b/, /desenvolvimento.*(militar|em pe)/, /\b(arranco|arremesso|power clean|clean)\b/, /good ?morning/, /stiff.*barra|barra.*stiff/];
const techNorm = (t: string) => t.toUpperCase().replace(/[\s_-]/g, '');
/** O que, neste exercício, pede mais nível do que o aluno tem: as técnicas avançadas (para tirar) e se o exercício em si é complexo (para trocar). */
export function levelFix(name: string, technique: string | null, level?: LevelKey | null): { techs: string[]; complex: boolean } {
  if (!level) return { techs: [], complex: false };
  const techs = (technique ? technique.split(' + ') : []).filter((t) => ADVANCED_TECH[level].includes(techNorm(t)));
  return { techs, complex: level === 'INICIANTE' && COMPLEX_FOR_BEGINNER.some((re) => re.test(norm(name))) };
}
/** Por que este exercício é pesado demais para o nível (vazio = tudo bem). */
export function levelIssues(name: string, technique: string | null, level?: LevelKey | null): string[] {
  const f = levelFix(name, technique, level); const out: string[] = [];
  if (f.techs.length) out.push(`técnica avançada para o nível (${f.techs.map((t) => t.toLowerCase()).join(', ')})`);
  if (f.complex) out.push('exercício complexo para quem está começando');
  return out;
}

// ─────────────────────────── comparação de treino (continuação) ───────────────────────────
export interface ExerciseRow {
  id?: string; exerciseId: string; name: string; category: string; sets: number; reps: string; restTime: number; technique: string | null; notes: string | null; order: number; day: string;
  substitutes: string[]; tags?: any; environments?: string[] | null; subCategory?: string | null;
}
export interface CompareDest { unavailable: Set<string>; jointRisks: string[]; env: string; level?: LevelKey | null; pool?: LibEx[] }
export interface CompareExercise { exerciseId: string; name: string; category: string; sets: number; reps: string; restTime: number; technique: string | null; series: string; notes: string | null; flags: Flag[]; detail: string[]; ok: boolean; hasSwap: boolean; rowId?: string | null; fix?: { techs: string[]; complex: boolean } | null; swapTo?: SwapTarget | null }
export interface CompareDay { day: string; exercises: CompareExercise[]; byCategory: { category: string; count: number }[] }
export interface Comparison {
  days: CompareDay[];
  summary: { daysCount: number; exercises: number; usable: number; flagged: number; avgSets: number; techniques: { name: string; count: number }[]; flags: Record<Flag, number> };
  toChange: { day: string; name: string; flags: Flag[]; why: string[] }[];
}
const envOk = (envs: any, env: string) => {
  const list = arr(envs).map((e) => e.toUpperCase());
  if (!list.length || list.includes('UNIVERSAL') || list.includes(env)) return true;
  return env === 'ACADEMIA_PADRAO' && list.includes('ACADEMIA');
};


// ───────────── leitura da linha do exercício ─────────────
// Quem monta o treino guarda em `technique` um JSON ({ t: técnica do exercício, b: blocos [{ sets, reps, restTime, technique }], o: observação, sb: ... }) OU só o nome da técnica.
// Aqui viram campos limpos para a tela e para a IA: séries totais, linha por série ("S1 15 · S2 12 · S3–4 10 DROPSET"), técnicas (sem "NORMAL") e a observação do coach.
const GROUP_TECH = /^(BISET|TRISET)$/;
const techKey = (t: any) => String(t ?? '').trim().toUpperCase().replace(/[\s_-]/g, '');
const isNormalTech = (t: any) => { const k = techKey(t); return !k || k === 'NORMAL'; };
const clipText = (v: any, n: number) => { const t = String(v ?? '').replace(/\s+/g, ' ').trim(); return t.length > n ? t.slice(0, n - 1) + '…' : t; };
export interface RowDetail { sets: number; reps: string; restTime: number; technique: string | null; series: string; note: string | null }
export function readRowDetail(r: { technique?: any; sets?: any; reps?: any; restTime?: any; notes?: any; category?: any }): RowDetail {
  const raw = typeof r.technique === 'string' ? r.technique.trim() : '';
  let j: any = null;
  if (raw.startsWith('{')) { try { j = JSON.parse(raw); } catch { j = null; } }
  const blocks: any[] = j && Array.isArray(j.b) ? j.b.filter((b: any) => b && typeof b === 'object') : [];
  const techs: string[] = []; const add = (t: any) => { const v = String(t ?? '').trim(); if (v && !isNormalTech(v) && !techs.some((x) => techKey(x) === techKey(v))) techs.push(v); };
  if (j) add(j.t); else if (raw && !raw.startsWith('{')) add(raw);   // JSON quebrado não vira "técnica"
  blocks.forEach((b) => add(b.technique));
  const cardio = /cardio/i.test(String(r.category || ''));
  let series = ''; let sets = Number(r.sets) || 0; let reps = String(r.reps ?? ''); let rest = Number(r.restTime) || 0;
  if (blocks.length && !cardio) {
    const parts: string[] = []; let n = 0;
    for (const b of blocks) {
      const c = Math.max(0, parseInt(String(b.sets), 10) || 0); if (!c) continue;
      const tag = !isNormalTech(b.technique) && !GROUP_TECH.test(techKey(b.technique)) ? ` ${String(b.technique).trim()}` : '';
      parts.push(`${c > 1 ? `S${n + 1}–${n + c}` : `S${n + 1}`} ${b.reps == null || String(b.reps) === '' ? '?' : String(b.reps)}${tag}`); n += c;
    }
    series = parts.join(' · '); if (n > 0) sets = n;
    const first = blocks.find((b) => (parseInt(String(b.sets), 10) || 0) > 0) || blocks[0];
    if (first && first.reps != null && String(first.reps) !== '') reps = String(first.reps);
    rest = Number(first && first.restTime) || rest;
  }
  const note = clipText(j ? j.o : '', 140) || clipText(r.notes, 140);
  return { sets, reps, restTime: rest, technique: techs.length ? techs.join(' + ') : null, series, note: note || null };
}

export function compareWorkouts(rows: ExerciseRow[], dest: CompareDest): Comparison {
  const byDay = new Map<string, ExerciseRow[]>();
  const usedNames = new Set<string>((rows || []).map((r) => nameKey(r.name)));   // a troca nunca repete um exercício que já está na rotina
  for (const r of rows || []) { const d = String(r.day || 'A'); if (!byDay.has(d)) byDay.set(d, []); byDay.get(d)!.push(r); }
  const flagsTotal: Record<Flag, number> = { SEM_APARELHO: 0, LIMITACAO: 0, AMBIENTE: 0, NIVEL: 0 };
  const techniques = new Map<string, number>(); const toChange: Comparison['toChange'] = [];
  let total = 0, flagged = 0, setsSum = 0;
  const days: CompareDay[] = [...byDay.keys()].sort().map((day) => {
    const list = byDay.get(day)!.slice().sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    const cats = new Map<string, number>();
    const exercises: CompareExercise[] = list.map((r) => {
      const flags: Flag[] = []; const detail: string[] = []; const det = readRowDetail(r);
      if (dest.unavailable.has(r.exerciseId)) { flags.push('SEM_APARELHO'); detail.push('o aluno avisou que não tem esse aparelho'); }
      const risk = arr((r.tags as any)?.jointRisk).map((x) => x.toUpperCase()).filter((j) => dest.jointRisks.includes(j));
      if (risk.length) { flags.push('LIMITACAO'); detail.push(`pesa em ${risk.map((x) => x.toLowerCase()).join(', ')}`); }
      if (!envOk(r.environments, dest.env)) { flags.push('AMBIENTE'); detail.push('exercício de outro tipo de local'); }
      const lvl = levelIssues(r.name, det.technique, dest.level); if (lvl.length) { flags.push('NIVEL'); detail.push(...lvl); }
      const fx = levelFix(r.name, det.technique, dest.level);
      let swapTo: SwapTarget | null = null;
      if (dest.pool && (flags.some((f) => f === 'SEM_APARELHO' || f === 'AMBIENTE' || f === 'LIMITACAO') || fx.complex)) {
        swapTo = pickSwap({ id: r.exerciseId, name: r.name, category: r.category, subCategory: r.subCategory, tags: r.tags, environments: r.environments }, dest.pool, { unavailable: dest.unavailable, jointRisks: dest.jointRisks, env: dest.env, level: dest.level, usedNames, envOk: (e: any) => envOk(e, dest.env), levelIssues });
        if (swapTo) usedNames.add(nameKey(swapTo.name));
      }
      const swaps = arr(r.substitutes).filter((id) => !dest.unavailable.has(id));
      total++; setsSum += det.sets;
      if (flags.length) { flagged++; flags.forEach((f) => { flagsTotal[f]++; }); toChange.push({ day, name: r.name, flags, why: detail }); }
      const tech = det.technique;
      if (tech) tech.split(' + ').forEach((t) => techniques.set(t, (techniques.get(t) || 0) + 1));
      const cat = r.category || 'OUTROS'; cats.set(cat, (cats.get(cat) || 0) + 1);
      return { exerciseId: r.exerciseId, name: r.name, category: cat, sets: det.sets, reps: det.reps, restTime: det.restTime, technique: tech, series: det.series, notes: det.note, flags, detail, ok: !flags.length, rowId: r.id ?? null, fix: fx.techs.length || fx.complex ? fx : null, swapTo, hasSwap: !!flags.length && swaps.length > 0 };
    });
    return { day, exercises, byCategory: [...cats.entries()].map(([category, count]) => ({ category, count })).sort((a, b) => b.count - a.count || a.category.localeCompare(b.category)) };
  });
  return {
    days,
    summary: { daysCount: days.length, exercises: total, usable: total - flagged, flagged, avgSets: total ? Math.round((setsSum / total) * 10) / 10 : 0, techniques: [...techniques.entries()].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name)), flags: flagsTotal },
    toChange,
  };
}

/** Linhas do banco (WorkoutExercise) + dicionário de exercícios -> linhas da comparação. */
export function exerciseRowsFrom(list: any[], exById: Map<string, any>): ExerciseRow[] {
  return (list || []).map((r) => { const e: any = exById.get(r.exerciseId); return { id: r.id, exerciseId: r.exerciseId, name: e?.name || 'Exercício', category: e?.category || '', subCategory: e?.subCategory ?? null, sets: r.sets, reps: r.reps, restTime: r.restTime, technique: r.technique, notes: r.notes, order: r.order, day: r.day, substitutes: [...arr(r.substitutes), ...(r.substituteId ? [String(r.substituteId)] : [])], tags: e?.tags, environments: e?.environments }; });
}

export interface ComparisonResult { ok: boolean; reason?: 'NAO_ENCONTRADO' | 'SEM_GENERO' | 'GENERO_DIFERENTE' | 'SEM_ROTINA'; comparison?: Comparison; source?: { studentId: string; name: string; routine: { id: string; name: string; ordinal: number | null; sessions: number } }; target?: { studentId: string; name: string; current: CompareDay[] | null; limits: string[]; places: Place[]; level?: { level: LevelKey; label: string } } }

/** Lê a rotina do aluno-referência e a compara com o destino. Os dois precisam ser da carteira do coach e do mesmo gênero. Só lê. */
export async function loadComparison(db: Db, coachId: string, targetId: string, sourceId: string, workoutId: string): Promise<ComparisonResult> {
  const sel = { id: true, name: true, gender: true, level: true, startDate: true, createdAt: true } as const;
  const users: any[] = await db.user.findMany({ where: { id: { in: [targetId, sourceId] }, role: 'USER', AND: [ownStudentScope(coachId)] }, select: sel });
  const t = users.find((u) => u.id === targetId); const s = users.find((u) => u.id === sourceId);
  if (!t || !s || targetId === sourceId) return { ok: false, reason: 'NAO_ENCONTRADO' };
  const gt = parseGender(t.gender), gs = parseGender(s.gender);
  if (!gt || !gs) return { ok: false, reason: 'SEM_GENERO' };
  if (gt !== gs) return { ok: false, reason: 'GENERO_DIFERENTE' };
  const wk: any = await db.workout.findFirst({ where: { id: workoutId, userId: sourceId }, select: { id: true, name: true, createdAt: true } });
  if (!wk) return { ok: false, reason: 'SEM_ROTINA' };
  const orderBy = [{ day: 'asc' }, { order: 'asc' }];
  const [srcRows, anam, unavailable, tWorkouts, sWorkouts, sHist, tSessions] = await Promise.all([
    db.workoutExercise.findMany({ where: { workoutId }, orderBy }),
    db.anamnese.findMany({ where: { userId: targetId }, select: { userId: true, createdAt: true, objetivo: true, nivel: true, frequencia: true, tempoDisponivel: true, limitacoes: true, cirurgias: true, equipamentos: true } }),
    unavailableExerciseIds(targetId, db),
    db.workout.findMany({ where: { userId: targetId }, select: { id: true, name: true, createdAt: true, archived: true }, orderBy: { createdAt: 'desc' } }),
    db.workout.findMany({ where: { userId: sourceId }, select: { id: true, name: true, createdAt: true, endDate: true, archived: true } }),
    db.workoutHistory.findMany({ where: { userId: sourceId }, select: { userId: true, date: true, workoutId: true } }),
    db.workoutHistory.count({ where: { userId: targetId } }),
  ]);
  // a rotina ATUAL do destino (a ficha mais nova não arquivada), só a estrutura, para ficar lado a lado
  const cur: any = (tWorkouts as any[]).find((w) => !w.archived) || null;
  const curRows: any[] = cur ? await db.workoutExercise.findMany({ where: { workoutId: cur.id }, orderBy }) : [];
  const exIds = [...new Set([...(srcRows as any[]), ...curRows].map((r) => r.exerciseId))];
  const exs: any[] = exIds.length ? await db.exercise.findMany({ where: { id: { in: exIds } }, select: { id: true, name: true, category: true, subCategory: true, tags: true, environments: true } }) : [];
  const exById = new Map(exs.map((e) => [e.id, e]));
  // o nível REAL do aluno de destino (mesma conta do findSimilar): é ele que decide o que é "avançado demais"
  const tLevel = computeLevel({ entry: parseLevel(t.level) || parseLevel(newest(anam as any[]).get(targetId)?.nivel) || 'INICIANTE', startDate: t.startDate || t.createdAt, sessions: Number(tSessions) || 0, now: new Date() });
  const profile = buildProfile(newest(anam as any[]).get(targetId), tLevel.level);
  const toRows = (list: any[]): ExerciseRow[] => exerciseRowsFrom(list, exById);
  // biblioteca do coach, só das categorias da rotina: de onde sai a troca automática dos exercícios que não servem para este aluno
  const cats = [...new Set((srcRows as any[]).map((r) => exById.get(r.exerciseId)?.category).filter(Boolean))];
  let pool: LibEx[] = [];
  try { pool = cats.length ? await db.exercise.findMany({ where: { AND: [{ category: { in: cats } }, visibleLibraryWhere(coachId)] }, select: { id: true, name: true, category: true, subCategory: true, videoUrl: true, tags: true, environments: true } }) : []; } catch (e) { pool = []; }
  const comparison = compareWorkouts(toRows(srcRows as any[]), { unavailable: new Set(unavailable), jointRisks: profile.jointRisks, env: profile.env, level: tLevel.level, pool });
  const current: CompareDay[] | null = cur ? compareWorkouts(toRows(curRows), { unavailable: new Set(), jointRisks: [], env: profile.env }).days : null;
  const routines = buildRoutines(sWorkouts as any, sHist as any); const sr = routines.find((r) => r.id === workoutId);
  return { ok: true, comparison, source: { studentId: sourceId, name: s.name || 'Aluno', routine: { id: wk.id, name: wk.name, ordinal: sr ? sr.ordinal : null, sessions: sr ? sr.sessions : 0 } }, target: { studentId: targetId, name: t.name || 'Aluno', current, limits: profile.limits, places: profile.places, level: { level: tLevel.level, label: tLevel.label } } };
}
