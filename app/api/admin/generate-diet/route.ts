// app/api/admin/generate-diet/route.ts — VERSÃO 6.0
// Novidades vs v5:
//   - buildMealSchedule(): calcula horários reais baseado na rotina do aluno
//   - Detecta conflito acordar→treino e aplica preworkoutStrategy
//   - Evita refeições no horário de trabalho (sugere portátil)
//   - IA recebe horários FIXOS para cada refeição — não inventa mais
//   - Substitutos obrigatórios: 1 base + 2 subs por grupo em proteínas e carbos
// ─────────────────────────────────────────────────────────────────────────────
import { NextResponse } from 'next/server';
import OpenAI       from 'openai';
import Anthropic    from '@anthropic-ai/sdk';
import { GoogleGenerativeAI } from '@google/generative-ai';

export const dynamic     = 'force-dynamic';
export const maxDuration = 90;

const openai    = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const googleAI  = new GoogleGenerativeAI(process.env.GOOGLE_AI_API_KEY ?? '');

type Provider = 'openai' | 'openai-mini' | 'anthropic' | 'google';

interface MacrosOverride { kcal: number; prot: number; carb: number; fat: number; }

interface MealSlot {
    time:     string;   // "HH:MM"
    name:     string;   // "Café da Manhã"
    role:     string;   // "preworkout" | "postworkout" | "main" | "snack" | "dinner" | "supper"
    portable: boolean;  // se deve ser refeição portátil (horário de trabalho)
    note:     string;   // instrução extra para a IA
    carbPriority: 'high' | 'medium' | 'low'; // prioridade de carbo nesta refeição
    protPriority: 'high' | 'medium' | 'low';
}

interface Anamnese {
    objetivo?: string; peso?: number; altura?: number; frequencia?: number;
    gender?: string; age?: number;
    trainFasted?: boolean;
    preworkoutStrategy?: string; // novo campo
    trainTime?: string; wakeUpTime?: string; sleepTime?: string;
    workTimeStart?: string; workTimeEnd?: string; workTime?: string;
    healthConditions?: string[]; healthConditionsObs?: string;
    bariatric?: boolean; bariatricType?: string; bariatricTime?: string;
    bariatricIntolerances?: string[];
    medications?: string[]; medicationsObs?: string;
    digestiveIssues?: string[]; digestiveObs?: string;
    sleepHours?: string; sleepQuality?: string; wakeHungry?: boolean;
    stressLevel?: number; stressEating?: boolean;
    cycleRegular?: string; pmsSymptoms?: string[]; pmsObs?: string;
    mealsPerDay?: number | string; eatsOutPerWeek?: string; budget?: string;
    waterIntake?: string; alcoholFreq?: string; coffeePerDay?: string;
    smoker?: boolean; eatSpeed?: string; nightBinge?: string;
    triedDiets?: string[]; dietWorked?: string; dietHated?: string;
    biggestChallenge?: string;
    allergies?: string; foodPreferences?: string; foodAversions?: string;
    supplements?: string; extraNotes?: string;
}

// ─── UTILITÁRIOS DE TEMPO ─────────────────────────────────────────────────────
function timeToMinutes(t: string): number {
    if (!t || !t.includes(':')) return 0;
    const [h, m] = t.split(':').map(Number);
    return (h || 0) * 60 + (m || 0);
}

function minutesToTime(mins: number): string {
    const total = ((mins % 1440) + 1440) % 1440; // wrap 24h
    const h = Math.floor(total / 60).toString().padStart(2, '0');
    const m = (total % 60).toString().padStart(2, '0');
    return `${h}:${m}`;
}

function addMinutes(t: string, delta: number): string {
    return minutesToTime(timeToMinutes(t) + delta);
}

function isInRange(t: string, start: string, end: string): boolean {
    const tm = timeToMinutes(t);
    const sm = timeToMinutes(start);
    const em = timeToMinutes(end);
    return tm >= sm && tm <= em;
}

function roundToQuarter(t: string): string {
    const mins  = timeToMinutes(t);
    const round = Math.round(mins / 15) * 15;
    return minutesToTime(round);
}

// ─── CONSTRUTOR DE AGENDA DE REFEIÇÕES ───────────────────────────────────────
/**
 * Calcula os slots de refeição com horários reais baseado na rotina do aluno.
 * Retorna array de MealSlot ordenado por horário.
 */
