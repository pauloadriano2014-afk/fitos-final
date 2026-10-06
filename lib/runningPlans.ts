// lib/runningPlans.ts
// 🏃 (6 out 2026) O que o SERVIDOR precisa saber dos protocolos de corrida (5K, 10K, 21K, 42K): quantas semanas tem cada um, em que bloco cai cada semana,
// os dias de treino e a SUGESTÃO por regras (tipo, semana de entrada, velocidades e dias) a partir da anamnese. O conteúdo dos treinos (fases, tempos) mora no app
// (src/utils/runningPlans.js); os dois lados são conferidos por teste para nunca divergirem (semanas e blocos).

export const PLAN_TYPES = ['5K', '10K', '21K', '42K'] as const;
export type PlanType = (typeof PLAN_TYPES)[number];

/** Os 3 treinos da semana: as chaves de sempre (os registros antigos usam esses nomes); o dia que aparece na tela vem de trainingDays. */
export const SESSION_KEYS = ['QUARTA', 'SEXTA', 'DOMINGO'] as const;
export const SESSIONS_PER_WEEK = SESSION_KEYS.length;

type Meta = { weeks: number; blocks: Array<[number, number]>; distanceKm: number; label: string };
export const PLAN_META: Record<PlanType, Meta> = {
  '5K': { weeks: 8, distanceKm: 5, label: 'Protocolo 5K', blocks: [[1, 2], [3, 4], [5, 6], [7, 7], [8, 8]] },
  '10K': { weeks: 10, distanceKm: 10, label: 'Protocolo 10K', blocks: [[1, 2], [3, 4], [5, 6], [7, 8], [9, 10]] },
  '21K': { weeks: 12, distanceKm: 21.1, label: 'Protocolo 21K', blocks: [[1, 3], [4, 6], [7, 9], [10, 11], [12, 12]] },
  '42K': { weeks: 16, distanceKm: 42.2, label: 'Protocolo 42K', blocks: [[1, 4], [5, 8], [9, 12], [13, 15], [16, 16]] },
};

export const normalizeType = (t: any): PlanType => (PLAN_TYPES.includes(t) ? (t as PlanType) : '5K');
export const totalWeeks = (t: any) => PLAN_META[normalizeType(t)].weeks;
export function clampWeek(type: any, week: any): number {
  const n = Math.round(Number(week));
  if (!Number.isFinite(n) || n < 1) return 1;
  return Math.min(n, totalWeeks(type));
}
export function blockOfWeek(type: any, week: any): number {
  const w = clampWeek(type, week);
  const i = PLAN_META[normalizeType(type)].blocks.findIndex(([a, b]) => w >= a && w <= b);
  return i < 0 ? 1 : i + 1;
}
/** Primeira semana de um bloco (para o app antigo, que mandava só o bloco de entrada). */
export function firstWeekOfBlock(type: any, block: any): number {
  const b = PLAN_META[normalizeType(type)].blocks[Math.round(Number(block)) - 1];
  return b ? b[0] : 1;
}

// ─── dias da semana ───────────────────────────────────────────────────────────
export const DAY_CODES = ['SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SAB', 'DOM'] as const;
const strip = (s: any) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '');
export const normalizeDay = (d: any): string | null => { const c = strip(d).toUpperCase().slice(0, 3); return (DAY_CODES as readonly string[]).includes(c) ? c : null; };

/** Valida os dias de treino do protocolo: 3 dias diferentes (leve, qualidade, longão). Vazio/ausente = sem escolha. Devolve null se for inválido. */
export function normalizeTrainingDays(v: any): string[] | null {
  if (v === undefined || v === null) return [];
  if (!Array.isArray(v)) return null;
  if (v.length === 0) return [];
  if (v.length !== SESSIONS_PER_WEEK) return null;
  const days = v.map(normalizeDay);
  if (days.some((d) => !d) || new Set(days).size !== days.length) return null;
  return days as string[];
}

const idx = (d: string) => (DAY_CODES as readonly string[]).indexOf(d);
const gap = (a: string, b: string) => { const x = (idx(b) - idx(a) + 7) % 7; return x === 0 ? 7 : x; };   // dias de a até b (circular)

/**
 * Escolhe 3 dos dias disponíveis e a ordem [leve, qualidade, longão]: dias espaçados (descanso entre os treinos fortes), longão no fim de semana quando der.
 * Menos de 3 dias disponíveis: usa o padrão QUA / SEX / DOM e avisa.
 */
