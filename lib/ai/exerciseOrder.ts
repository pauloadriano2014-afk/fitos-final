// lib/ai/exerciseOrder.ts
// 📐 (23 out 2026) ORDEM DOS EXERCÍCIOS NO DIA — o servidor garante o padrão, não a IA. Função pura (sem banco, sem IA).
// Regras (o "padrão" do Paulo):
//   1) os grupos seguem a ordem da ESTRUTURA do dia, mas músculo grande vem antes de músculo pequeno (costas antes de bíceps, peito antes de ombro e tríceps, pernas antes de panturrilha e abdômen).
//      Dentro do mesmo nível a ordem que o coach montou é mantida; `keepGroupOrder` desliga a correção por nível e segue só a estrutura.
//   2) todos os exercícios de um grupo ficam juntos (nunca bíceps → costas → bíceps) e, dentro do grupo, o multiarticular (composto) vem antes do isolado.
//   3) bi-set / tri-set andam juntos (a cadeia inteira muda de lugar como uma peça só).
//   4) mobilidade fica no começo; cardio, no fim. Exercício sem grupo conhecido fica onde estava, colado ao vizinho de cima.

/** Nível do grupo: 1 = grande/multiarticular, 2 = ombros pequenos e trapézio, 3 = braços, 4 = pequenos e abdômen. */
export const GROUP_TIER: Record<string, number> = {
  QUADRICEPS: 1, POSTERIORES: 1, GLUTEOS: 1, PEITO: 1, COSTAS_PUXADA: 1, COSTAS_REMADA: 1, OMBRO_MULTI: 1,
  OMBRO_FRONTAL: 2, OMBRO_LATERAL: 2, OMBRO_POST: 2, TRAPEZIO: 2,
  BICEPS: 3, TRICEPS: 3,
  ADUTOR: 4, ABDUTOR: 4, PANTURRILHA: 4, ABDOMEN: 4,
};
const tierOf = (id: string) => GROUP_TIER[id] ?? 2;

/** A ordem final dos grupos de um dia: por nível (grande → pequeno), mantendo a ordem do coach dentro de cada nível. */
export function orderedGroupIds(ids: string[], keepGroupOrder = false): string[] {
  const uniq = [...new Set(ids)];
  if (keepGroupOrder) return uniq;
  return uniq.map((id, i) => ({ id, i })).sort((a, b) => tierOf(a.id) - tierOf(b.id) || a.i - b.i).map((x) => x.id);
}

export interface OrderOpts<T> {
  /** ids dos grupos do dia, na ordem da estrutura */
  groups: string[];
  keepGroupOrder?: boolean;
  /** grupo do exercício (null = não pertence a nenhum grupo do dia) */
  groupOf: (ex: T) => string | null;
  isCompound: (ex: T) => boolean;
  kind: (ex: T) => 'MOB' | 'CARDIO' | 'FORCA';
  /** técnica do 1º bloco (BISET, TRISET...) */
  technique: (ex: T) => string;
}

const CHAIN: Record<string, number> = { BISET: 2, TRISET: 3 };

export function orderDayExercises<T>(list: T[], o: OrderOpts<T>): { list: T[]; changed: boolean } {
  if (!Array.isArray(list) || list.length < 2) return { list: list || [], changed: false };
  const order = orderedGroupIds(o.groups, o.keepGroupOrder);
  const rankOfGroup = new Map(order.map((g, i) => [g, i]));
  // 1) peças: cadeias de bi/tri-set consecutivas viram uma peça só
  const pieces: T[][] = [];
  for (let i = 0; i < list.length; i++) {
    const t = String(o.technique(list[i]) || '').toUpperCase();
    const size = CHAIN[t] || 0;
    if (size > 1 && i + size <= list.length && list.slice(i, i + size).every((e) => String(o.technique(e) || '').toUpperCase() === t)) { pieces.push(list.slice(i, i + size)); i += size - 1; } else pieces.push([list[i]]);
  }
  // 2) posição de cada peça: mobilidade (-1) no começo, cardio (9999) no fim, grupo conhecido = posição do grupo, desconhecido = herda a do vizinho de cima
  let carry = -1;
  const keyed = pieces.map((p, idx) => {
    const first = p[0]; const k = o.kind(first);
    let rank: number; let known = true;
    if (k === 'MOB') rank = -1; else if (k === 'CARDIO') rank = 9999;
    else { const g = o.groupOf(first); const r = g != null ? rankOfGroup.get(g) : undefined; if (r == null) { rank = carry; known = false; } else rank = r; }
    if (known && k === 'FORCA') carry = rank;
    return { p, idx, rank, mech: o.isCompound(first) ? 0 : 1 };
  });
  keyed.sort((a, b) => a.rank - b.rank || a.mech - b.mech || a.idx - b.idx);
  const out = keyed.flatMap((x) => x.p);
  const changed = out.some((e, i) => e !== list[i]);
  return { list: out, changed };
}
