// lib/autoPlanQuality.ts
// 🛡️ (4 out 2026) TRAVAS DE SEGURANÇA E QUALIDADE do plano automático (lib/autoPlan.ts). Tudo aqui é função pura, sem banco nem IA.
//
// Por que existe: o plano automático chega ao aluno SEM o coach revisar. Então a estrutura (dias, séries, calorias, macros) vem de código, e o que a
// IA devolve é CONFERIDO antes de salvar. Três camadas:
//   1. triagem   -> quem não pode receber plano automático (gestante, menor de 16, IMC fora da faixa, bariátrica, diabetes tipo 1): vai pro coach;
//   2. modo seguro -> quem pode, mas com cuidado (hipertensão, 60+, dor articular...): sem técnicas pesadas, cardio leve e, nas articulações que
//                     a biblioteca marca (JOELHO, LOMBAR, OMBRO), sem os exercícios de risco;
//   3. conferência -> o treino e a dieta que a IA devolveu são checados e consertados (dia vazio, exercício repetido, nº de séries errado, cardio
//                     que faltou, alimento fora da lista da alergia...). O que não dá pra consertar manda refazer; se continuar errado, vai pro coach.
import { calcAge } from '@/lib/macroPlanner';

// ─── LIMITES (um lugar só para ajustar) ──────────────────────────────────────
export const LIMITS = {
  minAge: 16,            // abaixo disso: coach
  imcLow: 18.5,          // abaixo (e emagrecendo): coach
  imcHigh: 40,           // a partir daqui (obesidade grau III): coach
  imcCareful: 35,        // a partir daqui: modo seguro
  seniorAge: 60,         // a partir daqui: modo seguro
  minDayRatio: 0.7,      // dia com menos que 70% dos exercícios pedidos: refaz
  maxKcalDeviation: 0.12,// dieta que fugiu mais que 12% da meta de calorias: refaz
  maxFoodRemoved: 0.2,   // IA usou mais de 20% de alimentos fora da lista: refaz
  minMeals: 3,
};

