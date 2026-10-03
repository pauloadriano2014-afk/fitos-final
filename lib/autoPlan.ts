// lib/autoPlan.ts
// 🤖 (3 out 2026) PLANO AUTOMÁTICO: o aluno de FICHA_8S ou CHALLENGE_21 termina o cadastro e a anamnese enxuta e o servidor monta o treino e a dieta
// dele na hora, sem o coach clicar em nada. É o mesmo motor de IA que o coach já usa (lib/ai/workoutGen.ts e lib/ai/dietGen.ts), só que disparado
// pelo servidor logo depois de salvar a anamnese.
//
// Como funciona:
//   1. POST /api/anamnese salva a anamnese e chama startAutoPlan(userId). Isso só registra a "corrida" (AutoPlanRun) e agenda a execução em
//      segundo plano -- a resposta pro aluno não espera a IA.
//   2. executeRun monta TREINO (uma ou duas fases) e DIETA (aba Treino + aba Descanso) ao mesmo tempo, salva tudo no banco e avisa o aluno e o coach.
//   3. O app do aluno consulta GET /api/auto-plan/status enquanto espera. Essa consulta também "cura" corridas que ficaram pra trás (servidor
//      reiniciou no meio, IA falhou): recomeça de onde parou, no máximo MAX_ATTEMPTS vezes.
//   4. Se não dá pra automatizar (aluno de coach parceiro, sem anamnese) ou a IA falha de vez, o coach é avisado e monta à mão, como sempre foi.
//
// Idempotente: quem já tem uma corrida concluída NÃO é remontado por uma segunda anamnese (só o coach, com force).
import { randomUUID } from 'crypto';
import prisma from '@/lib/prisma';
import { PAULO_ID } from '@/lib/masterIds';
import { isMasterId } from '@/lib/auth';
import { generateWorkoutPlan } from '@/lib/ai/workoutGen';
import { generateDietDay, type MacrosOverride } from '@/lib/ai/dietGen';
import { calcWeeklyPlan, calcAge } from '@/lib/macroPlanner';
import {
  MUSCLE_GROUPS, DEFAULT_LIMITATION_RULES, buildPresets, buildDefaultSplit, deriveTrainingEnvironment, dayNeedsCardio,
} from '@/lib/ai/splitPresets';
import { saveItemMetas, legacyFor } from '@/lib/foodMeasures';
import { saveDayScheme } from '@/lib/dayScheme';
import { sendPushToUser } from '@/app/utils/sendNotification';

// ─── PLANOS COM MONTAGEM AUTOMÁTICA ──────────────────────────────────────────
export type AutoPlanKind = 'FICHA_8S' | 'CHALLENGE_21';
export const AUTO_PLANS: AutoPlanKind[] = ['FICHA_8S', 'CHALLENGE_21'];
export const isAutoPlan = (plan?: string | null): plan is AutoPlanKind => !!plan && (AUTO_PLANS as string[]).includes(plan);

export const MAX_ATTEMPTS = 3;
const STALE_RUNNING_MS = 10 * 60 * 1000;   // corrida "rodando" há mais que isso = o servidor caiu no meio
const RETRY_GAP_MS = 60 * 1000;            // espera mínima entre uma falha e a próxima tentativa automática
const DAY_MS = 24 * 60 * 60 * 1000;

// Provedores usados na montagem automática (mesmos nomes que as rotas do coach aceitam).
export const AUTO_AI = { workout: 'GEMINI', diet: 'google' } as const;

// Abas da dieta geradas: dia de treino e dia de descanso (cobrem a semana inteira; o app do aluno só mostra as abas que têm refeição).
export const AUTO_DIET_DAYS = ['TREINO', 'DESCANSO'] as const;

// ─── PLANEJAMENTO (funções puras, sem banco) ─────────────────────────────────
export type Level = 'INICIANTE' | 'INTERMEDIARIO' | 'AVANCADO';
export interface PhaseSpec { key: string; label: string; days: number; cyclePhase: string; techniques: string[]; extraSetsOnFocus: number }
export interface PlanSpec {
  kind: AutoPlanKind;
  title: string;            // "FICHA 8 SEMANAS" | "DESAFIO 21 DIAS"
  totalDays: number;
  objective: string;        // o objetivo que vale para o treino e a dieta (o desafio é sempre emagrecimento)
  fatLoss: boolean;
  focus: string | null;     // área do corpo escolhida (só ficha de 8 semanas)
  freq: number;             // treinos por semana que vamos montar
  level: Level;
  phases: PhaseSpec[];
}

export const FOCUS_NONE = 'Corpo todo (equilibrado)';
// Área do corpo escolhida pelo aluno -> grupos musculares que ganham mais volume (o primeiro é o "principal", usado para garantir frequência).
export const FOCUS_GROUPS: Record<string, string[]> = {
  'Glúteos': ['GLUTEOS'],
  'Pernas': ['QUADRICEPS', 'POSTERIORES', 'GLUTEOS'],
  'Costas': ['COSTAS_PUXADA', 'COSTAS_REMADA'],
  'Peito': ['PEITO'],
  'Ombros': ['OMBRO_LATERAL', 'OMBRO_MULTI', 'OMBRO_POST'],
  'Braços': ['BICEPS', 'TRICEPS'],
  'Abdômen': ['ABDOMEN'],
};
export const FOCUS_OPTIONS = [...Object.keys(FOCUS_GROUPS), FOCUS_NONE];

