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

// 🧭 (24 out 2026) ESTILO DO COACH ("Como você quer montar o treino?"): ordem dos músculos por tipo de dia (parte de cima / pernas / full body) e regras "X vem antes/depois de Y" entre
// músculos ou exercícios. Vem em cycleConfig.orderStyle; sem ele vale a ordem padrão por nível (GROUP_TIER).
export type OrderKind = 'UPPER' | 'LOWER' | 'FULL';
export interface OrderRef { k: 'G' | 'E'; id: string }
export interface OrderRule { a: OrderRef; rel: 'ANTES' | 'DEPOIS'; b: OrderRef; when: 'SEMPRE' | OrderKind }
export interface OrderStyle { orders: Partial<Record<OrderKind, string[]>>; rules: OrderRule[] }
const UPPER = new Set(['PEITO', 'COSTAS_PUXADA', 'COSTAS_REMADA', 'OMBRO_MULTI', 'OMBRO_FRONTAL', 'OMBRO_LATERAL', 'OMBRO_POST', 'TRAPEZIO', 'BICEPS', 'TRICEPS']);
const LOWER = new Set(['QUADRICEPS', 'POSTERIORES', 'GLUTEOS', 'ADUTOR', 'ABDUTOR', 'PANTURRILHA']);
export const MAX_ORDER_RULES = 24;

/** Tipo do dia pelos músculos que ele tem: só cima, só pernas ou os dois (full body). */
export function kindOfDay(groups: string[]): OrderKind {
  const up = groups.some((g) => UPPER.has(g)); const low = groups.some((g) => LOWER.has(g));
  return up && low ? 'FULL' : low ? 'LOWER' : 'UPPER';
}

const okRef = (r: any): OrderRef | null => (r && (r.k === 'G' || r.k === 'E') && typeof r.id === 'string' && /^[A-Za-z0-9_\-]{1,64}$/.test(r.id) ? { k: r.k, id: r.id } : null);
/** Lê o estilo que veio do app (pode faltar ou vir quebrado): devolve null se não há nada que valha. */
export function cleanOrderStyle(raw: any): OrderStyle | null {
  if (!raw || typeof raw !== 'object') return null;
  const orders: OrderStyle['orders'] = {};
  for (const k of ['UPPER', 'LOWER', 'FULL'] as OrderKind[]) {
    const l = raw.orders && raw.orders[k];
    if (Array.isArray(l)) orders[k] = l.map(String).filter((g, i, a) => (GROUP_TIER[g] != null) && a.indexOf(g) === i);
  }
  const rules: OrderRule[] = [];
  for (const x of Array.isArray(raw.rules) ? raw.rules : []) {
    const a = okRef(x && x.a); const b = okRef(x && x.b);
    if (!a || !b || (a.k === b.k && a.id === b.id) || (x.rel !== 'ANTES' && x.rel !== 'DEPOIS')) continue;
    rules.push({ a, rel: x.rel, b, when: x.when === 'UPPER' || x.when === 'LOWER' || x.when === 'FULL' ? x.when : 'SEMPRE' });
    if (rules.length >= MAX_ORDER_RULES) break;
  }
  return Object.keys(orders).length || rules.length ? { orders, rules } : null;
}

/** A ordem dos grupos do dia pelo estilo do coach: a lista do tipo de dia (ou, com `followDay`, a ordem em que o coach deixou os músculos no dia), depois as regras entre músculos ("A antes de B"). */
export function styleGroupOrder(groups: string[], style: OrderStyle, kind: OrderKind, followDay = false): string[] {
  const present = [...new Set(groups)];
  const list = followDay ? present : (style.orders[kind] || []);
  const order = [...list.filter((g) => present.includes(g)), ...present.filter((g) => !list.includes(g))];
  const rules = style.rules.filter((r) => r.a.k === 'G' && r.b.k === 'G' && (r.when === 'SEMPRE' || r.when === kind));
  for (let pass = 0; pass < 2; pass++) {
    for (const r of rules) {
      const ia = order.indexOf(r.a.id); const ib = order.indexOf(r.b.id); if (ia < 0 || ib < 0) continue;
      if (r.rel === 'ANTES' && ia > ib) { order.splice(ia, 1); order.splice(order.indexOf(r.b.id), 0, r.a.id); }
      else if (r.rel === 'DEPOIS' && ia < ib) { order.splice(ia, 1); order.splice(order.indexOf(r.b.id) + 1, 0, r.a.id); }
    }
  }
  return order;
}

