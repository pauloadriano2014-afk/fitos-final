// lib/ai/styleProfile.ts
// 🧬 (27 out 2026) ESTILO DO COACH: lê os treinos que o próprio coach montou (todos, não só os da IA) e resume o "jeito dele": divisão da semana, quantos exercícios por dia,
// séries e repetições, técnicas, exercícios de sempre (âncoras) e o que ele troca de um ciclo para o próximo. Funções PURAS (sem banco): quem lê o banco é lib/ai/styleStore.ts.
// Nada aqui muda o treino de ninguém: o texto gerado só é entregue à IA quando o coach liga "usar o meu estilo" (por enquanto, só o Paulo).
import { normalizeSaved, type Plan, type PlanItem } from '@/lib/ai/genLearning';

export interface StyleWorkout { id: string; studentId: string; createdAt: string; gender: string; level: string; goal: string; plan: Plan }
export interface Pct { n: number; pct: number }
export interface StyleProfile {
  version: 1;
  sample: { workouts: number; students: number; from: string | null; to: string | null; days: number };
  split: { daysPerWorkout: Pct[]; dayPatterns: { groups: string[]; count: number }[] };
  volume: { exercisesPerDay: number; setsPerExercise: Pct[]; byGroup: { g: string; exPerDay: number; setsPerEx: number; days: number }[] };
  reps: { sequences: { seq: string; sets: number; pct: number }[] };
  techniques: { t: string; exercises: number; workoutsPct: number; lastOfGroupPct: number }[];
  favorites: { g: string; items: { n: string; students: number }[] }[];
  rotation: { pairs: number; keepRate: number; setsChangedPct: number; byGroup: { g: string; keepRate: number }[]; topSwaps: { from: string; to: string; count: number }[] };
  cardio: { dayPct: number; typical: string };
}

const str = (v: any) => String(v ?? '').trim();
export const norm = (v: any) => str(v).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const pct = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 100) : 0);
const avg = (a: number[]) => (a.length ? Math.round((a.reduce((x, y) => x + y, 0) / a.length) * 10) / 10 : 0);
const label = (g: string) => g.charAt(0).toUpperCase() + g.slice(1);
const SEP = ' — ';
/** Treinos do mesmo aluno criados com menos de 7 dias de diferença fazem parte do mesmo ciclo. */
export const CYCLE_GAP_MS = 7 * 24 * 3600 * 1000;
/** O grupo "largo" do exercício: Peito, Costas, Pernas... ("Pernas — Posteriores" -> "Pernas"). */
export const coarse = (g: string) => str(g).split(SEP)[0];

export const isCardio = (it: PlanItem) => /cardio/i.test(it.g);
export const isMobility = (it: PlanItem) => /mobilidade|along|aquec/i.test(it.g);
export const isStrength = (it: PlanItem) => !isCardio(it) && !isMobility(it) && !!it.g;

/** Treino salvo no banco (com os exercícios e a ficha do aluno) -> formato do estilo. Devolve null se for pequeno demais para ensinar algo. */
export function toStyleWorkout(w: any): StyleWorkout | null {
  const rows = Array.isArray(w?.exercises) ? w.exercises : [];
  if (rows.length < 3) return null;
  const names: Record<string, { n?: string; g?: string }> = {};
  for (const r of rows) {
    const e = r?.exercise; if (!e || !r.exerciseId) continue;
    // no sistema do Paulo o músculo está na categoria (Peito, Costas, Pernas...) e a subcategoria é o tipo (Medial, Remadas, Posteriores); "Geral" = sem tipo
    const cat = str(e.category), sub = str(e.subCategory); names[str(r.exerciseId)] = { n: str(e.name), g: sub && norm(sub) !== 'geral' && norm(sub) !== norm(cat) ? `${cat}${SEP}${sub}` : cat };
  }
  const plan = normalizeSaved(rows, names);
  if (!Object.values(plan).some((l) => l.some(isStrength))) return null;
  return { id: str(w.id), studentId: str(w.userId), createdAt: new Date(w.createdAt || 0).toISOString(), gender: str(w.user?.gender), level: str(w.level), goal: str(w.goal), plan };
}