const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));

export function levelOf(nivel?: string | null): Level {
  const n = String(nivel || '').toLowerCase();
  if (n.includes('inic')) return 'INICIANTE';
  if (n.includes('interm')) return 'INTERMEDIARIO';
  return 'AVANCADO';
}

const isFatLossText = (s?: string | null) => /emagrec|perda|perder|defini|secar|peso/i.test(String(s || ''));

export function planSpec(kind: AutoPlanKind, a: { objetivo?: string | null; nivel?: string | null; frequencia?: number | null; focoPrincipal?: string | null }): PlanSpec {
  const level = levelOf(a.nivel);
  const rawFreq = Number(a.frequencia) || 3;

  if (kind === 'CHALLENGE_21') {
    // Em 21 dias o resultado realista é perda de gordura, não ganho de músculo: sempre emagrecimento, mínimo de 3 treinos na semana.
    return {
      kind, title: 'DESAFIO 21 DIAS', totalDays: 21, objective: 'Emagrecimento', fatLoss: true, focus: null,
      freq: clamp(rawFreq, 3, 5), level,
      phases: [{
        key: 'D21', label: 'Desafio 21 dias', days: 21, cyclePhase: 'EMAGRECIMENTO',
        techniques: level === 'INICIANTE' ? ['BISET'] : ['BISET', 'TRISET'], extraSetsOnFocus: 0,
      }],
    };
  }

  // FICHA 8 SEMANAS: periodizada em duas fases de 4 semanas. Objetivo = foco numa área do corpo OU perder peso.
  const objective = String(a.objetivo || '').trim() || 'Hipertrofia';
  const fatLoss = isFatLossText(objective);
  const focusRaw = String(a.focoPrincipal || '').trim();
  const focus = !fatLoss && FOCUS_GROUPS[focusRaw] ? focusRaw : null;
  const beginner = level === 'INICIANTE';
  const phases: PhaseSpec[] = fatLoss
    ? [
        { key: 'F1', label: 'Fase 1 · Queima e adaptação', days: 28, cyclePhase: 'EMAGRECIMENTO', techniques: beginner ? ['BISET'] : ['BISET', 'TRISET'], extraSetsOnFocus: 0 },
        { key: 'F2', label: 'Fase 2 · Intensificação', days: 28, cyclePhase: 'DEFINICAO', techniques: beginner ? ['BISET'] : ['BISET', 'DROPSET'], extraSetsOnFocus: 0 },
      ]
    : [
        { key: 'F1', label: 'Fase 1 · Base e volume', days: 28, cyclePhase: 'HIPERTROFIA', techniques: ['BISET'], extraSetsOnFocus: 0 },
        { key: 'F2', label: 'Fase 2 · Intensificação', days: 28, cyclePhase: beginner ? 'HIPERTROFIA' : 'CHOQUE', techniques: beginner ? ['BISET', 'DROPSET'] : ['DROPSET', 'RESTPAUSE', 'BISET'], extraSetsOnFocus: 1 },
      ];
  return { kind, title: 'FICHA 8 SEMANAS', totalDays: 56, objective, fatLoss, focus, freq: clamp(rawFreq, 2, 6), level, phases };
}

type Group = { id: string; qty: number; sets?: number; rest?: number; autoAdded?: boolean };
type Day = { id: string; name: string; groups: Group[] };

const FAT_LOSS_SEQUENCES: Record<number, string[]> = {
  2: ['Full Body', 'Superior Geral'],
  3: ['Full Body', 'Superior Geral', 'Pernas Completo'],
  4: ['Superior Geral', 'Pernas Completo', 'Full Body', 'Costas + Ombros'],
  5: ['Superior Geral', 'Pernas Completo', 'Full Body', 'Costas + Ombros', 'LAST'],
};

/** Divisão de treino da ficha: emagrecimento usa corpo todo/superior/inferior; os demais usam a divisão padrão do app, com foco opcional. */
export function buildSplit(spec: PlanSpec, gender?: string | null): Day[] {
  const fem = gender === 'Feminino';
  const presets = buildPresets(gender);
  const groupsOf = (label: string): Group[] => ((presets.find((p: any) => p.label === label)?.groups || []) as Group[]).map((g) => ({ ...g }));
  const letters = 'ABCDEFGHIJKLMNOP';

  if (spec.fatLoss) {
    const seq = FAT_LOSS_SEQUENCES[clamp(spec.freq, 2, 5)].map((l) => (l === 'LAST' ? (fem ? 'Glúteos Foco' : 'Quadríceps Isolado') : l));
    return seq.map((label, i) => ({ id: String(i + 1), name: letters[i], groups: groupsOf(label) }));
  }

  let days: Day[] = (buildDefaultSplit(spec.freq, gender) as Day[]).map((d) => ({ ...d, groups: d.groups.map((g) => ({ ...g })) }));
  if (spec.focus) days = applyFocus(days, spec.focus, spec.freq);
  return days;
}

