// lib/macroPlanner.ts — CÓPIA de src/utils/macroPlanner.js do app (VERSÃO 4.0, metas do nutricionista).
// @ts-nocheck -- cópia fiel do JavaScript do app (para a paridade ser verificável linha a linha); o código novo que usa este arquivo é tipado.
// (3 out 2026) O plano automático do aluno calcula os macros por aba NO SERVIDOR, com a mesma conta que o app do coach usa na tela de dieta.
// Se mexer na conta lá, mexa aqui também (há um teste que compara os dois com centenas de combinações).
// v4.0: o coach/nutri pode escolher a equação de TMB (Mifflin-St Jeor, Harris-Benedict, FAO/OMS,
//   Cunningham ou TMB informada), o fator de atividade, o ajuste calórico do objetivo, o ajuste por
//   tipo de dia, kcal manual por dia e macros por g/kg ou por %. SEM configuração (targets = null) o
//   resultado é IDÊNTICO ao da v3.1 (teste de regressão com centenas de combinações).
// Correções vs v3.0 (mantidas):
//   - FIX MACROS INVERTIDOS: Aplicada escala harmônica no dia de Descanso. Quando o Kcal
//     desce, a proteína e a gordura precisam ceder uma margem mínima para os carboidratos
//     não zerarem, impedindo a IA de enlouquecer e gerar calorias fantasmas.
//   - SINCRONIZAÇÃO BACKEND: Aplicada mesma lógica Mifflin-St Jeor do route.ts.
//   - FATOR DE ATIVIDADE: Alinhado aos multiplicadores exatos do servidor (1.375 a 1.9).
//   - OBJETIVOS DINÂMICOS: Substituída a matriz fixa por percentuais (+10%, -20%) ajustados ao TDEE.
//   - MACROS BLINDADOS: Gordura fixa em 1.0g/kg, Proteína cravada em 2.2g/kg (Déficit).

export const DAY_TYPES = ['TREINO', 'TREINO_CARDIO', 'CARDIO', 'DESCANSO'];

export const DAY_TYPE_LABELS = {
    TREINO:        'Treino de Força',
    TREINO_CARDIO: 'Treino + Cardio',
    CARDIO:        'Só Cardio',
    DESCANSO:      'Descanso',
};

export function resolveGender(anamnese, genderParam) {
    const g = (anamnese?.gender ?? genderParam ?? '').trim().toLowerCase();
    return g === 'masculino' || g === 'male' || g === 'm';
}

// ─── CONFIGURAÇÃO DE METAS (o que o coach/nutri pode ajustar) ─────────────────────
export const EQUATIONS = {
    mifflin:    { label: 'Mifflin-St Jeor',            hint: 'Padrão do app. Boa precisão para a maioria dos adultos.' },
    harris:     { label: 'Harris-Benedict (rev. 1984)', hint: 'Roza & Shizgal (1984). Muito usada no Brasil.' },
    fao:        { label: 'FAO/OMS (1985)',             hint: 'Schofield, por faixa etária (18–30, 30–60, >60 anos), só com peso.' },
    cunningham: { label: 'Cunningham (massa magra)',   hint: '500 + 22 × massa magra. Para atletas: precisa do % de gordura.', needsBodyFat: true },
    manual:     { label: 'TMB informada',              hint: 'Você digita a TMB (ex.: calorimetria indireta).', needsManual: true },
};

export const ACTIVITY_PRESETS = [
    { factor: 1.2,   label: 'Sedentário' },
    { factor: 1.375, label: 'Leve' },
    { factor: 1.55,  label: 'Moderado' },
    { factor: 1.725, label: 'Intenso' },
    { factor: 1.9,   label: 'Muito intenso' },
];

/** Ajuste calórico por tipo de dia, como sempre foi (Treino+Cardio 105%, Treino 100%, Cardio 95%, Descanso 90%). */
export const DEFAULT_DAY_MULT = { TREINO: 1.0, TREINO_CARDIO: 1.05, CARDIO: 0.95, DESCANSO: 0.9 };

