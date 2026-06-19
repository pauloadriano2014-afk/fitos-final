// app/api/admin/generate-diet/route.ts — VERSÃO 6.8
// Melhorias vs v6.7:
//   - FIX MACROS: Remoção da tag [↑PROT] e do termo "proteína máxima" que faziam a IA estourar a meta.
//   - MATEMÁTICA GUIADA: A IA agora recebe a média exata de gramas de proteína permitida por refeição.
//   - CULINÁRIA: Ajustes finos nos termos para evitar "overdose" de carnes em refeições únicas.

import { NextResponse } from 'next/server';
import OpenAI       from 'openai';
import Anthropic    from '@anthropic-ai/sdk';
import { GoogleGenerativeAI } from '@google/generative-ai';

export const dynamic     = 'force-dynamic';
export const maxDuration = 90;

const openai    = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const googleAI  = new GoogleGenerativeAI(process.env.GEMINI_API_KEY as string);

type Provider = 'openai' | 'openai-mini' | 'anthropic' | 'google';

interface MacrosOverride { kcal: number; prot: number; carb: number; fat: number; }

interface MealSlot {
    time:         string;
    name:         string;
    role:         string;
    portable:     boolean;
    note:         string;
    carbPriority: 'high' | 'medium' | 'low';
    protPriority: 'high' | 'medium' | 'low';
}

interface Anamnese {
    objetivo?: string; peso?: number; altura?: number; frequencia?: number;
    gender?: string; age?: number;
    trainFasted?: boolean;
    preworkoutStrategy?: string;
    trainTime?: string; wakeUpTime?: string; sleepTime?: string;
    freeDays?: string[]; freeWakeUpTime?: string; freeSleepTime?: string; freeTrainTime?: string;
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
    const total = ((mins % 1440) + 1440) % 1440;
    const h = Math.floor(total / 60).toString().padStart(2, '0');
    const m = (total % 60).toString().padStart(2, '0');
    return `${h}:${m}`;
}
function addMinutes(t: string, delta: number): string {
    return minutesToTime(timeToMinutes(t) + delta);
}
function isInRange(t: string, start: string, end: string): boolean {
    const tm = timeToMinutes(t), sm = timeToMinutes(start), em = timeToMinutes(end);
    return tm >= sm && tm <= em;
}
function roundToQuarter(t: string): string {
    return minutesToTime(Math.round(timeToMinutes(t) / 15) * 15);
}