export function suggestTrainingDays(available: any): { days: string[]; usedDefault: boolean } {
  const avail = Array.from(new Set((Array.isArray(available) ? available : []).map(normalizeDay).filter(Boolean) as string[]));
  if (avail.length < SESSIONS_PER_WEEK) return { days: ['QUA', 'SEX', 'DOM'], usedDefault: true };
  let best: { score: number; days: string[] } | null = null;
  for (let i = 0; i < avail.length; i++) for (let j = 0; j < avail.length; j++) for (let k = 0; k < avail.length; k++) {
    if (i === j || j === k || i === k) continue;
    const [easy, quality, long] = [avail[i], avail[j], avail[k]];
    // descanso entre os dois treinos fortes (qualidade e longão), nos dois sentidos da semana
    const hardGap = Math.min(gap(quality, long), gap(long, quality));
    const minGap = Math.min(gap(easy, quality), gap(quality, long), gap(long, easy), gap(quality, easy), gap(long, quality), gap(easy, long));
    const weekend = long === 'DOM' ? 2 : long === 'SAB' ? 1 : 0;
    const score = weekend * 1000 + Math.min(hardGap, 3) * 100 + Math.min(minGap, 3) * 10 - (idx(easy) > idx(quality) ? 1 : 0);
    if (!best || score > best.score) best = { score, days: [easy, quality, long] };
  }
  return { days: best!.days, usedDefault: false };
}

// ─── elegibilidade e sugestão por regras ──────────────────────────────────────
const DIST_RANK: Record<string, number> = { 'Menos de 1km': 0, '1 a 2km': 1, '2 a 3km': 2, '3 a 5km': 3, 'Mais de 5km': 4 };
const GOAL_TYPE: Record<string, PlanType> = { complete_5k: '5K', complete_10k: '10K', complete_21k: '21K', complete_42k: '42K' };
export const GOAL_LABELS: Record<string, string> = {
  complete_5k: 'Completar 5 km', complete_10k: 'Completar 10 km', complete_21k: 'Completar a meia maratona (21 km)', complete_42k: 'Completar a maratona (42 km)',
  weight_loss: 'Emagrecer', fitness: 'Condicionamento geral', race: 'Prova oficial', other: 'Outro',
};

const freq = (a: any) => { const n = parseInt(String(a?.weeklyFrequencyNow ?? '').replace(/\D/g, ''), 10); return Number.isFinite(n) ? n : 0; };
const dist = (a: any) => (a?.maxDistanceBefore in DIST_RANK ? DIST_RANK[a.maxDistanceBefore] : -1);
const raceText = (a: any) => strip(String(a?.racesDescription ?? '')).toLowerCase();
const ranHalf = (a: any) => /\b21(,\d)?\s*k|meia/.test(raceText(a));
const ranFull = (a: any) => /\b42(,\d)?\s*k|(?<!meia\s)maratona/.test(raceText(a));
const ran10 = (a: any) => /\b10\s*k/.test(raceText(a)) || ranHalf(a) || ranFull(a);

/** Quais protocolos o histórico da pessoa sustenta. O coach pode escolher outro (a decisão é dele), mas a IA e a sugestão automática só vão até aqui. */
export function eligibleTypes(a: any): PlanType[] {
  const out: PlanType[] = ['5K'];
  const active = a?.runningExperience === 'active';
  const strong = active && dist(a) >= 4 && freq(a) >= 2;               // corre hoje e já passou dos 5 km
  if (strong || (active && a?.completedRaces && ran10(a))) out.push('10K');
  if (strong && a?.completedRaces && (ranHalf(a) || ranFull(a)) && freq(a) >= 3) out.push('21K');
  if (strong && a?.completedRaces && ranFull(a) && freq(a) >= 3 && a?.medicalClearance === 'yes') out.push('42K');
  return out;
}

export type Preset = { z2: number; z3: number; z4: number; z5: number };
export const SPEED_PRESETS: Record<'iniciante' | 'padrao' | 'experiente', Preset> = {
  iniciante: { z2: 7, z3: 7.6, z4: 8.6, z5: 9.6 },
  padrao: { z2: 7.5, z3: 8.2, z4: 9.5, z5: 10.8 },
  experiente: { z2: 8.5, z3: 9.3, z4: 10.5, z5: 11.8 },
};