export const DEFAULT_TARGETS = {
    v: 1,
    equation: 'mifflin',
    manualTmb: null,                 // kcal (equation = 'manual')
    bodyFatPct: null,                // % (equation = 'cunningham')
    activity: { mode: 'auto', factor: 1.55 },       // auto = pela frequência de treino
    goal: { mode: 'auto', value: 0 },               // auto = pelo objetivo | 'percent' (±%) | 'kcal' (± kcal/dia)
    dayMult: { ...DEFAULT_DAY_MULT },
    kcalManual: {},                  // { TREINO: 2300, ... } vazio = calculado
    macros: { mode: 'auto', protGkg: 2.0, fatGkg: 1.0, pct: { prot: 30, carb: 40, fat: 30 } },
};

const num = (v, min, max, fallback) => {
    const n = typeof v === 'number' ? v : parseFloat(String(v ?? '').replace(',', '.'));
    if (!Number.isFinite(n)) return fallback;
    return Math.min(max, Math.max(min, n));
};

// valor opcional: fora da faixa = "não informado" (não "corrige" um número absurdo para o limite)
const numStrict = (v, min, max) => {
    const n = typeof v === 'number' ? v : parseFloat(String(v ?? '').replace(',', '.'));
    return Number.isFinite(n) && n >= min && n <= max ? n : null;
};

/** Aceita o que veio do servidor/tela (qualquer lixo) e devolve uma configuração válida e completa. */
export function sanitizeTargets(raw) {
    const d = DEFAULT_TARGETS;
    const t = raw && typeof raw === 'object' ? raw : {};
    const out = {
        v: 1,
        equation: EQUATIONS[t.equation] ? t.equation : d.equation,
        manualTmb: numStrict(t.manualTmb, 500, 6000),
        bodyFatPct: numStrict(t.bodyFatPct, 3, 60),
        activity: {
            mode: t.activity?.mode === 'factor' ? 'factor' : 'auto',
            factor: num(t.activity?.factor, 1.0, 2.5, d.activity.factor),
        },
        goal: {
            mode: ['percent', 'kcal'].includes(t.goal?.mode) ? t.goal.mode : 'auto',
            value: t.goal?.mode === 'kcal' ? num(t.goal?.value, -2500, 2500, 0) : num(t.goal?.value, -50, 50, 0),
        },
        dayMult: {},
        kcalManual: {},
        macros: {
            mode: ['gkg', 'pct'].includes(t.macros?.mode) ? t.macros.mode : 'auto',
            protGkg: num(t.macros?.protGkg, 0.3, 4.5, d.macros.protGkg),
            fatGkg: num(t.macros?.fatGkg, 0.2, 3.0, d.macros.fatGkg),
            pct: {
                prot: num(t.macros?.pct?.prot, 0, 100, d.macros.pct.prot),
                carb: num(t.macros?.pct?.carb, 0, 100, d.macros.pct.carb),
                fat: num(t.macros?.pct?.fat, 0, 100, d.macros.pct.fat),
            },
        },
    };
    for (const k of DAY_TYPES) {
        out.dayMult[k] = num(t.dayMult?.[k], 0.5, 1.5, DEFAULT_DAY_MULT[k]);
        const m = numStrict(t.kcalManual?.[k], 600, 8000);
        if (m) out.kcalManual[k] = Math.round(m);
    }
    return out;
}

/** true = sem nenhum ajuste (o cálculo é o padrão do app). */
export function isDefaultTargets(raw) {
    if (!raw) return true;
    const t = sanitizeTargets(raw);
    return JSON.stringify(t) === JSON.stringify(sanitizeTargets(null));
}

