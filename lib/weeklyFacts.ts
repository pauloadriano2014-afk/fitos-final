// lib/weeklyFacts.ts
// 📊 (1 out 2026) Os DADOS REAIS da semana de um aluno, que alimentam as perguntas da segunda-feira (lib/weeklyFeedback.ts, lib/weeklyAI.ts)
// e o painel do coach: treinos registrados x o que o plano pede, observações que ele escreveu, dieta e check-in com fotos.
//
// Regra de ouro: os NÚMEROS e as DATAS vêm daqui (código), nunca da IA. A IA só redige a pergunta a partir destes fatos.
// Funções puras (sem banco) -- o carregamento do banco fica em lib/weeklyFactsLoader.ts. Fuso: Brasília fixo (UTC-3).
import { weekRange } from '@/lib/weeklyFeedback';

const BRT_OFFSET_MS = 3 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const pad = (n: number) => String(n).padStart(2, '0');

/** "AAAA-MM-DD" no relógio de Brasília. */
export function brtYmd(d: Date | string): string {
  const t = new Date(new Date(d).getTime() - BRT_OFFSET_MS);
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;
}
const ymdToDays = (s: string) => { const [y, m, d] = s.split('-').map(Number); return Math.floor(Date.UTC(y, m - 1, d) / DAY_MS); };
/** Dias entre duas datas "AAAA-MM-DD" (b - a). */
export const diffDays = (a: string, b: string) => ymdToDays(b) - ymdToDays(a);
/** "2026-09-15" -> "15/09" */
export const ddmm = (ymd: string) => `${ymd.slice(8, 10)}/${ymd.slice(5, 7)}`;

const WEEKDAYS = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];
export const weekdayName = (d: Date | string) => WEEKDAYS[new Date(new Date(d).getTime() - BRT_OFFSET_MS).getUTCDay()];

const clean = (v: unknown, max: number) => String(v ?? '').replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);

// ─── entrada (linhas já lidas do banco) ───────────────────────────────────────────────────────────
export type SessionIn = { id?: string; date: Date | string; day?: string | null; exerciseIds?: string[]; rpe?: number | null };
export type NoteIn = { kind: 'EXERCISE' | 'WORKOUT'; exercise?: string | null; text: string; date: Date | string; handled?: boolean };
export type FactsInput = {
  weekStart: string;
  now: Date;
  /** letras dos dias do plano ativo na semana (sem OFF/DESCANSO) */
  planDays: string[];
  /** dia do plano -> ids dos exercícios (pra deduzir o dia de registros antigos, sem `day`) */
  planDayExercises?: Record<string, string[]>;
  /** frequência declarada na anamnese (usada quando não há plano) */
  declaredFreq?: number | null;
  /** o aluno entrou / o plano começou depois da segunda: não dá pra cobrar o plano inteiro */
  partialWeek?: boolean;
  sessions: SessionIn[];
  notes: NoteIn[];
  checkin: { disabled?: boolean; nextCheckInDate?: Date | string | null; hasAny: boolean; accountCreatedAt?: Date | string | null } | null;
  diet: { enabled: boolean; mealLogs: Array<{ date: string; status: string }>; daily: Array<{ date: string; adherence?: string | null; note?: string | null }> } | null;
  limitations?: string[] | null;
  sleepQuality?: string | null;
};

// ─── saída ────────────────────────────────────────────────────────────────────────────────────────
export type CheckinStatus = 'DISABLED' | 'OK' | 'DUE' | 'LATE' | 'NEVER';
export type WeeklyFacts = {
  v: 1;
  weekStart: string;
  training: {
    planned: number | null;
    plannedSource: 'PLAN' | 'ANAMNESE' | null;
    partialWeek: boolean;
    done: number;
    weekdays: string[];       // dias da semana com treino registrado (ordem do calendário): ["terça", "quinta"]
    doneDays: string[];       // letras do plano feitas
    missingDays: string[];    // letras do plano SEM registro (vazio quando não dá pra ter certeza)
    avgRpe: number | null;
  };
  notes: Array<{ kind: 'EXERCISE' | 'WORKOUT'; exercise: string | null; text: string; weekday: string; handled: boolean }>;
  diet: { enabled: boolean; hasData: boolean; loggedDays: number; meals: number; followed: number; substituted: number; skipped: number; free: number; dayYes: number; dayPartial: number; dayNo: number; notes: string[] };
  checkin: { status: CheckinStatus; dueDate: string | null; daysLate: number };
  profile: { limitations: string[]; poorSleep: boolean };
};

