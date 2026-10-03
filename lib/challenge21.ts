// lib/challenge21.ts
// 🔥 (3 out 2026) DESAFIO DE 21 DIAS: missões diárias de emagrecimento. Em 21 dias o resultado realista é perder gordura e criar o hábito, não ganhar
// músculo, então o app acompanha o aluno todo dia com um conjunto pequeno de missões (as mesmas de sempre + 1 desafio diferente por dia).
//
// Tudo aqui é PURO (sem banco): quais são as missões de cada dia, o que conta como dia cumprido, sequência, pontos e o resumo que o app mostra.
// A rota (app/api/challenge21) só busca os dados e chama estas funções.
//
// De onde vem cada missão:
//   - AUTOMÁTICAS (o aluno não precisa marcar; vêm do que o app já registra):
//       treino  -> existe um treino finalizado no dia (WorkoutHistory)                       (bônus, não é obrigatória)
//       agua    -> a meta de água do dia foi batida no contador de água da dieta (DailyCheckin.water_ml)
//       dieta   -> o aluno respondeu "SIM" em "seguiu o plano hoje?" (DailyCheckin.dietAdherence)
//     A água e a dieta também podem ser marcadas à mão (quem não usa o contador).
//   - MANUAIS: movimento (passos), sono, o desafio do dia e as missões que entram nas semanas 2 e 3.

export const CHALLENGE_DAYS = 21;
export const VALID_DAY_RATIO = 0.7;        // dia cumprido = pelo menos 70% das missões obrigatórias
export const FULL_DAY_BONUS = 10;          // todas as obrigatórias feitas
export const DAY_MS = 24 * 60 * 60 * 1000;
const BRT_OFFSET_MS = 3 * 60 * 60 * 1000;  // Brasil sem horário de verão: o "dia" do aluno é o de Brasília

export type MissionKind = 'habit' | 'daily' | 'workout';
export interface Mission {
  id: string;
  label: string;
  hint?: string;
  points: number;
  kind: MissionKind;
  required: boolean;      // entra na conta do dia cumprido
  autoCapable: boolean;   // pode ser concluída sozinha por dado do app
  manualAllowed: boolean; // o aluno pode marcar à mão
}
export interface DayMission extends Mission { done: boolean; auto: boolean }

export interface Profile { waterMl: number }
export interface DayAuto { workout?: boolean; waterMl?: number; dietAdherence?: string | null }

// ─── datas (dia de Brasília como texto AAAA-MM-DD) ───────────────────────────
/** O dia (AAAA-MM-DD) em Brasília de um instante. */
export const brtDate = (d: Date | number = new Date()): string => new Date((typeof d === 'number' ? d : d.getTime()) - BRT_OFFSET_MS).toISOString().slice(0, 10);
/** Soma `n` dias a uma data AAAA-MM-DD. */
export const addDays = (date: string, n: number): string => new Date(Date.parse(date + 'T00:00:00Z') + n * DAY_MS).toISOString().slice(0, 10);
/** Quantos dias de calendário vão de `from` até `to` (negativo se `to` é antes). */
export const diffDays = (from: string, to: string): number => Math.round((Date.parse(to + 'T00:00:00Z') - Date.parse(from + 'T00:00:00Z')) / DAY_MS);
const isDate = (s: unknown): s is string => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && Number.isFinite(Date.parse(s + 'T00:00:00Z'));
export { isDate };
/** Início e fim (instantes) do dia de Brasília `date`: [início, fim). */
export const brtDayRange = (date: string): [Date, Date] => { const s = Date.parse(date + 'T00:00:00Z') + BRT_OFFSET_MS; return [new Date(s), new Date(s + DAY_MS)]; };

/** Dia do desafio (1..21) de uma data; 0 = ainda não começou; 22 = já acabou. */
export function dayIndexOf(startDate: string, today: string): number {
  const n = diffDays(startDate, today) + 1;
  if (n < 1) return 0;
  return n > CHALLENGE_DAYS ? CHALLENGE_DAYS + 1 : n;
}

