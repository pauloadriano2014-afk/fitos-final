// lib/launchPromo.ts
// 🔥 PROMOÇÃO DE LANÇAMENTO dos planos de coach (regras em config/coachBillingPlans.ts).
//
// Como as vagas são contadas (decisão do Paulo, 1 out 2026: "só quando o pagamento é confirmado"):
//   - USADA   = coach com isLaunchPromo = true (pagamento promocional CONFIRMADO; inclui quem entrou na promoção antiga).
//   - RESERVADA = coach que gerou a cobrança promocional e ainda não pagou: segura a vaga por LAUNCH_PROMO_RESERVATION_DAYS dias.
//   - Vaga livre = limite - usadas - reservadas ainda válidas.
// Sem contador que "desliza": o número vem sempre da contagem de coaches, então cobrança não paga que expira devolve a vaga sozinha.
// Pagamento que chega depois de a reserva vencer continua valendo o preço que o coach recebeu (o webhook confirma mesmo assim): o limite vale
// para NOVAS reservas, e a diferença é de no máximo algumas vagas.
//
// Recebe o `db` (Prisma) por parâmetro para testar sem banco.
import { LAUNCH_PROMO_MAX, LAUNCH_PROMO_PERCENT, LAUNCH_PROMO_RESERVATION_DAYS } from '@/config/coachBillingPlans';

const DAY_MS = 24 * 60 * 60 * 1000;

export type PromoState = { max: number; used: number; reserved: number; available: number; percent: number };

async function loadMax(db: any): Promise<number> {
    const cfg = await db.platformConfig.upsert({
        where: { id: 'singleton' }, update: {},
        create: { id: 'singleton', launchPromoUsed: 0, launchPromoMax: LAUNCH_PROMO_MAX },
    });
    const n = Number(cfg?.launchPromoMax);
    return Number.isFinite(n) && n >= 0 ? n : LAUNCH_PROMO_MAX;
}

export async function getPromoState(db: any, now: Date = new Date()): Promise<PromoState> {
    const max = await loadMax(db);
    const [used, reserved] = await Promise.all([
        db.user.count({ where: { isLaunchPromo: true } }),
        db.user.count({ where: { launchPromoStatus: 'RESERVED', isLaunchPromo: false, launchPromoReservedUntil: { gt: now } } }),
    ]);
    return { max, used, reserved, available: Math.max(0, max - used - reserved), percent: LAUNCH_PROMO_PERCENT };
}

/**
 * O coach pode receber o preço promocional? Só quem AINDA NÃO PAGOU nenhum período e não é do time master. Coach que já estava ativo, em atraso
 * ou cancelado antes dessa promoção (sem registro de 1º pagamento) NÃO entra: não é "novo".
 */
export function isEligibleForPromo(coach: { id?: string; isLaunchPromo?: boolean | null; coachFirstPaidAt?: Date | string | null; coachBillingStatus?: string | null }, isMaster: (id?: string | null) => boolean): boolean {
    if (!coach) return false;
    if (isMaster(coach.id)) return false;
    if (coach.isLaunchPromo) return false;
    if (coach.coachFirstPaidAt) return false;
    if (['ACTIVE', 'OVERDUE', 'CANCELLED'].includes(String(coach.coachBillingStatus || ''))) return false;
    return true;
}

/**
 * Tenta reservar uma vaga para o coach (ao gerar a cobrança promocional). true = pode cobrar o preço promocional.
 * Quem já tem reserva válida mantém (e renova o prazo). A transação trava a linha de configuração, então dois coaches pedindo a última vaga
 * ao mesmo tempo não passam os dois.
 */
export async function reservePromo(db: any, coachId: string, now: Date = new Date()): Promise<boolean> {
    await loadMax(db);   // garante a linha de configuração
    return db.$transaction(async (tx: any) => {
        await tx.platformConfig.update({ where: { id: 'singleton' }, data: { updatedAt: now } });   // trava a linha até o fim da transação
        const me = await tx.user.findUnique({ where: { id: coachId }, select: { launchPromoStatus: true, launchPromoReservedUntil: true, isLaunchPromo: true } });
        const reservedUntil = new Date(now.getTime() + LAUNCH_PROMO_RESERVATION_DAYS * DAY_MS);
        const hasOwn = me?.launchPromoStatus === 'RESERVED' && me?.launchPromoReservedUntil && new Date(me.launchPromoReservedUntil) > now;
        if (hasOwn) {
            await tx.user.update({ where: { id: coachId }, data: { launchPromoReservedUntil: reservedUntil } });
            return true;
        }
        const state = await getPromoState(tx, now);
        if (state.available <= 0) return false;
        await tx.user.update({ where: { id: coachId }, data: { launchPromoStatus: 'RESERVED', launchPromoReservedUntil: reservedUntil } });
        return true;
    });
}

/** Pagamento promocional confirmado: a vaga vira USADA (isLaunchPromo). Idempotente. */
export async function confirmPromo(db: any, coachId: string): Promise<void> {
    await db.user.update({ where: { id: coachId }, data: { launchPromoStatus: 'CONFIRMED', launchPromoReservedUntil: null, isLaunchPromo: true } });
}

/** A cobrança promocional falhou antes de existir (Asaas recusou etc.): solta a reserva, mas nunca mexe em vaga já CONFIRMADA. */
export async function cancelReservation(db: any, coachId: string): Promise<void> {
    await db.user.updateMany({ where: { id: coachId, launchPromoStatus: 'RESERVED', isLaunchPromo: false }, data: { launchPromoStatus: null, launchPromoReservedUntil: null } });
}

/** Cobrança promocional apagada/estornada: devolve a vaga. */
export async function releasePromo(db: any, coachId: string): Promise<void> {
    await db.user.update({ where: { id: coachId }, data: { launchPromoStatus: null, launchPromoReservedUntil: null, isLaunchPromo: false } });
}

/** Master muda o limite de vagas (inteiro de 0 a 1000). Devolve o estado novo. */
export async function setPromoMax(db: any, max: number, now: Date = new Date()): Promise<PromoState> {
    // só inteiro de verdade: null/vazio/booleano/decimal NÃO valem (Number(null) é 0 e zeraria as vagas sem ninguém querer)
    const n = typeof max === 'number' || (typeof max === 'string' && max.trim() !== '') ? Number(max) : NaN;
    if (!Number.isInteger(n) || n < 0 || n > 1000) throw new Error('Limite inválido: use um número inteiro de 0 a 1000.');
    await db.platformConfig.upsert({
        where: { id: 'singleton' }, update: { launchPromoMax: n },
        create: { id: 'singleton', launchPromoUsed: 0, launchPromoMax: n },
    });
    return getPromoState(db, now);
}
