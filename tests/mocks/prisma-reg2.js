const created = [];
const prisma = { user: {
  findFirst: async () => ({ id: 'master', accountStatus: 'ACTIVE' }),
  findUnique: async ({ where }) => (where.email === 'paulo_adriano2014@live.com' ? { id: 'master', pushToken: null, webPushSubscription: null } : null),
  create: async ({ data }) => { created.push(data); return { id: 'new1', ...data, password: 'x' }; },
} };
module.exports = prisma; module.exports.default = prisma; module.exports.__created = created;
