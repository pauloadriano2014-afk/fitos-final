// src/config/coachBillingPlans.ts
// 💳 CATÁLOGO DOS PLANOS DO COACH (mensalidade da plataforma ELITE FIT)
//
// (1 out 2026) Planos em DEGRAUS por número de alunos ativos × CICLO (mensal/trimestral/semestral/anual) × TIPO (Personal/Nutri/Elite).
// Tudo é GERADO por esta tabela -- um lugar só. O app (seletor do coach, painel do master) e a página de vendas leem o catálogo pelo servidor
// (GET /api/coach-plans/catalog); nada de preço escrito à mão em outro arquivo (foi assim que a promoção chegou a dizer 3 valores diferentes).
//
// CHAVES: o degrau GROWTH mantém as chaves de sempre (PERSONAL_MONTHLY, NUTRI_QUARTERLY, ELITE_ANNUAL...) e os MESMOS preços de antes
// (confirmado por teste): coach que já tem plano continua exatamente igual. Os outros degraus ganham o degrau na chave: PERSONAL_START_MONTHLY,
// ELITE_SCALE_ANNUAL, NUTRI_UNLIMITED_QUARTERLY...
// As chaves *_LAUNCH (promoção antiga, 3 meses por valor fixo) ficam só para resolver quem já foi cobrado nelas (webhook); não são mais oferecidas.
//
// PROMOÇÃO DE LANÇAMENTO (regras escolhidas pelo Paulo em 1 out 2026):
//   - 30% de desconto sobre o TOTAL do ciclo, só nos ciclos trimestral, semestral e anual;
//   - para os primeiros LAUNCH_PROMO_MAX coaches (o limite fica em PlatformConfig.launchPromoMax e o master altera pelo app);
//   - só no 1º período contratado: a renovação volta ao preço normal do ciclo;
//   - a vaga só é consumida quando o pagamento é CONFIRMADO (ver lib/launchPromo.ts).
export type CoachType = 'PERSONAL' | 'NUTRICIONISTA' | 'ELITE';
export type Tier = 'START' | 'GROWTH' | 'SCALE' | 'UNLIMITED';
export type Cycle = 'MONTHLY' | 'QUARTERLY' | 'SEMIANNUAL' | 'ANNUAL';

export type BillingPlan = {
    label:        string;
    coachType:    CoachType;
    tier:         Tier;
    cycle:        Cycle | 'LAUNCH';
    months:       number;
    totalPrice:   number;
    monthlyPrice: number;   // valor por mês DENTRO do ciclo (já com o desconto do ciclo)
    baseMonthly:  number;   // mensalidade do degrau/tipo SEM desconto de ciclo (usada para saber se uma troca é "para baixo")
    maxStudents:  number | null;
    isPromo:      boolean;  // true só nos planos *_LAUNCH antigos
    promoMonths:  number;
    legacy?:      boolean;  // plano que não é mais oferecido
};

export const TIERS: Record<Tier, { label: string; maxStudents: number | null; monthly: Record<CoachType, number> }> = {
    START:     { label: 'Start',     maxStudents: 25,   monthly: { PERSONAL: 69,  NUTRICIONISTA: 69,  ELITE: 119 } },
    GROWTH:    { label: 'Growth',    maxStudents: 50,   monthly: { PERSONAL: 97,  NUTRICIONISTA: 97,  ELITE: 147 } },
    SCALE:     { label: 'Scale',     maxStudents: 150,  monthly: { PERSONAL: 147, NUTRICIONISTA: 147, ELITE: 197 } },
    UNLIMITED: { label: 'Ilimitado', maxStudents: null, monthly: { PERSONAL: 197, NUTRICIONISTA: 197, ELITE: 247 } },
};
export const TIER_ORDER: Tier[] = ['START', 'GROWTH', 'SCALE', 'UNLIMITED'];

// factor = o que o ciclo paga do mensal (mesma lógica do catálogo de sempre: -6% / -12% / -19%, arredondado ao real por mês)
export const CYCLES: Record<Cycle, { label: string; months: number; factor: number }> = {
    MONTHLY:    { label: 'Mensal',    months: 1,  factor: 1.00 },
    QUARTERLY:  { label: 'Trimestral', months: 3,  factor: 0.94 },
    SEMIANNUAL: { label: 'Semestral', months: 6,  factor: 0.88 },
    ANNUAL:     { label: 'Anual',     months: 12, factor: 0.81 },
};
export const CYCLE_ORDER: Cycle[] = ['MONTHLY', 'QUARTERLY', 'SEMIANNUAL', 'ANNUAL'];