const norm = (s: any) => String(s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const arr = (v: any): string[] => (Array.isArray(v) ? v.map((x) => String(x)) : []);
const isNone = (s: string) => /^(nenhum|nenhuma|nao|não)$/i.test(String(s).trim());
const real = (v: any) => arr(v).filter((x) => x && !isNone(x));

// ─── MAPA GRUPO DO PLANO -> "target" DA BIBLIOTECA ───────────────────────────
// A biblioteca do coach não usa exatamente os nomes dos grupos do plano (POSTERIOR x POSTERIORES, OMBROS x OMBRO_MULTI, ABDUTOR sem exercício...).
// Este mapa diz em quais targets cada grupo pode ser atendido; vale para conferir cobertura e para saber de que grupo é um exercício.
export const TARGET_ALIASES: Record<string, string[]> = {
  QUADRICEPS: ['QUADRICEPS', 'PERNAS'],
  POSTERIORES: ['POSTERIORES', 'POSTERIOR', 'PERNAS'],
  GLUTEOS: ['GLUTEOS', 'PERNAS'],
  PANTURRILHA: ['PANTURRILHA'],
  ADUTOR: ['ADUTOR', 'PERNAS'],
  ABDUTOR: ['ABDUTOR', 'GLUTEOS', 'PERNAS'],
  COSTAS_PUXADA: ['COSTAS_PUXADA', 'COSTAS'],
  COSTAS_REMADA: ['COSTAS_REMADA', 'COSTAS'],
  OMBRO_MULTI: ['OMBRO_MULTI', 'OMBROS', 'OMBRO_FRONTAL'],
  OMBRO_FRONTAL: ['OMBRO_FRONTAL', 'OMBROS'],
  OMBRO_LATERAL: ['OMBRO_LATERAL', 'OMBROS'],
  OMBRO_POST: ['OMBRO_POST', 'OMBROS'],
  TRAPEZIO: ['TRAPEZIO', 'OMBROS'],
  PEITO: ['PEITO'],
  BICEPS: ['BICEPS'],
  TRICEPS: ['TRICEPS'],
  ABDOMEN: ['ABDOMEN', 'ABDÔMEN'],
  CARDIO: ['CARDIO'],
};
export const aliasesOf = (groupId: string): string[] => TARGET_ALIASES[groupId] || [groupId];

// ─── 1) TRIAGEM ──────────────────────────────────────────────────────────────
export interface Triage {
  /** Preenchido = NÃO montar automaticamente: o coach monta (code vira o `error` da corrida). */
  manual: { code: string; reason: string } | null;
  /** Motivos do modo seguro (vazio = plano normal). */
  conservative: string[];
  /** Articulações cujos exercícios de risco ficam fora da biblioteca que a IA vê. */
  excludeJointRisk: string[];
}

export function imcOf(a: any): number | null {
  const imc = Number(a?.imc);
  if (Number.isFinite(imc) && imc > 0) return imc;
  const peso = Number(a?.peso), alt = Number(a?.altura);
  if (Number.isFinite(peso) && Number.isFinite(alt) && peso > 0 && alt > 0) return peso / ((alt / 100) ** 2);
  return null;
}

const JOINT_BY_TEXT: Array<[RegExp, string]> = [
  [/joelho|lca|menisco/, 'JOELHO'],
  [/lombar|coluna|hernia/, 'LOMBAR'],
  [/ombro|manguito/, 'OMBRO'],
];

export function triage(a: any, user: { birthDate?: string | null }, spec: { fatLoss: boolean }): Triage {
  const conds = real(a?.healthConditions);
  const meds = real(a?.medications);
  const reasons: Array<{ code: string; reason: string }> = [];

  if (conds.some((c) => /gestante|gravida|lactante|amament/.test(norm(c)))) reasons.push({ code: 'GESTANTE_LACTANTE', reason: 'Gestante ou lactante' });
  const age = calcAge(user?.birthDate);
  if (age < LIMITS.minAge) reasons.push({ code: 'MENOR_DE_IDADE', reason: `Menor de ${LIMITS.minAge} anos (${age} anos)` });
  const imc = imcOf(a);
  if (imc !== null && spec.fatLoss && imc < LIMITS.imcLow) reasons.push({ code: 'IMC_BAIXO', reason: `IMC ${imc.toFixed(1)} (abaixo do peso) com objetivo de perder peso` });
  if (imc !== null && imc >= LIMITS.imcHigh) reasons.push({ code: 'OBESIDADE_GRAU_3', reason: `IMC ${imc.toFixed(1)} (obesidade grau III)` });
  if (a?.bariatric === true) reasons.push({ code: 'BARIATRICA', reason: 'Cirurgia bariátrica' });
  if (conds.some((c) => /diabetes tipo 1/.test(norm(c)))) reasons.push({ code: 'DIABETES_TIPO_1', reason: 'Diabetes tipo 1' });

  const limits = [...real(a?.limitacoes), ...real(a?.cirurgias)];
  const conservative: string[] = [];
  if (conds.some((c) => /hipertensao/.test(norm(c)))) conservative.push('Hipertensão');
  if (conds.some((c) => /diabetes tipo 2|pre-diabetes|resistencia a insulina/.test(norm(c)))) conservative.push('Diabetes tipo 2 / resistência à insulina');
  if (conds.some((c) => /hipertireoidismo/.test(norm(c)))) conservative.push('Hipertireoidismo');
  if (meds.some((m) => /anti-hipertensivo|corticoide/.test(norm(m)))) conservative.push(`Medicamento: ${meds.filter((m) => /anti-hipertensivo|corticoide/.test(norm(m))).join(', ')}`);
  if (age >= LIMITS.seniorAge) conservative.push(`Idade ${age} anos`);
  if (imc !== null && imc >= LIMITS.imcCareful) conservative.push(`IMC ${imc.toFixed(1)}`);
  if (limits.length) conservative.push(`Limitações/cirurgias: ${limits.join(', ')}`);

  const risks = new Set<string>();
  for (const l of limits) for (const [re, joint] of JOINT_BY_TEXT) if (re.test(norm(l))) risks.add(joint);

  return {
    manual: reasons.length ? { code: reasons[0].code, reason: reasons.map((r) => r.reason).join('; ') } : null,
    conservative,
    excludeJointRisk: [...risks],
  };
}

/** Técnicas permitidas no modo seguro: só as que não pedem esforço máximo. */
export function safeTechniques(techniques: string[]): string[] {
  const calm = techniques.filter((t) => t === 'BISET');
  return calm;
}

/** Regra extra do ciclo no modo seguro (mesmo formato de limitationRules que a IA do coach já lê). */
export const SAFE_CARDIO_RULE = {
  id: 'MODO_SEGURO', trigger: 'modo seguro', label: 'Modo seguro', color: '#FF9500',
  rules: [
    { group: 'CARDIO', forceLight: true, note: 'Intensidade leve a moderada (Zona 2), sem HIIT nem tiros.' },
    { group: 'GERAL', addNote: true, note: 'Cargas moderadas, execução controlada e sem levar nenhuma série à falha.' },
  ],
};

// ─── 2) COBERTURA DA BIBLIOTECA APÓS O FILTRO DE ARTICULAÇÃO ─────────────────
export interface PlanDay { name: string; groups: Array<{ id: string; qty: number; sets?: number }> }

const countIn = (targets: string[], bank: string[]) => bank.filter((t) => targets.includes(t)).length;

/** O filtro de risco articular não pode esvaziar um grupo do plano: se sobrar menos de 2 exercícios onde havia 2 ou mais, o coach monta. */
export function jointFilterIssues(days: PlanDay[], before: string[], after: string[]): string[] {
  const issues: string[] = [];
  const seen = new Set<string>();
  for (const d of days) for (const g of d.groups) {
    if (seen.has(g.id) || g.id === 'CARDIO' || g.id === 'MOBILIDADE') continue;
    seen.add(g.id);
    const t = aliasesOf(g.id);
    const b = countIn(t, before), af = countIn(t, after);
    if (b >= 2 && af < 2) issues.push(`${g.id}: sobraram ${af} de ${b} exercícios depois de tirar os de risco`);
  }
  return issues;
}

// ─── 3) CONFERÊNCIA DO TREINO ────────────────────────────────────────────────
export interface WorkoutCheck { body: any; blocking: string[]; notes: string[]; repairs: number }

// técnicas em que o nº de blocos tem significado próprio (GVT = 10, 21 e cluster seguem o próprio padrão): não mexer
const BLOCKS_OWN_RULE = new Set(['GVT', '21', 'CLUSTERSET', 'DROPSET', 'RESTPAUSE']);

const targetOfExercise = (ex: any, meta: Record<string, { target?: string }>) => String(meta?.[ex.exerciseId]?.target || '').toUpperCase();
const isCardioEx = (ex: any, meta: Record<string, { target?: string }>) => String(ex?.category || '').toUpperCase() === 'CARDIO' || targetOfExercise(ex, meta) === 'CARDIO';

/**
 * Confere o treino que a IA devolveu contra a estrutura que o plano pediu (cycleConfig.days) e conserta o que dá:
 *   conserta -> exercício repetido no mesmo dia, dia que a IA inventou, nº de blocos diferente das séries do grupo;
 *   refaz    -> dia sem exercício, dia com menos de 70% dos exercícios, dia sem cardio quando o plano pede cardio.
 * `meta` = { exerciseId: { target } } da biblioteca (o corpo da IA só traz categoria).
 */
export function checkWorkout(cycleConfig: { days: PlanDay[] }, body: any, meta: Record<string, { target?: string }> = {}): WorkoutCheck {
  const blocking: string[] = [], notes: string[] = [];
  let repairs = 0;
  const out: Record<string, any[]> = {};
  const expectedNames = new Set((cycleConfig.days || []).map((d) => String(d.name)));
  const given: Record<string, any[]> = body?.exercisesByDay || {};

  for (const d of cycleConfig.days || []) {
    const name = String(d.name);
    const wanted = (d.groups || []).filter((g) => g.id !== 'MOBILIDADE');
    const expected = wanted.reduce((s, g) => s + (Number(g.qty) || 0), 0);
    const list: any[] = Array.isArray(given[name]) ? given[name] : [];

    // repetido no mesmo dia (mantém o primeiro)
    const seen = new Set<string>();
    const unique = list.filter((ex) => { if (seen.has(ex.exerciseId)) return false; seen.add(ex.exerciseId); return true; });
    if (unique.length !== list.length) { repairs += list.length - unique.length; notes.push(`Dia ${name}: ${list.length - unique.length} exercício(s) repetido(s) removido(s)`); }

    if (!unique.length) { blocking.push(`Dia ${name} veio sem exercícios`); out[name] = []; continue; }
    if (unique.length < Math.ceil(expected * LIMITS.minDayRatio)) blocking.push(`Dia ${name}: só ${unique.length} de ${expected} exercícios`);
    else if (unique.length < expected) notes.push(`Dia ${name}: ${unique.length} de ${expected} exercícios`);

    if (wanted.some((g) => g.id === 'CARDIO') && !unique.some((ex) => isCardioEx(ex, meta))) blocking.push(`Dia ${name} veio sem cardio`);

    // nº de blocos = séries do grupo (só quando dá pra saber o grupo sem dúvida e a técnica não tem regra própria)
    out[name] = unique.map((ex) => {
      if (isCardioEx(ex, meta)) return ex;
      const blocks: any[] = Array.isArray(ex.blocks) ? ex.blocks : [];
      if (!blocks.length || blocks.some((b) => BLOCKS_OWN_RULE.has(String(b.technique || '').toUpperCase()))) return ex;
      const t = targetOfExercise(ex, meta);
      if (!t) return ex;
      const sets = new Set(wanted.filter((g) => aliasesOf(g.id).includes(t) && Number(g.sets) > 0).map((g) => Number(g.sets)));
      if (sets.size !== 1) return ex;
      const want = [...sets][0];
      if (blocks.length === want) return ex;
      repairs++;
      notes.push(`Dia ${name}: "${ex.title || ex.exerciseId}" tinha ${blocks.length} séries, ajustado para ${want}`);
      const fixed = blocks.length > want ? blocks.slice(0, want) : [...blocks, ...Array.from({ length: want - blocks.length }, () => ({ ...blocks[blocks.length - 1] }))];
      return { ...ex, blocks: fixed };
    });
  }

  const extra = Object.keys(given).filter((k) => !expectedNames.has(k));
  if (extra.length) { repairs += extra.length; notes.push(`Dia(s) que o plano não pediu foram removidos: ${extra.join(', ')}`); }

  const tabs = (cycleConfig.days || []).map((d) => String(d.name)).filter((n) => out[n] && out[n].length);
  return { body: { ...body, exercisesByDay: out, workoutTabs: tabs }, blocking, notes, repairs };
}

/** Aluno sem nenhum treino registrado: a carga que a IA escreve seria chute. Deixa em branco para ele achar a carga certa no primeiro treino. */
export function blankLoads(body: any): any {
  const out: Record<string, any[]> = {};
  for (const [day, list] of Object.entries<any[]>(body?.exercisesByDay || {})) {
    out[day] = (list || []).map((ex) => ({ ...ex, blocks: (ex.blocks || []).map((b: any) => ({ ...b, load: '' })) }));
  }
  return { ...body, exercisesByDay: out };
}

// ─── 4) CONFERÊNCIA DA DIETA ─────────────────────────────────────────────────
export interface DietCheck { meals: any[]; blocking: string[]; notes: string[]; removed: number; kcal: number }

/** Calorias do dia: só o 1º item de cada grupo conta (os outros dois são substitutos equivalentes), igual ao motor de dieta. */
export function dayKcal(meals: any[]): number {
  let total = 0;
  meals.forEach((meal, mi) => {
    const counted = new Set<string>();
    for (const it of meal.items || []) {
      const key = `${mi}:${it.groupId}`;
      if (counted.has(key)) continue;
      counted.add(key);
      total += ((Number(it.calories_per_100) || 0) * (parseFloat(it.amount) || 0)) / 100;
    }
  });
  return Math.round(total);
}

/**
 * Confere uma aba da dieta. `allowed` = ids do catálogo liberados para este aluno (sem o que a alergia/aversão/bariátrica excluem).
 *   conserta -> tira alimento que não é do catálogo ou que a restrição do aluno proíbe;
 *   refaz    -> menos de 3 refeições, refeição que ficou vazia, mais de 20% de alimentos proibidos, calorias muito longe da meta.
 */
export function checkDietDay(meals: any[], targetKcal: number, allowed: Set<string>): DietCheck {
  const blocking: string[] = [], notes: string[] = [];
  let removed = 0, total = 0;

  const cleaned = (meals || []).map((meal: any) => {
    const items = (meal.items || []).filter((it: any) => {
      total++;
      const ok = allowed.has(String(it.id));
      if (!ok) { removed++; notes.push(`"${it.name}" fora da lista liberada para o aluno, removido`); }
      return ok;
    });
    return { ...meal, items };
  });

  if (cleaned.length < LIMITS.minMeals) blocking.push(`Só ${cleaned.length} refeições`);
  const empty = cleaned.filter((m: any) => !m.items.length);
  if (empty.length) blocking.push(`Refeição sem alimento: ${empty.map((m: any) => m.name).join(', ')}`);
  if (total > 0 && removed / total > LIMITS.maxFoodRemoved) blocking.push(`${removed} de ${total} alimentos fora da lista liberada`);

  const kcal = dayKcal(cleaned);
  if (targetKcal > 0 && Math.abs(kcal - targetKcal) > targetKcal * LIMITS.maxKcalDeviation) blocking.push(`Calorias ${kcal} kcal, meta ${targetKcal} kcal`);

  return { meals: cleaned, blocking, notes, removed, kcal };
}
