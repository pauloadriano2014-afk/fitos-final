// prisma em memória pro importador do IBGE e pra busca de alimentos: entende os filtros usados nessas rotas
const DB = (globalThis.__IDB ??= { foods: [], portions: [], items: [], noPortionTable: false, seq: 0, log: [] });
const P2021 = () => Object.assign(new Error('The table `public.FoodPortion` does not exist in the current database.'), { code: 'P2021' });
const get = (row, k) => row[k];
function match(row, where) {
  if (!where) return true;
  return Object.entries(where).every(([k, v]) => {
    if (k === 'AND') return v.every((w) => match(row, w));
    if (k === 'OR') return v.some((w) => match(row, w));
    if (v && typeof v === 'object' && !(v instanceof Date)) {
      if ('in' in v) return v.in.includes(get(row, k));
      if ('contains' in v) return String(get(row, k) ?? '').toLowerCase().includes(String(v.contains).toLowerCase());
    }
    return (get(row, k) ?? null) === v;
  });
}
const pick = (row, select) => { if (!select) return { ...row }; const o = {}; for (const k of Object.keys(select)) if (select[k]) o[k] = row[k]; return o; };
const prisma = {
  __db: DB,
  food: {
    findMany: async ({ where, select, orderBy, skip = 0, take } = {}) => { DB.log.push(['food.findMany', where]); let r = DB.foods.filter((f) => match(f, where)); r = r.sort((a, b) => String(a.name).localeCompare(String(b.name))); return r.slice(skip, take ? skip + take : undefined).map((f) => pick(f, select)); },
    count: async ({ where } = {}) => DB.foods.filter((f) => match(f, where)).length,
    findUnique: async ({ where }) => { const f = DB.foods.find((x) => x.id === where.id); return f ? { ...f } : null; },
    createMany: async ({ data, skipDuplicates }) => { let n = 0; for (const d of data) { if (DB.foods.some((f) => f.id === d.id || (f.source === d.source && f.externalId === d.externalId))) { if (skipDuplicates) continue; throw new Error('Unique constraint'); } DB.foods.push({ conversionFactor: 1, isFavorite: false, isLactoseFree: false, ...d }); n++; } return { count: n }; },
    update: async ({ where, data }) => { const f = DB.foods.find((x) => x.id === where.id); if (!f) throw new Error('not found'); Object.assign(f, data); return f; },
    deleteMany: async ({ where }) => { const del = DB.foods.filter((f) => match(f, where)); DB.foods = DB.foods.filter((f) => !del.includes(f)); return { count: del.length }; },
  },
  foodPortion: {
    findMany: async ({ where, select } = {}) => { if (DB.noPortionTable) throw P2021(); return DB.portions.filter((p) => match(p, where)).map((p) => pick(p, select)); },
    count: async ({ where } = {}) => { if (DB.noPortionTable) throw P2021(); return DB.portions.filter((p) => match(p, where)).length; },
    createMany: async ({ data, skipDuplicates }) => { if (DB.noPortionTable) throw P2021(); let n = 0; for (const d of data) { if (DB.portions.some((p) => p.foodId === d.foodId && p.scope === d.scope && p.unit === d.unit)) { if (skipDuplicates) continue; throw new Error('Unique'); } DB.portions.push({ id: 'p' + (++DB.seq), isDefault: false, defaultAmount: null, ...d }); n++; } return { count: n }; },
    update: async ({ where, data }) => { if (DB.noPortionTable) throw P2021(); Object.assign(DB.portions.find((p) => p.id === where.id), data); },
    deleteMany: async ({ where }) => { if (DB.noPortionTable) throw P2021(); const del = DB.portions.filter((p) => match(p, where)); DB.portions = DB.portions.filter((p) => !del.includes(p)); return { count: del.length }; },
  },
  foodItem: {
    count: async ({ where } = {}) => DB.items.filter((i) => match(i, where)).length,
    updateMany: async ({ where, data }) => { const m = DB.items.filter((i) => match(i, where)); m.forEach((i) => Object.assign(i, data)); return { count: m.length }; },
  },
  $transaction: async (ops) => Promise.all(ops),
  $disconnect: async () => {},
};
class PrismaClient { constructor() { return prisma; } }
module.exports = prisma; module.exports.default = prisma; module.exports.PrismaClient = PrismaClient;
