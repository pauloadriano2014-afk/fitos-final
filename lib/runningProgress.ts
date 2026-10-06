// lib/runningProgress.ts
// 🏃 (6 out 2026) Andamento do protocolo de corrida por DESEMPENHO.
// Antes: a semana andava só com o calendário (travava na 8 e nunca olhava o que a aluna fez). Agora quem manda é o que ela treinou:
//   • A semana FECHA quando ela faz os 3 treinos (e a próxima só abre 7 dias depois de a semana abrir: descansar também é treinar),
//     ou quando já passaram 7 dias e ela fez pelo menos 2 dos 3.
//   • Se a semana fechou e o esforço médio (RPE) foi alto (9 ou mais), a semana é REPETIDA uma vez antes de subir.
//   • Se ficou 14 dias sem fazer pelo menos 2 treinos, volta UMA semana (não passa de 1).
//   • O protocolo termina quando ela faz a PROVA (o DOMINGO da última semana).
// Tudo é função pura sobre (protocolo, treinos, agora): quem chama grava o estado novo quando `changed` for true.

import { PLAN_META, SESSION_KEYS, SESSIONS_PER_WEEK, blockOfWeek, clampWeek, normalizeType, totalWeeks, type PlanType } from './runningPlans';

const DAY = 86400000;
export const WEEK_DAYS = 7;
export const IDLE_DAYS_TO_STEP_BACK = 14;
export const HARD_RPE = 9;
export const MIN_SESSIONS_SOFT_CLOSE = 2;

export type ProtocolState = {
  id: string;
  protocolType?: string | null;
  startWeek: number;
  startDate: Date | string;
  currentWeek?: number | null;
  weekOpenedAt?: Date | string | null;
  completedAt?: Date | string | null;
  lastRepeatWeek?: number | null;
  progressNote?: string | null;
};
export type RunLogLite = { protocolId?: string | null; sessionDay: string; createdAt: Date | string; rpe?: number | null };

export type Persisted = { currentWeek: number; weekOpenedAt: Date; completedAt: Date | null; lastRepeatWeek: number | null; progressNote: string | null };

export type ProgressView = {
  type: PlanType;
  week: number;
  totalWeeks: number;
  block: number;
  status: 'ACTIVE' | 'WEEK_DONE' | 'COMPLETED';   // ACTIVE = treinando a semana; WEEK_DONE = fez tudo e espera a próxima abrir; COMPLETED = concluiu o protocolo
  doneKeys: string[];
  sessionsPerWeek: number;
  openedAt: Date;
  unlocksAt: Date | null;                          // quando a próxima semana abre (só em WEEK_DONE)
  daysLeft: number;                                // dias que faltam para a semana "vencer" (0 = já venceu)
  overdue: boolean;                                // a semana já passou de 7 dias sem fechar
  avgRpe: number | null;
  note: string | null;
  completedAt: Date | null;
  pct: number;                                     // 0 a 100
};

const d = (v: any): Date => (v instanceof Date ? v : new Date(v));
const startOfDay = (x: Date) => { const y = new Date(x); y.setHours(0, 0, 0, 0); return y; };
const fmtRpe = (n: number) => String(Math.round(n * 10) / 10).replace('.', ',');

/** Estado de um protocolo antigo (sem semana gravada): usa o calendário como antes e passa a gravar a partir daí. */
export function legacyState(p: ProtocolState, now: Date): Persisted {
  const type = normalizeType(p.protocolType);
  const start = startOfDay(d(p.startDate));
  const diffDays = Math.floor((startOfDay(now).getTime() - start.getTime()) / DAY);
  const week = clampWeek(type, (p.startWeek || 1) + Math.floor(Math.max(0, diffDays) / WEEK_DAYS));
  const calendarStart = new Date(start.getTime() + (week - (p.startWeek || 1)) * WEEK_DAYS * DAY);
  // a semana 8 antiga ficava "aberta" para sempre; sem este limite o protocolo recuaria na primeira abertura
  const floor = new Date(now.getTime() - (WEEK_DAYS - 1) * DAY);
  const openedAt = new Date(Math.min(now.getTime(), Math.max(calendarStart.getTime(), floor.getTime())));
  return { currentWeek: week, weekOpenedAt: openedAt, completedAt: null, lastRepeatWeek: null, progressNote: null };
}