function buildMealSchedule(a: Anamnese, dayType: string): MealSlot[] {
    const wake      = a.wakeUpTime    || '07:00';
    const sleep     = a.sleepTime     || '23:00';
    const train     = a.trainTime     || '08:00';
    const workStart = a.workTimeStart || (a.workTime ? a.workTime.split(' às ')[0] : '09:00');
    const workEnd   = a.workTimeEnd   || (a.workTime ? a.workTime.split(' às ')[1] : '18:00');
    const numMeals  = Math.min(8, Math.max(2, Number(a.mealsPerDay) || 5));
    const isBariatric = !!a.bariatric;
    const hasGastrite = (a.digestiveIssues ?? []).some(d => ['Gastrite','Refluxo / DRGE'].includes(d));
    const strategy  = a.preworkoutStrategy || 'shake'; // novo campo

    const wakeMin   = timeToMinutes(wake);
    const sleepMin  = timeToMinutes(sleep);
    const trainMin  = timeToMinutes(train);
    const windowMin = sleepMin > wakeMin ? sleepMin - wakeMin : (1440 - wakeMin + sleepMin);

    const slots: MealSlot[] = [];

    // ── DIAS SEM TREINO (DESCANSO) ────────────────────────────────────────────
    if (dayType === 'DESCANSO') {
        const interval = Math.floor(windowMin / (numMeals - 1));
        const mealDefs = [
            { name: 'Café da Manhã', role: 'main',   carbPriority: 'medium' as const, protPriority: 'medium' as const },
            { name: 'Lanche da Manhã', role: 'snack', carbPriority: 'low'    as const, protPriority: 'medium' as const },
            { name: 'Almoço',        role: 'main',   carbPriority: 'medium' as const, protPriority: 'high'   as const },
            { name: 'Lanche da Tarde',role: 'snack', carbPriority: 'low'    as const, protPriority: 'medium' as const },
            { name: 'Jantar',        role: 'dinner', carbPriority: 'low'    as const, protPriority: 'high'   as const },
            { name: 'Ceia',          role: 'supper', carbPriority: 'low'    as const, protPriority: 'medium' as const },
        ];

        const selected = mealDefs.slice(0, numMeals);
        selected.forEach((def, i) => {
            const time = roundToQuarter(minutesToTime(wakeMin + interval * i));
            const portable = isInRange(time, workStart, workEnd);
            slots.push({
                time,
                name:    def.name,
                role:    def.role,
                portable,
                note: portable
                    ? 'Refeição durante horário de trabalho — escolha opção prática e portátil.'
                    : (i === 0 && hasGastrite ? 'Não comece com café puro — inclua algo sólido primeiro.' : ''),
                carbPriority: def.carbPriority,
                protPriority: def.protPriority,
            });
        });

        return slots;
    }

    // ── DIAS COM TREINO (TREINO, CARDIO, TREINO_CARDIO) ───────────────────────

    // Calcular diferença entre acordar e treino
    const minsTillTrain = ((trainMin - wakeMin) + 1440) % 1440;
    const hasTimeForPreWorkout = minsTillTrain >= 60 && !a.trainFasted;

    // Slots obrigatórios
    const required: MealSlot[] = [];

    // 1. PRÉ-TREINO
    if (!a.trainFasted) {
        if (hasTimeForPreWorkout) {
            // Tem tempo — pré-treino sólido 60-75min antes
            const preTime = roundToQuarter(minutesToTime(trainMin - 70));
            const portable = isInRange(preTime, workStart, workEnd);
            required.push({
                time: preTime,
                name: 'Pré-Treino',
                role: 'preworkout',
                portable,
                note: portable
                    ? 'Pré-treino no trabalho — opção prática: banana + whey ou tapioca + frango fatiado.'
                    : 'Refeição pré-treino: foco em carboidrato de médio/rápido absorção + proteína leve.',
                carbPriority: 'high',
                protPriority: 'medium',
            });
        } else {
            // Pouco tempo entre acordar e treinar
            if (strategy === 'shake' || strategy === 'shake_rapido') {
                // Shake 20min antes
                const shakeTime = roundToQuarter(minutesToTime(trainMin - 20));
                required.push({
                    time: shakeTime,
                    name: 'Pré-Treino Rápido',
                    role: 'preworkout',
                    portable: false,
                    note: `Acorda ${minsTillTrain}min antes do treino — shake rápido: banana + whey. Fácil digestão, sem desconforto.`,
                    carbPriority: 'high',
                    protPriority: 'low',
                });
            } else if (strategy === 'ceia_pretreino') {
                // Ceia pré-treino na noite anterior
                const ceiaTime = roundToQuarter(minutesToTime(sleepMin - 60));
                required.push({
                    time: ceiaTime,
                    name: 'Ceia Pré-Treino',
                    role: 'preworkout',
                    portable: false,
                    note: `Acorda apenas ${minsTillTrain}min antes do treino — esta refeição é a noite anterior para garantir energia no treino matinal.`,
                    carbPriority: 'high',
                    protPriority: 'medium',
                });
            } else if (strategy === 'reforcar_pos') {
                // Pula pré-treino, nota no pós
                // não adiciona slot de pré
            }
        }
    } else {
        // Treina em jejum — nota informativa
        required.push({
            time: wake,
            name: 'Quebra do Jejum (Pós-Treino)',
            role: 'postworkout',
            portable: false,
            note: 'Treina em jejum. Esta é a primeira refeição do dia, após o treino. Carboidrato + proteína para recuperação.',
            carbPriority: 'high',
            protPriority: 'high',
        });
    }

    // 2. PÓS-TREINO (sempre, exceto jejum que já foi adicionado)
    if (!a.trainFasted) {
        const posTime = roundToQuarter(minutesToTime(trainMin + 45));
        const portable = isInRange(posTime, workStart, workEnd);
        required.push({
            time: posTime,
            name: 'Pós-Treino',
            role: 'postworkout',
            portable,
            note: portable
                ? 'Pós-treino no trabalho — whey + fruta ou iogurte grego + granola.'
                : 'Pós-treino: prioridade máxima em proteína + carboidrato para recuperação muscular.',
            carbPriority: 'high',
            protPriority: 'high',
        });
    }

    // 3. PREENCHER OS SLOTS RESTANTES NA JANELA
    const remainingSlots = numMeals - required.length;
    const usedTimes = new Set(required.map(r => r.time));

    // Distribuir refeições na janela, evitando conflitos com pré/pós treino
    const mainMealDefs = [
        { name: 'Café da Manhã',   role: 'main',   carbPriority: 'medium' as const, protPriority: 'medium' as const, idealOffset: 0   },
        { name: 'Lanche da Manhã', role: 'snack',  carbPriority: 'medium' as const, protPriority: 'low'    as const, idealOffset: 0.2 },
        { name: 'Almoço',          role: 'main',   carbPriority: 'high'   as const, protPriority: 'high'   as const, idealOffset: 0.4 },
        { name: 'Lanche da Tarde', role: 'snack',  carbPriority: 'low'    as const, protPriority: 'medium' as const, idealOffset: 0.6 },
        { name: 'Jantar',          role: 'dinner', carbPriority: 'low'    as const, protPriority: 'high'   as const, idealOffset: 0.8 },
        { name: 'Ceia',            role: 'supper', carbPriority: 'low'    as const, protPriority: 'medium' as const, idealOffset: 0.95},
    ];

    const selected = mainMealDefs.slice(0, remainingSlots);
    selected.forEach(def => {
        let idealMin = wakeMin + Math.round(windowMin * def.idealOffset);
        // Garante mínimo de 90min de distância dos slots já definidos
        let attempts = 0;
        while (attempts < 20) {
            const t = roundToQuarter(minutesToTime(idealMin));
            const conflict = [...usedTimes].some(ut =>
                Math.abs(timeToMinutes(ut) - timeToMinutes(t)) < 90
            );
            if (!conflict) {
                usedTimes.add(t);
                const portable = isInRange(t, workStart, workEnd);
                let note = '';
                if (portable) note = 'Refeição durante horário de trabalho — opção portátil/prática.';
                if (def.role === 'main' && hasGastrite && def.idealOffset === 0) {
                    note = 'Não comece o dia com café puro — inclua alimento sólido antes.';
                }
                required.push({ time: t, name: def.name, role: def.role, portable, note, carbPriority: def.carbPriority, protPriority: def.protPriority });
                break;
            }
            idealMin += 15;
            attempts++;
        }
    });

    // Ordenar por horário
    required.sort((a, b) => timeToMinutes(a.time) - timeToMinutes(b.time));

    // Ajuste especial: se bariátrico, garante min 6 refeições e volume pequeno
    if (isBariatric && required.length < 6) {
        // Adiciona lanches extras entre as refeições existentes
        const extra = 6 - required.length;
        for (let i = 0; i < extra; i++) {
            const insertAfter = required[Math.floor(required.length / 2) + i];
            const newTime = roundToQuarter(addMinutes(insertAfter.time, 120));
            if (!usedTimes.has(newTime)) {
                usedTimes.add(newTime);
                required.push({
                    time: newTime, name: `Lanche Extra ${i + 1}`,
                    role: 'snack', portable: false,
                    note: 'Bariátrico: refeição de pequeno volume (~150ml), rica em proteína.',
                    carbPriority: 'low', protPriority: 'high',
                });
            }
        }
        required.sort((a, b) => timeToMinutes(a.time) - timeToMinutes(b.time));
    }

    return required;
}