/** Mais exercícios nos grupos da área escolhida e, se a área aparece pouco, 1 grupo dela nos dias que não treinam essa região. */
export function applyFocus(days: Day[], focus: string, freq: number): Day[] {
  const ids = FOCUS_GROUPS[focus];
  if (!ids || !ids.length) return days;
  const out = days.map((d) => ({ ...d, groups: d.groups.map((g) => (ids.includes(g.id) ? { ...g, qty: Math.min(6, (g.qty || 3) + 1) } : { ...g })) }));
  const has = (d: Day) => d.groups.some((g) => ids.includes(g.id));
  const target = Math.min(out.length, freq >= 4 ? 3 : 2);
  let present = out.filter(has).length;
  for (let i = out.length - 1; i >= 0 && present < target; i--) {
    if (!has(out[i])) { out[i].groups.push({ id: ids[0], qty: 2 }); present++; }
  }
  return out;
}

/** Configuração do ciclo no formato que a rota/IA do coach já entende (mesmas regras do hook useGerarTreino do app). */
export function buildCycleConfig(spec: PlanSpec, phase: PhaseSpec, a: any, gender?: string | null) {
  const baseDays = buildSplit(spec, gender);
  const focusIds = spec.focus ? FOCUS_GROUPS[spec.focus] : [];
  const days = baseDays
    .map((d) => {
      const aiGroups = d.groups.filter((g) => g.id !== 'MOBILIDADE');
      if (!aiGroups.length) return null;
      const groups: Group[] = [...aiGroups];
      // Fase de queima de gordura (desafio e ficha de perder peso): cardio em TODO dia de treino, inclusive o de pernas. A regra do app
      // (dayNeedsCardio) pula o dia só de pernas, o que faz sentido pra definição mas não para um desafio de emagrecimento.
      const needsCardio = phase.cyclePhase === 'EMAGRECIMENTO' ? !groups.some((g) => g.id === 'CARDIO') : dayNeedsCardio(groups, phase.cyclePhase);
      if (needsCardio) groups.push({ id: 'CARDIO', qty: 1, rest: 0, autoAdded: true });
      return {
        name: d.name,
        groups: groups.map((g) => {
          const info = (MUSCLE_GROUPS as any[]).find((mg) => mg.id === g.id);
          const baseSets = g.sets ?? info?.defaultSets ?? 4;
          const sets = focusIds.includes(g.id) && phase.extraSetsOnFocus ? Math.min(5, baseSets + phase.extraSetsOnFocus) : baseSets;
          return { id: g.id, qty: g.qty, sets, rest: g.rest ?? info?.defaultRest ?? 60 };
        }),
      };
    })
    .filter(Boolean);

  const allLimits = [...(a.limitacoes || []), ...(a.cirurgias || [])].map((l: string) => String(l).toLowerCase());
  return {
    selectedAI: AUTO_AI.workout,
    customKey: null,
    phase: phase.cyclePhase,
    techniques: phase.techniques,
    techniqueScope: 'CYCLE',
    gender: gender || 'Não informado',
    trainingEnvironment: deriveTrainingEnvironment(a.equipamentos),
    days,
    manualExercisesByDay: {},
    limitationRules: (DEFAULT_LIMITATION_RULES as any[]).filter((rule) => allLimits.some((l: string) => l.includes(rule.trigger.toLowerCase()))),
    cardioTarget: ['EMAGRECIMENTO', 'DEFINICAO'].includes(phase.cyclePhase) ? 300 : null,
  };
}

/** Pontos que o coach deve conferir antes de o aluno seguir à risca (o plano sai na hora, a revisão vem depois). */
export function reviewFlags(a: any, user?: { birthDate?: string | null }): string[] {
  const flags: string[] = [];
  const none = (s: string) => /^(nenhum|nenhuma|não|nao)$/i.test(String(s).trim());
  const list = (arr: any) => (Array.isArray(arr) ? arr.filter((x: string) => x && !none(x)) : []);
  const conds = list(a.healthConditions); if (conds.length) flags.push(`Condições de saúde: ${conds.join(', ')}`);
  const meds = list(a.medications); if (meds.length) flags.push(`Medicamentos: ${meds.join(', ')}`);
  if (a.bariatric === true) flags.push('Cirurgia bariátrica');
  const lims = list(a.limitacoes); if (lims.length) flags.push(`Limitações/dores: ${lims.join(', ')}`);
  const cir = list(a.cirurgias); if (cir.length) flags.push(`Cirurgias: ${cir.join(', ')}`);
  const age = calcAge(user?.birthDate);
  if (age < 16) flags.push(`Menor de idade (${age} anos)`);
  if (age >= 60) flags.push(`Idade ${age} anos`);
  const imc = Number(a.imc);
  if (Number.isFinite(imc) && imc > 0 && (imc < 18.5 || imc >= 35)) flags.push(`IMC ${imc.toFixed(1)}`);
  return flags;
}

