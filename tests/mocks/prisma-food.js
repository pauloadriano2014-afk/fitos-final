const rows = require('/tmp/claude-0/-home-user/86513411-0da9-5f81-8d5c-a48e2b800aa5/scratchpad/vt/food_catalog.json');
const prisma = { __last: null, food: { findMany: async (args) => { prisma.__last = args; return rows; } } };
module.exports = prisma; module.exports.default = prisma;