export const COACH_TYPE_LABEL: Record<CoachType, string> = { PERSONAL: 'Personal', NUTRICIONISTA: 'Nutri', ELITE: 'Elite' };
const KEY_PREFIX: Record<CoachType, string> = { PERSONAL: 'PERSONAL', NUTRICIONISTA: 'NUTRI', ELITE: 'ELITE' };

const round = (n: number) => Math.round(n);
const cents = (n: number) => Math.round(n * 100) / 100;

/** Chave do plano. GROWTH mantém a forma antiga (sem o degrau na chave). */
export function planKey(type: CoachType, tier: Tier, cycle: Cycle): string {
    return tier === 'GROWTH' ? `${KEY_PREFIX[type]}_${cycle}` : `${KEY_PREFIX[type]}_${tier}_${cycle}`;
}

function buildPlans(): Record<string, BillingPlan> {
    const out: Record<string, BillingPlan> = {};
    (Object.keys(KEY_PREFIX) as CoachType[]).forEach((type) => {
        TIER_ORDER.forEach((tier) => {
            CYCLE_ORDER.forEach((cycle) => {
                const base = TIERS[tier].monthly[type];
                const c = CYCLES[cycle];
                const monthlyPrice = round(base * c.factor);
                const label = tier === 'GROWTH'
                    ? `${COACH_TYPE_LABEL[type]} ${c.label}`
                    : `${COACH_TYPE_LABEL[type]} ${TIERS[tier].label} ${c.label}`;
                out[planKey(type, tier, cycle)] = {
                    label, coachType: type, tier, cycle, months: c.months,
                    totalPrice: monthlyPrice * c.months, monthlyPrice, baseMonthly: base,
                    maxStudents: TIERS[tier].maxStudents, isPromo: false, promoMonths: 0,
                };
            });
        });
    });
    // promoção ANTIGA (3 meses por valor fixo): fica só para resolver quem já foi cobrado nela
    out.PERSONAL_LAUNCH = { label: 'Personal Lançamento', coachType: 'PERSONAL',      tier: 'GROWTH', cycle: 'LAUNCH', months: 3, totalPrice: 209.7, monthlyPrice: 69.9,  baseMonthly: 97,  maxStudents: 50, isPromo: true, promoMonths: 3, legacy: true };
    out.NUTRI_LAUNCH    = { label: 'Nutri Lançamento',     coachType: 'NUTRICIONISTA', tier: 'GROWTH', cycle: 'LAUNCH', months: 3, totalPrice: 209.7, monthlyPrice: 69.9,  baseMonthly: 97,  maxStudents: 50, isPromo: true, promoMonths: 3, legacy: true };
    out.ELITE_LAUNCH    = { label: 'Elite Lançamento',     coachType: 'ELITE',         tier: 'GROWTH', cycle: 'LAUNCH', months: 3, totalPrice: 197,   monthlyPrice: 65.67, baseMonthly: 147, maxStudents: 50, isPromo: true, promoMonths: 3, legacy: true };
    return out;
}

export const BILLING_PLANS: Record<string, BillingPlan> = buildPlans();

/** Planos que a tela pode oferecer (sem os antigos). */
export const OFFERED_PLAN_KEYS: string[] = Object.keys(BILLING_PLANS).filter((k) => !BILLING_PLANS[k].legacy);

/**
 * Plano antigo de lançamento (*_LAUNCH, 3 meses por valor fixo) não é mais oferecido: se alguém pedir esse (app antigo, renovação de quem entrou nele),
 * cobra o plano normal equivalente (trimestral do mesmo tipo, degrau Growth). Qualquer outra chave volta igual.
 */
export function resolveOfferedPlanKey(key: string): string {
    const plan = BILLING_PLANS[key];
    if (!plan || !plan.legacy) return key;
    return planKey(plan.coachType, 'GROWTH', 'QUARTERLY');
}