/** Instrução livre para a IA da dieta (REGRA 10 do prompt): contexto do produto, sem nunca atropelar meta de macros nem restrição clínica. */
export function dietInstruction(spec: PlanSpec): string {
  if (spec.kind === 'CHALLENGE_21') {
    return 'Desafio de 21 dias de emagrecimento: monte um cardápio simples, rápido de preparar, com bastante saciedade (proteína e fibra) e alimentos comuns do dia a dia brasileiro.';
  }
  return spec.fatLoss
    ? 'Ficha de 8 semanas com objetivo de perder peso: cardápio simples, saciante e fácil de manter por 8 semanas.'
    : `Ficha de 8 semanas${spec.focus ? ` com foco em ${spec.focus.toLowerCase()}` : ''}: proteína bem distribuída para sustentar o ganho de massa, com alimentos comuns do dia a dia.`;
}

/** Anamnese no formato que o motor de dieta espera (campos extras do cadastro do aluno). */
export function toDietAnamnese(a: any, user: { gender?: string | null; birthDate?: string | null }, spec: PlanSpec) {
  const row = { ...a };
  delete row.id; delete row.userId; delete row.createdAt;
  return { ...row, objetivo: spec.objective, gender: user.gender ?? undefined, age: calcAge(user.birthDate) };
}

/** Macros por aba, com a mesma conta do app do coach (lib/macroPlanner.ts). */
export function macrosFor(a: any, user: { gender?: string | null; birthDate?: string | null }, spec: PlanSpec): Record<string, MacrosOverride> {
  const plan = calcWeeklyPlan({ peso: a.peso, altura: a.altura, frequencia: spec.freq, objetivo: spec.objective, gender: user.gender ?? undefined }, user.birthDate, user.gender, null, null);
  return plan.macrosByDay;
}

// ─── CONVERSÃO PARA O BANCO (puras) ──────────────────────────────────────────
/** Linhas de WorkoutExercise exatamente como o "Montar treino" do app grava (blocos de série empacotados em `technique`). */
export function packWorkoutRows(workoutId: string, exercisesByDay: Record<string, any[]>, workoutTabs?: string[]) {
  const tabs = workoutTabs && workoutTabs.length ? workoutTabs : Object.keys(exercisesByDay || {});
  let order = 0;
  const rows: any[] = [];
  for (const day of tabs) {
    for (const ex of exercisesByDay[day] || []) {
      const isCardio = String(ex.category || '').toUpperCase() === 'CARDIO';
      const blocks = Array.isArray(ex.blocks) && ex.blocks.length ? ex.blocks : [{ sets: '3', reps: '10', technique: '', restTime: '60' }];
      const first = blocks[0];
      const subs: string[] = [];
      if (ex.substitute?.id) subs.push(String(ex.substitute.id));
      rows.push({
        workoutId,
        exerciseId: String(ex.exerciseId),
        day: String(day).trim(),
        sets: parseInt(first.sets) || (isCardio ? 20 : 3),
        reps: String(first.reps),
        technique: JSON.stringify({ t: first.technique || '', b: blocks, o: ex.observation || '' }),
        restTime: parseInt(first.restTime) || 0,
        order: order++,
        observation: ex.observation || '',
        substitutes: subs,
      });
    }
  }
  return rows;
}

/** Refeições geradas (todas as abas) -> estrutura do `create` do Prisma + fila de metadados (mesmo formato de app/api/admin/diet). */
export function buildMealsCreate(meals: any[]) {
  const metaQueue: Array<{ foodItemId: string; foodId?: string; portions?: Record<string, number> }> = [];
  const create = meals.map((meal: any, mIndex: number) => ({
    name: meal.name || 'Refeição',
    time: meal.time || '00:00',
    order: mIndex,
    notes: meal.notes || '',
    dayType: meal.dayType || 'TREINO',
    alternativeGroupId: null,
    isMainVersion: true,
    alternativeLabel: null,
    items: {
      create: (meal.items || []).map((item: any) => {
        const id = randomUUID();
        let portions: Record<string, number> | undefined;
        try {
          const legacy = item.id ? legacyFor({ id: String(item.id), name: String(item.name || '') }) : null;
          if (legacy && legacy.portions && Object.keys(legacy.portions).length) portions = { ...legacy.portions };
        } catch { /* sem medidas antigas: segue só com o foodId */ }
        metaQueue.push({ foodItemId: id, foodId: item.id ? String(item.id) : undefined, portions });
        return {
          id,
          name: item.name || 'Alimento',
          amount: Number(item.amount) || 0,
          unit: item.unit || 'g',
          calories: Number(item.calories_per_100) || 0,
          protein: Number(item.p) || 0,
          carbs: Number(item.c) || 0,
          fats: Number(item.f) || 0,
          substitutionGroupId: item.groupId ? String(item.groupId) : null,
        };
      }),
    },
  }));
  return { create, metaQueue };
}

/** Mensagem amigável para o aluno, por estado. */
export function studentMessage(status: string, step?: string | null): string {
  switch (status) {
    case 'DONE': return 'Seu plano está pronto! Treino e dieta montados para você.';
    case 'RUNNING': return step === 'SAVING' ? 'Salvando seu plano...' : 'Montando seu treino e sua dieta com base nas suas respostas...';
    case 'PENDING': return 'Na fila para montar seu plano...';
    case 'MANUAL': return 'Seu coach vai montar seu plano e te avisa assim que estiver pronto.';
    case 'FAILED': return 'Estamos finalizando seu plano. Você será avisado assim que estiver pronto.';
    default: return 'Preencha sua anamnese para montarmos seu plano.';
  }
}

