// src/config/coachBillingPlans.ts
export const BILLING_PLANS: Record<string, {
    label:       string;
    coachType:   'PERSONAL' | 'NUTRICIONISTA' | 'ELITE';
    months:      number;
    totalPrice:  number;
    monthlyPrice:number;
    isPromo:     boolean;
    promoMonths: number;
}> = {
    PERSONAL_MONTHLY:    { label:'Personal Mensal',      coachType:'PERSONAL',      months:1,  totalPrice:97,    monthlyPrice:97,   isPromo:false, promoMonths:0 },
    PERSONAL_QUARTERLY:  { label:'Personal Trimestral',  coachType:'PERSONAL',      months:3,  totalPrice:273,   monthlyPrice:91,   isPromo:false, promoMonths:0 },
    PERSONAL_SEMIANNUAL: { label:'Personal Semestral',   coachType:'PERSONAL',      months:6,  totalPrice:510,   monthlyPrice:85,   isPromo:false, promoMonths:0 },
    PERSONAL_ANNUAL:     { label:'Personal Anual',       coachType:'PERSONAL',      months:12, totalPrice:948,   monthlyPrice:79,   isPromo:false, promoMonths:0 },
    PERSONAL_LAUNCH:     { label:'Personal Lançamento',  coachType:'PERSONAL',      months:3,  totalPrice:209.7, monthlyPrice:69.9, isPromo:true,  promoMonths:3 },
    NUTRI_MONTHLY:       { label:'Nutri Mensal',         coachType:'NUTRICIONISTA', months:1,  totalPrice:97,    monthlyPrice:97,   isPromo:false, promoMonths:0 },
    NUTRI_QUARTERLY:     { label:'Nutri Trimestral',     coachType:'NUTRICIONISTA', months:3,  totalPrice:273,   monthlyPrice:91,   isPromo:false, promoMonths:0 },
    NUTRI_SEMIANNUAL:    { label:'Nutri Semestral',      coachType:'NUTRICIONISTA', months:6,  totalPrice:510,   monthlyPrice:85,   isPromo:false, promoMonths:0 },
    NUTRI_ANNUAL:        { label:'Nutri Anual',          coachType:'NUTRICIONISTA', months:12, totalPrice:948,   monthlyPrice:79,   isPromo:false, promoMonths:0 },
    NUTRI_LAUNCH:        { label:'Nutri Lançamento',     coachType:'NUTRICIONISTA', months:3,  totalPrice:209.7, monthlyPrice:69.9, isPromo:true,  promoMonths:3 },
    ELITE_MONTHLY:       { label:'Elite Mensal',         coachType:'ELITE',         months:1,  totalPrice:147,   monthlyPrice:147,  isPromo:false, promoMonths:0 },
    ELITE_QUARTERLY:     { label:'Elite Trimestral',     coachType:'ELITE',         months:3,  totalPrice:414,   monthlyPrice:138,  isPromo:false, promoMonths:0 },
    ELITE_SEMIANNUAL:    { label:'Elite Semestral',      coachType:'ELITE',         months:6,  totalPrice:774,   monthlyPrice:129,  isPromo:false, promoMonths:0 },
    ELITE_ANNUAL:        { label:'Elite Anual',          coachType:'ELITE',         months:12, totalPrice:1428,  monthlyPrice:119,  isPromo:false, promoMonths:0 },
    ELITE_LAUNCH:        { label:'Elite Lançamento',     coachType:'ELITE',         months:3,  totalPrice:329.7, monthlyPrice:109.9,isPromo:true,  promoMonths:3 },
};

export const LAUNCH_PROMO_MAX = 10;

export function calcProportionalCredit(
    totalPaid: number,
    totalDays: number,
    daysRemaining: number
): number {
    if (!totalDays || daysRemaining <= 0) return 0;
    return Math.round((totalPaid / totalDays) * daysRemaining * 100) / 100;
}

export function calcBillingEnd(start: Date, months: number): Date {
    const end = new Date(start);
    end.setMonth(end.getMonth() + months);
    return end;
}