// ─── CONSTRUTOR DE AGENDA ─────────────────────────────────────────────────────
function buildMealSchedule(a: Anamnese, dayType: string): MealSlot[] {
    const isFolga = (dayType === 'DESCANSO' || dayType === 'CARDIO') &&
                    a.freeDays && a.freeDays.length > 0 && !a.freeDays.includes('Nenhum');

    const wake  = isFolga && a.freeWakeUpTime ? a.freeWakeUpTime : (a.wakeUpTime  || '07:00');
    const sleep = isFolga && a.freeSleepTime  ? a.freeSleepTime  : (a.sleepTime   || '23:00');
    const train = isFolga && a.freeTrainTime  ? a.freeTrainTime  : (a.trainTime   || '18:00');

    const workStart = a.workTimeStart || (a.workTime ? a.workTime.split(' às ')[0] : '09:00');
    const workEnd   = a.workTimeEnd   || (a.workTime ? a.workTime.split(' às ')[1] : '18:00');
    const numMeals  = Math.min(8, Math.max(2, Number(a.mealsPerDay) || 5));
    const isBariatric = !!a.bariatric;
    const hasGastrite = (a.digestiveIssues ?? []).some(d => ['Gastrite','Refluxo / DRGE'].includes(d));
    const strategy    = a.preworkoutStrategy || 'shake';

    const wakeMin  = timeToMinutes(wake);
    const sleepMin = timeToMinutes(sleep);
    const trainMin = timeToMinutes(train);
    const windowMin = sleepMin > wakeMin ? sleepMin - wakeMin : (1440 - wakeMin + sleepMin);

    // ── DESCANSO ──────────────────────────────────────────────────────────────
    if (dayType === 'DESCANSO') {
        const interval = Math.floor(windowMin / (numMeals - 1));
        const mealDefs = [
            { name:'Café da Manhã',   role:'main',   carbPriority:'medium' as const, protPriority:'medium' as const },
            { name:'Lanche da Manhã', role:'snack',  carbPriority:'low'    as const, protPriority:'medium' as const },
            { name:'Almoço',          role:'main',   carbPriority:'medium' as const, protPriority:'high'   as const },
            { name:'Lanche da Tarde', role:'snack',  carbPriority:'low'    as const, protPriority:'medium' as const },
            { name:'Jantar',          role:'dinner', carbPriority:'low'    as const, protPriority:'high'   as const },
            { name:'Ceia',            role:'supper', carbPriority:'low'    as const, protPriority:'medium' as const },
        ];
        return mealDefs.slice(0, numMeals).map((def, i) => {
            const time     = roundToQuarter(minutesToTime(wakeMin + interval * i));
            const portable = isInRange(time, workStart, workEnd);
            return {
                time, name: def.name, role: def.role, portable,
                note: portable ? 'Refeição durante horário de trabalho — opção prática e portátil.'
                    : (i === 0 && hasGastrite ? 'Não comece com café puro — inclua alimento sólido primeiro.' : ''),
                carbPriority: def.carbPriority,
                protPriority: def.protPriority,
            };
        });
    }

    // ── DIAS COM TREINO ───────────────────────────────────────────────────────
    const minsTillTrain = ((trainMin - wakeMin) + 1440) % 1440;
    const hasTimeForPre = minsTillTrain >= 60 && !a.trainFasted;
    const required: MealSlot[] = [];

    if (!a.trainFasted) {
        if (hasTimeForPre) {
            const preTime  = roundToQuarter(minutesToTime(trainMin - 70));
            const portable = isInRange(preTime, workStart, workEnd);
            required.push({
                time: preTime, name: 'Pré-Treino', role: 'preworkout', portable,
                note: portable
                    ? 'Pré-treino no trabalho — banana + whey ou tapioca + frango fatiado.'
                    : 'Pré-treino: carboidrato de rápida absorção + proteína leve.',
                carbPriority: 'high', protPriority: 'medium',
            });
        } else if (strategy === 'ceia_pretreino') {
            const ceiaTime = roundToQuarter(minutesToTime(sleepMin - 60));
            required.push({
                time: ceiaTime, name: 'Ceia Pré-Treino', role: 'preworkout', portable: false,
                note: `Acorda ${minsTillTrain}min antes do treino — ceia na noite anterior garante energia.`,
                carbPriority: 'high', protPriority: 'medium',
            });
        } else {
            const shakeTime = roundToQuarter(minutesToTime(trainMin - 20));
            required.push({
                time: shakeTime, name: 'Pré-Treino Rápido', role: 'preworkout', portable: false,
                note: `Acorda ${minsTillTrain}min antes — shake rápido: banana + whey.`,
                carbPriority: 'high', protPriority: 'low',
            });
        }
        const posTime  = roundToQuarter(minutesToTime(trainMin + 45));
        const portable = isInRange(posTime, workStart, workEnd);
        required.push({
            time: posTime, name: 'Pós-Treino', role: 'postworkout', portable,
            note: portable ? 'Pós-treino no trabalho — whey + fruta ou iogurte + granola.'
                : 'Pós-treino: focar na recuperação. Frango/Peixe/Whey com carbo.',
            carbPriority: 'high', protPriority: 'high',
        });
    } else {
        required.push({
            time: wake, name: 'Quebra do Jejum (Pós-Treino)', role: 'postworkout', portable: false,
            note: 'Treina em jejum — primeira refeição do dia após o treino. Carbo + proteína.',
            carbPriority: 'high', protPriority: 'high',
        });
    }

    const remainingSlots = numMeals - required.length;
    const usedTimes = new Set(required.map(r => r.time));

    const mainMealDefs = [
        { name:'Café da Manhã',   role:'main',   carbPriority:'medium' as const, protPriority:'medium' as const, idealOffset:0    },
        { name:'Lanche da Manhã', role:'snack',  carbPriority:'medium' as const, protPriority:'low'    as const, idealOffset:0.2  },
        { name:'Almoço',          role:'main',   carbPriority:'high'   as const, protPriority:'high'   as const, idealOffset:0.4  },
        { name:'Lanche da Tarde', role:'snack',  carbPriority:'low'    as const, protPriority:'medium' as const, idealOffset:0.6  },
        { name:'Jantar',          role:'dinner', carbPriority:'low'    as const, protPriority:'high'   as const, idealOffset:0.8  },
        { name:'Ceia',            role:'supper', carbPriority:'low'    as const, protPriority:'medium' as const, idealOffset:0.95 },
    ];

    const mappedDefs = mainMealDefs.map(def => {
        const idealMin = wakeMin + Math.round(windowMin * def.idealOffset);
        let minDistance = Infinity;
        required.forEach(r => {
            let dist = Math.abs(timeToMinutes(r.time) - idealMin);
            if (dist > 720) dist = 1440 - dist; 
            if (dist < minDistance) minDistance = dist;
        });
        return { def, idealMin, minDistance };
    });

    mappedDefs.sort((a, b) => b.minDistance - a.minDistance);
    const selectedDefs = mappedDefs.slice(0, remainingSlots).map(m => m.def);

    selectedDefs.sort((a, b) => a.idealOffset - b.idealOffset);

    selectedDefs.forEach(def => {
        let idealMin = wakeMin + Math.round(windowMin * def.idealOffset);
        let attempts = 0;
        while (attempts < 20) {
            const t = roundToQuarter(minutesToTime(idealMin));
            const conflict = [...usedTimes].some(ut => {
                let d = Math.abs(timeToMinutes(ut) - timeToMinutes(t));
                return d < 60 || (1440 - d) < 60; 
            });
            if (!conflict) {
                usedTimes.add(t);
                const portable = isInRange(t, workStart, workEnd);
                required.push({
                    time: t, name: def.name, role: def.role, portable,
                    note: portable ? 'Refeição durante horário de trabalho — opção portátil.'
                        : (def.role === 'main' && hasGastrite && def.idealOffset === 0
                            ? 'Não comece o dia com café puro — inclua alimento sólido antes.' : ''),
                    carbPriority: def.carbPriority,
                    protPriority: def.protPriority,
                });
                break;
            }
            idealMin += 15; attempts++;
        }
    });

    required.sort((a, b) => timeToMinutes(a.time) - timeToMinutes(b.time));

    if (isBariatric && required.length < 6) {
        const extra = 6 - required.length;
        for (let i = 0; i < extra; i++) {
            const insertAfter = required[Math.floor(required.length / 2) + i];
            const newTime = roundToQuarter(addMinutes(insertAfter.time, 120));
            if (!usedTimes.has(newTime)) {
                usedTimes.add(newTime);
                required.push({
                    time: newTime, name: `Lanche Extra ${i + 1}`, role: 'snack', portable: false,
                    note: 'Bariátrico: volume máx ~150ml, rico em proteína.',
                    carbPriority: 'low', protPriority: 'high',
                });
            }
        }
        required.sort((a, b) => timeToMinutes(a.time) - timeToMinutes(b.time));
    }

    return required;
}