const NO_LIMITATION = /^(nenhum|nenhuma|n[aã]o|sem|nada|n\/a)/i;
const POOR_SLEEP = /^(regular|ruim|p[eé]ssimo)/i;
const upper = (s: unknown) => String(s ?? '').trim().toUpperCase();
const norm = (s: unknown) => upper(s).normalize('NFD').replace(/[̀-ͯ]/g, '');

/** Letra do dia do plano que esse registro representa (a gravada, ou deduzida pelos exercícios feitos). */
export function resolveSessionDay(s: SessionIn, planDayExercises: Record<string, string[]> = {}): string | null {
  const given = upper(s.day);
  if (given) return given;
  const ids = new Set((s.exerciseIds || []).filter(Boolean));
  if (!ids.size) return null;
  let best: string | null = null, bestN = 0, tie = false;
  for (const [day, exIds] of Object.entries(planDayExercises)) {
    const n = new Set(exIds.filter((id) => ids.has(id))).size;
    if (n > bestN) { best = upper(day); bestN = n; tie = false; } else if (n > 0 && n === bestN) tie = true;
  }
  if (!best || tie || bestN < Math.max(1, Math.ceil(ids.size * 0.5))) return null;
  return best;
}

export function computeFacts(input: FactsInput): WeeklyFacts {
  const { weekStart, now } = input;
  const range = weekRange(weekStart);
  const inWeek = (d: Date | string) => { const t = new Date(d).getTime(); return t >= range.start.getTime() && t < range.end.getTime(); };

  // ── treino ──
  const planDays = [...new Set((input.planDays || []).map(upper).filter(Boolean))];
  const planDayExercises: Record<string, string[]> = {};
  Object.entries(input.planDayExercises || {}).forEach(([k, v]) => { planDayExercises[upper(k)] = v; });
  const partialWeek = !!input.partialWeek;
  const declared = Number(input.declaredFreq) > 0 ? Math.min(14, Math.round(Number(input.declaredFreq))) : null;
  const planned = partialWeek ? null : planDays.length ? planDays.length : declared;
  const plannedSource: 'PLAN' | 'ANAMNESE' | null = partialWeek ? null : planDays.length ? 'PLAN' : declared ? 'ANAMNESE' : null;

  const sessions = (input.sessions || []).filter((s) => inWeek(s.date)).map((s) => ({ ...s, resolved: resolveSessionDay(s, planDayExercises) }));
  // o mesmo treino finalizado duas vezes no mesmo dia conta uma vez só
  const seen = new Set<string>();
  const unique = sessions.filter((s, i) => {
    const key = s.resolved ? `${brtYmd(s.date)}|${s.resolved}` : `id|${s.id ?? i}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  const weekdays = [...new Set([...unique].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()).map((s) => weekdayName(s.date)))];
  const doneDays = [...new Set(unique.map((s) => s.resolved).filter(Boolean) as string[])].sort();
  const allResolved = unique.every((s) => !!s.resolved);
  const missingDays = plannedSource === 'PLAN' && allResolved ? planDays.filter((d) => !doneDays.includes(d)) : [];
  const rpes = unique.map((s) => Number(s.rpe)).filter((n) => Number.isFinite(n) && n > 0);
  const avgRpe = rpes.length ? Math.round((rpes.reduce((a, b) => a + b, 0) / rpes.length) * 10) / 10 : null;

  // ── observações do aluno na semana (do mais recente pro mais antigo) ──
  const seenNote = new Set<string>();
  const notes = (input.notes || [])
    .filter((n) => inWeek(n.date) && clean(n.text, 5))
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    .map((n) => ({ kind: n.kind, exercise: clean(n.exercise, 80) || null, text: clean(n.text, 240), weekday: weekdayName(n.date), handled: !!n.handled }))
    .filter((n) => { const k = `${(n.exercise || '').toLowerCase()}|${n.text.toLowerCase()}`; if (seenNote.has(k)) return false; seenNote.add(k); return true; })
    .slice(0, 6);

  // ── dieta ──
  const d = input.diet;
  const logs = d ? d.mealLogs : [];
  const daily = d ? d.daily : [];
  const count = (st: string) => logs.filter((l) => norm(l.status) === st).length;
  const adh = (v: string) => daily.filter((x) => norm(x.adherence) === v).length;
  const diet = {
    enabled: !!(d && d.enabled),
    hasData: logs.length > 0 || daily.some((x) => !!norm(x.adherence)),
    loggedDays: new Set(logs.map((l) => l.date)).size,
    meals: logs.length,
    followed: count('SEGUIU'), substituted: count('SUBSTITUIU'), skipped: count('PULOU'), free: count('LIVRE'),
    dayYes: adh('SIM'), dayPartial: adh('PARCIAL'), dayNo: adh('NAO'),
    notes: daily.map((x) => clean(x.note, 200)).filter(Boolean).slice(0, 3),
  };

  // ── check-in com fotos ──
  const c = input.checkin;
  const today = brtYmd(now);
  let status: CheckinStatus = 'OK', dueDate: string | null = null, daysLate = 0;
  if (!c) status = 'OK';
  else if (c.disabled) status = 'DISABLED';
  else {
    if (c.nextCheckInDate) { dueDate = brtYmd(c.nextCheckInDate); daysLate = Math.max(0, diffDays(dueDate, today)); }
    if (!c.hasAny) {
      const age = c.accountCreatedAt ? diffDays(brtYmd(c.accountCreatedAt), today) : 0;
      status = age >= 7 ? 'NEVER' : 'OK';
    } else if (dueDate) {
      const late = diffDays(dueDate, today);
      status = late >= 1 ? 'LATE' : late === 0 ? 'DUE' : 'OK';
    }
  }

  // ── perfil (anamnese) ──
  const limitations = (input.limitations || []).map((l) => clean(l, 60)).filter((l) => l && !NO_LIMITATION.test(l));

  return {
    v: 1, weekStart,
    training: { planned, plannedSource, partialWeek, done: unique.length, weekdays, doneDays, missingDays, avgRpe },
    notes, diet, checkin: { status, dueDate, daysLate },
    profile: { limitations, poorSleep: !!input.sleepQuality && POOR_SLEEP.test(String(input.sleepQuality)) },
  };
}

// ─── textos (determinísticos) ─────────────────────────────────────────────────────────────────────
const list = (items: string[]) => (items.length <= 1 ? items.join('') : `${items.slice(0, -1).join(', ')} e ${items[items.length - 1]}`);

/** "o Treino C e o Treino E" */
export const missingDaysText = (days: string[]) => list(days.map((d) => `o Treino ${d}`));

/**
 * Frase com os treinos registrados: "3 de 5 treinos registrados (terça, quinta e sábado)". Só compara com um número quando ele vem do PLANO
 * ATIVO do aluno (a frequência da anamnese é só uma meta declarada -- ele pode nem ter ficha ainda). Vazio se não há o que dizer.
 */
export function trainingSentence(f: WeeklyFacts): string {
  const t = f.training;
  const days = t.weekdays.length ? ` (${list(t.weekdays)})` : '';
  if (t.plannedSource === 'PLAN' && t.planned) {
    if (t.done === 0) return 'nenhum treino registrado';
    return `${t.done} de ${t.planned} ${t.planned === 1 ? 'treino registrado' : 'treinos registrados'}${days}`;
  }
  if (t.done > 0) return `${t.done} ${t.done === 1 ? 'treino registrado' : 'treinos registrados'}${days}`;
  return '';
}

/** Treinou menos de 60% do plano ativo (só quando dá pra comparar). */
export const isLowLogged = (f: WeeklyFacts | null | undefined) => !!f && f.training.plannedSource === 'PLAN' && !!f.training.planned && !f.training.partialWeek && f.training.done / f.training.planned < 0.6;

/** Dá pra comparar o que ele registrou com o plano dele? */
export const hasPlanGap = (f: WeeklyFacts | null | undefined) => !!f && f.training.plannedSource === 'PLAN' && !!f.training.planned && !f.training.partialWeek && f.training.done < f.training.planned;

export type FactLine = { key: string; icon: string; text: string; tone: 'ok' | 'warn' | 'bad' };

/** Linhas prontas pro coach ver ao lado das respostas ("Dados da semana"). */
export function describeFacts(f: WeeklyFacts | null | undefined): FactLine[] {
  if (!f) return [];
  const out: FactLine[] = [];
  const t = f.training;
  const sentence = trainingSentence(f);
  if (sentence) {
    let text = `Treinos: ${sentence}`;
    if (t.missingDays.length && t.done > 0) text += ` · sem registro: ${t.missingDays.map((d) => `Treino ${d}`).join(', ')}`;
    if (t.avgRpe !== null) text += ` · esforço médio ${t.avgRpe}/10`;
    if (t.plannedSource === 'ANAMNESE' && t.planned) text += ` · meta da anamnese: ${t.planned}x/semana (sem ficha ativa)`;
    out.push({ key: 'training', icon: 'dumbbell', text, tone: isLowLogged(f) ? 'bad' : hasPlanGap(f) ? 'warn' : 'ok' });
  } else if (t.partialWeek) {
    out.push({ key: 'training', icon: 'dumbbell', text: `Treinos: ${t.done} registrado(s) · semana parcial (entrou ou mudou de plano durante a semana)`, tone: 'ok' });
  }
  f.notes.forEach((n, i) => out.push({ key: `note${i}`, icon: 'comment-text-outline', text: `${n.kind === 'EXERCISE' ? `Observação${n.exercise ? ` (${n.exercise})` : ''}` : 'Feedback do treino'} · ${n.weekday}: "${n.text}"${n.handled ? '' : ' · sem resposta'}`, tone: n.handled ? 'ok' : 'warn' }));
  const dt = f.diet;
  if (dt.enabled) {
    if (dt.hasData) {
      const parts: string[] = [];
      if (dt.meals) parts.push(`${dt.meals} ${dt.meals === 1 ? 'refeição marcada' : 'refeições marcadas'} em ${dt.loggedDays} ${dt.loggedDays === 1 ? 'dia' : 'dias'}`);
      if (dt.dayYes + dt.dayPartial + dt.dayNo) parts.push(`fim do dia: ${dt.dayYes} seguiu · ${dt.dayPartial} parcial · ${dt.dayNo} não`);
      out.push({ key: 'diet', icon: 'food-apple-outline', text: `Dieta: ${parts.join(' · ')}`, tone: dt.dayNo > dt.dayYes ? 'warn' : 'ok' });
    } else out.push({ key: 'diet', icon: 'food-apple-outline', text: 'Dieta: sem marcações no diário essa semana', tone: 'ok' });
  }
  const c = f.checkin;
  if (c.status === 'LATE') out.push({ key: 'checkin', icon: 'camera-outline', text: `Check-in com fotos atrasado há ${c.daysLate} ${c.daysLate === 1 ? 'dia' : 'dias'}${c.dueDate ? ` (marcado para ${ddmm(c.dueDate)})` : ''}`, tone: 'bad' });
  else if (c.status === 'NEVER') out.push({ key: 'checkin', icon: 'camera-outline', text: 'Ainda não enviou as fotos iniciais do check-in', tone: 'bad' });
  else if (c.status === 'DUE') out.push({ key: 'checkin', icon: 'camera-outline', text: 'Check-in com fotos vence hoje', tone: 'warn' });
  return out;
}

