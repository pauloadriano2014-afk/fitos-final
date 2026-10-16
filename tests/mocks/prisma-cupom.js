// Banco em memória do teste do CUPOM DE DESCONTO: o do checkout próprio (prisma-checkout) + tabela cupomDesconto + count/OR/AND em produtoVenda.
const { randomUUID } = require('crypto');
const base = require('./prisma-checkout.js');
const T = base.__db;
T.cupomDesconto = T.cupomDesconto || [];

function cmp(val, v) {
  if (v === null) return val === null || val === undefined;
  if (v instanceof Date) return val instanceof Date && val.getTime() === v.getTime();
  if (typeof v === 'object' && !Array.isArray(v)) {
    return Object.entries(v).every(([op, arg]) => {
      if (op === 'equals') return v.mode === 'insensitive' ? String(val ?? '').toLowerCase() === String(arg).toLowerCase() : val === arg;
      if (op === 'mode') return true;
      if (op === 'in') return arg.includes(val);
      if (op === 'gt') return val > arg;
      if (op === 'gte') return val >= arg;
      if (op === 'lt') return val < arg;
      if (op === 'lte') return val <= arg;
      if (op === 'not') return val !== arg;
      throw new Error('operador não suportado no mock: ' + op);
    });
  }
  return val === v;
}
function match(row, where) {
  if (!where) return true;
  return Object.entries(where).every(([k, v]) => {
    if (k === 'OR') return v.some((w) => match(row, w));
    if (k === 'AND') return (Array.isArray(v) ? v : [v]).every((w) => match(row, w));
    return cmp(row[k], v);
  });
}
const pick = (r, select) => { if (!select) return { ...r }; const o = {}; Object.keys(select).forEach((k) => { if (select[k]) o[k] = r[k]; }); return o; };
const sortBy = (rows, o) => { if (!o) return rows; const [[k, d]] = Object.entries(Array.isArray(o) ? o[0] : o); return [...rows].sort((a, b) => (a[k] > b[k] ? 1 : a[k] < b[k] ? -1 : 0) * (d === 'desc' ? -1 : 1)); };

const cupomDesconto = {
  findUnique: async ({ where, select }) => { const r = T.cupomDesconto.find((x) => Object.entries(where).every(([k, v]) => x[k] === v)); return r ? pick(r, select) : null; },
  findMany: async ({ where, orderBy, select } = {}) => sortBy(T.cupomDesconto.filter((x) => match(x, where)), orderBy).map((r) => pick(r, select)),
  create: async ({ data }) => {
    if (T.cupomDesconto.some((x) => x.codigo === data.codigo)) throw Object.assign(new Error('Unique constraint failed on the fields: (`codigo`)'), { code: 'P2002' });
    const row = { id: randomUUID(), descricao: null, produtoIds: null, validoDe: null, validoAte: null, usoMaximo: null, umaVezPorCliente: true, ativo: true, createdAt: new Date(), ...data };
    T.cupomDesconto.push(row); return { ...row };
  },
  update: async ({ where, data }) => { const r = T.cupomDesconto.find((x) => x.id === where.id); if (!r) throw Object.assign(new Error('not found'), { code: 'P2025' }); Object.assign(r, data); return { ...r }; },
  delete: async ({ where }) => {
    const i = T.cupomDesconto.findIndex((x) => x.id === where.id); if (i < 0) throw Object.assign(new Error('not found'), { code: 'P2025' });
    const [r] = T.cupomDesconto.splice(i, 1);
    T.produtoVenda.forEach((v) => { if (v.cupomId === r.id) v.cupomId = null; });   // onDelete: SetNull
    return { ...r };
  },
};
const venda = base.produtoVenda;
const produtoVenda = {
  ...venda,
  count: async ({ where } = {}) => T.produtoVenda.filter((v) => match(v, where)).length,
  findMany: async ({ where, select, orderBy } = {}) => sortBy(T.produtoVenda.filter((v) => match(v, where)), orderBy).map((r) => pick(r, select)),
};
const prisma = { ...base, cupomDesconto, produtoVenda };
module.exports = prisma; module.exports.default = prisma;