const strengthDays = (w: StyleWorkout) => Object.values(w.plan).map((l) => l.filter(isStrength)).filter((l) => l.length > 0);
const groupRuns = (items: PlanItem[]): string[] => { const out: string[] = []; for (const it of items) { const g = norm(coarse(it.g)); if (g && out[out.length - 1] !== g) out.push(g); } return out; };
const dispName = (items: PlanItem[], key: string) => (items.find((i) => norm(i.g) === key)?.g || key);
const dispCoarse = (items: PlanItem[], key: string) => coarse(items.find((i) => norm(coarse(i.g)) === key)?.g || key);
const isRealTech = (t: string) => !!t && t.toUpperCase() !== 'NORMAL';

/** O jeito do coach, calculado dos treinos dele (do mais novo para o mais antigo ou em qualquer ordem). */
export function buildStyleProfile(workoutsIn: StyleWorkout[]): StyleProfile {
  const ws = (workoutsIn || []).filter((w) => strengthDays(w).length > 0).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const students = new Set(ws.map((w) => w.studentId));
  let dayCount = 0;

  const daysHist = new Map<number, number>(); const patterns = new Map<string, { groups: string[]; count: number }>();
  const setsHist = new Map<number, number>(); const seqHist = new Map<string, { seq: string; sets: number; count: number }>();
  const exPerDay: number[] = []; const byGroup = new Map<string, { name: string; ex: number[]; sets: number[]; days: number }>();
  const tech = new Map<string, { exercises: number; workouts: Set<string>; last: number }>();
  const fav = new Map<string, Map<string, { n: string; students: Set<string> }>>();
  let cardioDays = 0; const cardioMinutes: number[] = [];

  let totalEx = 0;
  for (const w of ws) {
    const days = strengthDays(w);
    daysHist.set(days.length, (daysHist.get(days.length) || 0) + 1);
    for (const [, items] of Object.entries(w.plan)) {
      const st = items.filter(isStrength);
      if (st.length) {
        dayCount++; exPerDay.push(st.length);
        const runs = groupRuns(st); const pk = runs.join('|'); const cur = patterns.get(pk) || { groups: runs.map((g) => label(dispCoarse(st, g))), count: 0 }; cur.count++; patterns.set(pk, cur);
        const perGroup = new Map<string, PlanItem[]>(); for (const it of st) { const k = norm(it.g); (perGroup.get(k) || perGroup.set(k, []).get(k)!).push(it); }
        for (const [k, list] of perGroup) { const e = byGroup.get(k) || { name: dispName(list, k), ex: [], sets: [], days: 0 }; e.ex.push(list.length); list.forEach((x) => e.sets.push(x.s)); e.days++; byGroup.set(k, e); }
        st.forEach((it, i) => {
          totalEx++; setsHist.set(it.s, (setsHist.get(it.s) || 0) + 1);
          if (it.r) { const key = `${it.s}|${it.r}`; const s0 = seqHist.get(key) || { seq: it.r, sets: it.s, count: 0 }; s0.count++; seqHist.set(key, s0); }
          const lastOfRun = i === st.length - 1 || norm(coarse(st[i + 1].g)) !== norm(coarse(it.g));
          for (const t of it.t.split('+').map((x) => x.trim()).filter(isRealTech)) { const e = tech.get(t) || { exercises: 0, workouts: new Set<string>(), last: 0 }; e.exercises++; e.workouts.add(w.id); if (lastOfRun) e.last++; tech.set(t, e); }
          const gk = norm(it.g); const fm = fav.get(gk) || new Map<string, { n: string; students: Set<string> }>(); const f = fm.get(it.id) || { n: it.n, students: new Set<string>() }; f.students.add(w.studentId); fm.set(it.id, f); fav.set(gk, fm);
        });
      }
      const cd = items.filter(isCardio); if (cd.length) { cardioDays++; cd.forEach((c) => { if (c.s > 0) cardioMinutes.push(c.s); }); }
    }
  }

  // 🔁 variação entre ciclos: o mesmo aluno, treino a treino (só musculação)
  const perStudent = new Map<string, StyleWorkout[]>(); for (const w of ws) (perStudent.get(w.studentId) || perStudent.set(w.studentId, []).get(w.studentId)!).push(w);
  let pairs = 0; let kept = 0; let prevTotal = 0; let common = 0; let setsChanged = 0;
  const grpKeep = new Map<string, { name: string; kept: number; total: number }>(); const swaps = new Map<string, { from: string; to: string; count: number }>();
  for (const list of perStudent.values()) {
    // rotinas criadas quase juntas (ex.: "semana 1 e 3" + "semana 2 e 4") são UM ciclo: a variação se mede de um ciclo para o seguinte
    const cycles: StyleWorkout[][] = [];
    for (const w of list) { const last = cycles[cycles.length - 1]; const lastW = last && last[last.length - 1]; if (lastW && Date.parse(w.createdAt) - Date.parse(lastW.createdAt) < CYCLE_GAP_MS) last.push(w); else cycles.push([w]); }
    for (let i = 1; i < cycles.length; i++) {
      const prev = cycles[i - 1], next = cycles[i];
      const pItems = prev.flatMap((w) => Object.values(w.plan).flat()).filter(isStrength); const nItems = next.flatMap((w) => Object.values(w.plan).flat()).filter(isStrength);
      if (!pItems.length || !nItems.length) continue;
      pairs++; const nIds = new Map(nItems.map((x) => [x.id, x])); const pIds = new Set(pItems.map((x) => x.id));
      prevTotal += new Set(pItems.map((x) => x.id)).size; const seen = new Set<string>();
      for (const it of pItems) {
        if (seen.has(it.id)) continue; seen.add(it.id);
        const k = norm(coarse(it.g)); const gk = grpKeep.get(k) || { name: coarse(it.g), kept: 0, total: 0 }; gk.total++;
        const n = nIds.get(it.id); if (n) { kept++; gk.kept++; common++; if (n.s !== it.s) setsChanged++; } grpKeep.set(k, gk);
      }
      // trocas: primeiro dentro do mesmo tipo (Peito — Superior), o que sobrar dentro do mesmo músculo (Peito)
      const leftover = (items: PlanItem[], not: Set<string>) => { const s2 = new Set<string>(); return items.filter((x) => { if (not.has(x.id) || s2.has(x.id)) return false; s2.add(x.id); return true; }); };
      const gone = leftover(pItems, new Set(nItems.map((x) => x.id))); const fresh = leftover(nItems, pIds); const taken = new Set<string>();
      const addSwap = (o: PlanItem, n: PlanItem) => { taken.add(n.id); const key = `${o.id}>${n.id}`; const e = swaps.get(key) || { from: o.n, to: n.n, count: 0 }; e.count++; swaps.set(key, e); };
      const unpaired: PlanItem[] = [];
      for (const o of gone) { const n = fresh.find((x) => !taken.has(x.id) && norm(x.g) === norm(o.g)); if (n) addSwap(o, n); else unpaired.push(o); }
      for (const o of unpaired) { const n = fresh.find((x) => !taken.has(x.id) && norm(coarse(x.g)) === norm(coarse(o.g))); if (n) addSwap(o, n); }
    }
  }

  const dpw = Array.from(daysHist.entries()).sort((a, b) => b[1] - a[1]).map(([n, c]) => ({ n, pct: pct(c, ws.length) }));
  const sph = Array.from(setsHist.entries()).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([n, c]) => ({ n, pct: pct(c, totalEx) }));
  return {
    version: 1,
    sample: { workouts: ws.length, students: students.size, from: ws[0]?.createdAt.slice(0, 10) || null, to: ws[ws.length - 1]?.createdAt.slice(0, 10) || null, days: dayCount },
    split: { daysPerWorkout: dpw, dayPatterns: Array.from(patterns.values()).sort((a, b) => b.count - a.count).slice(0, 10) },
    volume: {
      exercisesPerDay: avg(exPerDay), setsPerExercise: sph,
      byGroup: Array.from(byGroup.values()).filter((g) => g.days >= 3).sort((a, b) => b.days - a.days).slice(0, 16).map((g) => ({ g: label(g.name), exPerDay: avg(g.ex), setsPerEx: avg(g.sets), days: g.days })),
    },
    reps: { sequences: Array.from(seqHist.values()).sort((a, b) => b.count - a.count).slice(0, 8).map((s) => ({ seq: s.seq, sets: s.sets, pct: pct(s.count, totalEx) })) },
    techniques: Array.from(tech.entries()).sort((a, b) => b[1].exercises - a[1].exercises).slice(0, 8).map(([t, e]) => ({ t, exercises: e.exercises, workoutsPct: pct(e.workouts.size, ws.length), lastOfGroupPct: pct(e.last, e.exercises) })),
    favorites: Array.from(fav.entries()).map(([k, m]) => ({ g: label(byGroup.get(k)?.name || k), total: byGroup.get(k)?.days || 0, items: Array.from(m.values()).sort((a, b) => b.students.size - a.students.size).slice(0, 5).map((x) => ({ n: x.n, students: x.students.size })) }))
      .filter((f) => f.total >= 3).sort((a, b) => b.total - a.total).slice(0, 16).map(({ g, items }) => ({ g, items })),
    rotation: {
      pairs, keepRate: pct(kept, prevTotal), setsChangedPct: pct(setsChanged, common),
      byGroup: Array.from(grpKeep.values()).filter((g) => g.total >= 5).sort((a, b) => b.total - a.total).slice(0, 12).map((g) => ({ g: label(g.name), keepRate: pct(g.kept, g.total) })),
      topSwaps: Array.from(swaps.values()).sort((a, b) => b.count - a.count).filter((s) => s.count >= 2).slice(0, 8),
    },
    cardio: { dayPct: pct(cardioDays, dayCount + cardioDays), typical: cardioMinutes.length ? `${Math.round(avg(cardioMinutes))} min` : '' },
  };
}