// ─── FORMATAR AGENDA PARA PROMPT ─────────────────────────────────────────────
function formatScheduleForPrompt(slots: MealSlot[], trainTime: string, dayType: string): string {
    const lines = slots.map((s, i) => {
        const portableTag = s.portable ? ' [PORTÁTIL]' : '';
        const noteStr     = s.note     ? ` | ${s.note}` : '';
        
        // 🔴 FIX CRÍTICO: Removido a tag [↑PROT] para evitar que a IA super-estime as carnes
        const carbTag     = s.carbPriority === 'high' ? '↑CARBO' : s.carbPriority === 'low' ? '↓CARBO' : '';
        const tags        = [carbTag].filter(Boolean).join(' ');
        const tagStr      = tags ? ` [${tags}]` : '';

        return `${i + 1}. ${s.time} — ${s.name}${portableTag}${tagStr}${noteStr}`;
    });
    return `${dayType !== 'DESCANSO' ? `\n⏱️ Treino: ${trainTime}` : ''}\n${lines.join('\n')}`;
}

// ─── CATÁLOGO ─────────────────────────────────────────────────────────────────
const FOOD_CATALOG = [
    { id:"7fa55081", n:"Frango Grelhado",             sc:"Proteínas Gerais", k:165, p:31, c:0,  f:3  },
    { id:"b2c9bdb7", n:"Frango Desfiado (Cozido)",      sc:"Proteínas Gerais", k:165, p:31, c:0,  f:3  },
    { id:"c5f3b7e6", n:"Sobrecoxa de Frango (Sem pele)",sc:"Proteínas Gerais", k:210, p:28, c:0,  f:10 },
    { id:"ae77cc5e", n:"Moela de Frango (Cozida)",      sc:"Proteínas Gerais", k:153, p:30, c:0,  f:3  },
    { id:"96d11aa4", n:"Carne Moída (Patinho)",         sc:"Proteínas Gerais", k:219, p:35, c:0,  f:7  },
    { id:"76ba67e7", n:"Patinho (Cozido / Iscas)",      sc:"Proteínas Gerais", k:219, p:35, c:0,  f:7  },
    { id:"f46f2036", n:"Alcatra Grelhada",              sc:"Proteínas Gerais", k:240, p:31, c:0,  f:11 },
    { id:"0b2de140", n:"Carne de Panela (Cozida)",      sc:"Proteínas Gerais", k:220, p:30, c:0,  f:10 },
    { id:"23f6b995", n:"Carne Seca Desfiada",           sc:"Proteínas Gerais", k:280, p:40, c:0,  f:12 },
    { id:"928041e8", n:"Tilápia Grelhada",              sc:"Proteínas Gerais", k:128, p:26, c:0,  f:2  },
    { id:"bdeb253d", n:"Salmão Grelhado",               sc:"Proteínas Gerais", k:200, p:25, c:0,  f:10 },
    { id:"94776886", n:"Pescada Branca Grelhada",       sc:"Proteínas Gerais", k:110, p:26, c:0,  f:1  },
    { id:"de802ecf", n:"Atum (Grelhado ou Assado)",     sc:"Proteínas Gerais", k:130, p:29, c:0,  f:1  },
    { id:"8fad8abc", n:"Sardinha (Enlatada em Água)",   sc:"Proteínas Gerais", k:110, p:24, c:0,  f:2  },
    { id:"3cee1649", n:"Camarão Grelhado",              sc:"Proteínas Gerais", k:100, p:24, c:0,  f:1  },
    { id:"d965922a", n:"Peito de Peru Grelhado",        sc:"Proteínas Gerais", k:150, p:29, c:0,  f:3  },
    { id:"67b01945", n:"Ovos Inteiros",                 sc:"Proteínas Gerais", k:143, p:13, c:1,  f:10 },
    { id:"fffd8a66", n:"Clara de Ovo",                  sc:"Proteínas Gerais", k:52,  p:11, c:1,  f:0  },
    { id:"5a27992c", n:"Tofu (Queijo de Soja)",         sc:"Proteínas Gerais", k:76,  p:8,  c:2,  f:4  },
    { id:"f1826a2c", n:"Proteína de Soja (PTS Crua)",   sc:"Proteínas Gerais", k:320, p:50, c:30, f:1  },
    { id:"007db8e3", n:"Queijo Cottage Tradicional",    sc:"Queijos e Pastas",  k:98,  p:11, c:3,  f:4  },
    { id:"5b756560", n:"Queijo Ricota Fresca",          sc:"Queijos e Pastas",  k:140, p:11, c:3,  f:8  },
    { id:"5173b746", n:"Requeijão Light",               sc:"Queijos e Pastas",  k:180, p:10, c:2,  f:14 },
    { id:"37933f71", n:"Queijo Mussarela Light",        sc:"Queijos e Pastas",  k:260, p:24, c:2,  f:16 },
    { id:"c4ef1a39", n:"Queijo Minas Frescal Light",    sc:"Queijos e Pastas",  k:160, p:16, c:3,  f:9  },
    { id:"e7bdae09", n:"Iogurte Natural Desnatado",     sc:"Leites e Iogurtes", k:40,  p:4,  c:5,  f:0  },
    { id:"3a90b75d", n:"Iogurte Grego Zero/Light",      sc:"Leites e Iogurtes", k:50,  p:6,  c:5,  f:0  },
    { id:"f86484b3", n:"Leite Desnatado",               sc:"Leites e Iogurtes", k:35,  p:3,  c:5,  f:0  },
    { id:"b0401676", n:"Peito de Peru (Fatiado)",       sc:"Frios e Embutidos", k:110, p:21, c:1,  f:2  },
    { id:"113ea8da", n:"Presunto Magro",                sc:"Frios e Embutidos", k:105, p:16, c:2,  f:3  },
    { id:"fa4ba3b8", n:"Arroz Branco",                  sc:"Carbos Base", k:130, p:2,  c:28, f:0  },
    { id:"eccd514c", n:"Arroz Integral",                sc:"Carbos Base", k:111, p:2,  c:23, f:1  },
    { id:"7ff6a7f4", n:"Batata Doce Cozida",            sc:"Carbos Base", k:86,  p:1,  c:20, f:0  },
    { id:"edc8a4fd", n:"Batata Inglesa Cozida",         sc:"Carbos Base", k:86,  p:1,  c:19, f:0  },
    { id:"c7d2240a", n:"Mandioca Cozida",               sc:"Carbos Base", k:114, p:1,  c:26, f:0  },
    { id:"f632556e", n:"Mandioquinha / Batata Baroa",   sc:"Carbos Base", k:100, p:1,  c:20, f:0  },
    { id:"5e4832bf", n:"Inhame (Cozido)",               sc:"Carbos Base", k:118, p:1,  c:28, f:0  },
    { id:"8bb16ab4", n:"Macarrão Cozido",               sc:"Carbos Base", k:130, p:4,  c:28, f:0  },
    { id:"5c9cde6a", n:"Macarrão Integral (Cozido)",    sc:"Carbos Base", k:124, p:5,  c:26, f:1  },
    { id:"4b6eb78f", n:"Pão de Forma Tradicional",      sc:"Pães e Massas", k:260, p:8,  c:50, f:2  },
    { id:"a416e4fe", n:"Pão Francês",                   sc:"Pães e Massas", k:300, p:9,  c:58, f:3  },
    { id:"08301bb2", n:"Pão Integral",                  sc:"Pães e Massas", k:250, p:10, c:46, f:3  },
    { id:"1f1f1fe",  n:"Tapioca (Goma)",                sc:"Pães e Massas", k:330, p:0,  c:81, f:0  },
    { id:"7e243728", n:"Rap10",                         sc:"Pães e Massas", k:300, p:8,  c:52, f:5  },
    { id:"crepioca", n:"Massa de Crepioca",             sc:"Pães e Massas", k:330, p:0,  c:81, f:0  },
    { id:"bdb59103", n:"Aveia em Flocos",               sc:"Cereais e Fibras", k:380, p:13, c:60, f:8  },
    { id:"9d36b48b", n:"Cuscuz de Milho",               sc:"Cereais e Fibras", k:112, p:3,  c:25, f:0  },
    { id:"91473bf8", n:"Chia",                          sc:"Cereais e Fibras", k:486, p:16, c:40, f:30 },
    { id:"d6289c5c", n:"Farinha de Linhaça",            sc:"Cereais e Fibras", k:534, p:18, c:30, f:42 },
    { id:"1837aac1", n:"Granola Sem Açúcar",            sc:"Cereais e Fibras", k:380, p:10, c:60, f:10 },
    { id:"6fecb9d2", n:"Feijão Carioca Cozido",         sc:"Leguminosas e Grãos", k:76,  p:4,  c:13, f:0 },
    { id:"7b85d6df", n:"Feijão Preto Cozido",           sc:"Leguminosas e Grãos", k:91,  p:5,  c:14, f:0 },
    { id:"33e2a094", n:"Lentilha Cozida",               sc:"Leguminosas e Grãos", k:116, p:9,  c:20, f:0 },
    { id:"38432feb", n:"Grão de Bico Cozido",           sc:"Leguminosas e Grãos", k:164, p:8,  c:27, f:2 },
    { id:"0ce696b0", n:"Banana",     sc:"Frutas", k:89,  p:1, c:23, f:0 },
    { id:"c6135c45", n:"Maçã",       sc:"Frutas", k:52,  p:0, c:14, f:0 },
    { id:"28800928", n:"Mamão",      sc:"Frutas", k:43,  p:0, c:11, f:0 },
    { id:"d2405198", n:"Morango",    sc:"Frutas", k:32,  p:1, c:8,  f:0 },
    { id:"e1ba74a1", n:"Laranja",    sc:"Frutas", k:47,  p:1, c:12, f:0 },
    { id:"eeae57e2", n:"Kiwi",       sc:"Frutas", k:61,  p:1, c:15, f:0 },
    { id:"fa1e0345", n:"Melancia",   sc:"Frutas", k:30,  p:1, c:8,  f:0 },
    { id:"745c31e4", n:"Azeite de Oliva",    sc:"Gorduras e Oleaginosas", k:884, p:0,  c:0,  f:100 },
    { id:"9696c9b6", n:"Pasta de Amendoim",  sc:"Gorduras e Oleaginosas", k:588, p:25, c:20, f:50  },
    { id:"0c1231ef", n:"Castanha do Pará",   sc:"Gorduras e Oleaginosas", k:650, p:14, c:12, f:66  },
    { id:"200b4eb5", n:"Nozes",              sc:"Gorduras e Oleaginosas", k:650, p:15, c:14, f:65  },
    { id:"82a2525d", n:"Abacate",            sc:"Gorduras e Oleaginosas", k:160, p:2,  c:8,  f:14  },
    { id:"1813dae5", n:"Manteiga",           sc:"Gorduras e Oleaginosas", k:717, p:1,  c:1,  f:81  },
    { id:"32176cad", n:"Brócolis (Cozido)",  sc:"Vegetais e Legumes", k:25, p:2, c:4, f:0 },
    { id:"ed7041ed", n:"Couve-flor",         sc:"Vegetais e Legumes", k:25, p:2, c:4, f:0 },
    { id:"72a49b38", n:"Cenoura (Cozida)",   sc:"Vegetais e Legumes", k:35, p:1, c:8, f:0 },
    { id:"260caaae", n:"Alface (Qualquer tipo)", sc:"Vegetais e Legumes", k:14, p:1, c:2, f:0 },
    { id:"50f4acaa", n:"Tomate",             sc:"Vegetais e Legumes", k:18, p:1, c:3, f:0 },
    { id:"5ee331d2", n:"Rúcula",             sc:"Vegetais e Legumes", k:25, p:3, c:4, f:0 },
    { id:"3357f827", n:"Couve (Manteiga)",   sc:"Vegetais e Legumes", k:35, p:3, c:6, f:0 },
    { id:"15f10970", n:"Espinafre",          sc:"Vegetais e Legumes", k:23, p:3, c:4, f:0 },
    { id:"35d3ae09", n:"Abobrinha",          sc:"Vegetais e Legumes", k:17, p:1, c:3, f:0 },
    { id:"07ee0c78", n:"Abóbora Cabotiá",    sc:"Vegetais e Legumes", k:34, p:1, c:8, f:0 },
    { id:"ba4cb07b", n:"Beterraba",          sc:"Vegetais e Legumes", k:43, p:2, c:10,f:0 },
    { id:"5e622521", n:"Whey Protein Concentrado", sc:"Suplementos em Pó", k:400, p:75, c:10, f:5  },
    { id:"89342d9f", n:"Whey Protein Isolado",     sc:"Suplementos em Pó", k:370, p:90, c:2,  f:1  },
    { id:"ffb77725", n:"Albumina",                 sc:"Suplementos em Pó", k:360, p:80, c:5,  f:0  },
    { id:"4aada106", n:"Caseína",                  sc:"Suplementos em Pó", k:360, p:80, c:5,  f:1  },
    { id:"893d83d0", n:"Creatina",                 sc:"Creatina Isolada",  k:0,   p:0,  c:0,  f:0  },
    { id:"40d69ef4", n:"YoPRO 15g (Bebida Láctea)",sc:"Prontos p/ Consumo",k:45,  p:6,  c:5,  f:0  },
    { id:"7b22ccb6", n:"YoPRO 25g (Bebida Láctea)",sc:"Prontos p/ Consumo",k:62,  p:10, c:5,  f:0  },
    { id:"34c424a4", n:"Barra de Proteína Bold",   sc:"Prontos p/ Consumo",k:350, p:33, c:33, f:15 },
    { id:"2cadb09b", n:"Paçoca (Rolha)",            sc:"Doces e Açúcares",  k:490, p:15, c:60, f:25 },
    { id:"9b1aebc9", n:"Chocolate Meio Amargo (70%)",sc:"Doces e Açúcares", k:540, p:6,  c:45, f:35 },
    { id:"638a0cc5", n:"Geleia de Frutas (100% Fruta)",sc:"Doces e Açúcares",k:150,p:0,  c:10, f:0  },
    { id:"08a0c3cb", n:"Café sem Açúcar",   sc:"Bebidas Zero", k:0, p:0, c:0, f:0 },
    { id:"19aa03fc", n:"Chá sem Açúcar",    sc:"Bebidas Zero", k:0, p:0, c:0, f:0 },
    { id:"8e3e9898", n:"Suco Clight/Zero",  sc:"Bebidas Zero", k:0, p:0, c:0, f:0 },
    { id:"1016e944", n:"Gelatina Zero",     sc:"Bebidas Zero", k:5, p:1, c:0, f:0 },
    { id:"752dbe21", n:"Refrigerante Zero", sc:"Bebidas Zero", k:0, p:0, c:0, f:0 },
];