// ─── FORMATAR AGENDA PARA O PROMPT ───────────────────────────────────────────
function formatScheduleForPrompt(slots: MealSlot[], trainTime: string, dayType: string): string {
    const lines = slots.map((s, i) => {
        const portableTag = s.portable ? ' [PORTÁTIL]' : '';
        const noteStr     = s.note     ? ` | Nota: ${s.note}` : '';
        const carbTag     = s.carbPriority === 'high' ? '↑CARBO' : s.carbPriority === 'low' ? '↓CARBO' : '';
        const protTag     = s.protPriority === 'high' ? '↑PROT'  : '';
        const tags        = [carbTag, protTag].filter(Boolean).join(' ');
        return `${i + 1}. ${s.time} — ${s.name}${portableTag} [${tags}]${noteStr}`;
    });

    const trainNote = dayType !== 'DESCANSO'
        ? `\n⏱️ Treino: ${trainTime}`
        : '';

    return `${trainNote}\n${lines.join('\n')}`;
}

// ─── CATÁLOGO ─────────────────────────────────────────────────────────────────
const FOOD_CATALOG = [
    { id:"7fa55081", n:"Frango Grelhado",               sc:"Proteínas Gerais", k:165, p:31, c:0,  f:3  },
    { id:"b2c9bdb7", n:"Frango Desfiado (Cozido)",      sc:"Proteínas Gerais", k:165, p:31, c:0,  f:3  },
    { id:"c5f3b7e6", n:"Sobrecoxa de Frango (Sem pele)", sc:"Proteínas Gerais",k:210, p:28, c:0,  f:10 },
    { id:"ae77cc5e", n:"Moela de Frango (Cozida)",       sc:"Proteínas Gerais", k:153, p:30, c:0,  f:3  },
    { id:"96d11aa4", n:"Carne Moída (Patinho)",          sc:"Proteínas Gerais", k:219, p:35, c:0,  f:7  },
    { id:"76ba67e7", n:"Patinho (Cozido / Iscas)",       sc:"Proteínas Gerais", k:219, p:35, c:0,  f:7  },
    { id:"f46f2036", n:"Alcatra Grelhada",               sc:"Proteínas Gerais", k:240, p:31, c:0,  f:11 },
    { id:"0b2de140", n:"Carne de Panela (Cozida)",       sc:"Proteínas Gerais", k:220, p:30, c:0,  f:10 },
    { id:"23f6b995", n:"Carne Seca Desfiada",            sc:"Proteínas Gerais", k:280, p:40, c:0,  f:12 },
    { id:"928041e8", n:"Tilápia Grelhada",               sc:"Proteínas Gerais", k:128, p:26, c:0,  f:2  },
    { id:"bdeb253d", n:"Salmão Grelhado",                sc:"Proteínas Gerais", k:200, p:25, c:0,  f:10 },
    { id:"94776886", n:"Pescada Branca Grelhada",        sc:"Proteínas Gerais", k:110, p:26, c:0,  f:1  },
    { id:"de802ecf", n:"Atum (Grelhado ou Assado)",      sc:"Proteínas Gerais", k:130, p:29, c:0,  f:1  },
    { id:"8fad8abc", n:"Sardinha (Enlatada em Água)",    sc:"Proteínas Gerais", k:110, p:24, c:0,  f:2  },
    { id:"3cee1649", n:"Camarão Grelhado",               sc:"Proteínas Gerais", k:100, p:24, c:0,  f:1  },
    { id:"d965922a", n:"Peito de Peru Grelhado",         sc:"Proteínas Gerais", k:150, p:29, c:0,  f:3  },
    { id:"67b01945", n:"Ovos Inteiros",                  sc:"Proteínas Gerais", k:143, p:13, c:1,  f:10 },
    { id:"fffd8a66", n:"Clara de Ovo",                   sc:"Proteínas Gerais", k:52,  p:11, c:1,  f:0  },
    { id:"5a27992c", n:"Tofu (Queijo de Soja)",          sc:"Proteínas Gerais", k:76,  p:8,  c:2,  f:4  },
    { id:"f1826a2c", n:"Proteína de Soja (PTS Crua)",    sc:"Proteínas Gerais", k:320, p:50, c:30, f:1  },
    { id:"007db8e3", n:"Queijo Cottage Tradicional",     sc:"Queijos e Pastas",  k:98,  p:11, c:3,  f:4  },
    { id:"5b756560", n:"Queijo Ricota Fresca",           sc:"Queijos e Pastas",  k:140, p:11, c:3,  f:8  },
    { id:"5173b746", n:"Requeijão Light",                sc:"Queijos e Pastas",  k:180, p:10, c:2,  f:14 },
    { id:"37933f71", n:"Queijo Mussarela Light",         sc:"Queijos e Pastas",  k:260, p:24, c:2,  f:16 },
    { id:"c4ef1a39", n:"Queijo Minas Frescal Light",     sc:"Queijos e Pastas",  k:160, p:16, c:3,  f:9  },
    { id:"e7bdae09", n:"Iogurte Natural Desnatado",      sc:"Leites e Iogurtes", k:40,  p:4,  c:5,  f:0  },
    { id:"3a90b75d", n:"Iogurte Grego Zero/Light",       sc:"Leites e Iogurtes", k:50,  p:6,  c:5,  f:0  },
    { id:"f86484b3", n:"Leite Desnatado",                sc:"Leites e Iogurtes", k:35,  p:3,  c:5,  f:0  },
    { id:"b0401676", n:"Peito de Peru (Fatiado)",        sc:"Frios e Embutidos", k:110, p:21, c:1,  f:2  },
    { id:"113ea8da", n:"Presunto Magro",                 sc:"Frios e Embutidos", k:105, p:16, c:2,  f:3  },
    { id:"fa4ba3b8", n:"Arroz Branco",                   sc:"Carbos Base", k:130, p:2,  c:28, f:0  },
    { id:"eccd514c", n:"Arroz Integral",                 sc:"Carbos Base", k:111, p:2,  c:23, f:1  },
    { id:"7ff6a7f4", n:"Batata Doce Cozida",             sc:"Carbos Base", k:86,  p:1,  c:20, f:0  },
    { id:"edc8a4fd", n:"Batata Inglesa Cozida",          sc:"Carbos Base", k:86,  p:1,  c:19, f:0  },
    { id:"c7d2240a", n:"Mandioca Cozida",                sc:"Carbos Base", k:114, p:1,  c:26, f:0  },
    { id:"f632556e", n:"Mandioquinha / Batata Baroa",    sc:"Carbos Base", k:100, p:1,  c:20, f:0  },
    { id:"5e4832bf", n:"Inhame (Cozido)",                sc:"Carbos Base", k:118, p:1,  c:28, f:0  },
    { id:"8bb16ab4", n:"Macarrão Cozido",                sc:"Carbos Base", k:130, p:4,  c:28, f:0  },
    { id:"5c9cde6a", n:"Macarrão Integral (Cozido)",     sc:"Carbos Base", k:124, p:5,  c:26, f:1  },
    { id:"4b6eb78f", n:"Pão de Forma Tradicional",       sc:"Pães e Massas", k:260, p:8,  c:50, f:2  },
    { id:"a416e4fe", n:"Pão Francês",                    sc:"Pães e Massas", k:300, p:9,  c:58, f:3  },
    { id:"08301bb2", n:"Pão Integral",                   sc:"Pães e Massas", k:250, p:10, c:46, f:3  },
    { id:"1f1f1fe",  n:"Tapioca (Goma)",                 sc:"Pães e Massas", k:330, p:0,  c:81, f:0  },
    { id:"7e243728", n:"Rap10",                          sc:"Pães e Massas", k:300, p:8,  c:52, f:5  },
    { id:"crepioca", n:"Massa de Crepioca",              sc:"Pães e Massas", k:330, p:0,  c:81, f:0  },
    { id:"bdb59103", n:"Aveia em Flocos",                sc:"Cereais e Fibras", k:380, p:13, c:60, f:8  },
    { id:"9d36b48b", n:"Cuscuz de Milho",                sc:"Cereais e Fibras", k:112, p:3,  c:25, f:0  },
    { id:"91473bf8", n:"Chia",                           sc:"Cereais e Fibras", k:486, p:16, c:40, f:30 },
    { id:"d6289c5c", n:"Farinha de Linhaça",             sc:"Cereais e Fibras", k:534, p:18, c:30, f:42 },
    { id:"1837aac1", n:"Granola Sem Açúcar",             sc:"Cereais e Fibras", k:380, p:10, c:60, f:10 },
    { id:"6fecb9d2", n:"Feijão Carioca Cozido",          sc:"Leguminosas e Grãos", k:76,  p:4,  c:13, f:0  },
    { id:"7b85d6df", n:"Feijão Preto Cozido",            sc:"Leguminosas e Grãos", k:91,  p:5,  c:14, f:0  },
    { id:"33e2a094", n:"Lentilha Cozida",                sc:"Leguminosas e Grãos", k:116, p:9,  c:20, f:0  },
    { id:"38432feb", n:"Grão de Bico Cozido",            sc:"Leguminosas e Grãos", k:164, p:8,  c:27, f:2  },
    { id:"0ce696b0", n:"Banana",                         sc:"Frutas", k:89,  p:1,  c:23, f:0  },
    { id:"c6135c45", n:"Maçã",                           sc:"Frutas", k:52,  p:0,  c:14, f:0  },
    { id:"28800928", n:"Mamão",                          sc:"Frutas", k:43,  p:0,  c:11, f:0  },
    { id:"d2405198", n:"Morango",                        sc:"Frutas", k:32,  p:1,  c:8,  f:0  },
    { id:"e1ba74a1", n:"Laranja",                        sc:"Frutas", k:47,  p:1,  c:12, f:0  },
    { id:"eeae57e2", n:"Kiwi",                           sc:"Frutas", k:61,  p:1,  c:15, f:0  },
    { id:"fa1e0345", n:"Melancia",                       sc:"Frutas", k:30,  p:1,  c:8,  f:0  },
    { id:"745c31e4", n:"Azeite de Oliva",                sc:"Gorduras e Oleaginosas", k:884, p:0,  c:0,  f:100 },
    { id:"9696c9b6", n:"Pasta de Amendoim",              sc:"Gorduras e Oleaginosas", k:588, p:25, c:20, f:50  },
    { id:"0c1231ef", n:"Castanha do Pará",               sc:"Gorduras e Oleaginosas", k:650, p:14, c:12, f:66  },
    { id:"200b4eb5", n:"Nozes",                          sc:"Gorduras e Oleaginosas", k:650, p:15, c:14, f:65  },
    { id:"82a2525d", n:"Abacate",                        sc:"Gorduras e Oleaginosas", k:160, p:2,  c:8,  f:14  },
    { id:"1813dae5", n:"Manteiga",                       sc:"Gorduras e Oleaginosas", k:717, p:1,  c:1,  f:81  },
    { id:"32176cad", n:"Brócolis (Cozido)",              sc:"Vegetais e Legumes", k:25, p:2, c:4, f:0 },
    { id:"ed7041ed", n:"Couve-flor",                     sc:"Vegetais e Legumes", k:25, p:2, c:4, f:0 },
    { id:"72a49b38", n:"Cenoura (Cozida)",               sc:"Vegetais e Legumes", k:35, p:1, c:8, f:0 },
    { id:"260caaae", n:"Alface (Qualquer tipo)",         sc:"Vegetais e Legumes", k:14, p:1, c:2, f:0 },
    { id:"50f4acaa", n:"Tomate",                         sc:"Vegetais e Legumes", k:18, p:1, c:3, f:0 },
    { id:"5ee331d2", n:"Rúcula",                         sc:"Vegetais e Legumes", k:25, p:3, c:4, f:0 },
    { id:"3357f827", n:"Couve (Manteiga)",               sc:"Vegetais e Legumes", k:35, p:3, c:6, f:0 },
    { id:"15f10970", n:"Espinafre",                      sc:"Vegetais e Legumes", k:23, p:3, c:4, f:0 },
    { id:"35d3ae09", n:"Abobrinha",                      sc:"Vegetais e Legumes", k:17, p:1, c:3, f:0 },
    { id:"07ee0c78", n:"Abóbora Cabotiá",                sc:"Vegetais e Legumes", k:34, p:1, c:8, f:0 },
    { id:"ba4cb07b", n:"Beterraba",                      sc:"Vegetais e Legumes", k:43, p:2, c:10,f:0 },
    { id:"5e622521", n:"Whey Protein Concentrado",       sc:"Suplementos em Pó",  k:400, p:75, c:10, f:5  },
    { id:"89342d9f", n:"Whey Protein Isolado",           sc:"Suplementos em Pó",  k:370, p:90, c:2,  f:1  },
    { id:"ffb77725", n:"Albumina",                       sc:"Suplementos em Pó",  k:360, p:80, c:5,  f:0  },
    { id:"4aada106", n:"Caseína",                        sc:"Suplementos em Pó",  k:360, p:80, c:5,  f:1  },
    { id:"893d83d0", n:"Creatina",                       sc:"Creatina Isolada",   k:0,   p:0,  c:0,  f:0  },
    { id:"40d69ef4", n:"YoPRO 15g (Bebida Láctea)",      sc:"Prontos p/ Consumo", k:45,  p:6,  c:5,  f:0  },
    { id:"7b22ccb6", n:"YoPRO 25g (Bebida Láctea)",      sc:"Prontos p/ Consumo", k:62,  p:10, c:5,  f:0  },
    { id:"34c424a4", n:"Barra de Proteína Bold",         sc:"Prontos p/ Consumo", k:350, p:33, c:33, f:15 },
    { id:"2cadb09b", n:"Paçoca (Rolha)",                 sc:"Doces e Açúcares",   k:490, p:15, c:60, f:25 },
    { id:"9b1aebc9", n:"Chocolate Meio Amargo (70%)",    sc:"Doces e Açúcares",   k:540, p:6,  c:45, f:35 },
    { id:"638a0cc5", n:"Geleia de Frutas (100% Fruta)",  sc:"Doces e Açúcares",   k:150, p:0,  c:10, f:0  },
    { id:"08a0c3cb", n:"Café sem Açúcar",                sc:"Bebidas Zero", k:0, p:0, c:0, f:0 },
    { id:"19aa03fc", n:"Chá sem Açúcar",                 sc:"Bebidas Zero", k:0, p:0, c:0, f:0 },
    { id:"8e3e9898", n:"Suco Clight/Zero",               sc:"Bebidas Zero", k:0, p:0, c:0, f:0 },
    { id:"1016e944", n:"Gelatina Zero",                  sc:"Bebidas Zero", k:5, p:1, c:0, f:0 },
    { id:"752dbe21", n:"Refrigerante Zero",              sc:"Bebidas Zero", k:0, p:0, c:0, f:0 },
];

