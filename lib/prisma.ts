import { PrismaClient } from '@prisma/client';

const globalForPrisma = global as unknown as { prisma: PrismaClient };

// 🔒 (26 set 2026 — auditoria de segurança) Antes logava TODA query (com
// parâmetros) mesmo em produção — nos logs do Render isso pode vazar dado de
// aluno (e custa performance à toa). Em produção só loga erro/warning; o log
// verboso de query continua só em dev, que é onde ele ajuda a debugar.
export const prisma =
  globalForPrisma.prisma ||
  new PrismaClient({
    log: process.env.NODE_ENV === 'production' ? ['error', 'warn'] : ['query'],
  });

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;

export default prisma;