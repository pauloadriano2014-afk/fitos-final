// lib/similarPanorama.ts
// 🔭 (18 out 2026) PANORAMA DO GRUPO e CARGAS para a análise com IA. Em vez de mandar à IA 3 rotinas cruas, mandamos CONTAS feitas sobre MUITO mais gente:
//   • PANORAMA: todos os alunos parecidos (mesmo gênero, nota de semelhança ≥ MIN_SCORE) e várias rotinas de cada um (não só as da faixa 1–3): quantos exercícios por dia, séries
//     por exercício, quanto usam de técnica avançada — separado por NÍVEL —, os exercícios mais usados e as técnicas mais comuns. Ao lado vem o mesmo número da rotina ATUAL do
//     aluno de destino, para a IA dizer "ela está acima do que as iniciantes fazem".
//   • CARGAS: o que o aluno de destino levantou nos exercícios da rotina atual (fase normal, mais recente) e a carga TÍPICA dos alunos parecidos do mesmo nível no mesmo exercício.
// Tudo aqui é função pura (recebe linhas já lidas) + duas funções finas que leem o banco. Nada de nome, contato ou foto vai para a IA.
import { createHash } from 'crypto';
import type { LevelKey } from '@/lib/studentLevel';
import { LEVEL_LABEL } from '@/lib/studentLevel';
import { compareWorkouts, exerciseRowsFrom, type CompareDay, type CompareDest, type PanoramaSource } from '@/lib/similarStudents';
import { buildStudentLoads } from '@/lib/studentLoads';

export const PANORAMA_MAX_STUDENTS = 30;
export const PANORAMA_ROUTINES_PER_STUDENT = 6;
export const PANORAMA_MAX_ROUTINES = 90;
export const TOP_EXERCISES = 12;
export const MAX_PANORAMA_CHARS = 1700;
export const MAX_LOADS_CHARS = 900;

const FLAG_TXT: Record<string, string> = { SEM_APARELHO: 'NÃO TEM O APARELHO', LIMITACAO: 'LIMITAÇÃO', AMBIENTE: 'OUTRO LOCAL', NIVEL: 'AVANÇADO P/ NÍVEL' };
const ADVANCED = ['DROPSET', 'RESTPAUSE', 'CLUSTERSET', '21', 'TRISET', 'GVT', '1.5REPS', 'TUT'];
const techKey = (t: string) => t.toUpperCase().replace(/[\s_-]/g, '');
/** A técnica é "avançada" (a mesma lista que a comparação usa para o nível iniciante). */
export const isAdvancedTech = (t: string) => ADVANCED.includes(techKey(t));
const r1 = (n: number) => Math.round(n * 10) / 10;
const pct = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 100) : 0);
const fmt = (n: number) => String(r1(n)).replace('.', ',');
const hash = (v: any) => createHash('sha1').update(JSON.stringify(v)).digest('hex').slice(0, 16);

export interface PanoRoutine { level: LevelKey; days: CompareDay[] }
export interface LevelStat { level: LevelKey; label: string; routines: number; avgSets: number; exPerDay: number; advPct: number }
export interface Panorama {
  students: number; routines: number;
  byLevel: LevelStat[];
  target: { avgSets: number; exPerDay: number; advPct: number; exercises: number } | null;
  topExercises: { name: string; pct: number; flags: string[] }[];
  techniques: { name: string; pct: number }[];
  text: string; hash: string;
}

function stat(routines: { days: CompareDay[] }[]): { avgSets: number; exPerDay: number; advPct: number; exercises: number } {
  let ex = 0, sets = 0, days = 0, adv = 0;
  for (const r of routines) for (const d of r.days) {
    days++;
    for (const e of d.exercises) {
      if (/cardio|mobilidade|alongamento/i.test(String(e.category || ''))) continue;
      ex++; sets += Number(e.sets) || 0;
      if (e.technique && e.technique.split(' + ').some(isAdvancedTech)) adv++;
    }
  }
  return { avgSets: ex ? r1(sets / ex) : 0, exPerDay: days ? r1(ex / days) : 0, advPct: pct(adv, ex), exercises: ex };
}