export const weekOf = (dayIndex: number): 1 | 2 | 3 => (dayIndex <= 7 ? 1 : dayIndex <= 14 ? 2 : 3);
export const WEEK_THEMES: Record<1 | 2 | 3, { title: string; desc: string }> = {
  1: { title: 'SEMANA 1 · BASE', desc: 'Criar o hábito: água, movimento, sono e comida no plano.' },
  2: { title: 'SEMANA 2 · CONSTÂNCIA', desc: 'Manter o ritmo e cortar o que mais atrapalha: açúcar e refrigerante.' },
  3: { title: 'SEMANA 3 · RETA FINAL', desc: 'Proteína em toda refeição e mais movimento para fechar forte.' },
};

// Passos por semana: sobe um degrau a cada semana.
const STEPS_BY_WEEK: Record<1 | 2 | 3, { steps: string; minutes: number }> = { 1: { steps: '6.000', minutes: 30 }, 2: { steps: '8.000', minutes: 40 }, 3: { steps: '10.000', minutes: 45 } };

// ─── o desafio de cada dia (um por dia, em ordem) ────────────────────────────
export const DAILY_CHALLENGES: Array<{ title: string; hint: string }> = [
  { title: 'Ponto de partida', hint: 'Tire as fotos iniciais (frente, lado e costas) e anote a cintura. Sem comparar com ninguém: é o seu dia zero.' },
  { title: 'Água no lugar do refrigerante', hint: 'Hoje, nada de refrigerante nem suco de caixinha: água, água com gás ou com limão.' },
  { title: 'Cozinhe em casa', hint: 'Prepare hoje uma refeição em casa, com comida de verdade, sem ultraprocessados.' },
  { title: 'Escada no lugar do elevador', hint: 'Escolha escadas hoje e caminhe 10 minutos depois do almoço.' },
  { title: 'Refeição sem tela', hint: 'Faça uma refeição sem celular nem TV, mastigando devagar. A saciedade chega com mais calma.' },
  { title: 'Marmitas de amanhã', hint: 'Deixe amanhã organizado: separe ou prepare as refeições de acordo com o plano.' },
  { title: 'Descanso ativo', hint: '30 minutos de caminhada leve e 10 minutos de alongamento. Recuperar também emagrece.' },
  { title: 'Medidas da semana', hint: 'Pese e meça a cintura (mesmo horário, em jejum) e anote. Compare com o dia 1.' },
  { title: 'Água antes de comer', hint: 'Beba um copo de água antes de cada refeição principal.' },
  { title: '45 agachamentos no dia', hint: 'Acumule 3 séries de 15 agachamentos ao longo do dia (sem carga e sem dor).' },
  { title: 'Zero açúcar adicionado', hint: 'Café, suco e sobremesa sem açúcar adicionado. Fruta pode.' },
  { title: 'Noite de sono', hint: 'Alongue 10 minutos antes de dormir e tente deitar antes das 23h.' },
  { title: 'Lanche pronto', hint: 'Deixe um lanche com proteína pronto para o horário em que a fome mais aperta.' },
  { title: 'Caminhada da janta', hint: 'Depois do jantar, caminhe 15 minutos. Ajuda a digestão e o gasto do dia.' },
  { title: 'Segunda pesagem', hint: 'Pese e meça a cintura de novo. Veja o que já mudou desde o dia 1 e comemore.' },
  { title: 'Carboidrato mais natural', hint: 'Troque um carboidrato refinado (pão branco, macarrão comum) por uma opção integral ou natural.' },
  { title: '2 minutos de prancha', hint: 'Acumule 2 minutos de prancha ao longo do dia, em quantas séries precisar.' },
  { title: 'Dia sem delivery', hint: 'Monte todas as suas refeições do plano hoje, sem pedir comida pronta.' },
  { title: 'Sem beliscar', hint: 'Entre as refeições, nada de beliscar. Se a fome vier, vá para o lanche do plano.' },
  { title: 'Treino com intenção', hint: 'No seu treino de hoje (ou numa caminhada forte), capriche na execução e no último exercício.' },
  { title: 'Fechamento', hint: 'Último dia! Pese, meça a cintura, tire as fotos finais e envie o seu check-in para o coach.' },
];

export const challengeOf = (dayIndex: number) => DAILY_CHALLENGES[Math.min(Math.max(dayIndex, 1), CHALLENGE_DAYS) - 1];

