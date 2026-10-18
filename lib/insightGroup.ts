// lib/insightGroup.ts
// 🧠 (18 out 2026) VISÃO GERAL DOS TREINOS do coach: de todos os alunos que entram nas análises (lib/insightsScope.ts), como estão os treinos que eles de fato fizeram, separados por
// GÊNERO e NÍVEL (nunca se mistura homem com mulher). As contas são feitas aqui, sem IA: quantos dias por rotina, exercícios por dia, séries, técnicas e exercícios mais usados.
// Em cima disso a IA escreve a leitura de cada grupo e a metodologia que vale adotar no próximo treino — e o resultado fica na MEMÓRIA (lib/insightMemory.ts): sem alunos/rotinas novas,
// o mesmo fingerprint devolve a leitura guardada sem gastar IA. A IA recebe só números e nomes de exercícios, nunca nomes de alunos.
import Anthropic from '@anthropic-ai/sdk';
import { loadInsightsPool, type Gender } from '@/lib/insightsScope';
import { LEVEL_LABEL, type LevelKey } from '@/lib/studentLevel';
import { buildRoutines } from '@/lib/similarStudents';
import { hashOf } from '@/lib/insightDigest';
import { readMemory, saveMemory, countHit } from '@/lib/insightMemory';
import { callTool } from '@/lib/aiTool';

export const GROUP_MODEL = 'claude-sonnet-5-5';
export const MAX_STUDENTS = 80;
export const ROUTINES_PER_STUDENT = 3;     // as últimas rotinas treinadas de cada aluno
const TOOL_NAME = 'registrar_visao';

export interface GroupEntry { gender: Gender; level: LevelKey; routines: { days: number; exercises: { name: string; category: string; sets: number; technique: string | null }[] }[] }
export interface GroupStat {
  key: string; gender: Gender; level: LevelKey; label: string; students: number; routines: number;
  avgDays: number; avgExercisesPerDay: number; avgSets: number;
  techniques: { name: string; pct: number }[]; topExercises: { name: string; count: number }[]; categories: { category: string; pct: number }[];
}
const r1 = (n: number) => Math.round(n * 10) / 10;
const pct = (n: number, d: number) => (d ? Math.round((n / d) * 100) : 0);
const top = <T,>(m: Map<string, number>, n: number, f: (k: string, v: number) => T): T[] => [...m.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, n).map(([k, v]) => f(k, v));

/** Conta os grupos (gênero × nível). Grupo sem nenhuma rotina treinada não aparece. */
export function aggregateGroups(entries: (GroupEntry & { studentId?: string })[]): GroupStat[] {
  const by = new Map<string, (GroupEntry & { studentId?: string })[]>();
  for (const e of entries) { if (!e.routines.length) continue; const k = `${e.gender}|${e.level}`; if (!by.has(k)) by.set(k, []); by.get(k)!.push(e); }
  const out: GroupStat[] = [];
  for (const [key, list] of by) {
    const routines = list.flatMap((e) => e.routines); const exs = routines.flatMap((r) => r.exercises);
    const days = routines.reduce((a, r) => a + r.days, 0); const tech = new Map<string, number>(); const names = new Map<string, number>(); const cats = new Map<string, number>(); let sets = 0;
    for (const x of exs) { sets += x.sets || 0; names.set(x.name, (names.get(x.name) || 0) + 1); const c = String(x.category || 'OUTROS').toUpperCase(); cats.set(c, (cats.get(c) || 0) + 1); if (x.technique) { tech.set(x.technique, (tech.get(x.technique) || 0) + 1); } }
    const [gender, level] = key.split('|') as [Gender, LevelKey];
    out.push({
      key, gender, level, label: `${gender === 'Feminino' ? 'Mulheres' : 'Homens'} · ${LEVEL_LABEL[level]}`, students: list.length, routines: routines.length,
      avgDays: r1(days / routines.length), avgExercisesPerDay: r1(days ? exs.length / days : 0), avgSets: r1(exs.length ? sets / exs.length : 0),
      techniques: top(tech, 5, (name, v) => ({ name, pct: pct(v, exs.length) })), topExercises: top(names, 8, (name, count) => ({ name, count })), categories: top(cats, 6, (category, v) => ({ category, pct: pct(v, exs.length) })),
    });
  }
  return out.sort((a, b) => a.gender.localeCompare(b.gender) || ['INICIANTE', 'INTERMEDIARIO', 'AVANCADO'].indexOf(a.level) - ['INICIANTE', 'INTERMEDIARIO', 'AVANCADO'].indexOf(b.level));
}