/** Velocidades por zona válidas (km/h): z2 < z3 < z4 < z5, todas entre 4 e 20. Devolve null se algo estiver fora. */
export function sanitizeSpeeds(v: any): Preset | null {
  if (!v || typeof v !== 'object') return null;
  const out: any = {};
  for (const k of ['z2', 'z3', 'z4', 'z5']) {
    const n = Number(String(v[k]).replace(',', '.'));
    if (!Number.isFinite(n) || n < 4 || n > 20) return null;
    out[k] = Math.round(n * 10) / 10;
  }
  return out.z2 < out.z3 && out.z3 < out.z4 && out.z4 < out.z5 ? (out as Preset) : null;
}

export type RulesSuggestion = {
  protocolType: PlanType; startWeek: number; customSpeeds: Preset; trainingDays: string[]; adaptations: string | null; customNotes: string; warnings: string[]; reasons: string[];
};

/** A sugestão por regras (sem IA): serve para todo coach e também de rede de segurança quando a IA erra. */
export function suggestByRules(a: any): RulesSuggestion {
  const warnings: string[] = [];
  const reasons: string[] = [];
  const eligible = eligibleTypes(a);
  const goalType = GOAL_TYPE[a?.runningGoal as string];
  let type: PlanType;
  if (goalType) {
    type = eligible.includes(goalType) ? goalType : eligible[eligible.length - 1];
    if (type !== goalType) warnings.push(`O objetivo é ${goalType}, mas pela anamnese ainda não há base para esse protocolo. Sugestão: ${type} primeiro.`);
    else if (goalType !== '5K') reasons.push(`Objetivo ${goalType} e histórico de corrida compatível.`);
  } else {
    type = eligible.includes('10K') && a?.runningGoal !== 'weight_loss' ? '10K' : '5K';
  }

  // semana de entrada (conservadora): quem nunca correu, parou ou treina pouco começa do início
  let startWeek = 1;
  if (type === '5K') {
    const d = dist(a);
    if (a?.runningExperience === 'active' && freq(a) >= 2) startWeek = d >= 3 ? 5 : d === 2 ? 3 : 1;
    else if (a?.runningExperience === 'stopped' && d >= 3 && (a?.timeStopped === 'Menos de 3 meses')) startWeek = 3;
    if ((a?.fitnessLevel && a.fitnessLevel <= 2) || !a?.canJog5min) startWeek = 1;
    if (startWeek > 1) reasons.push(`Entra na semana ${startWeek} pelo histórico (corre hoje e já fez ${a?.maxDistanceBefore}).`);
  }

  const beginner = a?.runningExperience === 'never' || a?.runningExperience === 'stopped' || (a?.fitnessLevel && a.fitnessLevel <= 2);
  const experienced = a?.runningExperience === 'active' && dist(a) >= 4 && (a?.fitnessLevel ?? 0) >= 4;
  const customSpeeds = SPEED_PRESETS[beginner ? 'iniciante' : experienced ? 'experiente' : 'padrao'];

  const t = suggestTrainingDays(a?.availableDays);
  if (t.usedDefault) warnings.push('A pessoa marcou menos de 3 dias disponíveis: usei quarta, sexta e domingo. Confira antes de confirmar.');

  const injuries = Array.isArray(a?.injuries) ? a.injuries.filter((x: string) => x && x !== 'Nenhuma') : [];
  if (a?.heartCondition) warnings.push('Informou condição cardíaca: confirme a liberação médica antes de ativar o protocolo.');
  if (a?.medicalClearance && a.medicalClearance !== 'yes') warnings.push('Sem liberação médica para atividade física informada.');
  if (injuries.length) warnings.push(`Lesões informadas: ${injuries.join(', ')}.`);
  if (a?.jointIssues) warnings.push('Informou problema articular: observe o impacto e a progressão.');
  if (a?.canWalk30min === false) warnings.push('Disse que não consegue caminhar 30 minutos: comece pela caminhada antes do protocolo.');

  const attention: string[] = [];
  if (injuries.length) attention.push(`Lesões: ${injuries.join(', ')}.`);
  if (a?.jointIssues) attention.push('Problema articular.');
  if (a?.bodyPainDuringWalk) attention.push(`Dor ao caminhar: ${String(a.bodyPainDuringWalk).slice(0, 120)}.`);
  const adaptations = attention.length ? `Pontos de atenção: ${attention.join(' ')} Priorize piso plano/esteira e avalie reduzir o impacto.` : null;

  const customNotes = [
    `Sugestão automática: ${type}, entrada na semana ${startWeek}.`,
    `Perfil: ${a?.runningExperience === 'never' ? 'nunca correu' : a?.runningExperience === 'stopped' ? 'já correu e parou' : 'corre atualmente'}.`,
    a?.runningGoal ? `Objetivo: ${GOAL_LABELS[a.runningGoal] || a.runningGoal}.` : null,
  ].filter(Boolean).join(' ');

  return { protocolType: type, startWeek, customSpeeds, trainingDays: t.days, adaptations, customNotes, warnings, reasons };
}