// ─── FILTRAR CATÁLOGO ─────────────────────────────────────────────────────────
function filteredCatalog(a: Anamnese): string {
    const al = (a.allergies ?? '').toLowerCase();
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
    }).map(f => `${f.id}|${f.n}|k${f.k}|P${f.p}|C${f.c}|G${f.f}|${f.sc}`).join('\n');
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
        lines.push('🟡 HIPERTENSÃO → sem embutidos com sódio elevado');
    const dig = a.digestiveIssues ?? [];
    if (dig.some(d => ['Gastrite','Refluxo / DRGE'].includes(d)))
        lines.push('🔵 GASTRITE/REFLUXO → sem café em jejum, refeições menores, pouca gordura no pré-treino');
    if (dig.some(d => d.includes('Intestino Preso')))
        lines.push('🔵 CONSTIPAÇÃO → mais fibras: aveia, chia, vegetais em toda refeição principal');
    if (dig.some(d => d.includes('Intestino Solto')))
        lines.push('🔵 SII → fibras solúveis: aveia, cenoura, banana. Evite lactose em excesso');
    if ((a.stressLevel ?? 0) >= 4 || a.stressEating)
        lines.push('⚡ STRESS ALIMENTAR → 1 doce controlado no jantar (chocolate 70% ou paçoca)');
    if (a.nightBinge && !['never','rarely'].includes(a.nightBinge))
        lines.push('🌙 COMPULSÃO NOTURNA → ceia OBRIGATÓRIA: proteína + gordura boa (cottage + pasta amendoim)');
    const pms = a.pmsSymptoms ?? [];
    if (pms.includes('Compulsão Alimentar Forte') || pms.includes('Vontade de Doce'))
        lines.push('🩸 TPM → +20g carbo fase pré-menstrual, 1 doce planejado');
    if (a.dietHated?.trim())  lines.push(`❌ EVITAR SEMPRE → ${a.dietHated}`);
    if (a.dietWorked?.trim()) lines.push(`✅ PRIORIZAR → ${a.dietWorked}`);
    if (a.biggestChallenge)   lines.push(`🎯 MAIOR DESAFIO → "${a.biggestChallenge}"`);
    if (a.extraNotes?.trim()) lines.push(`📝 OBSERVAÇÃO DO COACH → ${a.extraNotes}`);
    return lines.length ? `\n━━━ CONTEXTO CLÍNICO — PRIORIDADE MÁXIMA ━━━\n${lines.join('\n')}` : '';
}