/** As contas do panorama. `students` = quantos alunos entraram; `targetCurrent` = a rotina atual do aluno de destino (para comparar lado a lado). */
export function aggregatePanorama(routines: PanoRoutine[], students: number, targetCurrent: CompareDay[] | null): Panorama {
  const byLevelMap = new Map<LevelKey, PanoRoutine[]>();
  for (const r of routines) { if (!byLevelMap.has(r.level)) byLevelMap.set(r.level, []); byLevelMap.get(r.level)!.push(r); }
  const order: LevelKey[] = ['INICIANTE', 'INTERMEDIARIO', 'AVANCADO'];
  const byLevel: LevelStat[] = order.filter((l) => byLevelMap.has(l)).map((l) => ({ level: l, label: LEVEL_LABEL[l], routines: byLevelMap.get(l)!.length, ...stat(byLevelMap.get(l)!) })).map(({ exercises, ...rest }) => rest);

  const ex = new Map<string, { name: string; routines: number; flags: Set<string> }>();
  const tech = new Map<string, number>(); let totalEx = 0;
  for (const r of routines) {
    const seen = new Set<string>();
    for (const d of r.days) for (const e of d.exercises) {
      if (/cardio|mobilidade|alongamento/i.test(String(e.category || ''))) continue;
      totalEx++;
      if (e.technique) e.technique.split(' + ').forEach((t) => tech.set(t, (tech.get(t) || 0) + 1));
      const k = e.exerciseId || e.name;
      let cur = ex.get(k); if (!cur) { cur = { name: e.name, routines: 0, flags: new Set() }; ex.set(k, cur); }
      if (!seen.has(k)) { cur.routines++; seen.add(k); }
      (e.flags || []).filter((f) => f !== 'NIVEL').forEach((f) => cur!.flags.add(f));
    }
  }
  const n = routines.length;
  const topExercises = [...ex.values()].sort((a, b) => b.routines - a.routines || a.name.localeCompare(b.name, 'pt-BR')).slice(0, TOP_EXERCISES).map((x) => ({ name: x.name, pct: pct(x.routines, n), flags: [...x.flags] }));
  const techniques = [...tech.entries()].map(([name, c]) => ({ name, pct: pct(c, totalEx) })).sort((a, b) => b.pct - a.pct || a.name.localeCompare(b.name)).slice(0, 6);
  const tgt = targetCurrent && targetCurrent.length ? stat([{ days: targetCurrent }]) : null;

  const lines: string[] = [`PANORAMA DO GRUPO (${students} ${students === 1 ? 'aluno parecido' : 'alunos parecidos'}, ${n} ${n === 1 ? 'rotina' : 'rotinas'}, mesmo gênero)`];
  if (byLevel.length) lines.push('Por nível: ' + byLevel.map((l) => `${l.label} (${l.routines} rotinas): ${fmt(l.avgSets)} séries/exercício, ${fmt(l.exPerDay)} exercícios/dia, ${l.advPct}% com técnica avançada`).join(' | '));
  if (tgt) lines.push(`Rotina ATUAL do aluno destino: ${fmt(tgt.avgSets)} séries/exercício, ${fmt(tgt.exPerDay)} exercícios/dia, ${tgt.advPct}% com técnica avançada`);
  if (topExercises.length) lines.push('Mais usados (% das rotinas): ' + topExercises.map((x) => `${x.name} ${x.pct}%${x.flags.length ? ` [${x.flags.map((f) => FLAG_TXT[f] || f).join('+')}]` : ''}`).join('; '));
  if (techniques.length) lines.push('Técnicas (% dos exercícios): ' + techniques.map((t) => `${t.name} ${t.pct}%`).join('; '));
  let text = lines.join('\n'); if (text.length > MAX_PANORAMA_CHARS) text = text.slice(0, MAX_PANORAMA_CHARS - 1) + '…';
  // impressão digital GROSSA: só muda de verdade quando o grupo muda bastante (uma rotina a mais não pede análise nova)
  const fp = hash({ s: Math.floor(students / 3), r: Math.floor(n / 10), top: topExercises.slice(0, 8).map((x) => x.name), t: techniques.slice(0, 3).map((x) => x.name), l: byLevel.map((l) => [l.level, Math.round(l.avgSets * 2) / 2]) });
  return { students, routines: n, byLevel, target: tgt, topExercises, techniques, text, hash: fp };
}