/** Texto curto para a IA ler (português, sem enfeite). `maxChars` corta o final se passar. */
export function styleProfileText(p: StyleProfile, coachName = 'o coach', maxChars = 2600): string {
  if (!p || !p.sample.workouts) return '';
  const L: string[] = [];
  L.push(`ESTILO DE ${coachName.toUpperCase()} (calculado de ${p.sample.workouts} treinos reais de ${p.sample.students} alunos, ${p.sample.days} dias de musculação) — imite este jeito de montar, sem copiar treino de um aluno para outro:`);
  if (p.split.daysPerWorkout.length) L.push(`- Dias por rotina: ${p.split.daysPerWorkout.slice(0, 4).map((d) => `${d.n} dias (${d.pct}%)`).join(', ')}.`);
  if (p.split.dayPatterns.length) L.push(`- Dias mais comuns (grupos na ordem em que aparecem): ${p.split.dayPatterns.slice(0, 6).map((d) => `${d.groups.join(' + ')} (${d.count}x)`).join('; ')}.`);
  L.push(`- Em média ${p.volume.exercisesPerDay} exercícios de musculação por dia.`);
  if (p.volume.byGroup.length) L.push(`- Por grupo, num dia em que o grupo aparece: ${p.volume.byGroup.slice(0, 10).map((g) => `${g.g} ${g.exPerDay} exerc. de ~${g.setsPerEx} séries`).join('; ')}.`);
  if (p.volume.setsPerExercise.length) L.push(`- Séries por exercício: ${p.volume.setsPerExercise.slice(0, 4).map((s) => `${s.n} (${s.pct}%)`).join(', ')}.`);
  if (p.reps.sequences.length) L.push(`- Repetições mais usadas (séries x repetições por série): ${p.reps.sequences.slice(0, 6).map((s) => `${s.sets}x ${s.seq} (${s.pct}%)`).join('; ')}.`);
  if (p.techniques.length) L.push(`- Técnicas: ${p.techniques.slice(0, 5).map((t) => `${t.t} em ${t.workoutsPct}% dos treinos${t.lastOfGroupPct >= 40 ? `, quase sempre no último exercício do grupo (${t.lastOfGroupPct}%)` : ''}`).join('; ')}.`);
  if (p.favorites.length) L.push(`- Exercícios de sempre por grupo: ${p.favorites.slice(0, 10).map((f) => `${f.g}: ${f.items.slice(0, 4).map((i) => i.n).join(', ')}`).join(' | ')}.`);
  if (p.rotation.pairs >= 3) {
    L.push(`- De um ciclo para o seguinte (mesmo aluno, ${p.rotation.pairs} trocas de rotina observadas) mantém ~${p.rotation.keepRate}% dos exercícios${p.rotation.setsChangedPct ? ` e muda o número de séries em ~${p.rotation.setsChangedPct}% dos que mantém` : ''}.`);
    const lowest = p.rotation.byGroup.slice().sort((a, b) => a.keepRate - b.keepRate).slice(0, 3); if (lowest.length) L.push(`- Os grupos que ele mais renova: ${lowest.map((g) => `${g.g} (mantém ${g.keepRate}%)`).join(', ')}.`);
    if (p.rotation.topSwaps.length) L.push(`- Trocas típicas: ${p.rotation.topSwaps.slice(0, 6).map((s) => `${s.from} → ${s.to}`).join('; ')}.`);
  }
  if (p.cardio.dayPct > 0) L.push(`- Cardio em ~${p.cardio.dayPct}% dos dias${p.cardio.typical ? `, em geral ${p.cardio.typical}` : ''}.`);
  const text = L.join('\n');
  return text.length > maxChars ? text.slice(0, maxChars - 1).replace(/\s+\S*$/, '') + '…' : text;
}

