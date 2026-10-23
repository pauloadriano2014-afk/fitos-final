// lib/ai/genLearning.ts
// 🧠 (23 out 2026) Comparar o treino que a IA gerou com o que o coach deixou ao salvar (etapa 2 de "a IA aprende com as correções do Paulo"). Funções puras (sem banco).
// Formato enxuto: { dia: [ { id, n (nome), g (grupo/músculo), s (total de séries), r (repetições por bloco), t (técnica) } ] }.
export interface PlanItem { id: string; n: string; g: string; s: number; r: string; t: string }
export type Plan = Record<string, PlanItem[]>;
export type EditType = 'removed' | 'added' | 'swapped' | 'moved' | 'sets' | 'reps' | 'technique';
export interface Edit { type: EditType; day: string; id?: string; n?: string; g?: string; from?: any; to?: any; fromId?: string; toId?: string; pos?: number }
export interface EditSummary { removed: number; added: number; swapped: number; moved: number; changed: number; total: number }

const MAX_EDITS = 80;
const str = (v: any) => String(v ?? '').trim();
const num = (v: any) => { const n = parseInt(String(v), 10); return Number.isFinite(n) ? n : 0; };
const uniq = (a: string[]) => a.filter((x, i) => x && a.indexOf(x) === i);

function parseTech(raw: any): { t: string; b: any[] | null } {
  const s = str(raw); if (!s) return { t: '', b: null };
  if (s[0] === '{') { try { const o = JSON.parse(s); return { t: str(o.t), b: Array.isArray(o.b) ? o.b : null }; } catch { /* texto comum */ } }
  return { t: s, b: null };
}
const fromBlocks = (blocks: any[]): Pick<PlanItem, 's' | 'r' | 't'> => ({
  s: blocks.reduce((a, b) => a + num(b?.sets), 0),
  r: blocks.map((b) => str(b?.reps)).join('/'),
  t: uniq(blocks.map((b) => str(b?.technique).toUpperCase())).join('+'),
});

/** O que a IA entregou (`exercisesByDay` + `workoutTabs`) no formato enxuto. */
export function normalizeGenerated(exercisesByDay: Record<string, any[]>, workoutTabs?: string[]): Plan {
  const tabs = workoutTabs && workoutTabs.length ? workoutTabs : Object.keys(exercisesByDay || {});
  const plan: Plan = {};
  for (const day of tabs) {
    const items: PlanItem[] = [];
    for (const ex of exercisesByDay?.[day] || []) {
      if (!ex || !ex.exerciseId) continue;
      const blocks = Array.isArray(ex.blocks) && ex.blocks.length ? ex.blocks : [{ sets: '3', reps: '10', technique: '' }];
      items.push({ id: str(ex.exerciseId), n: str(ex.title || ex.name), g: str(ex.subCategory || ex.category), ...fromBlocks(blocks) });
    }
    plan[str(day)] = items;
  }
  return plan;
}

/** O que ficou salvo (linhas de WorkoutExercise, em qualquer ordem) no formato enxuto. `names` completa nome e grupo dos exercícios que a IA não tinha entregue. */
export function normalizeSaved(rows: any[], names: Record<string, { n?: string; g?: string }> = {}): Plan {
  const sorted = (rows || []).filter(Boolean).sort((a, b) => num(a.order) - num(b.order));
  const plan: Plan = {};
  for (const r of sorted) {
    if (!r || !r.exerciseId) continue;
    const day = str(r.day) || 'A'; const id = str(r.exerciseId);
    const { t, b } = parseTech(r.technique);
    const blocks = b && b.length ? b : [{ sets: r.sets, reps: r.reps, technique: t }];
    const nm = names[id] || {};
    (plan[day] = plan[day] || []).push({ id, n: str(nm.n), g: str(nm.g), ...fromBlocks(blocks) });
  }
  return plan;
}