function stateOf(p: ProtocolState, now: Date): { s: Persisted; fresh: boolean } {
  if (p.currentWeek != null && p.weekOpenedAt != null) {
    return { fresh: false, s: { currentWeek: clampWeek(p.protocolType, p.currentWeek), weekOpenedAt: d(p.weekOpenedAt), completedAt: p.completedAt ? d(p.completedAt) : null, lastRepeatWeek: p.lastRepeatWeek ?? null, progressNote: p.progressNote ?? null } };
  }
  return { fresh: true, s: legacyState(p, now) };
}

/** Os treinos do protocolo feitos na rodada atual da semana (desde que ela abriu), um por tipo de treino. */
function roundLogs(p: ProtocolState, logs: RunLogLite[], openedAt: Date): RunLogLite[] {
  return logs.filter((l) => (l.protocolId == null || l.protocolId === p.id) && (SESSION_KEYS as readonly string[]).includes(l.sessionDay) && d(l.createdAt).getTime() >= openedAt.getTime());
}

/**
 * Resolve o andamento. `logs` = os registros do aluno (de preferência só os do protocolo). Aplica no máximo algumas transições em cadeia
 * (ex.: fechou a semana e a próxima também já venceu parada), devolve o estado a gravar (`next`), se mudou, e a visão para a tela.
 */
export function resolveProgress(p: ProtocolState, logs: RunLogLite[], now: Date = new Date()): { next: Persisted; changed: boolean; view: ProgressView } {
  const type = normalizeType(p.protocolType);
  const total = totalWeeks(type);
  const { s: base, fresh } = stateOf(p, now);
  let s: Persisted = { ...base };
  let changed = fresh;

  for (let guard = 0; guard < 40 && !s.completedAt; guard++) {
    const rl = roundLogs(p, logs, s.weekOpenedAt);
    const done = new Set(rl.map((l) => l.sessionDay));
    const elapsed = now.getTime() - s.weekOpenedAt.getTime();
    const weekOver = elapsed >= WEEK_DAYS * DAY;
    const isFinal = s.currentWeek >= total;

    // concluiu: fez a prova (DOMINGO da última semana)
    if (isFinal && done.has('DOMINGO')) {
      const race = rl.filter((l) => l.sessionDay === 'DOMINGO').sort((a, b) => d(a.createdAt).getTime() - d(b.createdAt).getTime())[0];
      s = { ...s, completedAt: d(race.createdAt), progressNote: 'Protocolo concluído! 🏁' };
      changed = true;
      break;
    }
    if (isFinal) {
      // última semana: só encerra pela prova; mas parar 14 dias ainda volta uma semana
      if (elapsed >= IDLE_DAYS_TO_STEP_BACK * DAY && done.size < MIN_SESSIONS_SOFT_CLOSE) { s = stepBack(s, type, now); changed = true; continue; }
      break;
    }

    const full = done.size >= SESSIONS_PER_WEEK;
    const soft = done.size >= MIN_SESSIONS_SOFT_CLOSE && weekOver;
    if (full && !weekOver) break;   // semana concluída: espera a próxima abrir

    if (full || soft) {
      const rpes = rl.map((l) => l.rpe).filter((n): n is number => typeof n === 'number' && n > 0);
      const avg = rpes.length >= 2 ? rpes.reduce((a, b) => a + b, 0) / rpes.length : null;
      if (avg !== null && avg >= HARD_RPE && s.lastRepeatWeek !== s.currentWeek) {
        s = { ...s, weekOpenedAt: full ? new Date(s.weekOpenedAt.getTime() + WEEK_DAYS * DAY) : now, lastRepeatWeek: s.currentWeek,
          progressNote: `Semana ${s.currentWeek} repetida: o esforço médio foi ${fmtRpe(avg)} de 10 (muito pesado). Vamos consolidar antes de subir.` };
      } else {
        s = { ...s, currentWeek: s.currentWeek + 1, weekOpenedAt: full ? new Date(s.weekOpenedAt.getTime() + WEEK_DAYS * DAY) : now, lastRepeatWeek: null,
          progressNote: soft && !full ? `Semana ${s.currentWeek} fechada com ${done.size} de ${SESSIONS_PER_WEEK} treinos. Seguimos para a semana ${s.currentWeek + 1}.` : null };
      }
      changed = true;
      continue;
    }

    if (elapsed >= IDLE_DAYS_TO_STEP_BACK * DAY && done.size < MIN_SESSIONS_SOFT_CLOSE) { s = stepBack(s, type, now); changed = true; continue; }
    break;
  }

  return { next: s, changed, view: buildView(p, type, s, logs, now) };
}

