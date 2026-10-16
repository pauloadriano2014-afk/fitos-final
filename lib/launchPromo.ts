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
//
// 🤝 COACH PARCEIRO (16 out 2026): teste grátis de 30 dias + VAGA EXTRA. O parceiro recebe o mesmo preço promocional, mas SEM ocupar vaga de fundador e mesmo que as vagas
// de fundador já tenham acabado; a oferta fica aberta até o fim do teste + 7 dias (partnerOfferUntil). Quando o pagamento é confirmado ele vira Fundador (ganha os recursos
// de Fundador) marcado como launchPromoExtra = true, e esse coach NÃO entra na conta de vagas usadas.
//
// Recebe o `db` (Prisma) por parâmetro para testar sem banco.
import { LAUNCH_PROMO_MAX, LAUNCH_PROMO_PERCENT, LAUNCH_PROMO_RESERVATION_DAYS } from '@/config/coachBillingPlans';

const DAY_MS = 24 * 60 * 60 * 1000;
export const PARTNER_TRIAL_DAYS = 30;          // teste grátis do parceiro (o normal é de 7 dias, ver coach-requests)
export const PARTNER_OFFER_EXTRA_DAYS = 7;     // a oferta promocional continua aberta por mais 7 dias depois do fim do teste

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
        db.user.count({ where: { isLaunchPromo: true, launchPromoExtra: false } }),   // vaga EXTRA de parceiro não entra na conta dos fundadores
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

/** Datas do teste de parceiro a partir de `now`: fim do teste (30 dias) e fim da oferta promocional (+7 dias). */
export function partnerTrialDates(now: Date = new Date()): { trialEndsAt: Date; partnerOfferUntil: Date } {
    const trialEndsAt = new Date(now.getTime() + PARTNER_TRIAL_DAYS * DAY_MS);
    return { trialEndsAt, partnerOfferUntil: new Date(trialEndsAt.getTime() + PARTNER_OFFER_EXTRA_DAYS * DAY_MS) };
}

/** A oferta de parceiro (vaga extra) ainda está aberta para este coach? (marcado como parceiro e dentro do prazo). Quem pode ou não receber a promoção continua em isEligibleForPromo. */
export function isPartnerOfferOpen(coach: { partnerCoach?: boolean | null; partnerOfferUntil?: Date | string | null } | null | undefined, now: Date = new Date()): boolean {
    if (!coach || !coach.partnerCoach || !coach.partnerOfferUntil) return false;
    const until = new Date(coach.partnerOfferUntil).getTime();
    return Number.isFinite(until) && until >= now.getTime();
}

/**
 * Marca (ou desmarca) um coach como PARCEIRO. Ligar: só coach ativo, que ainda não pagou e que não é do time master -- o teste vai para 30 dias a partir de agora e a oferta
 * fica aberta até o fim do teste + 7 dias (reabre o acesso de quem estava com o teste de 7 dias vencido). Desligar: só tira a marca e o prazo da oferta (não mexe no teste que sobrou).
 */
export async function setPartnerCoach(db: any, coachId: string, on: boolean, isMaster: (id?: string | null) => boolean, now: Date = new Date()): Promise<{ ok: true; trialEndsAt?: Date; partnerOfferUntil?: Date } | { ok: false; error: string }> {
    if (!coachId) return { ok: false, error: 'Coach não informado.' };
    const coach = await db.user.findUnique({ where: { id: coachId }, select: { id: true, role: true, accountStatus: true, coachFirstPaidAt: true, coachBillingStatus: true, isLaunchPromo: true } });
    if (!coach || coach.role !== 'COACH') return { ok: false, error: 'Coach não encontrado.' };
    if (!on) {
        await db.user.update({ where: { id: coachId }, data: { partnerCoach: false, partnerOfferUntil: null } });
        return { ok: true };
    }
    if (isMaster(coachId)) return { ok: false, error: 'Coach do time master não usa teste nem promoção.' };
    if (coach.accountStatus !== 'ACTIVE') return { ok: false, error: 'Aprove o coach primeiro (a aprovação já pode ser como parceiro).' };
    if (coach.coachFirstPaidAt || coach.isLaunchPromo || ['ACTIVE', 'OVERDUE', 'CANCELLED'].includes(String(coach.coachBillingStatus || ''))) return { ok: false, error: 'Esse coach já tem plano pago ou já teve; a oferta de parceiro é só para quem ainda não pagou.' };
    const d = partnerTrialDates(now);
    await db.user.update({ where: { id: coachId }, data: { partnerCoach: true, partnerOfferUntil: d.partnerOfferUntil, coachBillingStatus: 'TRIAL', trialEndsAt: d.trialEndsAt } });
    return { ok: true, ...d };
}

/**
 * Ao gerar a cobrança promocional: 'EXTRA' (parceiro com a oferta aberta: não ocupa vaga de fundador e nem precisa de vaga livre), 'FUNDADOR' (reservou uma vaga de fundador) ou false (sem vaga).
 * Se o parceiro já tinha uma reserva de fundador ainda aberta, ela é solta: ele vai pela vaga extra e a vaga volta para os outros.
 */
export async function reservePromoOrExtra(db: any, coach: { id: string; partnerCoach?: boolean | null; partnerOfferUntil?: Date | string | null }, now: Date = new Date()): Promise<'EXTRA' | 'FUNDADOR' | false> {
    if (isPartnerOfferOpen(coach, now)) { await cancelReservation(db, coach.id); return 'EXTRA'; }
    return (await reservePromo(db, coach.id, now)) ? 'FUNDADOR' : false;
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

/**
 * Pagamento promocional confirmado: a vaga vira USADA (isLaunchPromo). Parceiro que NÃO tinha reservado vaga de fundador confirma como vaga EXTRA (launchPromoExtra = true: não conta nas
 * vagas, mas é Fundador para os recursos). Idempotente: quem já estava confirmado mantém como estava (webhook repetido não troca extra por fundador nem o contrário).
 */
export async function confirmPromo(db: any, coachId: string): Promise<void> {
    const me = await db.user.findUnique({ where: { id: coachId }, select: { isLaunchPromo: true, launchPromoExtra: true, launchPromoStatus: true, partnerCoach: true } });
    const extra = me?.isLaunchPromo ? !!me?.launchPromoExtra : (!!me?.partnerCoach && me?.launchPromoStatus !== 'RESERVED');
    await db.user.update({ where: { id: coachId }, data: { launchPromoStatus: extra ? 'EXTRA' : 'CONFIRMED', launchPromoReservedUntil: null, isLaunchPromo: true, launchPromoExtra: extra } });
}

/** A cobrança promocional falhou antes de existir (Asaas recusou etc.): solta a reserva, mas nunca mexe em vaga já CONFIRMADA. */
export async function cancelReservation(db: any, coachId: string): Promise<void> {
    await db.user.updateMany({ where: { id: coachId, launchPromoStatus: 'RESERVED', isLaunchPromo: false }, data: { launchPromoStatus: null, launchPromoReservedUntil: null } });
}

/** Cobrança promocional apagada/estornada: devolve a vaga. */
export async function releasePromo(db: any, coachId: string): Promise<void> {
    await db.user.update({ where: { id: coachId }, data: { launchPromoStatus: null, launchPromoReservedUntil: null, isLaunchPromo: false, launchPromoExtra: false } });
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
