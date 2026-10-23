// Banco em memória do teste da FOTO DE PERFIL (/api/user/update): só a tabela user, com findUnique e update.
const users = [];
const prisma = {
  user: {
    findUnique: async ({ where }) => { const r = users.find((u) => u.id === where.id); return r ? { ...r } : null; },
    update: async ({ where, data }) => { const r = users.find((u) => u.id === where.id); if (!r) throw Object.assign(new Error('not found'), { code: 'P2025' }); Object.assign(r, data); return { ...r }; },
  },
  __users: users,
  __reset: () => { users.length = 0; },
};
module.exports = prisma; module.exports.default = prisma;