// ─── FILTRAR CATÁLOGO ─────────────────────────────────────────────────────────
function filteredCatalog(a: Anamnese): string {
    const al = (a.allergies    ?? '').toLowerCase();
    const av = (a.foodAversions ?? '').toLowerCase();
    const bt = (a.bariatricIntolerances ?? []).join(' ').toLowerCase();

    return FOOD_CATALOG.filter(f => {
        if (al.includes('lactose') && ['Queijos e Pastas','Leites e Iogurtes'].includes(f.sc)) return false;
        if (al.includes('glúten')  && f.sc === 'Pães e Massas') return false;
        if (al.includes('lactose') && f.n.toLowerCase().includes('whey')) return false;
        if (bt.includes('gordura') && f.f > 20) return false;
        if (bt.includes('açúcar')  && f.c > 30 && f.p < 10) return false;
        if (bt.includes('lactose') && ['Queijos e Pastas','Leites e Iogurtes'].includes(f.sc)) return false;
        const avWords = av.split(/[,\s]+/).filter(w => w.length > 2);
        if (avWords.some(w => f.n.toLowerCase().includes(w))) return false;
        return true;
    })
    .map(f => `${f.id}|${f.n}|k${f.k}|P${f.p}|C${f.c}|G${f.f}|${f.sc}`)
    .join('\n');
}

