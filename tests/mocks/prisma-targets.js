const P2021 = () => Object.assign(new Error('The table `public.StudentDietTargets` does not exist in the current database.'), { code: 'P2021' });
const db = { users: {}, rows: {}, missing: false };
const prisma = {
  __db: db,
  user: { findUnique: async ({ where }) => db.users[where.id] || null },
  studentDietTargets: {
    findUnique: async ({ where }) => { if (db.missing) throw P2021(); return db.rows[where.userId] ? JSON.parse(JSON.stringify(db.rows[where.userId])) : null; },
    upsert: async ({ where, create, update }) => { if (db.missing) throw P2021(); const now = new Date(); const cur = db.rows[where.userId]; db.rows[where.userId] = cur ? { ...cur, ...update, updatedAt: now } : { ...create, createdAt: now, updatedAt: now }; return JSON.parse(JSON.stringify(db.rows[where.userId])); },
    deleteMany: async ({ where }) => { if (db.missing) throw P2021(); delete db.rows[where.userId]; return { count: 1 }; },
  },
};
module.exports = prisma; module.exports.default = prisma;
