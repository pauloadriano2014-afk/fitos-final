// lib/finishWorkout.ts
// 🔒 (1 out 2026) FINALIZAR TREINO SEM DUPLICAR. Problema: com internet fraca "SALVAR E FINALIZAR" demora, o aluno toca de novo, e cada toque gravava
// UM treino novo (XP em dobro, um aviso para o coach por toque, contagem da semana inflada, feedback prejudicado).
//
// Três camadas (esta é a do SERVIDOR; o app também trava o botão e reenvia a mesma chave):
//   1. O app manda `clientKey` = chave fixa da sessão de treino. Mesma chave = mesmo treino: a 2ª chamada devolve o resultado da 1ª, sem gravar,
//      sem dar XP e sem avisar o coach de novo.
//   2. Índice único (userId, clientKey) no banco: se dois pedidos chegarem juntos, só um grava; o outro recebe o resultado do primeiro.
//   3. App ANTIGO (sem chave): o servidor cria uma chave automática por "ficha + dia + janela de 20 min" e também procura um treino igual feito há
//      pouco. Quem treina o mesmo dia da mesma ficha duas vezes em menos de 20 minutos não existe; quem toca duas vezes seguidas, sim.

export const AUTO_KEY_WINDOW_MS = 20 * 60 * 1000;

/** Aceita só chaves "normais" (letras, números e : . _ -), até 120 caracteres. Qualquer outra coisa vira "sem chave" (cai na regra do app antigo). */
export function sanitizeClientKey(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const k = raw.trim();
  if (!k || k.length > 120 || !/^[A-Za-z0-9:._\-]+$/.test(k)) return null;
  return k;
}

export const cleanDay = (day: unknown): string | null => (day ? String(day).trim().toUpperCase().slice(0, 40) || null : null);
export const cleanWorkoutId = (id: unknown): string | null => (id ? String(id).slice(0, 80) : null);

/** Chave automática para quem não mandou `clientKey`: mesma ficha + mesmo dia + mesma janela de 20 min = mesmo treino. */
export function autoClientKey(p: { workoutId?: string | null; day?: string | null; workoutName?: string | null; now: Date }): string {
  const ref = (p.workoutId || String(p.workoutName || 'TREINO').trim().toUpperCase().replace(/[^A-Z0-9]+/g, '_')).slice(0, 60);
  const bucket = Math.floor(p.now.getTime() / AUTO_KEY_WINDOW_MS);
  return `auto:${ref}:${p.day || '-'}:${bucket}`;
}

/**
 * Esse treino já foi gravado? Procura pela chave (e, sem chave do app, por um treino igual nos últimos 20 min, cobrindo a virada da janela).
 * Devolve o registro existente ({ id, xpEarned }) ou null.
 */
export async function findExistingFinish(
  db: any,
  p: { userId: string; clientKey: string; auto: boolean; workoutId: string | null; day: string | null; workoutName: string; now: Date },
): Promise<{ id: string; xpEarned: number } | null> {
  const byKey = await db.workoutHistory.findFirst({ where: { userId: p.userId, clientKey: p.clientKey }, select: { id: true, xpEarned: true } });
  if (byKey) return byKey;
  if (!p.auto) return null;
  const since = new Date(p.now.getTime() - AUTO_KEY_WINDOW_MS);
  const where: any = { userId: p.userId, date: { gte: since } };
  if (p.day) where.day = p.day;
  if (p.workoutId) where.workoutId = p.workoutId;
  if (!p.day && !p.workoutId) where.name = p.workoutName;
  return (await db.workoutHistory.findFirst({ where, select: { id: true, xpEarned: true }, orderBy: { date: 'desc' } })) || null;
}

/** Erro de "já existe" do Prisma (índice único): outro pedido idêntico gravou primeiro. */
export const isUniqueViolation = (e: any): boolean => !!e && e.code === 'P2002';
