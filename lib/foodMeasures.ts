// lib/foodMeasures.ts
// 🥄 (30 set 2026) MEDIDAS CASEIRAS -- quanto pesa (ou mede) UMA colher de sopa, UMA escumadeira,
// UM bife médio... de cada alimento.
//
// Regras de precedência (da mais forte pra mais fraca), por alimento e por medida:
//   1. Ajuste do PRÓPRIO time (coach/nutri)      -> FoodPortion scope = teamId  (source COACH)
//   2. Medida "manual" global                    -> FoodPortion scope GLOBAL, source MANUAL
//   3. Medidas que já existiam no app             -> lib/legacyFoodPortions.ts (tratadas como MANUAL)
//   4. Tabela de Medidas Referidas do IBGE (POF)  -> FoodPortion scope GLOBAL, source IBGE
// Um coach/nutri nunca altera a medida de outro: o ajuste dele só vale no time dele.
//
// Tudo que lê o banco aqui é à prova de "tabela ainda não criada" (deploy antes do `prisma db push`):
// devolve vazio em vez de derrubar a busca de alimentos ou a leitura da dieta.
import prisma from '@/lib/prisma';
import { LEGACY_FOOD_PORTIONS, type LegacyPortion } from '@/lib/legacyFoodPortions';

// ─── catálogo de medidas ──────────────────────────────────────────────────────
// A chave é o que fica gravado na dieta (FoodItem.unit). As 6 antigas (g, ml, unid, colher, fatia,
// xícara) continuam com a MESMA chave, então todas as dietas já salvas seguem valendo.
export const MEASURES = {
  g:                { label: 'g',                   plural: 'g',                    kind: 'peso' },
  ml:               { label: 'ml',                  plural: 'ml',                   kind: 'volume' },
  unid:             { label: 'unid.',               plural: 'unid.',                kind: 'contagem' },
  fatia:            { label: 'fatia',               plural: 'fatias',               kind: 'contagem' },
  colher:           { label: 'colher de sopa',      plural: 'colheres de sopa',     kind: 'volume' },
  colher_sobremesa: { label: 'colher de sobremesa', plural: 'colheres de sobremesa', kind: 'volume' },
  colher_cha:       { label: 'colher de chá',       plural: 'colheres de chá',      kind: 'volume' },
  colher_cafe:      { label: 'colher de café',      plural: 'colheres de café',     kind: 'volume' },
  'xícara':         { label: 'xícara',              plural: 'xícaras',              kind: 'volume' },
  copo:             { label: 'copo',                plural: 'copos',                kind: 'volume' },
  concha:           { label: 'concha',              plural: 'conchas',              kind: 'volume' },
  escumadeira:      { label: 'escumadeira',         plural: 'escumadeiras',         kind: 'volume' },
  bife_p:           { label: 'bife pequeno',        plural: 'bifes pequenos',       kind: 'porcao' },
  bife_m:           { label: 'bife médio',          plural: 'bifes médios',         kind: 'porcao' },
  bife_g:           { label: 'bife grande',         plural: 'bifes grandes',        kind: 'porcao' },
  pedaco:           { label: 'pedaço',              plural: 'pedaços',              kind: 'porcao' },
  scoop:            { label: 'scoop',               plural: 'scoops',               kind: 'contagem' },
  punhado:          { label: 'punhado',             plural: 'punhados',             kind: 'porcao' },
  porcao:           { label: 'porção',              plural: 'porções',              kind: 'porcao' },
} as const;

export type MeasureKey = keyof typeof MEASURES;
export const MEASURE_KEYS = Object.keys(MEASURES) as MeasureKey[];
/** g e ml são implícitos (1 g = 1 g): nunca ficam na tabela de medidas. */
export const STORED_MEASURE_KEYS = MEASURE_KEYS.filter((k) => k !== 'g' && k !== 'ml');

const strip = (s: string) =>
  String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

const ALIASES: Array<[RegExp, MeasureKey]> = [
  [/^(g|gr|grama|gramas)$/, 'g'],
  [/^(ml|mililitro|mililitros)$/, 'ml'],
  [/^(un|unid|unidade|unidades)$/, 'unid'],
  [/^(fatia|fatias)$/, 'fatia'],
  [/^(colher|colheres|colher sopa|colher de sopa|col sopa|colher_sopa)$/, 'colher'],
  [/^(colher sobremesa|colher de sobremesa|col sobremesa)$/, 'colher_sobremesa'],
  [/^(colher cha|colher de cha|col cha|colher_cha)$/, 'colher_cha'],
  [/^(colher cafe|colher de cafe|col cafe|colher_cafe)$/, 'colher_cafe'],
  [/^(xicara|xicaras)$/, 'xícara'],
  [/^(copo|copos)$/, 'copo'],
  [/^(concha|conchas)$/, 'concha'],
  [/^(escumadeira|escumadeiras)$/, 'escumadeira'],
  [/^(bife p|bife pequeno|bife_p)$/, 'bife_p'],
  [/^(bife m|bife medio|bife_m)$/, 'bife_m'],
  [/^(bife g|bife grande|bife_g)$/, 'bife_g'],
  [/^(pedaco|pedacos)$/, 'pedaco'],
  [/^(scoop|scoops|dosador)$/, 'scoop'],
  [/^(punhado|punhados)$/, 'punhado'],
  [/^(porcao|porcoes)$/, 'porcao'],
];