type Db = any;
/** Lê os alunos que entram nas análises e as últimas rotinas que eles treinaram. Só lê. */
export async function loadGroupEntries(db: Db, coachId: string, now: Date = new Date()): Promise<{ entries: GroupEntry[]; students: number }> {
  const pool = await loadInsightsPool(db, coachId, now);
  const inc = pool.included.filter((s) => s.gender && s.level).slice(0, MAX_STUDENTS);
  if (!inc.length) return { entries: [], students: 0 };
  const ids = inc.map((s) => s.id);
  const [wks, hist] = await Promise.all([
    db.workout.findMany({ where: { userId: { in: ids } }, select: { id: true, userId: true, name: true, createdAt: true, endDate: true, archived: true } }),
    db.workoutHistory.findMany({ where: { userId: { in: ids } }, select: { userId: true, date: true, workoutId: true } }),
  ]);
  const wBy = new Map<string, any[]>(); for (const w of wks as any[]) { if (!wBy.has(w.userId)) wBy.set(w.userId, []); wBy.get(w.userId)!.push(w); }
  const hBy = new Map<string, any[]>(); for (const h of hist as any[]) { if (!hBy.has(h.userId)) hBy.set(h.userId, []); hBy.get(h.userId)!.push(h); }
  const chosen = new Map<string, string[]>();   // aluno -> ids das últimas rotinas treinadas
  for (const s of inc) { const ex = buildRoutines(wBy.get(s.id) || [], hBy.get(s.id) || []).filter((r) => r.ordinal != null); chosen.set(s.id, ex.slice(-ROUTINES_PER_STUDENT).map((r) => r.id)); }
  const wids = [...new Set([...chosen.values()].flat())];
  const rows: any[] = wids.length ? await db.workoutExercise.findMany({ where: { workoutId: { in: wids } }, select: { workoutId: true, exerciseId: true, day: true, sets: true, technique: true } }) : [];
  const exIds = [...new Set(rows.map((r) => r.exerciseId))];
  const exs: any[] = exIds.length ? await db.exercise.findMany({ where: { id: { in: exIds } }, select: { id: true, name: true, category: true } }) : [];
  const exBy = new Map(exs.map((e) => [e.id, e])); const rBy = new Map<string, any[]>(); for (const r of rows) { if (!rBy.has(r.workoutId)) rBy.set(r.workoutId, []); rBy.get(r.workoutId)!.push(r); }
  const entries: GroupEntry[] = inc.map((s) => ({
    gender: s.gender as Gender, level: (s.level as any).level as LevelKey,
    routines: (chosen.get(s.id) || []).map((wid) => { const list = rBy.get(wid) || []; return { days: new Set(list.map((x) => x.day || 'A')).size, exercises: list.map((x) => ({ name: exBy.get(x.exerciseId)?.name || 'Exercício', category: exBy.get(x.exerciseId)?.category || '', sets: Number(x.sets) || 0, technique: x.technique && !String(x.technique).trim().startsWith('{') && String(x.technique).toLowerCase() !== 'normal' ? String(x.technique) : null })) }; }).filter((r) => r.exercises.length),
  }));
  return { entries, students: inc.length };
}