/** Lê as rotinas dos alunos parecidos (muitas, de todos eles) e faz as contas. Só lê. */
export async function buildPanorama(db: any, sources: PanoramaSource[] | undefined, dest: CompareDest, targetCurrent: CompareDay[] | null): Promise<Panorama | null> {
  const picked = (sources || []).slice(0, PANORAMA_MAX_STUDENTS);
  const wanted: { workoutId: string; level: LevelKey }[] = [];
  for (const s of picked) for (const r of s.routines.slice().sort((a, b) => b.ordinal - a.ordinal).slice(0, PANORAMA_ROUTINES_PER_STUDENT)) { if (wanted.length < PANORAMA_MAX_ROUTINES) wanted.push({ workoutId: r.id, level: s.level }); }
  if (!wanted.length) return null;
  const ids = wanted.map((w) => w.workoutId);
  const rows: any[] = await db.workoutExercise.findMany({ where: { workoutId: { in: ids } }, orderBy: [{ day: 'asc' }, { order: 'asc' }] });
  const exIds = [...new Set(rows.map((r) => r.exerciseId))];
  const exs: any[] = exIds.length ? await db.exercise.findMany({ where: { id: { in: exIds } }, select: { id: true, name: true, category: true, tags: true, environments: true } }) : [];
  const exById = new Map(exs.map((e) => [e.id, e]));
  const byWorkout = new Map<string, any[]>();
  for (const r of rows) { if (!byWorkout.has(r.workoutId)) byWorkout.set(r.workoutId, []); byWorkout.get(r.workoutId)!.push(r); }
  const routines: PanoRoutine[] = [];
  for (const w of wanted) {
    const list = byWorkout.get(w.workoutId); if (!list || !list.length) continue;
    routines.push({ level: w.level, days: compareWorkouts(exerciseRowsFrom(list, exById), dest).days });
  }
  if (!routines.length) return null;
  const studentsUsed = picked.filter((s) => s.routines.some((r) => ids.includes(r.id))).length;
  return aggregatePanorama(routines, studentsUsed, targetCurrent);
}

// ─────────────────────────── cargas ───────────────────────────
const median = (xs: number[]) => { const a = xs.slice().sort((x, y) => x - y); const m = Math.floor(a.length / 2); return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2; };
const kg = (n: number) => `${String(r1(n)).replace('.', ',')} kg`;
const daysAgo = (iso: string, now: Date) => { const d = Math.floor((now.getTime() - new Date(iso).getTime()) / 86400000); return d <= 0 ? 'hoje' : d === 1 ? 'ontem' : d < 14 ? `há ${d} dias` : d < 60 ? `há ${Math.round(d / 7)} sem` : `há ${Math.round(d / 30)} meses`; };

export interface LoadsContext { text: string; hash: string; withLoad: number; withoutLoad: number }
/**
 * O que o aluno de destino levantou nos exercícios da rotina atual (treino NORMAL mais recente de cada um) e a carga típica (mediana) dos alunos parecidos do MESMO nível.
 * Pura: `history` = treinos do aluno (com `details`), `refRows` = séries dos alunos-referência ({ studentId, exerciseId, weight, date }).
 */
