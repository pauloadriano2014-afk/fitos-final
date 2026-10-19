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

interface BlockLike { sets?: string; reps?: string; technique?: string; [k: string]: any }

/** Se todas as séries do exercício têm a MESMA repetição (e são só séries comuns), devolve os blocos com a pirâmide da fase; senão devolve os mesmos blocos. */
export function shapeReps<B extends BlockLike>(blocks: B[], ctx: { phase: string | null | undefined; range: RepRange; compound?: boolean; idx?: number }): B[] {
  if (!Array.isArray(blocks) || blocks.length < 2) return blocks;
  if (blocks.some((b) => !TECH_OK.has(String(b.technique || '').toUpperCase().replace(/[^A-Z0-9_]/g, '')) || String(b.sets ?? '1').trim() !== '1')) return blocks;
  const reps = blocks.map((b) => String(b.reps ?? '').trim());
  if (!reps.every((r) => /^\d+$/.test(r)) || new Set(reps).size !== 1) return blocks;
  const scheme = pyramidReps(blocks.length, ctx.phase, ctx.range, variantFor(!!ctx.compound, ctx.idx || 0));
  if (!scheme || scheme.every((r) => r === reps[0])) return blocks;   // faixa muito estreita (ex.: iniciante): fica como está
  return blocks.map((b, i) => ({ ...b, reps: scheme[i] }));
}