// ─── TMB ───────────────────────────────────────────────────────────────────────
/** Devolve { tmb, equation (a usada de fato), warning? }. Faixa etária FAO: 18–30, 30–60, >60. */
export function calcBMR(equation, { peso, altura, idade, isHomem, bodyFatPct, manualTmb }) {
    let eq = EQUATIONS[equation] ? equation : 'mifflin';
    let warning = null;
    if (eq === 'cunningham' && !(bodyFatPct > 0)) { warning = 'Cunningham precisa do % de gordura — usei Mifflin-St Jeor.'; eq = 'mifflin'; }
    if (eq === 'manual' && !(manualTmb > 0)) { warning = 'TMB informada vazia — usei Mifflin-St Jeor.'; eq = 'mifflin'; }
    let tmb;
    switch (eq) {
        case 'harris':
            tmb = isHomem
                ? 88.362 + 13.397 * peso + 4.799 * altura - 5.677 * idade
                : 447.593 + 9.247 * peso + 3.098 * altura - 4.330 * idade;
            break;
        case 'fao': {
            const band = idade < 30 ? 0 : idade <= 60 ? 1 : 2;
            tmb = isHomem
                ? [15.3 * peso + 679, 11.6 * peso + 879, 13.5 * peso + 487][band]
                : [14.7 * peso + 496, 8.7 * peso + 829, 10.5 * peso + 596][band];
            break;
        }
        case 'cunningham':
            tmb = 500 + 22 * (peso * (1 - bodyFatPct / 100));
            break;
        case 'manual':
            tmb = manualTmb;
            break;
        default: // mifflin
            tmb = isHomem ? 10 * peso + 6.25 * altura - 5 * idade + 5 : 10 * peso + 6.25 * altura - 5 * idade - 161;
    }
    return { tmb: Math.round(tmb), equation: eq, warning };
}

/** Fator pela frequência de treino (o "automático" de sempre). */
export function autoActivityFactor(frequencia) {
    const freq = frequencia ?? 4;
    let f = 1.2; // Sedentário
    if (freq >= 1 && freq <= 2) f = 1.375;
    else if (freq >= 3 && freq <= 4) f = 1.55;
    else if (freq >= 5 && freq <= 6) f = 1.725;
    else if (freq >= 7) f = 1.9;
    return f;
}

function calcTDEE(peso, altura, idade, isHomem, frequencia, cfg) {
    const bmr = calcBMR(cfg.equation, { peso, altura, idade, isHomem, bodyFatPct: cfg.bodyFatPct, manualTmb: cfg.manualTmb });
    const factor = cfg.activity.mode === 'factor' ? cfg.activity.factor : autoActivityFactor(frequencia);
    return { tmb: bmr.tmb, tdee: Math.round(bmr.tmb * factor), factor, equation: bmr.equation, warning: bmr.warning };
}

/** Meta calórica base (antes do ajuste do dia) e g/kg de proteína do modo automático. */
function goalBase(tdee, objetivo, cfg) {
    const obj = (objetivo || '').toLowerCase();
    let protPerKg;
    let auto;
    if (obj.includes('hipertrofia') || obj.includes('ganho')) { auto = tdee * 1.1; protPerKg = 2.0; }          // +10% superávit
    else if (obj.includes('emagrecimento') || obj.includes('perda') || obj.includes('defini')) { auto = tdee * 0.8; protPerKg = 2.2; } // -20% déficit
    else { auto = tdee; protPerKg = 1.8; }                                                                    // manutenção / saúde
    let base = auto;
    if (cfg.goal.mode === 'percent') base = tdee * (1 + cfg.goal.value / 100);
    else if (cfg.goal.mode === 'kcal') base = tdee + cfg.goal.value;
    return { base, protPerKg };
}