function stepBack(s: Persisted, type: PlanType, now: Date): Persisted {
  const week = Math.max(1, s.currentWeek - 1);
  return { ...s, currentWeek: week, weekOpenedAt: now, lastRepeatWeek: null,
    progressNote: week < s.currentWeek ? `Voltamos para a semana ${week}: foram mais de ${IDLE_DAYS_TO_STEP_BACK} dias sem treinar. Retomar com calma protege o corpo.` : `Recomeçando a semana ${week}: foram mais de ${IDLE_DAYS_TO_STEP_BACK} dias sem treinar.` };
}

function buildView(p: ProtocolState, type: PlanType, s: Persisted, logs: RunLogLite[], now: Date): ProgressView {
  const total = totalWeeks(type);
  const rl = roundLogs(p, logs, s.weekOpenedAt);
  const doneKeys = (SESSION_KEYS as readonly string[]).filter((k) => rl.some((l) => l.sessionDay === k));
  const rpes = rl.map((l) => l.rpe).filter((n): n is number => typeof n === 'number' && n > 0);
  const avgRpe = rpes.length ? Math.round((rpes.reduce((a, b) => a + b, 0) / rpes.length) * 10) / 10 : null;
  const elapsed = now.getTime() - s.weekOpenedAt.getTime();
  const completed = !!s.completedAt;
  const full = doneKeys.length >= SESSIONS_PER_WEEK;
  const status: ProgressView['status'] = completed ? 'COMPLETED' : full && s.currentWeek < total ? 'WEEK_DONE' : 'ACTIVE';
  const unlocksAt = status === 'WEEK_DONE' ? new Date(s.weekOpenedAt.getTime() + WEEK_DAYS * DAY) : null;
  const pct = completed ? 100 : Math.min(99, Math.round((((s.currentWeek - 1) + doneKeys.length / SESSIONS_PER_WEEK) / total) * 100));
  return {
    type, week: s.currentWeek, totalWeeks: total, block: blockOfWeek(type, s.currentWeek), status, doneKeys, sessionsPerWeek: SESSIONS_PER_WEEK,
    openedAt: s.weekOpenedAt, unlocksAt, daysLeft: Math.max(0, Math.ceil((WEEK_DAYS * DAY - elapsed) / DAY)), overdue: !completed && elapsed >= WEEK_DAYS * DAY && !full,
    avgRpe, note: s.progressNote, completedAt: s.completedAt, pct,
  };
}

// ─── ajustes manuais do coach ────────────────────────────────────────────────
export type CoachAction = { action: 'advance' | 'repeat' | 'set-week'; week?: number };

/** O coach manda: liberar a próxima semana agora, repetir a atual ou saltar para uma semana. Reabre o relógio da semana. */
export function applyCoachAction(p: ProtocolState, act: CoachAction, now: Date = new Date()): Persisted | null {
  const type = normalizeType(p.protocolType);
  const total = totalWeeks(type);
  const { s } = stateOf(p, now);
  if (act.action === 'repeat') return { ...s, completedAt: null, weekOpenedAt: now, lastRepeatWeek: s.currentWeek, progressNote: `O coach pediu para repetir a semana ${s.currentWeek}.` };
  if (act.action === 'advance') {
    if (s.completedAt) return null;
    if (s.currentWeek >= total) return { ...s, completedAt: now, progressNote: 'O coach concluiu o protocolo. 🏁' };
    return { ...s, currentWeek: s.currentWeek + 1, weekOpenedAt: now, lastRepeatWeek: null, progressNote: `O coach liberou a semana ${s.currentWeek + 1}.` };
  }
  if (act.action === 'set-week') {
    const n = Number(act.week);
    if (!Number.isInteger(n) || n < 1 || n > total) return null;
    return { currentWeek: n, weekOpenedAt: now, completedAt: null, lastRepeatWeek: null, progressNote: `O coach ajustou o protocolo para a semana ${n}.` };
  }
  return null;
}

/** Estado inicial de um protocolo recém-criado. */
export function initialPersisted(type: any, startWeek: any, now: Date = new Date()): Persisted {
  return { currentWeek: clampWeek(type, startWeek), weekOpenedAt: now, completedAt: null, lastRepeatWeek: null, progressNote: null };
}

export { PLAN_META };