// ─── CONTEXTO CLÍNICO ─────────────────────────────────────────────────────────
function buildClinicalContext(a: Anamnese): string {
    const lines: string[] = [];
    if (a.bariatric) {
        const early = ['Menos de 6 meses','6 meses a 1 ano'].includes(a.bariatricTime ?? '');
        lines.push(`🔴 BARIÁTRICO (${a.bariatricType}, ${a.bariatricTime}) → PROT mín ${early?80:90}g · vol máx ${early?150:200}ml/refeição · SEM líquido junto · SEM açúcar concentrado`);
        if ((a.bariatricIntolerances??[]).length) lines.push(`   Intolerâncias: ${a.bariatricIntolerances!.join(', ')}`);
    }
    const cond = a.healthConditions ?? [];
    if (cond.some(c => ['Diabetes Tipo 2','Pré-diabetes','Resistência à Insulina'].includes(c)))
        lines.push('🟡 DM2/RI → carbos complexos, sem fruta isolada, distribuição uniforme de carbo');
    if (cond.some(c => c.includes('Hipotireoidismo')))
        lines.push('🟡 HIPOTIREOIDISMO → meta -10% kcal, castanha do pará 1-2 unid/dia');
    if (cond.includes('SOP'))
        lines.push('🟡 SOP → baixo IG, gordura boa em cada refeição, proteína em cada refeição');
    if (cond.includes('Hipertensão'))
        lines.push('🟡 HIPERTENSÃO → sem embutidos/ultraprocessados com sódio elevado');
    const dig = a.digestiveIssues ?? [];
    if (dig.some(d => ['Gastrite','Refluxo / DRGE'].includes(d)))
        lines.push('🔵 GASTRITE/REFLUXO → sem café em jejum, refeições menores, evite gordura no pré-treino');
    if (dig.some(d => d.includes('Intestino Preso')))
        lines.push('🔵 CONSTIPAÇÃO → mais fibras (aveia, chia, vegetais)');
    if (dig.some(d => d.includes('Intestino Solto')))
        lines.push('🔵 SII → fibras solúveis (aveia, cenoura, banana), evite lactose em excesso');
    if ((a.stressLevel ?? 0) >= 4 || a.stressEating)
        lines.push('⚡ STRESS → 1 doce controlado no jantar (chocolate 70% ou paçoca)');
    if (a.nightBinge && !['never','rarely'].includes(a.nightBinge))
        lines.push('🌙 COMPULSÃO NOTURNA → ceia obrigatória: proteína + gordura (cottage + pasta amendoim)');
    const pms = a.pmsSymptoms ?? [];
    if (pms.includes('Compulsão Alimentar Forte') || pms.includes('Vontade de Doce'))
        lines.push('🩸 TPM → +20g carbo fase pré-menstrual, 1 doce planejado no plano');
    if (a.dietHated?.trim())  lines.push(`❌ EVITAR → ${a.dietHated}`);
    if (a.dietWorked?.trim()) lines.push(`✅ PRIORIZAR → ${a.dietWorked}`);
    if (a.biggestChallenge)   lines.push(`🎯 DESAFIO → "${a.biggestChallenge}"`);
    if (a.extraNotes?.trim()) lines.push(`📝 NOTA → ${a.extraNotes}`);
    return lines.length ? `\n━━━ CONTEXTO CLÍNICO (PRIORITÁRIO) ━━━\n${lines.join('\n')}` : '';
}