// ─── REGRAS CULINÁRIAS BRASILEIRAS POR SLOT ───────────────────────────────────
function buildMealRules(slots: MealSlot[]): string {
    const rules: string[] = [];
    slots.forEach(s => {
        switch (s.role) {
            case 'main': 
                if (timeToMinutes(s.time) < timeToMinutes('11:00')) {
                    rules.push(`• ${s.name} (${s.time}): CAFÉ DA MANHÃ → ovos/clara/queijo/iogurte/pão/tapioca/aveia/fruta. NUNCA arroz, feijão, macarrão, carne bovina inteira.`);
                } else {
                    rules.push(`• ${s.name} (${s.time}): ALMOÇO → arroz/batata/mandioca + porção moderada de carne/frango/peixe + vegetal. NÃO use pão, tapioca, aveia.`);
                }
                break;
            case 'snack':
                rules.push(`• ${s.name} (${s.time}): LANCHE → opção leve: fruta + laticínio ou proteína leve. NÃO coloque arroz ou prato quente.`);
                break;
            case 'preworkout':
                rules.push(`• ${s.name} (${s.time}): PRÉ-TREINO → carbo rápido + proteína leve. NÃO gordura saturada, NÃO feijão.`);
                break;
            case 'postworkout':
                // 🔴 FIX: Avisando para NÃO exagerar na proteína aqui
                rules.push(`• ${s.name} (${s.time}): PÓS-TREINO → porção moderada de proteína + carbo rápido. Frango/peixe/whey + arroz/batata/fruta. NUNCA coloque "proteína máxima" para não estourar o limite diário.`);
                break;
            case 'dinner':
                // 🔴 FIX: Retirado o '↑PROT'
                rules.push(`• ${s.name} (${s.time}): JANTAR → refeição completa com ↓CARBO. Proteína + vegetal. NÃO pule esta refeição.`);
                break;
            case 'supper':
                rules.push(`• ${s.name} (${s.time}): CEIA → leve, fonte de proteína de lenta absorção: cottage, iogurte, caseína, ovo.`);
                break;
        }
    });
    return rules.join('\n');
}

