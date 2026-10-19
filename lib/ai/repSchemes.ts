// lib/ai/repSchemes.ts
// 🔺 (19 out 2026) REPETIÇÕES EM PIRÂMIDE. O treino gerado saía com todas as séries do exercício na mesma repetição (4x12, 4x12, 4x12), porque o exemplo do prompt tinha 4 blocos
// iguais e a IA copiava. O treino que o Paulo e a Adri montam não é assim: numa análise dos exercícios dos últimos 150 dias (só os de várias séries, sem técnica), 84% variam a repetição,
// quase sempre em pirâmide decrescente: 3 séries → 15-12-10 (397 exercícios), 12-10-8 (273), 15-12-12 (219); 4 séries → 15-12-10-8 (165), 12-10-8-8 (62), 12-12-10-10 (46).
// Aqui ficam esses esquemas e a regra que os aplica depois da IA (qualquer motor): se TODAS as séries de um exercício vieram com a mesma repetição, trocamos pelo esquema da fase.
// Quem já veio variando fica como está. Funções puras (sem banco).
export type RepRange = [number, number];

// Hipertrofia (a base do histórico): [isolado/acessório, composto (mais pesado), variação]
const HIPERTROFIA: Record<number, string[][]> = {
  2: [['15', '12'], ['12', '10'], ['12', '12']],
  3: [['15', '12', '10'], ['12', '10', '8'], ['15', '12', '12']],
  4: [['15', '12', '10', '8'], ['12', '10', '8', '8'], ['15', '12', '12', '10']],
  5: [['15', '12', '12', '10', '10'], ['12', '10', '10', '8', '8'], ['15', '12', '10', '10', '8']],
  6: [['15', '12', '12', '10', '10', '8'], ['12', '12', '10', '10', '8', '8'], ['15', '12', '12', '10', '10', '10']],
};
// Outras fases: um esquema só (a faixa da fase manda)
const OUTRAS: Record<string, Record<number, string[]>> = {
  FORCA: { 2: ['6', '5'], 3: ['6', '5', '4'], 4: ['6', '5', '4', '4'], 5: ['6', '5', '5', '4', '4'], 6: ['6', '5', '5', '4', '4', '4'] },
  CHOQUE: { 2: ['12', '10'], 3: ['12', '10', '8'], 4: ['12', '10', '8', '6'], 5: ['12', '10', '8', '8', '6'], 6: ['12', '10', '10', '8', '8', '6'] },
  EMAGRECIMENTO: { 2: ['20', '15'], 3: ['20', '15', '15'], 4: ['20', '15', '15', '12'], 5: ['20', '15', '15', '12', '12'], 6: ['20', '15', '15', '15', '12', '12'] },
  DEFINICAO: { 2: ['15', '12'], 3: ['15', '12', '12'], 4: ['15', '15', '12', '12'], 5: ['15', '15', '12', '12', '12'], 6: ['15', '15', '12', '12', '12', '12'] },
};
// DELOAD fica de fora de propósito: semana leve, repetição igual é o esperado.
const TECH_OK = new Set(['', 'BISET', 'TRISET']);   // nas outras técnicas (dropset, rest-pause, 21, cluster, GVT...) a repetição faz parte da técnica

const clamp = (v: string, [lo, hi]: RepRange) => String(Math.min(Math.max(Number(v), lo), hi));

/** Esquema de repetições (uma por série) para `n` séries; null se a fase não usa pirâmide. `variant`: 0 = isolado/acessório, 1 = composto (mais pesado), 2 = variação. */
export function pyramidReps(n: number, phase: string | null | undefined, range: RepRange, variant = 0): string[] | null {
  const k = Math.min(Math.max(Math.round(n), 0), 6); if (k < 2) return null;
  const ph = String(phase || 'HIPERTROFIA').toUpperCase();
  if (ph === 'DELOAD') return null;
  const base = (ph === 'HIPERTROFIA' || !OUTRAS[ph]) ? HIPERTROFIA[k][Math.min(Math.max(variant, 0), 2)] : OUTRAS[ph][k];
  const out = base.map((v) => clamp(v, range));
  return n > 6 ? [...out, ...Array.from({ length: n - 6 }, () => out[out.length - 1])] : out;
}

/** Qual das variações usar: composto → o mais pesado; nos demais alterna (1 a cada 3 usa a variação), para o treino não ficar todo igual. */
export const variantFor = (compound: boolean, idx: number): number => (compound ? 1 : (idx % 3 === 2 ? 2 : 0));