function calcMacrosForDayType(peso, tdee, objetivo, isHomem, dayType, cfg) {
    const { base, protPerKg } = goalBase(tdee, objetivo, cfg);
    const warnings = [];

    // Variação Diária (Ciclo de Carboidratos Inteligente) + margem de proteína/gordura no modo automático
    const dayMult = cfg.dayMult[dayType] ?? 1.0;
    let protFatMult = 1.0;
    if (dayType === 'CARDIO') protFatMult = 0.98;        // cede 2%
    else if (dayType === 'DESCANSO') protFatMult = 0.95; // cede 5% da proteína e gordura para salvar os carbos

    const pisoKcal = isHomem ? 1400 : 1200;
    const manual = cfg.kcalManual[dayType];
    let kcalAlvo;
    if (manual) {
        kcalAlvo = manual;
        if (manual < pisoKcal) warnings.push(`${manual} kcal está abaixo do piso de segurança (${pisoKcal} kcal).`);
    } else {
        kcalAlvo = Math.max(pisoKcal, Math.round(base * dayMult));
    }

    let protAlvo, fatAlvo, carbAlvo, kcalReal;
    const mode = cfg.macros.mode;
    if (mode === 'pct') {
        const { prot, carb, fat } = cfg.macros.pct;
        const sum = prot + carb + fat;
        if (Math.abs(sum - 100) > 1) warnings.push(`Os percentuais somam ${Math.round(sum)}% (o ideal é 100%) — normalizei.`);
        const k = sum > 0 ? 100 / sum : 0;
        protAlvo = Math.round((kcalAlvo * prot * k) / 100 / 4);
        carbAlvo = Math.round((kcalAlvo * carb * k) / 100 / 4);
        fatAlvo = Math.round((kcalAlvo * fat * k) / 100 / 9);
        kcalReal = Math.round(protAlvo * 4 + carbAlvo * 4 + fatAlvo * 9);
    } else if (mode === 'gkg') {
        protAlvo = Math.round(peso * cfg.macros.protGkg);
        fatAlvo = Math.round(peso * cfg.macros.fatGkg);
        const calRest = kcalAlvo - protAlvo * 4 - fatAlvo * 9;
        if (calRest < 0) warnings.push('Proteína + gordura já passam da meta calórica: carboidrato zerado.');
        carbAlvo = Math.max(0, Math.round(calRest / 4));
        kcalReal = Math.round(protAlvo * 4 + carbAlvo * 4 + fatAlvo * 9);
    } else {
        // automático (v3.1): proteína pelo objetivo, gordura 1 g/kg, carbo = o que sobra (mín. 20 g)
        const baseProt = peso * protPerKg * protFatMult;
        const baseFat = peso * 1.0 * protFatMult;
        protAlvo = Math.round(baseProt);
        fatAlvo = Math.max(30, Math.round(baseFat));
        const calRest = kcalAlvo - protAlvo * 4 - fatAlvo * 9;
        carbAlvo = Math.max(20, Math.round(calRest / 4));
        kcalReal = Math.round(protAlvo * 4 + carbAlvo * 4 + fatAlvo * 9);
    }

    if (Math.abs(kcalReal - kcalAlvo) > kcalAlvo * 0.05) warnings.push(`Os macros somam ${kcalReal} kcal (meta ${kcalAlvo} kcal).`);
    if (peso > 0 && protAlvo / peso > 3.2) warnings.push(`Proteína alta: ${(protAlvo / peso).toFixed(1).replace('.', ',')} g/kg.`);

    const macros = { kcal: kcalReal, prot: protAlvo, carb: carbAlvo, fat: fatAlvo };
    const detail = {
        kcalAlvo,
        gkg: peso > 0 ? { prot: +(protAlvo / peso).toFixed(2), carb: +(carbAlvo / peso).toFixed(2), fat: +(fatAlvo / peso).toFixed(2) } : null,
        pct: kcalReal > 0 ? { prot: Math.round((protAlvo * 4 * 100) / kcalReal), carb: Math.round((carbAlvo * 4 * 100) / kcalReal), fat: Math.round((fatAlvo * 9 * 100) / kcalReal) } : null,
        manualKcal: !!manual,
        warnings,
    };
    return { macros, detail };
}

// ─── DISTRIBUIÇÃO SEMANAL SUGERIDA ───────────────────────────────────────────
export function suggestWeekDistribution(frequencia, objetivo) {
    const freq = Math.min(7, Math.max(1, Number(frequencia) || 3));

    const base = {
        1: { TREINO: 1, TREINO_CARDIO: 0, CARDIO: 0, DESCANSO: 6 },
        2: { TREINO: 1, TREINO_CARDIO: 0, CARDIO: 1, DESCANSO: 5 },
        3: { TREINO: 2, TREINO_CARDIO: 0, CARDIO: 1, DESCANSO: 4 },
        4: { TREINO: 2, TREINO_CARDIO: 1, CARDIO: 1, DESCANSO: 3 },
        5: { TREINO: 2, TREINO_CARDIO: 2, CARDIO: 1, DESCANSO: 2 },
        6: { TREINO: 3, TREINO_CARDIO: 2, CARDIO: 1, DESCANSO: 1 },
        7: { TREINO: 3, TREINO_CARDIO: 2, CARDIO: 2, DESCANSO: 0 },
    };

    const dist = { ...base[freq] };

    if (objetivo === 'Hipertrofia' && freq >= 4) {
        if (dist.CARDIO > 0) { dist.CARDIO -= 1; dist.TREINO += 1; }
    }
    if (['Emagrecimento', 'Definição'].includes(objetivo) && freq >= 5) {
        if (dist.TREINO > 1) { dist.TREINO -= 1; dist.CARDIO += 1; }
    }

    return dist;
}