// ─── perfil e meta de água ───────────────────────────────────────────────────
/** Meta de água do dia em ml: 35 ml por kg, arredondada para 250 ml, entre 2 e 4 litros. Sem peso, 2,5 L. */
export function waterTargetMl(pesoKg?: number | string | null): number {
  const p = typeof pesoKg === 'string' ? parseFloat(pesoKg.replace(',', '.')) : Number(pesoKg);
  if (!Number.isFinite(p) || p <= 0) return 2500;
  const ml = Math.round((p * 35) / 250) * 250;
  return Math.min(4000, Math.max(2000, ml));
}
const litros = (ml: number) => `${(ml / 1000).toFixed(ml % 1000 === 0 ? 0 : 1).replace('.', ',')} L`;

// ─── as missões de um dia ────────────────────────────────────────────────────
export function missionsFor(dayIndex: number, profile: Profile): Mission[] {
  const week = weekOf(Math.min(Math.max(dayIndex, 1), CHALLENGE_DAYS));
  const mv = STEPS_BY_WEEK[week];
  const ch = challengeOf(dayIndex);
  const list: Mission[] = [
    { id: 'agua', label: `Beber ${litros(profile.waterMl)} de água`, hint: 'Marca sozinha quando você bate a meta no contador de água da dieta.', points: 10, kind: 'habit', required: true, autoCapable: true, manualAllowed: true },
    { id: 'dieta', label: 'Seguir o plano alimentar', hint: 'Marca sozinha quando você responde "sim" em "seguiu o plano hoje?" na dieta.', points: 10, kind: 'habit', required: true, autoCapable: true, manualAllowed: true },
    { id: 'movimento', label: `Caminhar ${mv.steps} passos`, hint: `Ou ${mv.minutes} minutos de movimento: caminhada, bike, dança...`, points: 10, kind: 'habit', required: true, autoCapable: false, manualAllowed: true },
    { id: 'sono', label: 'Dormir 7 horas ou mais', hint: 'Marque na manhã seguinte, referente à noite que passou.', points: 10, kind: 'habit', required: true, autoCapable: false, manualAllowed: true },
  ];
  if (week >= 2) list.push({ id: 'acucar', label: 'Sem refrigerante e açúcar adicionado', hint: 'Fruta e adoçante a gente deixa passar. O resto, não.', points: 10, kind: 'habit', required: true, autoCapable: false, manualAllowed: true });
  if (week >= 3) list.push({ id: 'proteina', label: 'Proteína em toda refeição principal', hint: 'Ovos, frango, peixe, carne, iogurte... como está no seu plano.', points: 10, kind: 'habit', required: true, autoCapable: false, manualAllowed: true });
  list.push({ id: 'desafio', label: `Desafio do dia: ${ch.title}`, hint: ch.hint, points: 20, kind: 'daily', required: true, autoCapable: false, manualAllowed: true });
  list.push({ id: 'treino', label: 'Treinar hoje', hint: 'Bônus: conta sozinho quando você finaliza um treino. Dia de descanso não tem problema.', points: 30, kind: 'workout', required: false, autoCapable: true, manualAllowed: false });
  return list;
}

/** Marca o que está feito (à mão ou sozinho). `manual` = ids marcados pelo aluno. */
export function resolveDay(dayIndex: number, profile: Profile, manual: string[], auto: DayAuto): DayMission[] {
  const set = new Set(manual || []);
  return missionsFor(dayIndex, profile).map((m) => {
    let isAuto = false;
    if (m.id === 'treino') isAuto = !!auto.workout;
    else if (m.id === 'agua') isAuto = Number(auto.waterMl) >= profile.waterMl;
    else if (m.id === 'dieta') isAuto = String(auto.dietAdherence || '').toUpperCase() === 'SIM';
    const manualDone = m.manualAllowed && set.has(m.id);
    return { ...m, done: isAuto || manualDone, auto: isAuto };
  });
}