// ─── PROMPT REESCRITO ─────────────────────────────────────────────────────────
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
    const mealRules   = buildMealRules(schedule);

    const isFolga = (dayType === 'DESCANSO' || dayType === 'CARDIO') &&
                    a.freeDays && a.freeDays.length > 0 && !a.freeDays.includes('Nenhum');

    const orcCtx =
        a.budget === 'econômico'     ? 'ORÇAMENTO ECONÔMICO → priorize frango, ovos, atum enlatado, aveia, batata doce, arroz. Evite salmão e whey isolado.' :
        a.budget === 'sem restrição' ? 'SEM RESTRIÇÃO DE ORÇAMENTO → pode usar salmão, whey isolado, barrinhas premium.' :
        'ORÇAMENTO MODERADO → frango, ovos, iogurte grego, whey concentrado, batata doce.';

    const dayLabels: Record<string,string> = {
        TREINO:        'TREINO DE FORÇA',
        TREINO_CARDIO: 'TREINO + CARDIO — dupla sessão, MAIOR gasto calórico do dia',
        CARDIO:        'CARDIO — aeróbico sem musculação',
        DESCANSO:      'DESCANSO — recuperação, sem treino',
    };

    // 🔴 FIX: Cálculo da média para engessar a IA matematicamente
    const avgProtPerMeal = Math.round(macros.prot / numMeals);

    return `Você é o Nutricionista Especialista do Coach Paulo Adriano (PA TEAM ELITE).
Sua função é montar um plano alimentar diário COMPLETO, PRÁTICO e CULTURALMENTE ADEQUADO para o contexto brasileiro.

━━━ REGRAS ABSOLUTAS — VIOLAÇÃO = RESPOSTA INVÁLIDA ━━━

REGRA 1 — CATÁLOGO: Use APENAS alimentos do CATÁLOGO abaixo. Nunca invente alimentos.
REGRA 2 — IDs EXATOS: "food_id" e "food_name" devem ser copiados EXATAMENTE do catálogo.
REGRA 3 — AGENDA SAGRADA: Você DEVE gerar EXATAMENTE ${numMeals} refeições, nos horários e nomes EXATOS da AGENDA. Não mude, não omita, não adicione nenhuma refeição. A última refeição da lista NUNCA pode ficar vazia.
REGRA 4 — SUBSTITUTOS OBRIGATÓRIOS:
  - Toda fonte de PROTEÍNA principal → 1 base + 2 substitutos (mesmo groupId, mesma subcategoria, caloricamente equivalentes)
  - Todo CARBO principal (arroz/batata/pão/tapioca) → 1 base + 2 substitutos (mesmo groupId, mesma subcategoria)
  - Cereal de café da manhã (aveia/granola/cuscuz) → 1 base + 2 substitutos
  - Vegetais, gorduras, bebidas: 1 base SEM substitutos
REGRA 5 — METAS RÍGIDAS (CALORIAS E MACROS):
  - KCAL: Você DEVE atingir ${macros.kcal} kcal (tolerância ±50kcal).
  - PROT: Você DEVE atingir exatamente ${macros.prot}g (tolerância ±5g). NUNCA ultrapasse ${macros.prot + 5}g.
  - CARBO: Você DEVE atingir exatamente ${macros.carb}g (tolerância ±10g).
  - GORD: Você DEVE atingir exatamente ${macros.fat}g (tolerância ±5g).
REGRA 6 — CULINÁRIA BRASILEIRA: Respeite rigorosamente as regras de cada refeição abaixo.
REGRA 7 — CONTEXTO CLÍNICO: Aplique TODAS as restrições clínicas abaixo sem exceção.
${isFolga ? 'REGRA 8 — DIAS LIVRES: Este é um dia de FOLGA/DESCANSO. A ingestão calórica total DEVE ser distribuída uniformemente entre as refeições para garantir a recuperação. NÃO gere calorias vazias.' : ''}
${clinico}

━━━ DIA: ${dayLabels[dayType] ?? dayType} ━━━

━━━ AGENDA OBRIGATÓRIA (${numMeals} refeições — não altere) ━━━
${scheduleStr}

━━━ REGRAS CULINÁRIAS POR REFEIÇÃO ━━━
${mealRules}

━━━ PERFIL DO ALUNO ━━━
Objetivo: ${a.objetivo} | Peso: ${a.peso}kg | Altura: ${a.altura}cm | Gênero: ${a.gender ?? 'não informado'}
Alergias/Intolerâncias: ${a.allergies ?? 'Nenhuma'}
Aversões (NUNCA use): ${a.foodAversions ?? 'Nenhuma'}
Preferências: ${a.foodPreferences ?? 'Não informado'}
Suplementos disponíveis: ${a.supplements ?? 'Nenhum'}
${orcCtx}

━━━ METAS DO DIA ━━━
KCAL: ${macros.kcal} | PROT: ${macros.prot}g | CARBO: ${macros.carb}g | GORD: ${macros.fat}g

━━━ DISTRIBUIÇÃO DE MACROS POR REFEIÇÃO ━━━
- Proteína: A meta é um TETO INTRANSPONÍVEL de ${macros.prot}g no total do dia. Para não estourar a soma matemática, use uma MÉDIA de EXATAMENTE ${avgProtPerMeal}g de proteína por refeição. NÃO use "doses duplas" de whey ou porções gigantes de carne em nenhuma refeição.
- Carbo: Distribua as calorias restantes prioritariamente em carbo para atingir a meta de ${macros.carb}g.
- Refeições marcadas ↑CARBO: recebem 60-70% do carbo total do dia.
- Refeições marcadas ↓CARBO: recebem 10-20% do carbo total.

━━━ CATÁLOGO (id|nome|kcal/100g|P|C|G|subcategoria) ━━━
${catalog}

━━━ EXEMPLO CORRETO DE SUBSTITUTOS NO JSON ━━━
Proteína principal com 2 substitutos (mesmo groupId "grp_prot_almoco"):
{ "food_id": "7fa55081", "food_name": "Frango Grelhado",         "amount": "150", "unit": "g", "groupId": "grp_prot_almoco" },
{ "food_id": "928041e8", "food_name": "Tilápia Grelhada",        "amount": "193", "unit": "g", "groupId": "grp_prot_almoco" },
{ "food_id": "96d11aa4", "food_name": "Carne Moída (Patinho)",   "amount": "113", "unit": "g", "groupId": "grp_prot_almoco" }

Carbo principal com 2 substitutos (mesmo groupId "grp_carbo_almoco"):
{ "food_id": "7ff6a7f4", "food_name": "Batata Doce Cozida",      "amount": "300", "unit": "g", "groupId": "grp_carbo_almoco" },
{ "food_id": "fa4ba3b8", "food_name": "Arroz Branco",            "amount": "231", "unit": "g", "groupId": "grp_carbo_almoco" },
{ "food_id": "c7d2240a", "food_name": "Mandioca Cozida",         "amount": "263", "unit": "g", "groupId": "grp_carbo_almoco" }

Nota: os substitutos têm amounts diferentes mas equivalentes em calorias ao item base.

━━━ FORMATO DE SAÍDA (JSON puro, sem markdown, sem explicações) ━━━
{
  "meals": [
    {
      "name": "Nome EXATO da agenda",
      "time": "HH:MM EXATO da agenda",
      "notes": "Dica prática e motivadora (1-2 frases) mencionando o objetivo desta refeição",
      "items": [
        { "food_id": "id-exato-catálogo", "food_name": "nome-exato-catálogo", "amount": "150", "unit": "g", "groupId": "grp_unico_por_grupo" }
      ]
    }
  ]
}`;
}

