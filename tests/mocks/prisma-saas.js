// banco em memória da página de vendas pública: usuário, configuração da página e planos (respeita where/orderBy/select como o Prisma)
const state = { users: new Map(), configs: new Map(), plans: [] };
const pick = (row, select) => { if (!select) return { ...row }; const o = {}; Object.keys(select).forEach((k) => { if (select[k]) o[k] = row[k]; }); return o; };
const api = {
  user: { async findUnique({ where, select }) { const u = state.users.get(where.id); return u ? pick(u, select) : null; } },
  salesPageConfig: { async findUnique({ where, select }) { const c = state.configs.get(where.coachId); return c ? pick(c, select) : null; } },
  coachPlan: { async findMany({ where, orderBy, select }) {
    let rows = state.plans.filter((p) => p.coachId === where.coachId && (where.isActive === undefined || p.isActive === where.isActive));
    if (orderBy && orderBy.value === 'asc') rows = rows.slice().sort((a, b) => a.value - b.value);
    return rows.map((r) => pick(r, select));
  } },
};
module.exports = api; module.exports.default = api;
module.exports.__state = state;
module.exports.__reset = () => { state.users.clear(); state.configs.clear(); state.plans.length = 0; };