// ─── PROMPT ───────────────────────────────────────────────────────────────────
function buildPrompt(
    a: Anamnese,
    macros: MacrosOverride,
    dayType: string,
    catalog: string,
    schedule: MealSlot[]
): string {
    const scheduleStr = formatScheduleForPrompt(schedule, a.trainTime ?? '??:??', dayType);
    const numMeals    = schedule.length;
    const clinico     = buildClinicalContext(a);

    const orcCtx =
        a.budget === 'econômico'     ? 'ECONÔMICO → frango, ovos, atum, aveia, batata doce. Evite salmão, whey isolado.' :
        a.budget === 'sem restrição' ? 'SEM RESTRIÇÃO → pode incluir salmão, whey isolado, barrinhas premium.' : '';

    const dayLabels: Record<string,string> = {
        TREINO:        'Treino de Força',
        TREINO_CARDIO: 'Treino + Cardio (dupla sessão — MAIOR gasto do dia)',
        CARDIO:        'Dia de Cardio',
        DESCANSO:      'Dia de Descanso',
    };

    return `Você é o Nutricionista Especialista do Coach Paulo Adriano (PA TEAM ELITE).

━━━ REGRAS ABSOLUTAS ━━━
1. USE APENAS alimentos do CATÁLOGO. NUNCA invente alimentos.
2. "food_id" e "food_name" copiados EXATAMENTE do catálogo (antes do "|").
3. USE EXATAMENTE os ${numMeals} horários e nomes da AGENDA abaixo — não mude.
4. SUBSTITUTOS OBRIGATÓRIOS em Proteínas Gerais, Carbos Base, Pães e Massas e Cereais:
   - Cada grupo DEVE ter 1 alimento BASE + 2 SUBSTITUTOS da MESMA subcategoria
   - Mesmo "groupId" para base e substitutos
   - Quantidades dos substitutos já equivalentes caloricamente ao base
5. Em Vegetais, Bebidas, Gorduras: 1 base sem substitutos é suficiente.
6. Bata EXATAMENTE ${macros.kcal} kcal ±80. PROT ≥ ${macros.prot}g. CARBO ~${macros.carb}g.
7. Distribua kcal proporcionalmente: refeições com ↑CARBO recebem mais carbo, com ↓CARBO menos.
8. Notas motivadoras e práticas em cada refeição, mencionando o porquê quando relevante.
9. Aplique TODO o contexto clínico — é PRIORITÁRIO.
${clinico}

━━━ DIA: ${(dayLabels[dayType] ?? dayType).toUpperCase()} ━━━

━━━ AGENDA OBRIGATÓRIA ━━━
${scheduleStr}

━━━ PERFIL ━━━
Objetivo: ${a.objetivo} | Peso: ${a.peso}kg | Altura: ${a.altura}cm
Alergias: ${a.allergies ?? 'Nenhuma'} | Aversões: ${a.foodAversions ?? 'Nenhuma'}
Preferências: ${a.foodPreferences ?? 'Não informado'}
Suplementos: ${a.supplements ?? 'Nenhum'}
${orcCtx}
Água atual: ${a.waterIntake ?? 'não informado'}

━━━ METAS DO DIA ━━━
KCAL: ${macros.kcal} | PROT: ${macros.prot}g | CARBO: ${macros.carb}g | GORD: ${macros.fat}g

━━━ CATÁLOGO (id|nome|kcal/100g|P|C|G|subcategoria) ━━━
${catalog}

━━━ FORMATO DE SAÍDA (JSON apenas, sem markdown) ━━━
{
  "meals": [
    {
      "name": "Nome exato da agenda",
      "time": "HH:MM exato da agenda",
      "notes": "Instrução prática e motivadora",
      "items": [
        { "food_id": "id-exato", "food_name": "nome-exato", "amount": "150", "unit": "g", "groupId": "grp1" },
        { "food_id": "id-exato", "food_name": "nome-exato", "amount": "130", "unit": "g", "groupId": "grp1" },
        { "food_id": "id-exato", "food_name": "nome-exato", "amount": "120", "unit": "g", "groupId": "grp1" }
      ]
    }
  ]
}`;
}