// ─────────────────────────── IA ───────────────────────────
export const GROUP_PROMPT = `Você é o assistente de um coach (personal trainer) e lê os NÚMEROS dos treinos que os alunos dele realmente fizeram, em português do Brasil. Chame a ferramenta ${TOOL_NAME}.
Cada grupo é gênero × nível (nunca misture). Para cada grupo diga, em 1 a 2 frases, como os treinos estão (dias, volume, técnicas, exercícios que mais se repetem) e UMA metodologia que vale adotar no próximo treino desse grupo.
Use SÓ os números enviados; não invente dados. Se um grupo tem poucos alunos, avise que a leitura é fraca. "oportunidades": o que o coach pode melhorar no conjunto (variação, volume, técnicas pouco usadas...). "alertas": desequilíbrios (ex.: pouco volume de um músculo).`;
export const GROUP_TOOL: any = {
  name: TOOL_NAME, description: 'Registra a leitura geral dos treinos do coach.',
  input_schema: { type: 'object', properties: {
    resumo: { type: 'string', description: '2 a 3 frases para ouvir em voz alta.' },
    grupos: { type: 'array', items: { type: 'object', properties: { grupo: { type: 'string' }, leitura: { type: 'string' }, metodologia: { type: 'string' } }, required: ['grupo', 'leitura', 'metodologia'] } },
    oportunidades: { type: 'array', items: { type: 'string' } }, alertas: { type: 'array', items: { type: 'string' } },
  }, required: ['resumo', 'grupos', 'oportunidades', 'alertas'] },
};
export interface GroupInsight { resumo: string; grupos: { grupo: string; leitura: string; metodologia: string }[]; oportunidades: string[]; alertas: string[] }
const str = (v: any, n: number) => { const s = String(v ?? '').replace(/\s+/g, ' ').trim(); return s.length > n ? s.slice(0, n - 1) + '…' : s; };
const list = (v: any, n: number, len: number) => (Array.isArray(v) ? v : []).map((x) => str(x, len)).filter(Boolean).slice(0, n);
export function sanitizeInsight(raw: any): GroupInsight {
  return { resumo: str(raw?.resumo, 480), grupos: (Array.isArray(raw?.grupos) ? raw.grupos : []).map((g: any) => ({ grupo: str(g?.grupo, 60), leitura: str(g?.leitura, 320), metodologia: str(g?.metodologia, 300) })).filter((g: any) => g.grupo).slice(0, 8), oportunidades: list(raw?.oportunidades, 4, 220), alertas: list(raw?.alertas, 3, 200) };
}
export const groupText = (g: GroupStat[]) => g.map((x) => `### ${x.label} — ${x.students} aluno(s), ${x.routines} rotina(s)\nDias por rotina: ${x.avgDays}. Exercícios por dia: ${x.avgExercisesPerDay}. Séries por exercício: ${x.avgSets}.\nTécnicas: ${x.techniques.map((t) => `${t.name} ${t.pct}%`).join(', ') || 'quase só séries normais'}.\nMúsculos (% dos exercícios): ${x.categories.map((c) => `${c.category} ${c.pct}%`).join(', ')}.\nExercícios mais repetidos: ${x.topExercises.map((e) => `${e.name} (${e.count})`).join(', ')}.`).join('\n\n');

export interface GroupResult { ok: boolean; groups: GroupStat[]; insight: GroupInsight | null; cached: boolean; stale: boolean; memory: boolean; usage?: { model: string; inputTokens: number; outputTokens: number; ms: number }; updatedAt: Date | null; students: number; stats?: { runs: number; hits: number } }

export async function groupInsights(db: Db, coachId: string, o: { client?: any; now?: Date; refresh?: boolean; onlyCached?: boolean } = {}): Promise<GroupResult> {
  const now = o.now || new Date();
  const { entries, students } = await loadGroupEntries(db, coachId, now);
  const groups = aggregateGroups(entries);
  const { row, available } = await readMemory(db, coachId, 'GROUP', 'all');
  const base = { groups, memory: available, students };
  if (!groups.length) return { ok: true, insight: null, cached: false, stale: false, updatedAt: null, ...base };
  const fingerprint = hashOf(groups);
  if (row && !o.refresh && row.fingerprint === fingerprint) { await countHit(db, row); return { ok: true, insight: row.result as GroupInsight, cached: true, stale: false, updatedAt: row.updatedAt, stats: { runs: row.runs, hits: (row.hits || 0) + 1 }, ...base }; }
  if (o.onlyCached) return { ok: true, insight: row ? (row.result as GroupInsight) : null, cached: !!row, stale: !!row, updatedAt: row ? row.updatedAt : null, stats: row ? { runs: row.runs, hits: row.hits || 0 } : undefined, ...base };
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!o.client && !apiKey) throw new Error('ANTHROPIC_API_KEY não configurada no servidor.');
  const client = o.client || new Anthropic({ apiKey, timeout: 60_000, maxRetries: 0 });
  const t0 = Date.now();
  // o claude-sonnet-5-5 não aceita forçar a ferramenta (400): ver lib/aiTool.ts
  const call = await callTool(client, { model: GROUP_MODEL, system: GROUP_PROMPT, tool: GROUP_TOOL, user: groupText(groups), maxTokens: 6000, refusalMsg: 'A IA recusou fazer essa leitura.', missingMsg: 'A IA não devolveu a leitura.' });
  const insight = sanitizeInsight(call.input);
  const usage = { model: GROUP_MODEL, inputTokens: call.usage.inputTokens, outputTokens: call.usage.outputTokens, ms: Date.now() - t0 };
  const saved = await saveMemory(db, coachId, 'GROUP', 'all', { fingerprint, result: insight, model: usage.model, inputTokens: usage.inputTokens, outputTokens: usage.outputTokens }, row);
  try { await db.aiLog?.create?.({ data: { userId: coachId, question: 'insight-group', answer: JSON.stringify({ usage, groups: groups.length }).slice(0, 2000) } }); } catch (e) { /* só registro de uso */ }
  return { ok: true, insight, cached: false, stale: false, usage, updatedAt: now, stats: { runs: (row?.runs || 0) + 1, hits: row?.hits || 0 }, ...base, memory: saved || available };
}
