// lib/coachMonthlyCaps.ts
// 🧮 (20 out 2026) Limite MENSAL dos usos de IA "leves" do coach parceiro (os de treino e dieta por IA têm o limite próprio em lib/coachAi.ts):
//   voz        = cada chamada de IA do ditado (transcrição do áudio + interpretação de nota, treino ou dieta) -> 600 por mês (~300 ditados)
//   perguntas  = perguntas ao assistente que usaram IA (as perguntas rápidas por regra não gastam e não contam) -> 300 por mês
//   checkin    = avaliações de check-in por IA (lê as fotos) -> 100 por mês
// Conta do AiLog (sem tabela nova), mês de Brasília (zera dia 1). Time master (Paulo e Adri) nunca tem limite. Muda sem mexer no código com
// COACH_LIMIT_VOZ, COACH_LIMIT_PERGUNTAS e COACH_LIMIT_CHECKIN no Render. Se o banco falhar na contagem, deixa passar (nunca trava o coach por erro nosso).
import { NextResponse } from 'next/server';
import { isMasterId } from './auth';
import { monthStartBR, nextMonthStartBR } from './coachAi';
import { USE_KINDS } from './aiCost';

export type CapKind = 'voz' | 'perguntas' | 'checkin';
export const CAP_KINDS: CapKind[] = ['voz', 'perguntas', 'checkin'];
export const CAP_DEFAULTS: Record<CapKind, number> = { voz: 600, perguntas: 300, checkin: 100 };
export const CAP_ENV: Record<CapKind, string> = { voz: 'COACH_LIMIT_VOZ', perguntas: 'COACH_LIMIT_PERGUNTAS', checkin: 'COACH_LIMIT_CHECKIN' };
export const CAP_LABEL: Record<CapKind, string> = { voz: 'ditados por voz', perguntas: 'perguntas ao assistente', checkin: 'avaliações de check-in' };
/** Linhas do AiLog que contam para cada limite (o começo do texto da pergunta gravada). */
export const CAP_PREFIXES: Record<CapKind, string[]> = {
  voz: [USE_KINDS.transcricao, USE_KINDS.notaVoz, USE_KINDS.treinoVoz, USE_KINDS.dietaVoz],
  perguntas: [USE_KINDS.perguntaCoach, USE_KINDS.eliteAssistente],
  checkin: ['avaliar-checkin:'],
};

export function capLimit(kind: CapKind, env: Record<string, string | undefined> = process.env): number {
  const n = Number(env[CAP_ENV[kind]]);
  return Number.isFinite(n) && n >= 0 && String(env[CAP_ENV[kind]] ?? '').trim() !== '' ? Math.floor(n) : CAP_DEFAULTS[kind];
}

export async function capUsed(db: any, userId: string, kind: CapKind, now: Date = new Date()): Promise<number> {
  try {
    return await db.aiLog.count({
      where: {
        userId,
        createdAt: { gte: monthStartBR(now) },
        OR: CAP_PREFIXES[kind].map((p) => ({ question: { startsWith: p } })),
        NOT: [{ question: { endsWith: ':falhou' } }, { question: { endsWith: ':OWN_KEY' } }],
      },
    });
  } catch { return -1; }   // -1 = não deu para contar
}

const dm = (d: Date) => { const b = new Date(d.getTime() - 3 * 3600 * 1000); return `${String(b.getUTCDate()).padStart(2, '0')}/${String(b.getUTCMonth() + 1).padStart(2, '0')}`; };

export interface CapState { used: number; limit: number; reached: boolean; resetsOn: string }
/** Estado do limite deste usuário. Master e quem não é coach/admin (aluno) nunca "chegou". */
export async function capState(db: any, user: { id: string; role?: string } | null | undefined, kind: CapKind, now: Date = new Date()): Promise<CapState> {
  const limit = capLimit(kind);
  const resetsOn = dm(nextMonthStartBR(now));
  if (!user || isMasterId(user.id) || String(user.role || '').toUpperCase() === 'USER') return { used: 0, limit, reached: false, resetsOn };
  const used = await capUsed(db, user.id, kind, now);
  return { used: Math.max(0, used), limit, reached: used >= 0 && used >= limit, resetsOn };
}

/** 429 pronto quando o limite do mês acabou; null quando pode seguir. */
export async function capResponse(db: any, user: { id: string; role?: string } | null | undefined, kind: CapKind, now: Date = new Date()): Promise<NextResponse | null> {
  const s = await capState(db, user, kind, now);
  if (!s.reached) return null;
  return NextResponse.json({ error: `Você usou todos os ${s.limit} ${CAP_LABEL[kind]} deste mês. Volta a liberar no dia ${s.resetsOn}. Precisa de mais? Fale com a equipe do ELITE FIT.`, code: 'LIMITE_MENSAL', kind, used: s.used, limit: s.limit, resetsOn: s.resetsOn }, { status: 429 });
}