// ─────────────────────────── exemplos parecidos ───────────────────────────
export interface StyleTarget { gender?: string; level?: string; goal?: string; days?: number; studentId?: string }
const lvl = (v: string) => { const n = norm(v); return n.includes('inici') ? 'i' : n.includes('inter') ? 'm' : n.includes('avanc') ? 'a' : ''; };
const gnd = (v: string) => { const n = norm(v); return n.startsWith('f') ? 'f' : n.startsWith('m') ? 'm' : ''; };
const gl = (v: string) => { const n = norm(v); return /hipert|massa|ganho/.test(n) ? 'h' : /emagre|defin|perda|cutting/.test(n) ? 'e' : /forca|power/.test(n) ? 'f' : /resist|cond/.test(n) ? 'r' : ''; };

/** Os `k` treinos reais mais parecidos com o aluno novo (mesmo sexo, nível, objetivo e nº de dias; os mais recentes valem um pouco mais). Nunca devolve treino do próprio aluno. */
export function pickSimilarExamples(ws: StyleWorkout[], t: StyleTarget, k = 3): StyleWorkout[] {
  const list = (ws || []).filter((w) => strengthDays(w).length > 0 && (!t.studentId || w.studentId !== t.studentId));
  if (!list.length) return [];
  const sorted = list.slice().sort((a, b) => a.createdAt.localeCompare(b.createdAt)); const rank = new Map(sorted.map((w, i) => [w.id, sorted.length > 1 ? i / (sorted.length - 1) : 1]));
  const scored = list.map((w) => {
    let s = 0; const d = strengthDays(w).length;
    if (gnd(t.gender || '') && gnd(w.gender) === gnd(t.gender || '')) s += 3;
    if (lvl(t.level || '') && lvl(w.level) === lvl(t.level || '')) s += 2;
    if (gl(t.goal || '') && gl(w.goal) === gl(t.goal || '')) s += 2;
    if (t.days) s += d === t.days ? 3 : Math.abs(d - t.days) === 1 ? 1 : -2;
    s += (rank.get(w.id) || 0) * 2;
    return { w, s };
  }).sort((a, b) => b.s - a.s);
  const out: StyleWorkout[] = []; const used = new Set<string>();
  for (const { w } of scored) { if (used.has(w.studentId)) continue; used.add(w.studentId); out.push(w); if (out.length >= k) break; }
  return out;
}