// ─── ENRIQUECER COM MEDIDAS CASEIRAS ─────────────────────────────────────────
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
        id: crypto.randomUUID(),
        name: meal.name, time: meal.time, notes: meal.notes ?? '', dayType,
        items: (meal.items ?? []).map((item: any) => {
            const db = map.get(item.food_id);
            let itemName = db?.n ?? item.food_name;
            const amt = parseFloat(item.amount?.toString() ?? '100');
            if (!isNaN(amt) && (item.unit === 'g' || !item.unit)) {
                if (itemName === 'Ovos Inteiros')         { const n = Math.max(1, Math.round(amt/50));  itemName += ` (~${n} unid.)`; }
                else if (itemName === 'Clara de Ovo')     { const n = Math.max(1, Math.round(amt/30));  itemName += ` (~${n} unid.)`; }
                else if (['Pão de Forma Tradicional','Pão Integral'].includes(itemName)) { const n = Math.max(1,Math.round(amt/25)); itemName += ` (~${n} fatia${n>1?'s':''})`; }
                else if (itemName === 'Pão Francês')      { const n = Math.max(1, Math.round(amt/50));  itemName += ` (~${n} unid.)`; }
                else if (itemName === 'Rap10')            { const n = Math.max(1, Math.round(amt/40));  itemName += ` (~${n} disco${n>1?'s':''})`; }
                else if (['Banana','Maçã','Laranja','Kiwi'].includes(itemName)) { const n=Math.max(1,Math.round(amt/100)); itemName+=` (~${n} unid. média${n>1?'s':''})`; }
                else if (['Mamão','Melancia'].includes(itemName)) { const n=Math.max(1,Math.round(amt/150)); itemName+=` (~${n} fatia${n>1?'s':''})`; }
                else if (itemName === 'Morango')          { const n = Math.max(1, Math.round(amt/12));  itemName += ` (~${n} unid.)`; }
                else if (['Castanha do Pará','Nozes'].includes(itemName)) { const n=Math.max(1,Math.round(amt/5)); itemName+=` (~${n} unid.)`; }
                else if (itemName.includes('Queijo Mussarela')||itemName.includes('Queijo Minas')||itemName.includes('Peito de Peru (Fatiado)')||itemName.includes('Presunto')) { const n=Math.max(1,Math.round(amt/15)); itemName+=` (~${n} fatia${n>1?'s':''})`; }
            }
            return {
                uniqueId: crypto.randomUUID(),
                groupId:  item.groupId ?? crypto.randomUUID(),
                id:       db?.id ?? item.food_id,
                name:     itemName,
                category: db ? catOf(db.sc) : '',
                subcategory: db?.sc ?? '',
                calories_per_100: db?.k ?? 0,
                p: db?.p ?? 0, c: db?.c ?? 0, f: db?.f ?? 0,
                base_unit: 'g',
                amount: amt.toString(),
                unit: item.unit ?? 'g',
            };
        }),
    }));
}