/** Maior subsequência crescente: devolve os índices que ficam no lugar (o resto "andou"). */
function stableSet(seq: number[]): Set<number> {
  const n = seq.length; const len = new Array(n).fill(1); const prev = new Array(n).fill(-1); let best = -1;
  for (let i = 0; i < n; i++) { for (let j = 0; j < i; j++) if (seq[j] < seq[i] && len[j] + 1 > len[i]) { len[i] = len[j] + 1; prev[i] = j; } if (best < 0 || len[i] > len[best]) best = i; }
  const keep = new Set<number>(); for (let k = best; k >= 0; k = prev[k]) keep.add(k);
  return keep;
}

/** Tudo o que mudou entre o treino da IA e o salvo pelo coach. Os exercícios tirados e acrescentados do mesmo grupo no mesmo dia viram "trocado". */
export function diffPlans(gen: Plan, saved: Plan): Edit[] {
  const edits: Edit[] = [];
  const days = uniq([...Object.keys(gen || {}), ...Object.keys(saved || {})]);
  for (const day of days) {
    const g = (gen?.[day] || []).filter((x, i, a) => a.findIndex((y) => y.id === x.id) === i);
    const s = (saved?.[day] || []).filter((x, i, a) => a.findIndex((y) => y.id === x.id) === i);
    const gIds = new Set(g.map((x) => x.id)); const sIds = new Set(s.map((x) => x.id));
    const removed = g.filter((x) => !sIds.has(x.id)); const added = s.filter((x) => !gIds.has(x.id));
    const usedAdded = new Set<string>(); const lone: PlanItem[] = [];
    for (const r of removed) {
      const a = added.find((x) => !usedAdded.has(x.id) && r.g && x.g && r.g === x.g);
      if (a) { usedAdded.add(a.id); edits.push({ type: 'swapped', day, fromId: r.id, toId: a.id, from: r.n, to: a.n, g: a.g || r.g, pos: s.findIndex((x) => x.id === a.id) }); }
      else lone.push(r);
    }
    for (const r of lone) edits.push({ type: 'removed', day, id: r.id, n: r.n, g: r.g });
    for (const a of added) if (!usedAdded.has(a.id)) edits.push({ type: 'added', day, id: a.id, n: a.n, g: a.g, pos: s.findIndex((x) => x.id === a.id) });
    // ordem: só entre os que continuam
    const common = s.filter((x) => gIds.has(x.id));
    const genPos = new Map(g.filter((x) => sIds.has(x.id)).map((x, i) => [x.id, i]));
    const keep = stableSet(common.map((x) => genPos.get(x.id) as number));
    common.forEach((x, i) => { if (!keep.has(i)) edits.push({ type: 'moved', day, id: x.id, n: x.n || g.find((y) => y.id === x.id)?.n, g: x.g || g.find((y) => y.id === x.id)?.g, from: genPos.get(x.id), to: i }); });
    // séries, repetições e técnica
    for (const x of common) {
      const o = g.find((y) => y.id === x.id) as PlanItem; const nm = o.n || x.n; const gr = o.g || x.g;
      if (o.s !== x.s) edits.push({ type: 'sets', day, id: x.id, n: nm, g: gr, from: o.s, to: x.s });
      if (o.r !== x.r) edits.push({ type: 'reps', day, id: x.id, n: nm, g: gr, from: o.r, to: x.r });
      if (o.t !== x.t) edits.push({ type: 'technique', day, id: x.id, n: nm, g: gr, from: o.t, to: x.t });
    }
  }
  return edits.slice(0, MAX_EDITS);
}

export function summarizeEdits(edits: Edit[]): EditSummary {
  const c = (t: EditType) => edits.filter((e) => e.type === t).length;
  const changed = c('sets') + c('reps') + c('technique');
  return { removed: c('removed'), added: c('added'), swapped: c('swapped'), moved: c('moved'), changed, total: edits.length };
}