// ─── ENRIQUECER ───────────────────────────────────────────────────────────────
function catOf(sc: string): string {
    const m: Record<string,string> = {
        'Proteínas Gerais':'Carnes e Proteínas','Queijos e Pastas':'Frios e Laticínios',
        'Leites e Iogurtes':'Frios e Laticínios','Frios e Embutidos':'Frios e Laticínios',
        'Carbos Base':'Carboidratos','Pães e Massas':'Carboidratos',
        'Cereais e Fibras':'Carboidratos','Leguminosas e Grãos':'Carboidratos',
        'Doces e Açúcares':'Carboidratos','Frutas':'Frutas',
        'Gorduras e Oleaginosas':'Gorduras e Oleaginosas',
        'Vegetais e Legumes':'Vegetais e Legumes',
        'Suplementos em Pó':'Suplementos','Creatina Isolada':'Suplementos',
        'Prontos p/ Consumo':'Suplementos','Bebidas Zero':'Bebidas',
    };
    return m[sc] ?? sc;
}

function enrich(rawMeals: any[], dayType: string): any[] {
    const map = new Map(FOOD_CATALOG.map(f => [f.id, f]));
    return rawMeals.map((meal: any) => ({
        id:      crypto.randomUUID(),
        name:    meal.name, time: meal.time, notes: meal.notes ?? '', dayType,
        items: (meal.items ?? []).map((item: any) => {
            const db = map.get(item.food_id);
            return {
                uniqueId:        crypto.randomUUID(),
                groupId:         item.groupId ?? crypto.randomUUID(),
                id:              db?.id    ?? item.food_id,
                name:            db?.n     ?? item.food_name,
                category:        db ? catOf(db.sc) : '',
                subcategory:     db?.sc   ?? '',
                calories_per_100:db?.k    ?? 0,
                p:               db?.p    ?? 0,
                c:               db?.c    ?? 0,
                f:               db?.f    ?? 0,
                base_unit:       'g',
                amount:          item.amount?.toString() ?? '100',
                unit:            item.unit ?? 'g',
            };
        }),
    }));
}