export interface DayScore { done: number; total: number; ratio: number; points: number; full: boolean; valid: boolean }
export function scoreDay(missions: DayMission[]): DayScore {
  const req = missions.filter((m) => m.required);
  const doneReq = req.filter((m) => m.done).length;
  const full = req.length > 0 && doneReq === req.length;
  const points = missions.filter((m) => m.done).reduce((s, m) => s + m.points, 0) + (full ? FULL_DAY_BONUS : 0);
  const ratio = req.length ? doneReq / req.length : 0;
  return { done: doneReq, total: req.length, ratio, points, full, valid: ratio >= VALID_DAY_RATIO };
}

export type DayStatus = 'FULL' | 'VALID' | 'PARTIAL' | 'MISSED' | 'TODAY' | 'FUTURE';
export interface DaySummary { dayIndex: number; date: string; status: DayStatus; done: number; total: number; points: number; full: boolean; valid: boolean }

export interface SummaryInput {
  startDate: string;                         // AAAA-MM-DD (dia de Brasília em que o desafio começou)
  today: string;                             // AAAA-MM-DD
  profile: Profile;
  manualByDate: Record<string, string[]>;    // missões marcadas à mão, por dia
  autoByDate: Record<string, DayAuto>;       // o que o app registrou sozinho, por dia
  weeklyWorkouts?: number;                   // meta de treinos por semana (só informativo)
}

export interface ChallengeSummary {
  state: 'WAITING' | 'ACTIVE' | 'FINISHED';
  startDate: string;
  endDate: string;
  dayIndex: number;                          // 0 (não começou) · 1..21 · 22 (acabou)
  daysToStart: number;
  week: 1 | 2 | 3;
  weekTheme: { title: string; desc: string };
  today: null | { date: string; dayIndex: number; missions: DayMission[]; score: DayScore };
  days: DaySummary[];
  streak: number;                            // dias cumpridos seguidos até hoje (hoje em andamento não quebra)
  bestStreak: number;
  validDays: number;
  fullDays: number;
  points: number;
  milestones: Array<{ days: number; label: string; reached: boolean }>;
  workoutsThisWeek: number;
  weeklyWorkoutsGoal: number | null;
}

export const MILESTONES = [{ days: 7, label: '7 dias cumpridos' }, { days: 14, label: '14 dias cumpridos' }, { days: 21, label: 'Desafio completo' }];

export function summarize(input: SummaryInput): ChallengeSummary {
  const { startDate, today, profile } = input;
  const dayIndex = dayIndexOf(startDate, today);
  const lastDay = Math.min(dayIndex, CHALLENGE_DAYS);
  const days: DaySummary[] = [];
  let points = 0, validDays = 0, fullDays = 0, run = 0, best = 0, streak = 0;
  let todayDetail: ChallengeSummary['today'] = null;

  for (let d = 1; d <= CHALLENGE_DAYS; d++) {
    const date = addDays(startDate, d - 1);
    if (d > lastDay) { days.push({ dayIndex: d, date, status: 'FUTURE', done: 0, total: 0, points: 0, full: false, valid: false }); continue; }
    const missions = resolveDay(d, profile, input.manualByDate[date] || [], input.autoByDate[date] || {});
    const sc = scoreDay(missions);
    const isToday = date === today && dayIndex <= CHALLENGE_DAYS;
    points += sc.points;
    if (sc.valid) validDays++;
    if (sc.full) fullDays++;
    // sequência: hoje em andamento não quebra (só soma se já está cumprido); dia passado não cumprido zera
    if (sc.valid) { run++; best = Math.max(best, run); } else if (!isToday) { run = 0; }
    const status: DayStatus = isToday ? 'TODAY' : sc.full ? 'FULL' : sc.valid ? 'VALID' : sc.done > 0 ? 'PARTIAL' : 'MISSED';
    days.push({ dayIndex: d, date, status, done: sc.done, total: sc.total, points: sc.points, full: sc.full, valid: sc.valid });
    if (isToday) todayDetail = { date, dayIndex: d, missions, score: sc };
  }
  streak = run;

  const state: ChallengeSummary['state'] = dayIndex < 1 ? 'WAITING' : dayIndex > CHALLENGE_DAYS ? 'FINISHED' : 'ACTIVE';
  const wk = weekOf(Math.max(1, Math.min(dayIndex, CHALLENGE_DAYS)));
  const weekStart = addDays(startDate, (wk - 1) * 7);
  let workoutsThisWeek = 0;
  for (let i = 0; i < 7; i++) { const dt = addDays(weekStart, i); if (diffDays(startDate, dt) < lastDay && input.autoByDate[dt]?.workout) workoutsThisWeek++; }

  return {
    state, startDate, endDate: addDays(startDate, CHALLENGE_DAYS - 1), dayIndex, daysToStart: dayIndex < 1 ? Math.max(0, diffDays(today, startDate)) : 0,
    week: wk, weekTheme: WEEK_THEMES[wk], today: todayDetail, days, streak, bestStreak: best, validDays, fullDays, points,
    milestones: MILESTONES.map((m) => ({ ...m, reached: validDays >= m.days })),
    workoutsThisWeek, weeklyWorkoutsGoal: input.weeklyWorkouts ?? null,
  };
}

