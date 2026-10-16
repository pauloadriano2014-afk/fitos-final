// Banco em memória do teste do checkout próprio: o mesmo da área de membros + relações (include) e delete que as rotas de produto usam.
const base = require('./prisma-membros3.js');
const T = base.__db;
const pick = (r, select) => { if (!select) return { ...r }; const o = {}; Object.keys(select).forEach((k) => { if (select[k]) o[k] = r[k]; }); return o; };
const withInc = (tbl) => ({
  ...tbl,
  findUnique: async (args) => {
    const r = await tbl.findUnique({ where: args.where });
    if (!r || !args.include) return r;
    const out = { ...r };
    if (args.include.produto) { const p = T.produtoDigital.find((x) => x.id === r.produtoId); out.produto = p ? pick(p, args.include.produto.select) : null; }
    if (args.include.venda) { const v = T.produtoVenda.find((x) => x.id === r.vendaId); out.venda = v ? pick(v, args.include.venda.select) : null; }
    return out;
  },
});
const venda = base.produtoVenda;
const prisma = {
  ...base,
  produtoTreinoAcesso: withInc(base.produtoTreinoAcesso),
  produtoCursoAcesso: withInc(base.produtoCursoAcesso),
  produtoVenda: {
    ...venda,
    delete: async ({ where }) => { const i = T.produtoVenda.findIndex((x) => Object.entries(where).every(([k, v]) => x[k] === v)); if (i < 0) throw Object.assign(new Error('not found'), { code: 'P2025' }); return T.produtoVenda.splice(i, 1)[0]; },
    findUnique: async (args) => {
      const v = await venda.findUnique(args);
      if (!v) return v;
      if (args.include?.treinoAcessos) v.treinoAcessos = T.produtoTreinoAcesso.filter((a) => a.vendaId === v.id).map((a) => pick(a, args.include.treinoAcessos.select));
      if (args.include?.cursoAcessos) v.cursoAcessos = T.produtoCursoAcesso.filter((a) => a.vendaId === v.id).map((a) => pick(a, args.include.cursoAcessos.select));
      return v;
    },
  },
  produtoDigital: {
    ...base.produtoDigital,
    findUnique: async ({ where, select }) => { const r = T.produtoDigital.find((x) => Object.entries(where).every(([k, v]) => x[k] === v)); return r ? pick(r, select) : null; },
    findMany: async ({ where, select } = {}) => T.produtoDigital.filter((x) => !where || Object.entries(where).every(([k, v]) => (v && typeof v === 'object' && 'in' in v) ? v.in.includes(x[k]) : x[k] === v)).map((r) => pick(r, select)),
  },
};
module.exports = prisma; module.exports.default = prisma;
