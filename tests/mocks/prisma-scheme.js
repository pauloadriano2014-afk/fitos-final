// prisma em memória, o suficiente pra rotas de alimentos/medidas/dieta
const crypto = require('crypto');
const db = {
  foods: [], portions: [], metas: [], diets: [], users: [],
  missingPortionTable: false, missingMetaTable: false, missingSchemeTable: false, schemes: {}, log: [],
};
const P2021 = () => Object.assign(new Error('The table `public.FoodPortion` does not exist in the current database.'), { code: 'P2021' });
const matchWhere = (row, where) => Object.entries(where || {}).every(([k, v]) => {
  if (v && typeof v === 'object' && 'in' in v) return v.in.includes(row[k]);
  return row[k] === v;
});
const prisma = {
  __db: db,
  food: {
    findMany: async () => db.foods.map((f) => ({ ...f })),
    count: async () => db.foods.length,
    findUnique: async ({ where }) => db.foods.find((f) => f.id === where.id) || null,
  },
  foodPortion: {
    findMany: async ({ where }) => { if (db.missingPortionTable) throw P2021(); return db.portions.filter((r) => matchWhere(r, where)).map((r) => ({ ...r })); },
    findUnique: async ({ where }) => { if (db.missingPortionTable) throw P2021(); const k = where.foodId_scope_unit; return db.portions.find((r) => r.foodId === k.foodId && r.scope === k.scope && r.unit === k.unit) || null; },
    upsert: async ({ where, update, create }) => { if (db.missingPortionTable) throw P2021(); const k = where.foodId_scope_unit; const r = db.portions.find((x) => x.foodId === k.foodId && x.scope === k.scope && x.unit === k.unit); if (r) Object.assign(r, update); else db.portions.push({ isDefault: false, defaultAmount: null, ...create }); },
    create: async ({ data }) => { if (db.missingPortionTable) throw P2021(); db.portions.push({ isDefault: false, defaultAmount: null, ...data }); },
    update: async ({ where, data }) => { if (db.missingPortionTable) throw P2021(); const k = where.foodId_scope_unit; Object.assign(db.portions.find((x) => x.foodId === k.foodId && x.scope === k.scope && x.unit === k.unit), data); },
    updateMany: async ({ where, data }) => { if (db.missingPortionTable) throw P2021(); db.portions.filter((r) => matchWhere(r, where)).forEach((r) => Object.assign(r, data)); },
    deleteMany: async ({ where }) => { if (db.missingPortionTable) throw P2021(); const del = db.portions.filter((r) => matchWhere(r, where)); db.portions = db.portions.filter((r) => !del.includes(r)); return { count: del.length }; },
  },
  foodItemMeta: {
    findMany: async ({ where }) => { if (db.missingMetaTable) throw P2021(); return db.metas.filter((m) => where.foodItemId.in.includes(m.foodItemId)); },
    createMany: async ({ data }) => { if (db.missingMetaTable) throw P2021(); data.forEach((d) => { if (!db.metas.find((m) => m.foodItemId === d.foodItemId)) db.metas.push(d); }); },
  },
  user: { findUnique: async ({ where }) => db.users.find((u) => u.id === where.id) || null },
  diet: {
    updateMany: async () => ({}),
    findMany: async () => JSON.parse(JSON.stringify(db.diets)),
    findFirst: async () => db.diets[0] || null,
    create: async ({ data }) => {
      const meals = (data.meals?.create || []).map((m, i) => ({ id: 'meal' + i, ...m, items: (m.items?.create || []).map((it) => ({ ...it })) }));
      db.dietSeq = (db.dietSeq || 0) + 1; const d = { id: 'diet' + db.dietSeq, userId: data.userId, isActive: true, isStrategy: false, meals, createdAt: new Date() };
      db.diets = [d]; return d;
    },
    findFirstStrategy: null,
    count: async () => 0,
  },
  dietDayScheme: {
    findFirst: async () => { if (db.missingSchemeTable) throw P2021(); return Object.keys(db.schemes).length ? { dietId: Object.keys(db.schemes)[0] } : null; },
    findUnique: async ({ where }) => { if (db.missingSchemeTable) throw P2021(); return db.schemes[where.dietId] ? { dietId: where.dietId, scheme: JSON.parse(JSON.stringify(db.schemes[where.dietId])) } : null; },
    findMany: async ({ where }) => { if (db.missingSchemeTable) throw P2021(); return where.dietId.in.filter((id) => db.schemes[id]).map((id) => ({ dietId: id, scheme: JSON.parse(JSON.stringify(db.schemes[id])) })); },
    upsert: async ({ where, create, update }) => { if (db.missingSchemeTable) throw P2021(); db.schemes[where.dietId] = JSON.parse(JSON.stringify(db.schemes[where.dietId] ? update.scheme : create.scheme)); },
    deleteMany: async ({ where }) => { if (db.missingSchemeTable) throw P2021(); delete db.schemes[where.dietId]; return { count: 1 }; },
  },
  meal: { deleteMany: async () => ({}) },
  $transaction: async (fn) => fn(prisma),
};
module.exports = prisma; module.exports.default = prisma;