// ─── PROVIDERS ────────────────────────────────────────────────────────────────
async function callOpenAI(prompt: string, model: string): Promise<string> {
    const res = await openai.chat.completions.create({
        model, response_format: { type: 'json_object' }, temperature: 0.3,
        messages: [{ role:'system', content:prompt }, { role:'user', content:'Gere o plano agora.' }],
    });
    return res.choices[0].message.content ?? '{}';
}

async function callAnthropic(prompt: string): Promise<string> {
    const res = await anthropic.messages.create({
        model:'claude-sonnet-4-5', max_tokens:4096, temperature:0.3,
        messages:[{ role:'user', content:`${prompt}\n\nGere o plano agora. Retorne APENAS o JSON.` }],
    });
    return ((res.content.find(b => b.type === 'text') as any)?.text ?? '{}')
        .replace(/```json\n?|\n?```/g, '').trim();
}

async function callGoogle(prompt: string): Promise<string> {
    const model = googleAI.getGenerativeModel({
        model: 'gemini-2.5-pro-preview-06-05',
        generationConfig: { responseMimeType:'application/json', temperature:0.3 } as any,
    });
    return (await model.generateContent(`${prompt}\n\nGere o plano agora.`)).response.text();
}

// ─── HANDLER ──────────────────────────────────────────────────────────────────
export async function POST(req: Request) {
    try {
        const {
            anamnese, dayType = 'TREINO', provider = 'anthropic',
            birthDate, gender, macrosOverride,
        } = await req.json();

        if (!anamnese) return NextResponse.json({ error:'Anamnese não encontrada.' }, { status:400 });

        // Macros: usa override do frontend ou fallback
        const macros: MacrosOverride = macrosOverride ?? (() => {
            const peso = anamnese.peso ?? 70;
            const isH  = (anamnese.gender ?? gender ?? '').toLowerCase().includes('masc');
            const prot = Math.round(peso * (isH ? 2.2 : 1.4));
            const fat  = Math.round(peso * 1.0);
            const kcal = Math.round(2000 + (isH ? 200 : 0));
            const carb = Math.max(20, Math.round((kcal - prot*4 - fat*9) / 4));
            return { kcal, prot, carb, fat };
        })();

        // Calcular agenda de refeições com horários reais
        const schedule = buildMealSchedule(anamnese, dayType);
        const catalog  = filteredCatalog(anamnese);
        const prompt   = buildPrompt(anamnese, macros, dayType, catalog, schedule);

        let raw: string; let modelUsed: string;
        switch (provider as Provider) {
            case 'anthropic':   raw = await callAnthropic(prompt);            modelUsed = 'claude-sonnet-4-5'; break;
            case 'google':      raw = await callGoogle(prompt);               modelUsed = 'gemini-2.5-pro';    break;
            case 'openai-mini': raw = await callOpenAI(prompt,'gpt-4o-mini'); modelUsed = 'gpt-4o-mini';       break;
            default:            raw = await callOpenAI(prompt,'gpt-4o');      modelUsed = 'gpt-4o';
        }

        const meals = enrich((JSON.parse(raw).meals ?? []), dayType);
        return NextResponse.json({ meals, meta:{ dayType, provider, modelUsed, schedule, ...macros } }, { status:200 });

    } catch (err: any) {
        console.error('[generate-diet]', err?.message ?? err);
        return NextResponse.json({ error:'Erro ao gerar dieta.' }, { status:500 });
    }
}