// ─── PROMOÇÃO DE LANÇAMENTO ─────────────────────────────────────────────────────
export const LAUNCH_PROMO_MAX = 10;              // valor inicial; o limite de verdade fica em PlatformConfig.launchPromoMax (o master muda pelo app)
export const LAUNCH_PROMO_PERCENT = 30;
export const LAUNCH_PROMO_CYCLES: Cycle[] = ['QUARTERLY', 'SEMIANNUAL', 'ANNUAL'];
export const LAUNCH_PROMO_RESERVATION_DAYS = 7;  // quanto tempo uma cobrança promocional gerada e ainda não paga segura a vaga

export function isPromoCycle(plan: BillingPlan | undefined | null): boolean {
    return !!plan && !plan.legacy && LAUNCH_PROMO_CYCLES.includes(plan.cycle as Cycle);
}

/** Total promocional do ciclo (30% a menos, em reais inteiros) ou null se o plano não participa da promoção. */
export function promoTotal(plan: BillingPlan | undefined | null): number | null {
    if (!isPromoCycle(plan)) return null;
    return round((plan as BillingPlan).totalPrice * (1 - LAUNCH_PROMO_PERCENT / 100));
}

/** O que cobrar agora por um plano: valor, valor cheio e se é promocional. */
export function quotePlan(key: string, opts: { promo?: boolean } = {}) {
    const plan = BILLING_PLANS[key];
    if (!plan) return null;
    const promo = promoTotal(plan);
    const useIt = !!opts.promo && promo !== null;
    return {
        key, plan, regularValue: plan.totalPrice,
        value: useIt ? (promo as number) : plan.totalPrice,
        isPromo: useIt, discountPercent: useIt ? LAUNCH_PROMO_PERCENT : 0,
    };
}

// ─── DESCONTO POR RECORRÊNCIA ───────────────────────────────────────────────────
// Coach que ativa pagamento automático (cartão salvo, ver coach-recurrence/create) paga esse percentual a menos que o preço cheio avulso.
// Aplicado uma vez na criação da assinatura -- o Asaas cobra esse valor sozinho em todo ciclo seguinte. NÃO se soma à promoção de lançamento:
// a promoção vale só no pagamento do 1º período; o pagamento automático entra depois, nas renovações, já no preço normal do ciclo.
export const RECURRENCE_DISCOUNT = 0.10; // 10%

export function getRecurrenceValue(totalPrice: number): number {
    return Math.round(totalPrice * (1 - RECURRENCE_DISCOUNT) * 100) / 100;
}

export function calcProportionalCredit(totalPaid: number, totalDays: number, daysRemaining: number): number {
    if (!totalDays || daysRemaining <= 0) return 0;
    return Math.round((totalPaid / totalDays) * daysRemaining * 100) / 100;
}

export function calcBillingEnd(start: Date, months: number): Date {
    const end = new Date(start);
    end.setMonth(end.getMonth() + months);
    return end;
}

/** Degrau que cabe um número de alunos ativos (para o aviso de limite, que só entra depois da aprovação da Apple). */
export function tierForStudents(activeStudents: number): Tier {
    for (const t of TIER_ORDER) {
        const max = TIERS[t].maxStudents;
        if (max === null || activeStudents <= max) return t;
    }
    return 'UNLIMITED';
}

/** Catálogo no formato que o app e a página de vendas consomem. */
export function catalogForClient() {
    return {
        tiers: TIER_ORDER.map((t) => ({ key: t, label: TIERS[t].label, maxStudents: TIERS[t].maxStudents })),
        cycles: CYCLE_ORDER.map((c) => ({ key: c, label: CYCLES[c].label, months: CYCLES[c].months })),
        types: (Object.keys(KEY_PREFIX) as CoachType[]).map((t) => ({ key: t, label: COACH_TYPE_LABEL[t] })),
        plans: OFFERED_PLAN_KEYS.map((k) => {
            const p = BILLING_PLANS[k];
            return {
                key: k, coachType: p.coachType, tier: p.tier, cycle: p.cycle, label: p.label, months: p.months,
                monthlyPrice: p.monthlyPrice, totalPrice: p.totalPrice, maxStudents: p.maxStudents,
                promoTotal: promoTotal(p),
                promoMonthly: promoTotal(p) === null ? null : cents((promoTotal(p) as number) / p.months),
            };
        }),
        promo: { percent: LAUNCH_PROMO_PERCENT, cycles: LAUNCH_PROMO_CYCLES },
    };
}