// ─── ESTADO DA CORRIDA (banco, com reserva em memória se a tabela ainda não existe) ─────────────
export interface RunRow {
  id: string; userId: string; plan: string; status: string; step: string | null; attempts: number; error: string | null;
  workoutIds: string[]; dietId: string | null; summary: any; startedAt: Date | null; finishedAt: Date | null; createdAt: Date; updatedAt: Date;
}

const missingTable = (e: any) => e?.code === 'P2021' || e?.code === 'P2022' || /does not exist|autoPlanRun/i.test(String(e?.message || ''));
let warned = false;
const warnOnce = (where: string, e: any) => {
  if (warned) return;
  warned = true;
  console.warn(`[autoPlan] ${where}: ${e?.code || ''} ${e?.message || e} — guardando o estado só em memória (rode "prisma db push" pra ativar a tabela AutoPlanRun).`);
};

const memory = new Map<string, RunRow>();
let useMemory = false;

async function guarded<T>(where: string, fromDb: () => Promise<T>, fromMem: () => T | Promise<T>): Promise<T> {
  if (useMemory) return fromMem();
  try {
    return await fromDb();
  } catch (e) {
    if (!missingTable(e)) throw e;
    warnOnce(where, e);
    useMemory = true;
    return fromMem();
  }
}

const db = () => (prisma as any).autoPlanRun;

export const runStore = {
  latest: (userId: string): Promise<RunRow | null> => guarded('latest',
    () => db().findFirst({ where: { userId }, orderBy: { createdAt: 'desc' } }),
    () => [...memory.values()].filter((r) => r.userId === userId).sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0] ?? null),
  get: (id: string): Promise<RunRow | null> => guarded('get',
    () => db().findUnique({ where: { id } }),
    () => memory.get(id) ?? null),
  create: (userId: string, plan: string): Promise<RunRow> => guarded('create',
    () => db().create({ data: { userId, plan } }),
    () => {
      const now = new Date();
      const row: RunRow = { id: randomUUID(), userId, plan, status: 'PENDING', step: null, attempts: 0, error: null, workoutIds: [], dietId: null, summary: null, startedAt: null, finishedAt: null, createdAt: now, updatedAt: now };
      memory.set(row.id, row);
      return row;
    }),
  /** As outras corridas do aluno (mais antigas): a remontagem forçada arquiva os treinos delas. */
  others: (userId: string, exceptId: string): Promise<RunRow[]> => guarded('others',
    () => db().findMany({ where: { userId, id: { not: exceptId } } }),
    () => [...memory.values()].filter((r) => r.userId === userId && r.id !== exceptId)),
  update: (id: string, patch: Partial<RunRow>): Promise<void> => guarded('update',
    async () => { await db().update({ where: { id }, data: patch }); },
    () => { const r = memory.get(id); if (r) Object.assign(r, patch, { updatedAt: new Date() }); }),
  /** Reserva a corrida para UMA execução (PENDING, FAILED ou RUNNING esquecida). Devolve a linha reservada ou null se outra execução já pegou. */
  claim: (id: string): Promise<RunRow | null> => guarded('claim',
    async () => {
      const staleBefore = new Date(Date.now() - STALE_RUNNING_MS);
      const res = await db().updateMany({
        where: { id, OR: [{ status: { in: ['PENDING', 'FAILED'] } }, { status: 'RUNNING', startedAt: { lt: staleBefore } }] },
        data: { status: 'RUNNING', step: 'GENERATING', startedAt: new Date(), attempts: { increment: 1 }, error: null },
      });
      return res.count === 1 ? db().findUnique({ where: { id } }) : null;
    },
    () => {
      const r = memory.get(id);
      if (!r) return null;
      const stale = r.status === 'RUNNING' && r.startedAt && Date.now() - r.startedAt.getTime() > STALE_RUNNING_MS;
      if (!(r.status === 'PENDING' || r.status === 'FAILED' || stale)) return null;
      Object.assign(r, { status: 'RUNNING', step: 'GENERATING', startedAt: new Date(), attempts: r.attempts + 1, error: null, updatedAt: new Date() });
      return r;
    }),
};

/** Só pros testes. */
export const __resetAutoPlanMemory = () => { memory.clear(); useMemory = false; warned = false; };

// ─── EXECUÇÃO ────────────────────────────────────────────────────────────────
/** Ajustes que só os testes mexem (espera entre as duas tentativas de uma chamada de IA). */
export const tuning = { retryDelayMs: 2000 };

async function withRetry<T>(label: string, fn: () => Promise<T>, tries = 2): Promise<T> {
  let last: any;
  for (let i = 0; i < tries; i++) {
    try { return await fn(); } catch (e: any) {
      last = e;
      console.warn(`[autoPlan] ${label}: tentativa ${i + 1}/${tries} falhou: ${e?.message || e}`);
      if (i < tries - 1) await new Promise((r) => setTimeout(r, tuning.retryDelayMs));
    }
  }
  throw last;
}

const PLACEHOLDER_RE = /CONSTRU[ÇC][ÃA]O/i;

interface Ctx {
  run: RunRow;
  user: { id: string; name: string | null; gender: string | null; birthDate: string | null; coachId: string | null; plan: string };
  anamnese: any;
  spec: PlanSpec;
  adminId: string;
  baseDate: Date;
  olderWorkoutIds: string[];   // treinos de montagens anteriores deste aluno (arquivados quando a nova fase 1 entra)
}

