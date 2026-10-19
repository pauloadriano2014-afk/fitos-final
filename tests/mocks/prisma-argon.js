// banco simulado mínimo para a rota evaluate-checkin (modo "fotos soltas", sem check-in salvo)
const DB = { users: [{ id: 'coach-p', name: 'Parceiro', aiCheckinPrompt: null, aiPromptMode: null }, { id: '3c82f763-66b4-48da-836e-16817d4f57c0', name: 'Paulo', aiCheckinPrompt: null, aiPromptMode: null }], aiLog: [] };
const prisma = {
  __db: DB,
  user: { findUnique: async ({ where }) => DB.users.find((u) => u.id === where.id) || null },
  checkIn: { findUnique: async () => null, update: async () => ({}), count: async () => 0 },
  aiLog: { create: async ({ data }) => { if (globalThis.__LOG_FAIL) throw new Error('log fora do ar'); DB.aiLog.push(data); return data; } },
};
module.exports = prisma; module.exports.default = prisma;