// ─── CÁLCULO COMPLETO DO PLANO SEMANAL ───────────────────────────────────────
/**
 * @param {Object} anamnese  - dados da anamnese do aluno
 * @param {string} birthDate - DD/MM/AAAA ou YYYY-MM-DD
 * @param {string} gender    - 'Masculino' | 'Feminino' (do cadastro)
 * @param {Object} weekDist  - distribuição editada pelo coach (opcional)
 * @param {Object} targets   - metas do nutricionista (opcional; null = padrão do app, igual à v3.1)
 */
export function calcWeeklyPlan(anamnese, birthDate, gender, weekDist = null, targets = null) {
    const cfg = sanitizeTargets(targets);
    const peso       = Number(anamnese?.peso)       || 70;
    const altura     = Number(anamnese?.altura)     || 170;
    const frequencia = Number(anamnese?.frequencia) || 3;
    const objetivo   = anamnese?.objetivo || 'Emagrecimento';

    const isHomem = resolveGender(anamnese, gender);

    // Idade real
    const idade = calcAge(birthDate || anamnese?.birthDate);

    const { tmb, tdee, factor, equation, warning } = calcTDEE(peso, altura, idade, isHomem, frequencia, cfg);

    // Macros por aba
    const macrosByDay = {};
    const detailByDay = {};
    for (const dayType of DAY_TYPES) {
        const r = calcMacrosForDayType(peso, tdee, objetivo, isHomem, dayType, cfg);
        macrosByDay[dayType] = r.macros;
        detailByDay[dayType] = r.detail;
    }

    // Distribuição semanal
    const distribution = weekDist ?? suggestWeekDistribution(frequencia, objetivo);

    // Média semanal ponderada
    let totalKcal = 0, totalProt = 0, totalCarb = 0, totalFat = 0;
    for (const dayType of DAY_TYPES) {
        const days   = distribution[dayType] || 0;
        const macros = macrosByDay[dayType];
        totalKcal += macros.kcal * days;
        totalProt += macros.prot * days;
        totalCarb += macros.carb * days;
        totalFat  += macros.fat  * days;
    }

    const avgKcal = Math.round(totalKcal / 7);
    const avgProt = Math.round(totalProt / 7);
    const avgCarb = Math.round(totalCarb / 7);
    const avgFat  = Math.round(totalFat  / 7);

    // Déficit/superávit semanal e estimativa de resultado
    const deficitSemanal   = Math.round(tdee * 7 - totalKcal);
    const kgEstimadoSemana = parseFloat((deficitSemanal / 7700).toFixed(2));
    // Positivo = perde gordura (déficit), Negativo = ganha peso (superávit)

    const warnings = [];
    if (warning) warnings.push(warning);
    for (const dayType of DAY_TYPES) {
        if ((distribution[dayType] || 0) > 0) for (const w of detailByDay[dayType].warnings) warnings.push(`${DAY_TYPE_LABELS[dayType]}: ${w}`);
    }

    return {
        tmb,
        tdee,
        activityFactor: factor,
        equation,
        objetivo,
        isHomem,
        macrosByDay,
        detailByDay,
        distribution,
        warnings,
        weekly: {
            totalKcal: Math.round(totalKcal),
            deficitSemanal,
            kgEstimadoSemana,
            avg: { kcal: avgKcal, prot: avgProt, carb: avgCarb, fat: avgFat },
        },
    };
}

// ─── HELPER: CALCULAR IDADE ───────────────────────────────────────────────────
export function calcAge(birthDate) {
    if (!birthDate) return 30;
    let d;
    const s = String(birthDate);
    if (s.includes('/')) {
        const [day, month, year] = s.split('/');
        d = new Date(`${year}-${month.padStart(2,'0')}-${day.padStart(2,'0')}`);
    } else {
        d = new Date(s);
    }
    if (isNaN(d.getTime())) return 30;
    const hoje = new Date();
    let age = hoje.getFullYear() - d.getFullYear();
    const m = hoje.getMonth() - d.getMonth();
    if (m < 0 || (m === 0 && hoje.getDate() < d.getDate())) age--;
    return age > 0 && age < 120 ? age : 30;
}