async function doWorkouts(ctx: Ctx): Promise<string[]> {
  const { run, user, anamnese, spec, adminId, baseDate } = ctx;
  const ids = [...(run.workoutIds || [])];
  // retomada: se algum treino da lista foi apagado pelo coach, recomeça dessa fase
  if (ids.length) {
    const alive = await prisma.workout.findMany({ where: { id: { in: ids } }, select: { id: true } });
    const aliveIds = new Set(alive.map((w) => w.id));
    while (ids.length && !aliveIds.has(ids[ids.length - 1])) ids.pop();
  }
  for (let i = ids.length; i < spec.phases.length; i++) {
    const phase = spec.phases[i];
    const cycleConfig = buildCycleConfig(spec, phase, anamnese, user.gender);
    const r = await withRetry(`treino ${phase.key}`, async () => {
      const res = await generateWorkoutPlan({ userId: user.id, adminId, cycleConfig });
      if (res.status !== 200) throw new Error(res.body?.error || `Falha ao gerar o treino (${res.status}).`);
      return res.body;
    });

    // janela da fase: fases em sequência a partir do dia da entrega; a última termina no último dia do plano
    const offset = spec.phases.slice(0, i).reduce((s, p) => s + p.days, 0);
    const startDate = new Date(baseDate.getTime() + offset * DAY_MS);
    const endDate = new Date(baseDate.getTime() + (offset + phase.days) * DAY_MS - 1000);
    const name = spec.phases.length > 1 ? `${spec.title} · ${phase.label}` : `${spec.title}`;

    const workoutId = await prisma.$transaction(async (tx) => {
      if (i === 0) {
        // o treino de verdade substitui o "EM CONSTRUÇÃO" do cadastro antigo
        const placeholders = await tx.workout.findMany({ where: { userId: user.id, archived: false }, select: { id: true, name: true, _count: { select: { exercises: true } } } });
        const ids2 = placeholders.filter((w) => PLACEHOLDER_RE.test(w.name) || w._count.exercises === 0 || ctx.olderWorkoutIds.includes(w.id)).map((w) => w.id);
        if (ids2.length) await tx.workout.updateMany({ where: { id: { in: ids2 } }, data: { archived: true } });
      }
      const w = await tx.workout.create({
        data: {
          userId: user.id, name, goal: spec.objective, level: anamnese.nivel || 'Personalizado',
          workoutModel: r.workoutModel || 'CARGA', isVisible: true, startDate, endDate,
        },
      });
      const rows = packWorkoutRows(w.id, r.exercisesByDay, r.workoutTabs);
      if (!rows.length) throw new Error('A IA não gerou exercícios válidos.');
      await tx.workoutExercise.createMany({ data: rows });
      return w.id;
    });
    ids.push(workoutId);
    await runStore.update(run.id, { workoutIds: [...ids], summary: { ...(run.summary || {}), baseDate: baseDate.toISOString(), workoutDone: ids.length === spec.phases.length } });
    run.workoutIds = [...ids];
  }
  return ids;
}

async function doDiet(ctx: Ctx): Promise<{ dietId: string; costBrl: number; totals: MacrosOverride }> {
  const { run, user, anamnese, spec } = ctx;
  if (run.dietId) {
    const exists = await prisma.diet.findUnique({ where: { id: run.dietId }, select: { id: true } });
    if (exists) return { dietId: run.dietId, costBrl: Number(run.summary?.dietCostBrl) || 0, totals: run.summary?.macros || { kcal: 0, prot: 0, carb: 0, fat: 0 } };
  }
  const dietAnamnese = toDietAnamnese(anamnese, user, spec);
  const macrosByDay = macrosFor(anamnese, user, spec);
  const instruction = dietInstruction(spec);

  const results = await Promise.all(AUTO_DIET_DAYS.map((dayType) =>
    withRetry(`dieta ${dayType}`, () => generateDietDay({
      anamnese: dietAnamnese, dayType, provider: AUTO_AI.diet, gender: user.gender, birthDate: user.birthDate,
      macrosOverride: macrosByDay[dayType], customInstruction: instruction,
    }))));

  const meals = results.flatMap((r, i) => (r.meals || []).map((m: any) => ({ ...m, dayType: AUTO_DIET_DAYS[i] })));
  if (!meals.length) throw new Error('A IA não gerou refeições.');
  const costBrl = results.reduce((s, r) => s + (r.usageAndCost?.costBrl || 0), 0);
  const head = macrosByDay.TREINO;
  const water = `${(Math.round(((Number(anamnese.peso) || 70) * 35) / 100) / 10).toFixed(1).replace('.', ',')} Litros`;

  const previousBase = await prisma.diet.findFirst({ where: { userId: user.id, isActive: true, isStrategy: false }, select: { id: true } });
  const { create, metaQueue } = buildMealsCreate(meals);
  const diet = await prisma.$transaction(async (tx) => {
    await tx.diet.updateMany({ where: { userId: user.id, isActive: true, isStrategy: false }, data: { isActive: false } });
    return tx.diet.create({
      data: {
        userId: user.id,
        name: spec.kind === 'CHALLENGE_21' ? 'Plano Alimentar · Desafio 21 Dias' : 'Plano Alimentar · Ficha 8 Semanas',
        goal: spec.objective,
        totalKcal: head.kcal, totalProtein: head.prot, totalCarbs: head.carb, totalFats: head.fat,
        waterIntake: water,
        generalNotes: 'Plano montado automaticamente a partir das suas respostas. Seu coach acompanha e pode ajustar o que for preciso.',
        isActive: true, isStrategy: false,
        meals: { create },
      },
    });
  });
  await saveItemMetas(metaQueue as any);
  await saveDayScheme(diet.id, undefined, previousBase?.id ?? null);
  // a aba Dieta só aparece pro aluno com o módulo ligado
  await prisma.user.update({ where: { id: user.id }, data: { dietModule: true } });
  return { dietId: diet.id, costBrl, totals: head };
}