/** Uma missão pode ser marcada/desmarcada à mão neste dia? (existe, é manual e a data está dentro da janela) */
export function canToggle(dayIndex: number, profile: Profile, missionId: string): boolean {
  if (dayIndex < 1 || dayIndex > CHALLENGE_DAYS) return false;
  const m = missionsFor(dayIndex, profile).find((x) => x.id === missionId);
  return !!m && m.manualAllowed;
}

/** Datas que o aluno pode editar: hoje e ontem (a missão de sono, por exemplo, só se sabe na manhã seguinte). */
export function editableDates(today: string): string[] { return [today, addDays(today, -1)]; }

// ─── lembretes ───────────────────────────────────────────────────────────────
export function reminderText(dayIndex: number, kind: 'morning' | 'evening', pending = 0): { title: string; body: string } | null {
  if (dayIndex < 1 || dayIndex > CHALLENGE_DAYS) return null;
  const ch = challengeOf(dayIndex);
  if (kind === 'morning') {
    return dayIndex === CHALLENGE_DAYS
      ? { title: '🏁 Último dia do desafio!', body: `${ch.title}: ${ch.hint}` }
      : { title: `🔥 Dia ${dayIndex} de ${CHALLENGE_DAYS}`, body: `Desafio de hoje: ${ch.title}. Abra o app e confira suas missões.` };
  }
  if (pending <= 0) return null;
  return { title: `⏰ Faltam ${pending} ${pending === 1 ? 'missão' : 'missões'} hoje`, body: `Dia ${dayIndex} de ${CHALLENGE_DAYS}: não deixe sua sequência cair. Leva poucos minutos.` };
}

// ─── início do desafio ───────────────────────────────────────────────────────
const CYCLE_WINDOW_MS = 6 * 60 * 60 * 1000;
const isPlaceholderName = (name: unknown) => /CONSTRU[ÇC][ÃA]O/i.test(String(name || ''));

/**
 * O desafio começa no dia em que o plano foi ENTREGUE: o início do treino de verdade (não o "em construção") mais antigo do ciclo atual.
 * Mesma regra do relógio da home (app: utils/planClock.js). Sem treino de verdade ainda, devolve null (o app mostra "preparando").
 */
export function challengeStartDate(workouts: Array<{ createdAt?: any; startDate?: any; name?: any; archived?: boolean; exerciseCount?: number }>): string | null {
  const real = (workouts || []).filter((w) => w && !w.archived && !isPlaceholderName(w.name) && (w.exerciseCount === undefined || w.exerciseCount > 0));
  if (!real.length) return null;
  const ms = (v: any) => { const t = v === null || v === undefined ? NaN : new Date(v).getTime(); return t; };
  const sorted = [...real].sort((a, b) => ms(b.createdAt) - ms(a.createdAt));
  const newest = sorted[0];
  const t0 = ms(newest.createdAt);
  const cycle = sorted.filter((w) => w === newest || (Number.isFinite(t0) && Number.isFinite(ms(w.createdAt)) && Math.abs(t0 - ms(w.createdAt)) <= CYCLE_WINDOW_MS));
  const starts = cycle.map((w) => ms(w.startDate)).filter((t) => Number.isFinite(t));
  const first = starts.length ? Math.min(...starts) : ms(newest.createdAt);
  return Number.isFinite(first) ? brtDate(first) : null;
}
