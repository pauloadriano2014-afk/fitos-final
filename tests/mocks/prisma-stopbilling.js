// Banco em memória do teste de "parar de cobrar": user, subscription e payment (com os filtros simples que a rota usa).
const T = { user: [], subscription: [], payment: [], workout: [] };
const match = (r, where = {}) => Object.entries(where).every(([k, v]) => {
  if (v && typeof v === 'object' && !(v instanceof Date)) { if ('in' in v) return v.in.includes(r[k]); }
  return r[k] === v;
});
const pick = (r, select) => { if (!select) return { ...r }; const o = {}; Object.keys(select).forEach((k) => { if (select[k]) o[k] = r[k]; }); return o; };
const table = (name) => ({
  findUnique: async ({ where, select }) => { const r = T[name].find((x) => match(x, where)); return r ? pick(r, select) : null; },
  findMany: async ({ where } = {}) => T[name].filter((x) => match(x, where)).map((r) => ({ ...r })),
  update: async ({ where, data }) => { const r = T[name].find((x) => match(x, where)); if (!r) throw new Error('not found'); Object.assign(r, data); return { ...r }; },
  updateMany: async ({ where, data }) => { let n = 0; T[name].forEach((r) => { if (match(r, where)) { Object.assign(r, data); n++; } }); return { count: n }; },
  count: async ({ where } = {}) => T[name].filter((x) => match(x, where)).length,
  deleteMany: async ({ where }) => { const keep = T[name].filter((r) => !match(r, where)); const n = T[name].length - keep.length; T[name].length = 0; T[name].push(...keep); return { count: n }; },
});
const prisma = { user: table('user'), subscription: table('subscription'), payment: table('payment'), workout: table('workout'), __db: T, __tx: { calls: 0 }, $transaction: async (ops) => { prisma.__tx.calls++; return Promise.all(ops); } };
module.exports = prisma; module.exports.default = prisma;