async function notifyCoach(coachId: string | null, title: string, body: string, data: any) {
  if (!coachId) return;
  try {
    const coach = await prisma.user.findUnique({ where: { id: coachId }, select: { id: true, pushToken: true, webPushSubscription: true } });
    if (coach) await sendPushToUser(coach, title, body, data);
  } catch (e) { console.error('[autoPlan] push coach:', e); }
}

async function notifyStudent(userId: string, title: string, body: string, data: any) {
  try {
    const u = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, pushToken: true, webPushSubscription: true } });
    if (u) await sendPushToUser(u, title, body, data);
  } catch (e) { console.error('[autoPlan] push aluno:', e); }
}

/** Executa UMA tentativa de montagem (já reservada por claim). Nunca lança. */
export async function executeRun(runId: string): Promise<void> {
  const run = await runStore.claim(runId);
  if (!run) return; // outra execução já pegou (ou já terminou)
  try {
    const user = await prisma.user.findUnique({
      where: { id: run.userId },
      select: { id: true, name: true, gender: true, birthDate: true, coachId: true, plan: true },
    });
    if (!user) { await runStore.update(run.id, { status: 'FAILED', error: 'ALUNO_NAO_ENCONTRADO', finishedAt: new Date() }); return; }
    if (!isAutoPlan(user.plan)) { await runStore.update(run.id, { status: 'MANUAL', step: null, error: 'PLANO_SEM_MONTAGEM_AUTOMATICA', finishedAt: new Date() }); return; }

    const anamnese: any = await prisma.anamnese.findFirst({ where: { userId: user.id }, orderBy: { createdAt: 'desc' } });
    if (!anamnese) { await runStore.update(run.id, { status: 'FAILED', error: 'SEM_ANAMNESE', finishedAt: new Date(), attempts: Math.max(0, run.attempts - 1) }); return; }

    // A IA usa a biblioteca de exercícios do coach e é recurso do time master: aluno sem coach cai na biblioteca do Paulo; aluno de parceiro vai pro coach.
    const adminId = isMasterId(user.coachId) ? (user.coachId as string) : (!user.coachId ? PAULO_ID : null);
    if (!adminId) {
      await runStore.update(run.id, { status: 'MANUAL', step: null, error: 'COACH_PARCEIRO', finishedAt: new Date() });
      await notifyCoach(user.coachId, '📝 Aluno aguarda a ficha', `${user.name || 'Um aluno'} terminou a anamnese. Monte o plano dele no app.`, { type: 'auto_plan_manual', studentId: user.id });
      return;
    }

    const spec = planSpec(user.plan, anamnese);
    const baseDate = run.summary?.baseDate ? new Date(run.summary.baseDate) : new Date();
    const older = await runStore.others(user.id, run.id);
    const ctx: Ctx = { run, user: user as Ctx['user'], anamnese, spec, adminId, baseDate, olderWorkoutIds: older.flatMap((r) => r.workoutIds || []) };

    // treino e dieta ao mesmo tempo: o aluno espera pelo mais demorado, não pela soma
    const [w, d] = await Promise.allSettled([doWorkouts(ctx), doDiet(ctx)]);

    const patch: Partial<RunRow> = { step: 'SAVING' };
    const summary: any = { ...(run.summary || {}), baseDate: baseDate.toISOString(), plan: spec.kind, objective: spec.objective, focus: spec.focus, freq: spec.freq, level: spec.level, phases: spec.phases.map((p) => p.label) };
    if (w.status === 'fulfilled') { patch.workoutIds = w.value; summary.workoutDone = true; }
    if (d.status === 'fulfilled') { patch.dietId = d.value.dietId; summary.dietDone = true; summary.dietCostBrl = d.value.costBrl; summary.macros = d.value.totals; }
    summary.flags = reviewFlags(anamnese, user);

    if (w.status === 'fulfilled' && d.status === 'fulfilled') {
      await runStore.update(run.id, { ...patch, summary, status: 'DONE', step: 'DONE', error: null, finishedAt: new Date() });
      await notifyStudent(user.id, '🎉 Seu plano está pronto!', 'Seu treino e sua dieta já estão no app. Bora começar!', { type: 'auto_plan_ready' });
      const flagText = summary.flags.length ? ` ⚠️ Conferir: ${summary.flags.slice(0, 3).join(' · ')}` : '';
      await notifyCoach(user.coachId, '🤖 Plano automático gerado', `${user.name || 'Aluno'} (${spec.title}) já tem treino e dieta.${flagText}`, { type: 'auto_plan_done', studentId: user.id });
      return;
    }

    const err = [w, d].filter((x): x is PromiseRejectedResult => x.status === 'rejected').map((x) => String(x.reason?.message || x.reason)).join(' | ');
    console.error(`[autoPlan] falha parcial (${user.id}): ${err}`);
    await runStore.update(run.id, { ...patch, summary, status: 'FAILED', error: err.slice(0, 1500), finishedAt: new Date() });
    if (run.attempts >= MAX_ATTEMPTS) {
      await notifyCoach(user.coachId, '⚠️ Plano automático falhou', `${user.name || 'Aluno'} (${spec.title}): a IA não conseguiu montar o plano. Abra o aluno e gere pela IA ou monte à mão.`, { type: 'auto_plan_failed', studentId: user.id });
    }
  } catch (e: any) {
    console.error('[autoPlan] erro inesperado:', e);
    try { await runStore.update(run.id, { status: 'FAILED', error: String(e?.message || e).slice(0, 1500), finishedAt: new Date() }); } catch { /* sem como registrar */ }
  }
}