export interface OrderOpts<T> {
  /** ids dos grupos do dia, na ordem da estrutura */
  groups: string[];
  /** segue a ordem dos músculos que o coach deixou no dia (sem estilo: desliga a correção por nível; com estilo: troca a lista por tipo de dia, e as regras entre músculos continuam valendo) */
  keepGroupOrder?: boolean;
  /** grupo do exercício (null = não pertence a nenhum grupo do dia) */
  groupOf: (ex: T) => string | null;
  isCompound: (ex: T) => boolean;
  kind: (ex: T) => 'MOB' | 'CARDIO' | 'FORCA';
  /** técnica do 1º bloco (BISET, TRISET...) */
  technique: (ex: T) => string;
  /** estilo do coach (ordem por tipo de dia + regras); sem ele vale a ordem padrão por nível */
  style?: any;
  /** id do exercício na biblioteca (para as regras entre exercícios) */
  exId?: (ex: T) => string;
  /** onde fica o cardio: no começo (depois da mobilidade) ou no fim (padrão) */
  cardioAt?: 'COMECO' | 'FIM' | string;
}

const CHAIN: Record<string, number> = { BISET: 2, TRISET: 3 };

export function orderDayExercises<T>(list: T[], o: OrderOpts<T>): { list: T[]; changed: boolean } {
  if (!Array.isArray(list) || list.length < 2) return { list: list || [], changed: false };
  const style = cleanOrderStyle(o.style);
  const kind = kindOfDay(o.groups);
  const order = style ? styleGroupOrder(o.groups, style, kind, o.keepGroupOrder === true) : orderedGroupIds(o.groups, o.keepGroupOrder);
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
    if (k === 'MOB') rank = -1; else if (k === 'CARDIO') rank = o.cardioAt === 'COMECO' ? -0.5 : 9999;
    else { const g = o.groupOf(first); const r = g != null ? rankOfGroup.get(g) : undefined; if (r == null) { rank = carry; known = false; } else rank = r; }
    if (known && k === 'FORCA') carry = rank;
    return { p, idx, rank, mech: o.isCompound(first) ? 0 : 1, grp: known && k === 'FORCA' ? (o.groupOf(first) as string | null) : null };
  });
  keyed.sort((a, b) => a.rank - b.rank || a.mech - b.mech || a.idx - b.idx);
  // regras do coach entre exercícios (e entre exercício e músculo): move as peças de A para antes/depois das de B
  if (style && o.exId) {
    const exId = o.exId;
    const members = (ref: OrderRef) => keyed.filter((x) => (ref.k === 'E' ? x.p.some((e) => exId(e) === ref.id) : x.grp === ref.id));
    for (const r of style.rules) {
      if (r.a.k === 'G' && r.b.k === 'G') continue;                       // entre músculos já foi resolvido na ordem dos grupos
      if (r.when !== 'SEMPRE' && r.when !== kind) continue;
      const A = members(r.a); const B = members(r.b); if (!A.length || !B.length || A.some((x) => B.includes(x))) continue;
      const idx = (x: any) => keyed.indexOf(x);
      if (r.rel === 'ANTES') {
        const firstB = Math.min(...B.map(idx)); if (Math.max(...A.map(idx)) < firstB) continue;
        const target = keyed[firstB]; const moved = keyed.filter((x) => A.includes(x)); const rest = keyed.filter((x) => !A.includes(x));
        rest.splice(rest.indexOf(target), 0, ...moved); keyed.splice(0, keyed.length, ...rest);
      } else {
        const lastB = Math.max(...B.map(idx)); if (Math.min(...A.map(idx)) > lastB) continue;
        const target = keyed[lastB]; const moved = keyed.filter((x) => A.includes(x)); const rest = keyed.filter((x) => !A.includes(x));
        rest.splice(rest.indexOf(target) + 1, 0, ...moved); keyed.splice(0, keyed.length, ...rest);
      }
    }
  }
  const out = keyed.flatMap((x) => x.p);
  const changed = out.some((e, i) => e !== list[i]);
  return { list: out, changed };
}