const ex1 = (it: PlanItem) => `${it.n} ${it.s}x${it.r || '?'}${it.t ? ` [${it.t}]` : ''}`;
/** Um treino real em linhas curtas (nomes dos exercícios, séries x repetições, técnica) para a IA enxergar o padrão. */
export function exampleText(w: StyleWorkout, maxChars = 900): string {
  const days = Object.entries(w.plan);
  const head = `Exemplo real (${strengthDays(w).length} dias${w.gender ? `, ${w.gender.toLowerCase()}` : ''}${w.level ? `, ${w.level.toLowerCase()}` : ''}${w.goal ? `, ${w.goal.toLowerCase()}` : ''}):`;
  const lines = days.map(([d, items]) => `  ${d}: ${items.filter((i) => isStrength(i) || isCardio(i)).map(ex1).join('; ')}`);
  const text = [head, ...lines].join('\n');
  return text.length > maxChars ? text.slice(0, maxChars - 1).replace(/\s+\S*$/, '') + '…' : text;
}

/** Bloco final que entra na mensagem da IA: o resumo do estilo + exemplos parecidos. Vazio se não houver base. */
export function buildStyleContext(ws: StyleWorkout[], target: StyleTarget, opts: { coachName?: string; examples?: number } = {}): string {
  const profile = buildStyleProfile(ws);
  const head = styleProfileText(profile, opts.coachName || 'o coach');
  if (!head) return '';
  const ex = pickSimilarExamples(ws, target, opts.examples ?? 3).map((w) => exampleText(w));
  return [head, ...(ex.length ? ['', 'TREINOS REAIS PARECIDOS COM ESTE ALUNO (só para você enxergar o jeito; monte o treino novo pelas regras e pelos códigos do banco):', ...ex] : [])].join('\n');
}