export function buildLoadsContext(
  exercises: { exerciseId: string; name: string }[], history: any[], refRows: { studentId: string; exerciseId: string; weight: number; date: any }[], now: Date = new Date(),
): LoadsContext {
  const uniq = [...new Map(exercises.map((e) => [e.exerciseId, e])).values()];
  const mine = buildStudentLoads(history || [], { now, onlyIds: uniq.map((e) => e.exerciseId), suggest: false });
  // carga típica: para cada aluno-referência, o MAIOR peso do treino mais recente daquele exercício; depois a mediana entre os alunos
  const latest = new Map<string, Map<string, { t: number; top: number }>>();   // exerciseId -> studentId -> { data, maior peso }
  for (const r of refRows || []) {
    const w = Number(r.weight); const t = new Date(r.date).getTime(); if (!(w > 0) || !Number.isFinite(t)) continue;
    let m = latest.get(r.exerciseId); if (!m) { m = new Map(); latest.set(r.exerciseId, m); }
    const c = m.get(r.studentId);
    if (!c || t > c.t) m.set(r.studentId, { t, top: w }); else if (t === c.t && w > c.top) c.top = w;
  }
  const parts: string[] = []; let withLoad = 0, withoutLoad = 0;
  for (const e of uniq) {
    const ref = mine[e.exerciseId]?.refs?.NORMAL;
    if (!ref) { withoutLoad++; continue; }
    withLoad++;
    const peers = [...(latest.get(e.exerciseId)?.values() || [])].map((x) => x.top);
    const typ = peers.length >= 2 ? `; parecidos do mesmo nível: ~${kg(median(peers))} (${peers.length} alunos)` : '';
    parts.push(`${e.name}: ${kg(ref.top)} (${daysAgo(ref.date, now)})${typ}`);
  }
  let text = parts.length ? `CARGAS (total em kg; treino normal mais recente)\n${parts.join('; ')}${withoutLoad ? `\nSem carga registrada em ${withoutLoad} exercício(s) da rotina atual.` : ''}` : (uniq.length ? 'CARGAS: o aluno ainda não registrou carga em nenhum exercício da rotina atual.' : '');
  if (text.length > MAX_LOADS_CHARS) text = text.slice(0, MAX_LOADS_CHARS - 1) + '…';
  // a data some do hash de propósito: só mudam as cargas, não "há quantos dias"
  const fp = hash(uniq.map((e) => [e.exerciseId, mine[e.exerciseId]?.refs?.NORMAL?.top ?? null]));
  return { text, hash: fp, withLoad, withoutLoad };
}

/** Lê o histórico do aluno de destino e as cargas dos alunos parecidos do mesmo nível. Só lê; qualquer falha = sem cargas (a análise segue). */
export async function loadLoadsContext(db: any, targetId: string, exercises: { exerciseId: string; name: string }[], peerIds: string[], now: Date = new Date()): Promise<LoadsContext | null> {
  if (!exercises.length) return null;
  try {
    const ids = [...new Set(exercises.map((e) => e.exerciseId))];
    const history: any[] = await db.workoutHistory.findMany({ where: { userId: targetId }, orderBy: { date: 'desc' }, take: 150, include: { details: true } });
    let refRows: any[] = [];
    if (peerIds.length && db.exerciseHistory?.findMany) {
      const rows: any[] = await db.exerciseHistory.findMany({
        where: { exerciseId: { in: ids }, weight: { gt: 0 }, workoutHistory: { userId: { in: peerIds.slice(0, 40) } } },
        select: { exerciseId: true, weight: true, workoutHistory: { select: { userId: true, date: true, loadPhase: true } } }, take: 4000,
      });
      refRows = rows.filter((r) => r.workoutHistory && (!r.workoutHistory.loadPhase || String(r.workoutHistory.loadPhase).toUpperCase() === 'NORMAL')).map((r) => ({ studentId: r.workoutHistory.userId, exerciseId: r.exerciseId, weight: r.weight, date: r.workoutHistory.date }));
    }
    return buildLoadsContext(exercises, history, refRows, now);
  } catch (e) { return null; }
}