/**
 * Confere a resposta da IA (que vem como texto livre): tipo e semana válidos, velocidades coerentes e nada que a anamnese não sustente.
 * O que não servir é trocado pela sugestão por regras. Devolve a sugestão final + o que foi corrigido.
 */
export function sanitizeAiSuggestion(raw: any, a: any): { suggestion: RulesSuggestion; corrections: string[] } {
  const rules = suggestByRules(a);
  const corrections: string[] = [];
  const r = raw && typeof raw === 'object' ? raw : {};
  const eligible = eligibleTypes(a);

  let type: PlanType;
  if (r.protocolType === undefined || r.protocolType === null) type = rules.protocolType;
  else if (!PLAN_TYPES.includes(r.protocolType)) { corrections.push(`A IA sugeriu um tipo desconhecido (${String(r.protocolType).slice(0, 20)}): usei ${rules.protocolType}.`); type = rules.protocolType; }
  else if (!eligible.includes(r.protocolType)) { corrections.push(`A IA sugeriu ${r.protocolType}, mas pela anamnese a pessoa ainda não tem base: ajustei para ${rules.protocolType}.`); type = rules.protocolType; }
  else type = r.protocolType;

  // a IA só pode ser MAIS cautelosa que as regras na semana de entrada (nunca entrar mais adiantada); se a IA escolheu OUTRO tipo, o teto é a semana 3 (5K) ou a 1 (10K+)
  const aiWeek = r.startWeek === undefined || r.startWeek === null || r.startWeek === '' ? NaN : Number(r.startWeek);
  const cap = type === rules.protocolType ? rules.startWeek : type === '5K' ? 3 : 1;
  let startWeek = Number.isFinite(aiWeek) ? Math.min(clampWeek(type, aiWeek), cap) : clampWeek(type, rules.startWeek);
  if (Number.isFinite(aiWeek) && clampWeek(type, aiWeek) > cap) corrections.push(`A IA queria entrar na semana ${clampWeek(type, aiWeek)} do ${type}; pela anamnese limitei à semana ${cap}.`);
  if (!Number.isFinite(aiWeek) && r.startWeek !== undefined) corrections.push('A semana de entrada veio fora do formato: usei a da sugestão automática.');
  if (type !== rules.protocolType && !Number.isFinite(aiWeek)) startWeek = 1;

  let speeds = sanitizeSpeeds(r.customSpeeds);
  if (!speeds) { if (r.customSpeeds) corrections.push('As velocidades da IA estavam fora do normal: usei as da sugestão automática.'); speeds = rules.customSpeeds; }

  const text = (v: any, max: number) => (typeof v === 'string' && v.trim() && v.trim().toLowerCase() !== 'null' ? v.trim().slice(0, max) : null);
  const suggestion: RulesSuggestion = {
    ...rules, protocolType: type, startWeek, customSpeeds: speeds,
    adaptations: text(r.adaptations, 1500) ?? rules.adaptations,
    customNotes: text(r.customNotes, 1500) ?? rules.customNotes,
    warnings: rules.warnings,
  };
  return { suggestion, corrections };
}

/** A IA devolve texto: tira cercas de markdown e pega do primeiro "{" ao último "}". Null se não for um objeto JSON. */
export function extractJson(raw: string): any | null {
  const clean = String(raw || '').replace(/```json|```/g, '').trim();
  const a = clean.indexOf('{'), b = clean.lastIndexOf('}');
  if (a < 0 || b <= a) return null;
  try { const v = JSON.parse(clean.slice(a, b + 1)); return v && typeof v === 'object' && !Array.isArray(v) ? v : null; }
  catch { return null; }
}
