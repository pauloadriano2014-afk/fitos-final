// Banco em memória para o teste da área de membros (lib/membros.ts + rotas /api/membros + e-mail de entrega do webhook).
const { randomUUID } = require('crypto');
const NAMES = ['membro', 'membroCodigo', 'membroSessao', 'produtoVenda', 'produtoDigital', 'produtoTreinoAcesso', 'produtoCursoAcesso', 'user'];
const T = (globalThis.__DB = Object.fromEntries(NAMES.map((n) => [n, []])));

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
const COMPOSITE = { vendaId_produtoId: ['vendaId', 'produtoId'] };
function match(row, where) {
  if (!where) return true;
  return Object.entries(where).every(([k, v]) => {
    if (COMPOSITE[k]) return COMPOSITE[k].every((f) => row[f] === v[f]);
    return cmp(row[k], v);
  });
}
const sortBy = (rows, o) => { if (!o) return rows; const [[k, d]] = Object.entries(Array.isArray(o) ? o[0] : o); return [...rows].sort((a, b) => (a[k] > b[k] ? 1 : a[k] < b[k] ? -1 : 0) * (d === 'desc' ? -1 : 1)); };
const stamp = (r) => { const now = new Date(); r.createdAt = r.createdAt || now; return r; };
const applyData = (row, data) => Object.entries(data).forEach(([k, v]) => { if (v && typeof v === 'object' && !(v instanceof Date) && 'increment' in v) row[k] = (row[k] || 0) + v.increment; else row[k] = v; });
const pick = (r, select) => { if (!select) return { ...r }; const o = {}; Object.keys(select).forEach((k) => { if (select[k]) o[k] = r[k]; }); return o; };

const UNIQUE = { membro: ['email'], membroCodigo: ['hash'], membroSessao: ['tokenHash'] };
function table(name, defaults = () => ({})) {
  const rows = T[name];
  const dup = (data) => (UNIQUE[name] || []).some((f) => rows.some((r) => r[f] === data[f]));
  return {
    findFirst: async ({ where, orderBy } = {}) => { const r = sortBy(rows.filter((x) => match(x, where)), orderBy)[0]; return r ? { ...r } : null; },
    findUnique: async ({ where }) => { const r = rows.find((x) => match(x, where)); return r ? { ...r } : null; },
    findMany: async ({ where, orderBy, select } = {}) => sortBy(rows.filter((x) => match(x, where)), orderBy).map((r) => pick(r, select)),
    create: async ({ data }) => {
      if (dup(data)) throw Object.assign(new Error('Unique constraint failed'), { code: 'P2002' });
      const row = stamp({ id: randomUUID(), ...defaults(), ...data }); rows.push(row); return { ...row };
    },
    update: async ({ where, data }) => { const r = rows.find((x) => match(x, where)); if (!r) throw Object.assign(new Error('not found'), { code: 'P2025' }); applyData(r, data); return { ...r }; },
    updateMany: async ({ where, data }) => { const hit = rows.filter((x) => match(x, where)); hit.forEach((r) => applyData(r, data)); return { count: hit.length }; },
    deleteMany: async ({ where } = {}) => { const hit = rows.filter((x) => match(x, where)); hit.forEach((r) => rows.splice(rows.indexOf(r), 1)); return { count: hit.length }; },
    upsert: async ({ where, create, update }) => {
      const r = rows.find((x) => match(x, where));
      if (r) { applyData(r, update); return { ...r }; }
      const row = stamp({ id: randomUUID(), ...defaults(), ...create }); rows.push(row); return { ...row };
    },
  };
}
const prisma = {
  __db: T,
  membro: table('membro', () => ({ origem: 'COMPRA', nome: null, telefone: null, ultimoAcesso: null })),
  membroCodigo: table('membroCodigo', () => ({ tentativas: 0, usadoEm: null })),
  membroSessao: table('membroSessao', () => ({ userAgent: null, ultimoUso: new Date() })),
  produtoVenda: (() => {
    const base = table('produtoVenda', () => ({ status: 'PENDENTE', itensBumpIds: null, paymentDate: null }));
    return { ...base, findUnique: async (args) => { const v = await base.findUnique(args); if (!v || !args.include?.produto) return v; const p = T.produtoDigital.find((x) => x.id === v.produtoId); return { ...v, produto: p ? pick(p, args.include.produto.select) : null }; } };
  })(),
  produtoDigital: table('produtoDigital', () => ({ descricao: null, capaUrl: null, linkEntrega: null, treinoPrograma: null, cursoPrograma: null })),
  produtoTreinoAcesso: table('produtoTreinoAcesso'),
  produtoCursoAcesso: table('produtoCursoAcesso'),
  user: table('user'),
};
module.exports = prisma; module.exports.default = prisma;