/** Qualquer grafia de unidade -> chave canônica. Desconhecida -> null. */
export function normalizeUnitKey(raw: unknown): MeasureKey | null {
  if (raw === null || raw === undefined) return null;
  const direct = String(raw).trim();
  if ((MEASURE_KEYS as string[]).includes(direct)) return direct as MeasureKey;
  const n = strip(direct);
  for (const [re, key] of ALIASES) if (re.test(n)) return key;
  return null;
}

const MAX_GRAMS = 5000;

/** Limpa um mapa { unidade: gramas } vindo de fora: só chaves conhecidas (menos g/ml) e gramas em (0, 5000]. */
export function sanitizePortions(input: unknown): Record<string, number> {
  const out: Record<string, number> = {};
  if (!input || typeof input !== 'object' || Array.isArray(input)) return out;
  for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
    const key = normalizeUnitKey(k);
    if (!key || key === 'g' || key === 'ml') continue;
    const n = typeof v === 'number' ? v : parseFloat(String(v).replace(',', '.'));
    if (!Number.isFinite(n) || n <= 0 || n > MAX_GRAMS) continue;
    out[key] = Math.round(n * 100) / 100;
  }
  return out;
}

// ─── resolução (puro, testável) ───────────────────────────────────────────────
export type PortionRow = {
  foodId: string;
  scope: string;
  unit: string;
  grams: number;
  isDefault?: boolean | null;
  defaultAmount?: number | null;
  source?: string | null;
};

export type PortionSource = 'COACH' | 'MANUAL' | 'LEGACY' | 'IBGE';
export type ResolvedPortions = {
  portions: Record<string, number>;
  sources: Record<string, PortionSource>;
  defaultPortion: { amount: number; unit: string } | null;
};

const norm = (s: string) => strip(s);

const LEGACY_BY_NAME = new Map<string, LegacyPortion>(
  Object.values(LEGACY_FOOD_PORTIONS).map((l) => [norm(l.name), l]),
);

/** Medidas antigas do app pra esse alimento: pelo id; se o id não bater, pelo nome idêntico. */
export function legacyFor(food: { id: string; name: string }): LegacyPortion | null {
  return LEGACY_FOOD_PORTIONS[food.id] ?? LEGACY_BY_NAME.get(norm(food.name)) ?? null;
}

export function resolvePortions(rows: PortionRow[], teamScope: string | null, legacy: LegacyPortion | null): ResolvedPortions {
  const portions: Record<string, number> = {};
  const sources: Record<string, PortionSource> = {};
  let defaultPortion: ResolvedPortions['defaultPortion'] = null;

  const apply = (unitRaw: string, grams: number, src: PortionSource) => {
    const key = normalizeUnitKey(unitRaw);
    if (!key || key === 'g' || key === 'ml' || !(grams > 0)) return;
    portions[key] = grams;
    sources[key] = src;
  };
  const setDefault = (unitRaw: string, amount: number | null | undefined) => {
    const key = normalizeUnitKey(unitRaw);
    if (!key) return;
    defaultPortion = { amount: amount && amount > 0 ? amount : 1, unit: key };
  };

  // da camada mais fraca pra mais forte (a mais forte escreve por último)
  const layer = (pred: (r: PortionRow) => boolean, src: PortionSource) => {
    for (const r of rows.filter(pred)) {
      apply(r.unit, r.grams, src);
      if (r.isDefault) setDefault(r.unit, r.defaultAmount ?? null);
    }
  };

  layer((r) => r.scope === 'GLOBAL' && (r.source ?? 'MANUAL') === 'IBGE', 'IBGE');
  if (legacy) {
    for (const [u, g] of Object.entries(legacy.portions)) apply(u, g, 'LEGACY');
    if (legacy.default) setDefault(legacy.default.unit, legacy.default.amount);
  }
  layer((r) => r.scope === 'GLOBAL' && (r.source ?? 'MANUAL') !== 'IBGE', 'MANUAL');
  if (teamScope) layer((r) => r.scope === teamScope, 'COACH');

  // padrão que aponta pra uma medida que não existe mais (ex.: removida): descarta
  const dp = defaultPortion as ResolvedPortions['defaultPortion'];
  if (dp && dp.unit !== 'g' && dp.unit !== 'ml' && !(dp.unit in portions)) defaultPortion = null;
  return { portions, sources, defaultPortion };
}