// ─── PROVIDERS ────────────────────────────────────────────────────────────────
async function callOpenAI(prompt: string, model: string): Promise<string> {
    const res = await openai.chat.completions.create({
        model, response_format: { type: 'json_object' }, temperature: 0.2,
        messages: [{ role:'system', content: prompt }, { role:'user', content:'Gere o plano agora. Retorne APENAS o JSON.' }],
    });
    return res.choices[0].message.content ?? '{}';
}

async function callAnthropic(prompt: string): Promise<string> {
    const res = await anthropic.messages.create({
        model: 'claude-3-5-sonnet-20240620',
        max_tokens: 8000, temperature: 0.2,
        messages: [{ role:'user', content:`${prompt}\n\nGere o plano agora. Retorne APENAS o JSON válido.` }],
    });
    return ((res.content.find(b => b.type === 'text') as any)?.text ?? '{}')
        .replace(/```json\n?|\n?```/g, '').trim();
}

async function callGoogle(prompt: string): Promise<string> {
    const model = googleAI.getGenerativeModel({
        model: 'gemini-2.5-flash',
        generationConfig: { responseMimeType: "application/json" } as any,
    });
    const result = await model.generateContent({
        contents: [{ role: 'user', parts: [{ text: `${prompt}\n\nGere o plano agora.` }] }]
    });
    return result.response.text();
}

// ─── HANDLER ──────────────────────────────────────────────────────────────────
export async function POST(req: Request) {
    try {
        const { anamnese, dayType = 'TREINO', provider = 'anthropic', birthDate, gender, macrosOverride } = await req.json();

        if (!anamnese) return NextResponse.json({ error:'Anamnese não encontrada.' }, { status:400 });

        const macros: MacrosOverride = macrosOverride ?? (() => {
            const peso = anamnese.peso ?? 70;
            const altura = anamnese.altura ?? 170;
            const idade = anamnese.age ?? 30;
            const isH  = (anamnese.gender ?? gender ?? '').toLowerCase().includes('masc');
            
            // 1. Equação de Mifflin-St Jeor
            const tmb = (10 * peso) + (6.25 * altura) - (5 * idade) + (isH ? 5 : -161);
            
            // 2. Fator de Atividade
            const freq = anamnese.frequencia ?? 4;
            let fatorAtividade = 1.2; // Sedentário
            if (freq >= 1 && freq <= 2) fatorAtividade = 1.375;
            else if (freq >= 3 && freq <= 4) fatorAtividade = 1.55;
            else if (freq >= 5 && freq <= 6) fatorAtividade = 1.725;
            else if (freq >= 7) fatorAtividade = 1.9;

            const tdee = tmb * fatorAtividade;

            // 3. Ajuste por Objetivo
            const obj = (anamnese.objetivo ?? '').toLowerCase();
            let kcalTarget = tdee;
            let protPerKg = 1.8; 
            
            if (obj.includes('hipertrofia') || obj.includes('ganho')) {
                kcalTarget = tdee * 1.1; // +10% Superávit
                protPerKg = 2.0;
            } else if (obj.includes('emagrecimento') || obj.includes('perda') || obj.includes('defini')) {
                kcalTarget = tdee * 0.8; // -20% Déficit
                protPerKg = 2.2; // Aumenta a proteína em restrição
            } else {
                kcalTarget = tdee; // Saúde / Manutenção
                protPerKg = 1.8;
            }

            const kcal = Math.round(kcalTarget);
            const prot = Math.round(peso * protPerKg);
            const fat  = Math.round(peso * 1.0); // Gordura travada em 1g/kg
            const carb = Math.max(20, Math.round((kcal - (prot * 4) - (fat * 9)) / 4));

            return { kcal, prot, carb, fat };
        })();

        const schedule = buildMealSchedule(anamnese, dayType);
        const catalog  = filteredCatalog(anamnese);
        const prompt   = buildPrompt(anamnese, macros, dayType, catalog, schedule);

        let raw: string; let modelUsed: string;
        switch (provider as Provider) {
            case 'anthropic':   raw = await callAnthropic(prompt); modelUsed = 'claude-3-5-sonnet-20240620'; break;
            case 'google':      raw = await callGoogle(prompt);    modelUsed = 'gemini-2.5-flash';    break;
            case 'openai-mini': raw = await callOpenAI(prompt,'gpt-4o-mini'); modelUsed = 'gpt-4o-mini'; break;
            default:            raw = await callOpenAI(prompt,'gpt-4o');      modelUsed = 'gpt-4o';
        }

        let parsed;
        try {
            const cleanJson = raw.replace(/^```json\s*/m,'').replace(/^```\s*/m,'').replace(/```\s*$/m,'').trim();
            parsed = JSON.parse(cleanJson);
        } catch (e) {
            console.error('[generate-diet] JSON inválido:', raw.slice(0, 500));
            throw new Error('A IA não gerou um JSON válido.');
        }

        const meals = enrich((parsed.meals ?? []), dayType);
        return NextResponse.json({ meals, meta:{ dayType, provider, modelUsed, schedule, ...macros } }, { status:200 });

    } catch (err: any) {
        console.error('[generate-diet]', err?.message ?? err);
        return NextResponse.json({ error:'Erro ao gerar dieta.' }, { status:500 });
    }
}