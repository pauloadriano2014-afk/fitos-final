// lib/runningMessages.ts
// 🔔 (6 out 2026) Os textos das notificações do módulo de corrida (puros: só montam título e corpo; quem envia é lib/runningNotify.ts).
// Dois públicos, dois tons: o COACH recebe o resumo do que precisa fazer; o ALUNO recebe uma frase curta e acolhedora, sem jargão e sem nada clínico.
import { GOAL_LABELS, PLAN_META, normalizeDay, type PlanType } from './runningPlans';
import type { ProgressView } from './runningProgress';

export type Msg = { title: string; body: string };

const first = (n: any) => String(n ?? '').trim().split(/\s+/)[0] || '';
const dias = (n: number) => (n === 1 ? '1 dia' : `${n} dias`);
const fmt = (n: number) => String(Math.round(n * 10) / 10).replace('.', ',');
const DAY_SHORT: Record<string, string> = { SEG: 'seg', TER: 'ter', QUA: 'qua', QUI: 'qui', SEX: 'sex', SAB: 'sáb', DOM: 'dom' };
const lista = (xs: string[]) => (xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} e ${xs[xs.length - 1]}`);

/** COACH: a aluna respondeu a anamnese de corrida. Já avisa o que pede atenção (liberação médica, coração, lesão). */
export function anamneseCoachMessage(name: any, a: any): Msg {
  const flags: string[] = [];
  if (a?.heartCondition) flags.push('condição cardíaca');
  if (a?.medicalClearance && a.medicalClearance !== 'yes') flags.push('sem liberação médica');
  if (Array.isArray(a?.injuries) && a.injuries.some((x: string) => x && x !== 'Nenhuma')) flags.push('lesão informada');
  const goal = a?.runningGoal ? GOAL_LABELS[a.runningGoal] || null : null;
  const body = [goal ? `Objetivo: ${goal}.` : null, flags.length ? `⚠ ${flags.join(', ')}.` : null, 'Toque para montar o protocolo.'].filter(Boolean).join(' ');
  return { title: `${first(name) || 'Seu aluno'} respondeu a anamnese de corrida`, body };
}

/** ALUNO: o coach ativou o protocolo. `renewed` = já tinha um antes (novo desafio). */
export function protocolStudentMessage(name: any, type: PlanType, startWeek: number, trainingDays: any, renewed = false): Msg {
  const days = (Array.isArray(trainingDays) ? trainingDays : []).map((d) => DAY_SHORT[normalizeDay(d) || ''] || '').filter(Boolean);
  const nm = first(name);
  const label = PLAN_META[type]?.label.replace('Protocolo ', '') ?? String(type);
  return {
    title: renewed ? 'Seu novo protocolo de corrida está pronto 🏃' : 'Seu protocolo de corrida está pronto 🏃',
    body: `${nm ? nm + ', seu' : 'Seu'} plano de ${label} começa na semana ${startWeek}${days.length === 3 ? ` · treinos: ${lista(days)}` : ''}. Toque para ver.`,
  };
}

export type ProgressKind = 'completed' | 'week_done' | 'advanced' | 'repeat';

/**
 * COACH: o que este treino mudou no andamento da aluna (compara o antes e o depois do registro). Null se nada de novo para contar.
 * Só as MUDANÇAS: o 2º treino da semana, ou um 4º treino depois da semana fechada, não avisam de novo.
 */
export function progressCoachMessage(name: any, before: ProgressView, after: ProgressView): (Msg & { kind: ProgressKind }) | null {
  const nm = first(name) || 'Seu aluno';
  if (after.status === 'COMPLETED' && before.status !== 'COMPLETED') {
    return { kind: 'completed', title: `${nm} concluiu o protocolo de ${after.type}! 🏁`, body: 'Hora de escolher o próximo desafio. Toque para abrir.' };
  }
  if (after.status === 'WEEK_DONE' && before.status === 'ACTIVE') {
    const left = Math.max(1, after.daysLeft);
    const esforco = after.avgRpe !== null ? ` · esforço médio ${fmt(after.avgRpe)}` : '';
    return { kind: 'week_done', title: `${nm} fechou a semana ${after.week} de ${after.totalWeeks}`, body: `${after.doneKeys.length} de ${after.sessionsPerWeek} treinos${esforco}. A semana ${after.week + 1} libera em ${dias(left)}.` };
  }
  if (after.week > before.week) {
    return { kind: 'advanced', title: `${nm} avançou para a semana ${after.week} de ${after.totalWeeks}`, body: after.note || `A semana ${before.week} foi fechada.` };
  }
  if (after.week === before.week && after.status === 'ACTIVE' && new Date(after.openedAt).getTime() > new Date(before.openedAt).getTime()) {
    return { kind: 'repeat', title: `${nm} vai repetir a semana ${after.week}`, body: after.note || 'O esforço da semana foi muito alto.' };
  }
  return null;
}
