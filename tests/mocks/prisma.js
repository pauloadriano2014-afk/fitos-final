const lib = require('/home/user/fitos-final/Exercise.json');
const prisma = { user: { findUnique: async ({ where }) => (globalThis.__USERS || {})[where.id] ?? null }, exercise: { findMany: async ({ where }) => {
  const ids = where.OR.map(o => o.coachId);
  return lib.filter(e => ids.includes(e.coachId ?? null));
} } };
module.exports = prisma; module.exports.default = prisma;