// ───────── ESCOLHA DO COACH (tela do Protocolo ELITE: quadradinho "Repetições") ─────────
// AUTO = o que está acima (pirâmide do histórico, pela fase); LEVE/PESADA = pirâmide fixa para TODOS os exercícios; RETA = mesma repetição em todas as séries; FAIXA = pirâmide de A até B.
// Escolha explícita do coach vale mais que a faixa da fase e que o deload; só as técnicas com repetição própria (dropset, rest-pause, 21, cluster, GVT...) ficam de fora.
export type RepMode = 'AUTO' | 'LEVE' | 'PESADA' | 'RETA' | 'FAIXA';
export interface RepChoice { mode: RepMode; flat?: number; from?: number; to?: number }
const SNAP = [3, 4, 5, 6, 8, 10, 12, 15, 20, 25, 30];
const snap = (v: number) => SNAP.reduce((best, x) => (Math.abs(x - v) < Math.abs(best - v) ? x : best), SNAP[0]);
const rep = (v: any, lo = 3, hi = 30): number | null => { const n = Math.round(Number(v)); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : null; };

/** Lê a escolha vinda da tela (pode faltar, vir quebrada ou de versão antiga) — sempre devolve algo válido; sem escolha = AUTO. */
export function cleanRepChoice(raw: any): RepChoice {
  const mode = String(raw && raw.mode || 'AUTO').toUpperCase();
  if (mode === 'LEVE' || mode === 'PESADA') return { mode };
  if (mode === 'RETA') return { mode: 'RETA', flat: rep(raw.flat) ?? 12 };
  if (mode === 'FAIXA') {
    let a = rep(raw.from), b = rep(raw.to); if (a === null || b === null) return { mode: 'AUTO' };
    if (a < b) [a, b] = [b, a]; if (a === b) return { mode: 'RETA', flat: a };
    return { mode: 'FAIXA', from: a, to: b };
  }
  return { mode: 'AUTO' };
}

/** Repetições (uma por série) da escolha do coach para `n` séries; null no AUTO (quem decide é a fase). */
export function choiceReps(choice: RepChoice | null | undefined, n: number): string[] | null {
  const c = cleanRepChoice(choice); const k = Math.round(n); if (c.mode === 'AUTO' || k < 2) return null;
  if (c.mode === 'RETA') return Array.from({ length: k }, () => String(c.flat));
  if (c.mode === 'FAIXA') return Array.from({ length: k }, (_, i) => String(i === 0 ? c.from : i === k - 1 ? c.to : snap(c.from! - ((c.from! - c.to!) * i) / (k - 1))));
  const base = HIPERTROFIA[Math.min(k, 6)][c.mode === 'PESADA' ? 1 : 0];
  return k > 6 ? [...base, ...Array.from({ length: k - 6 }, () => base[base.length - 1])] : base.slice();
}

/** Frase para a IA (só quando o coach escolheu algo): vale mais que a regra geral de repetições. */
export function describeRepChoice(choice: RepChoice | null | undefined): string {
  const c = cleanRepChoice(choice);
  if (c.mode === 'LEVE') return 'pirâmide LEVE em todos os exercícios — 3 séries 15/12/10, 4 séries 15/12/10/8, 5 séries 15/12/12/10/10';
  if (c.mode === 'PESADA') return 'pirâmide PESADA em todos os exercícios — 3 séries 12/10/8, 4 séries 12/10/8/8, 5 séries 12/10/10/8/8';
  if (c.mode === 'RETA') return `a MESMA repetição em todas as séries de todos os exercícios: ${c.flat} (nada de pirâmide)`;
  if (c.mode === 'FAIXA') return `pirâmide decrescente de ${c.from} até ${c.to} repetições em todos os exercícios (ex.: 4 séries = ${choiceReps(c, 4)!.join('/')}; 3 séries = ${choiceReps(c, 3)!.join('/')})`;
  return '';
}

interface BlockLike { sets?: string; reps?: string; technique?: string; [k: string]: any }

/** Se todas as séries do exercício têm a MESMA repetição (e são só séries comuns), devolve os blocos com a pirâmide da fase; senão devolve os mesmos blocos. */
export function shapeReps<B extends BlockLike>(blocks: B[], ctx: { phase: string | null | undefined; range: RepRange; compound?: boolean; idx?: number; choice?: RepChoice | null }): B[] {
  if (!Array.isArray(blocks) || blocks.length < 2) return blocks;
  if (blocks.some((b) => !TECH_OK.has(String(b.technique || '').toUpperCase().replace(/[^A-Z0-9_]/g, '')) || String(b.sets ?? '1').trim() !== '1')) return blocks;
  // escolha explícita do coach: vale para todas as séries comuns do exercício, mesmo que a IA tenha variado
  const picked = choiceReps(ctx.choice, blocks.length);
  if (picked) return picked.every((r, i) => String(blocks[i].reps ?? '').trim() === r) ? blocks : blocks.map((b, i) => ({ ...b, reps: picked[i] }));
  const reps = blocks.map((b) => String(b.reps ?? '').trim());
  if (!reps.every((r) => /^\d+$/.test(r)) || new Set(reps).size !== 1) return blocks;
  const scheme = pyramidReps(blocks.length, ctx.phase, ctx.range, variantFor(!!ctx.compound, ctx.idx || 0));
  if (!scheme || scheme.every((r) => r === reps[0])) return blocks;   // faixa muito estreita (ex.: iniciante): fica como está
  return blocks.map((b, i) => ({ ...b, reps: scheme[i] }));
}