/** Escopo (teamId) de quem está pedindo: time master é um só, os demais são o próprio id. */
export function teamScopeFor(coachId: string | null | undefined, masterIds: string[]): string | null {
  if (!coachId) return null;
  return masterIds.includes(coachId) ? 'MASTER_TEAM' : coachId;
}

// ─── banco (tudo protegido: tabela ausente = sem medidas do banco, só as antigas) ─────────
let warned = false;
function warnOnce(where: string, e: any) {
  if (warned) return;
  warned = true;
  console.warn(`[foodMeasures] ${where}: ${e?.code || ''} ${e?.message || e} — seguindo só com as medidas antigas (rode "prisma db push" pra ativar as novas).`);
}

/** Medidas de vários alimentos de uma vez (1 consulta). Nunca lança. */
export async function portionsForFoods(
  foods: Array<{ id: string; name: string }>,
  teamScope: string | null,
): Promise<Map<string, ResolvedPortions>> {
  const out = new Map<string, ResolvedPortions>();
  let rows: PortionRow[] = [];
  if (foods.length) {
    try {
      rows = (await (prisma as any).foodPortion.findMany({
        where: { foodId: { in: foods.map((f) => f.id) }, scope: { in: teamScope ? ['GLOBAL', teamScope] : ['GLOBAL'] } },
        select: { foodId: true, scope: true, unit: true, grams: true, isDefault: true, defaultAmount: true, source: true },
      })) as PortionRow[];
    } catch (e) {
      warnOnce('portionsForFoods', e);
    }
  }
  const byFood = new Map<string, PortionRow[]>();
  for (const r of rows) {
    const arr = byFood.get(r.foodId) ?? [];
    arr.push(r);
    byFood.set(r.foodId, arr);
  }
  for (const f of foods) out.set(f.id, resolvePortions(byFood.get(f.id) ?? [], teamScope, legacyFor(f)));
  return out;
}

// ─── metadados do item da dieta (foodId + medidas vigentes ao salvar) ─────────────────
export type ItemMeta = { foodId: string | null; portions: Record<string, number> | null };

export async function loadItemMeta(itemIds: string[]): Promise<Map<string, ItemMeta>> {
  const map = new Map<string, ItemMeta>();
  if (!itemIds.length) return map;
  try {
    const rows = await (prisma as any).foodItemMeta.findMany({
      where: { foodItemId: { in: itemIds } },
      select: { foodItemId: true, foodId: true, portions: true },
    });
    for (const r of rows) map.set(r.foodItemId, { foodId: r.foodId ?? null, portions: sanitizePortions(r.portions) });
  } catch (e) {
    warnOnce('loadItemMeta', e);
  }
  return map;
}

/** Junta foodId/medidas nos itens crus de uma dieta (Diet.meals[].items[]) antes de formatar. Nunca lança. */
export async function attachItemMeta(diet: any): Promise<void> {
  try {
    const ids: string[] = [];
    for (const m of diet?.meals ?? []) for (const it of m.items ?? []) if (it?.id) ids.push(it.id);
    const meta = await loadItemMeta(ids);
    if (!meta.size) return;
    for (const m of diet.meals) for (const it of m.items ?? []) {
      const x = meta.get(it.id);
      if (x) { it.__foodId = x.foodId; it.__portions = x.portions; }
    }
  } catch (e) {
    warnOnce('attachItemMeta', e);
  }
}

export type ItemMetaInput = { foodItemId: string; foodId?: unknown; portions?: unknown };

/** Grava foodId + medidas dos itens recém-criados. Falha em silêncio (a dieta já foi salva). */
export async function saveItemMetas(inputs: ItemMetaInput[]): Promise<void> {
  const data = inputs
    .map((i) => {
      const portions = sanitizePortions(i.portions);
      const foodId = typeof i.foodId === 'string' && i.foodId.length > 0 && i.foodId.length <= 64 ? i.foodId : null;
      return { foodItemId: i.foodItemId, foodId, portions: Object.keys(portions).length ? portions : undefined };
    })
    .filter((d) => d.foodId || d.portions);
  if (!data.length) return;
  try {
    await (prisma as any).foodItemMeta.createMany({ data, skipDuplicates: true });
  } catch (e) {
    warnOnce('saveItemMetas', e);
  }
}
