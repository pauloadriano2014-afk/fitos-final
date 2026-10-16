// Banco em memória do teste da INDICAÇÃO: o do cupom (prisma-cupom) + usuários e as consultas findFirst/updateMany/unicidade que a indicação usa.
const { randomUUID } = require('crypto');
const base = require('./prisma-cupom.js');
const T = base.__db;
T.user = T.user || [];
function cmp(val, v) {
  if (v === null) return val === null || val === undefined;
  if (v instanceof Date) return val instanceof Date && val.getTime() === v.getTime();
  if (typeof v === 'object' && !Array.isArray(v)) return Object.entries(v).every(([op, arg]) => {
    if (op === 'in') return arg.includes(val); if (op === 'gte') return val >= arg; if (op === 'lte') return val <= arg; if (op === 'gt') return val > arg; if (op === 'lt') return val < arg;
    if (op === 'equals') return val === arg; if (op === 'mode') return true; throw new Error('operador não suportado no mock: ' + op);
  });
  return val === v;
}
function match(row, where) { if (!where) return true; return Object.entries(where).every(([k, v]) => (k === 'OR' ? v.some((w) => match(row, w)) : k === 'AND' ? (Array.isArray(v) ? v : [v]).every((w) => match(row, w)) : cmp(row[k], v))); }
const pick = (r, select) => { if (!select) return { ...r }; const o = {}; Object.keys(select).forEach((k) => { if (select[k]) o[k] = r[k]; }); return o; };
const sortBy = (rows, o) => { if (!o) return rows; const [[k, d]] = Object.entries(Array.isArray(o) ? o[0] : o); return [...rows].sort((a, b) => (a[k] > b[k] ? 1 : a[k] < b[k] ? -1 : 0) * (d === 'desc' ? -1 : 1)); };
const p2002 = (campo) => Object.assign(new Error('Unique constraint failed on the fields: (`' + campo + '`)'), { code: 'P2002' });

const cupomDesconto = {
  ...base.cupomDesconto,
  create: async (args) => {
    const d = args.data;
    for (const campo of ['codigoDeId', 'vendaOrigemId']) if (d[campo] != null && T.cupomDesconto.some((x) => x[campo] === d[campo])) throw p2002(campo);
    return base.cupomDesconto.create(args);
  },
  findFirst: async ({ where, orderBy } = {}) => { const r = sortBy(T.cupomDesconto.filter((x) => match(x, where)), orderBy)[0]; return r ? { ...r } : null; },
  updateMany: async ({ where, data }) => { const rows = T.cupomDesconto.filter((x) => match(x, where)); rows.forEach((r) => Object.assign(r, data)); return { count: rows.length }; },
};
const user = {
  findUnique: async ({ where, select }) => { const r = T.user.find((x) => Object.entries(where).every(([k, v]) => x[k] === v)); return r ? pick(r, select) : null; },
  findMany: async ({ where, select } = {}) => T.user.filter((x) => match(x, where)).map((r) => pick(r, select)),
};
const produtoDigital = {
  ...base.produtoDigital,
  findMany: async ({ where, select, orderBy } = {}) => sortBy(T.produtoDigital.filter((x) => match(x, where)), orderBy).map((r) => pick(r, select)),
};
const prisma = { ...base, cupomDesconto, user, produtoDigital };
module.exports = prisma; module.exports.default = prisma;