// ─── ENTRADAS PÚBLICAS ───────────────────────────────────────────────────────
const schedule = (runId: string) => {
  // segundo plano: a resposta HTTP não espera a IA (o servidor é um processo Node comum, que continua rodando depois de responder)
  setTimeout(() => { executeRun(runId).catch((e) => console.error('[autoPlan] executeRun:', e)); }, 0);
};

/**
 * Registra e dispara a montagem automática. `force` (coach/master): refaz mesmo que já tenha dado certo (cria uma nova corrida).
 * Sem force: aluno que já tem corrida ativa/concluída/manual NÃO ganha outra (uma segunda anamnese não pode apagar o plano dele).
 */
export async function startAutoPlan(userId: string, opts: { force?: boolean } = {}): Promise<{ started: boolean; runId?: string; reason?: string }> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, plan: true } });
  if (!user) return { started: false, reason: 'ALUNO_NAO_ENCONTRADO' };
  if (!isAutoPlan(user.plan)) return { started: false, reason: 'PLANO_SEM_MONTAGEM_AUTOMATICA' };

  const last = await runStore.latest(userId);
  const runningNow = !!last && last.status === 'RUNNING' && !!last.startedAt && Date.now() - new Date(last.startedAt).getTime() < STALE_RUNNING_MS;
  if (last && runningNow) return { started: false, runId: last.id, reason: 'JA_RUNNING' };   // nem o coach (force) dispara por cima de uma montagem em andamento
  if (last && !opts.force) {
    // corrida pendente ou com falha pode ser retomada; concluída/manual/rodando não se repete
    if (last.status === 'PENDING' || last.status === 'FAILED') { schedule(last.id); return { started: true, runId: last.id, reason: 'RETOMADA' }; }
    return { started: false, runId: last.id, reason: `JA_${last.status}` };
  }
  const run = await runStore.create(userId, user.plan);
  schedule(run.id);
  return { started: true, runId: run.id };
}

export interface AutoPlanStatus {
  status: 'NONE' | 'PENDING' | 'RUNNING' | 'DONE' | 'FAILED' | 'MANUAL';
  step: string | null;
  workoutReady: boolean;
  dietReady: boolean;
  attempts: number;
  message: string;
  runId?: string;
  summary?: any;
  error?: string | null;
}

/** Estado pro app. Também recoloca em andamento o que ficou pra trás (autocura): é seguro chamar toda hora. */
export async function getAutoPlanStatus(userId: string, opts: { detail?: boolean } = {}): Promise<AutoPlanStatus> {
  let run = await runStore.latest(userId);
  if (!run) {
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { plan: true } });
    const hasAnamnese = isAutoPlan(user?.plan) ? !!(await prisma.anamnese.findFirst({ where: { userId }, select: { id: true } })) : false;
    if (hasAnamnese) {
      const s = await startAutoPlan(userId);
      if (s.runId) run = await runStore.get(s.runId);
    }
    if (!run) return { status: 'NONE', step: null, workoutReady: false, dietReady: false, attempts: 0, message: studentMessage('NONE') };
  } else {
    const now = Date.now();
    const stale = run.status === 'RUNNING' && run.startedAt && now - new Date(run.startedAt).getTime() > STALE_RUNNING_MS;
    const retryable = run.status === 'FAILED' && run.attempts < MAX_ATTEMPTS && (!run.finishedAt || now - new Date(run.finishedAt).getTime() > RETRY_GAP_MS);
    if (run.status === 'PENDING' || stale || retryable) schedule(run.id);
  }
  const summary = run.summary || {};
  const out: AutoPlanStatus = {
    status: run.status as AutoPlanStatus['status'],
    step: run.step,
    workoutReady: (run.workoutIds || []).length > 0 && !!summary.workoutDone,
    dietReady: !!run.dietId,
    attempts: run.attempts,
    message: studentMessage(run.status, run.step),
    runId: run.id,
  };
  if (opts.detail) { out.summary = summary; out.error = run.error; }
  return out;
}
