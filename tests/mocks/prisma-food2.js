const rows = require('/tmp/claude-0/-home-user/86513411-0da9-5f81-8d5c-a48e2b800aa5/scratchpad/vt/food_catalog.json');
const prisma = {
  user: { findUnique: async ({ where }) => (globalThis.__USERS || {})[where.id] ?? null },
  __last: null, __portions: [], __portionsBroken: false, __portionArgs: null,
  food: { findMany: async (args) => { prisma.__last = args; return rows; } },
  foodPortion: { findMany: async (args) => {
    prisma.__portionArgs = args;
    if (prisma.__portionsBroken) { const e = new Error('The table `public.FoodPortion` does not exist'); e.code = 'P2021'; throw e; }
    const ids = new Set(args.where.foodId.in); const scopes = new Set(args.where.scope.in);
    return prisma.__portions.filter((p) => ids.has(p.foodId) && scopes.has(p.scope)).map((p) => ({ ...p }));
  } },
};
module.exports = prisma; module.exports.default = prisma;
