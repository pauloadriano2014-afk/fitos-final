// lib/agendaStore.ts
// 📅 (6 out 2026) Agenda do coach: leitura e escrita no banco. `db` entra por parâmetro (o prisma de verdade nas rotas, um banco em memória nos testes).
// As regras puras (datas de Brasília, série semanal, validação, choque de horários) ficam em lib/agenda.ts.
import {
  CreateInput, PatchInput, ATENDIMENTO_KINDS, SERIES_HORIZON_DAYS, MAX_WINDOW_DAYS,
  addDaysKey, brtToUtc, dateKeyBrt, diffDaysKeys, endOfDayBrt, expandSeries, findConflicts, isDateKey, isTimeKey,
  normalizeMeetUrl, startOfDayBrt, timeKeyBrt, weekdayOfKey, Slot,
} from '@/lib/agenda';
import { MASTER_IDS } from '@/lib/masterIds';

export type Db = any;
export type Conflict = { id: string; title: string | null; kind: string; startsAt: Date; endsAt: Date; personName: string | null };
export type Fail = { error: string; status: number; conflicts?: Conflict[] };
const MIN = 60000;

/** "A tabela ainda não existe" (db push pendente): as rotas respondem 503 em vez de 500. */
export const isMissingTable = (e: any) => /does not exist|P2021|P2022/i.test(String(e?.code || '') + ' ' + String(e?.message || ''));

// ───────────────────────────── quem este coach atende ─────────────────────────────

const isMaster = (id: string) => MASTER_IDS.includes(id);
/** Alunos com conta que o coach atende: a mesma "muralha" do painel (app/api/admin/data). */
export const studentScope = (coachId: string) => isMaster(coachId) ? { OR: [{ coachId: null }, { coachId: { in: MASTER_IDS } }] } : { OR: [{ coachId }, { nutritionistId: coachId }] };
/** Cadastros só do financeiro (sem conta no app). */
export const offlineScope = (coachId: string) => isMaster(coachId) ? { OR: [{ coachId: null }, { coachId: { in: MASTER_IDS } }] } : { coachId };

/** Na central HOJE o master vê só os alunos dele e os sem dono (os do outro master ficam com o outro), igual ao "MEUS ALUNOS" do painel. */
export const ownStudentScope = (coachId: string) => isMaster(coachId) ? { OR: [{ coachId }, { coachId: null }, { nutritionistId: coachId }] } : studentScope(coachId);
export const ownOfflineScope = (coachId: string) => isMaster(coachId) ? { OR: [{ coachId }, { coachId: null }] } : offlineScope(coachId);

export async function personBelongs(db: Db, coachId: string, studentId: string | null, offlineClientId: string | null): Promise<boolean> {
  if (studentId) return !!(await db.user.findFirst({ where: { id: studentId, role: 'USER', AND: [studentScope(coachId)] }, select: { id: true } }));
  if (offlineClientId) return !!(await db.offlineClient.findFirst({ where: { id: offlineClientId, AND: [offlineScope(coachId)] }, select: { id: true } }));
  return true;
}

export type Person = { kind: 'student' | 'offline'; id: string; name: string; photoUrl: string | null; phone: string | null; category: string | null };

export async function loadPersons(db: Db, events: { studentId?: string | null; offlineClientId?: string | null }[]): Promise<Map<string, Person>> {
  const sIds = [...new Set(events.map((e) => e.studentId).filter(Boolean))] as string[];
  const oIds = [...new Set(events.map((e) => e.offlineClientId).filter(Boolean))] as string[];
  const map = new Map<string, Person>();
  if (sIds.length) (await db.user.findMany({ where: { id: { in: sIds } }, select: { id: true, name: true, photoUrl: true, phone: true, financeCategory: true } })).forEach((u: any) => map.set('s:' + u.id, { kind: 'student', id: u.id, name: u.name || 'Aluno', photoUrl: u.photoUrl || null, phone: u.phone || null, category: u.financeCategory || null }));
  if (oIds.length) (await db.offlineClient.findMany({ where: { id: { in: oIds } }, select: { id: true, name: true, photoUrl: true, phone: true, financeCategory: true } })).forEach((o: any) => map.set('o:' + o.id, { kind: 'offline', id: o.id, name: o.name || 'Cliente', photoUrl: o.photoUrl || null, phone: o.phone || null, category: o.financeCategory || null }));
  return map;
}
export const personOf = (map: Map<string, Person>, e: { studentId?: string | null; offlineClientId?: string | null }) =>
  e.studentId ? map.get('s:' + e.studentId) || null : e.offlineClientId ? map.get('o:' + e.offlineClientId) || null : null;

export async function withPersons<T extends { studentId?: string | null; offlineClientId?: string | null }>(db: Db, events: T[]) {
  const persons = await loadPersons(db, events);
  return events.map((e) => ({ ...e, person: personOf(persons, e) }));
}

// ───────────────────────────── ajustes ─────────────────────────────

export type Settings = { coachId: string; meetProvider: string; meetUrl: string | null; remindCoachMin: number; remindStudentMin: number; dailySummary: boolean; summaryHour: number; summarySentOn: string | null; workStart: string; workEnd: string };
export const DEFAULT_SETTINGS = { meetProvider: 'MEET', meetUrl: null, remindCoachMin: 30, remindStudentMin: 120, dailySummary: true, summaryHour: 7, summarySentOn: null, workStart: '06:00', workEnd: '21:00' };

export async function getSettings(db: Db, coachId: string): Promise<Settings> {
  const row = await db.agendaSettings.findUnique({ where: { coachId } }).catch((e: any) => { if (isMissingTable(e)) throw e; return null; });
  return { ...DEFAULT_SETTINGS, ...(row || {}), coachId };
}

export function parseSettingsBody(b: any): { ok: true; value: Partial<Settings> } | { ok: false; error: string } {
  if (!b || typeof b !== 'object') return { ok: false, error: 'Corpo inválido.' };
  const v: Partial<Settings> = {};
  if ('meetUrl' in b) { const m = normalizeMeetUrl(b.meetUrl); if (!m.ok) return m; v.meetUrl = m.url; }
  const int = (k: 'remindCoachMin' | 'remindStudentMin' | 'summaryHour', lo: number, hi: number, label: string) => {
    if (!(k in b)) return null;
    const n = Number(b[k]);
    if (!Number.isInteger(n) || n < lo || n > hi) return `${label} precisa ficar entre ${lo} e ${hi}.`;
    v[k] = n; return null;
  };
  const err = int('remindCoachMin', 0, 1440, 'O aviso ao coach') || int('remindStudentMin', 0, 2880, 'O aviso ao aluno') || int('summaryHour', 5, 11, 'A hora do resumo');
  if (err) return { ok: false, error: err };
  if ('dailySummary' in b) { if (typeof b.dailySummary !== 'boolean') return { ok: false, error: 'Resumo diário inválido.' }; v.dailySummary = b.dailySummary; }
  for (const k of ['workStart', 'workEnd'] as const) if (k in b) { if (!isTimeKey(b[k])) return { ok: false, error: 'Horário inválido (use HH:MM).' }; v[k] = b[k]; }
  if (v.workStart && v.workEnd && v.workEnd <= v.workStart) return { ok: false, error: 'O fim do expediente precisa ser depois do início.' };
  return { ok: true, value: v };
}

export async function saveSettings(db: Db, coachId: string, v: Partial<Settings>): Promise<Settings> {
  const cur = await getSettings(db, coachId);
  const next = { ...cur, ...v };
  if (next.workEnd <= next.workStart) throw Object.assign(new Error('O fim do expediente precisa ser depois do início.'), { status: 400 });
  const data = { meetProvider: next.meetProvider, meetUrl: next.meetUrl, remindCoachMin: next.remindCoachMin, remindStudentMin: next.remindStudentMin, dailySummary: next.dailySummary, summaryHour: next.summaryHour, workStart: next.workStart, workEnd: next.workEnd };
  await db.agendaSettings.upsert({ where: { coachId }, update: data, create: { coachId, ...data } });
  return { ...next };
}

// ───────────────────────────── série → dias reais ─────────────────────────────

const rowFromSeries = (s: any, slot: Slot) => ({
  coachId: s.coachId, seriesId: s.id, slotAt: slot.slotAt, kind: s.kind, title: s.title ?? null, studentId: s.studentId ?? null, offlineClientId: s.offlineClientId ?? null,
  startsAt: slot.startsAt, endsAt: slot.endsAt, location: s.location ?? null, meetProvider: s.meetProvider ?? null, meetUrl: s.meetUrl ?? null, notes: s.notes ?? null, status: 'SCHEDULED',
  notifyStudent: s.notifyStudent !== false, notifyCoach: s.notifyCoach !== false,
});

/** Cria os dias que faltam das séries ativas do coach entre `fromKey` e `toKey`. Pode rodar quantas vezes quiser: o que já existe (inclusive cancelado ou remarcado) não é recriado. */
export async function ensureSeriesWindow(db: Db, coachId: string, fromKey: string, toKey: string, only?: any[]): Promise<number> {
  const all: any[] = only || await db.agendaSeries.findMany({ where: { coachId, active: true, startDate: { lte: toKey } } });
  const series = all.filter((s) => s.active !== false && s.startDate <= toKey && (!s.endDate || s.endDate >= fromKey));
  if (!series.length) return 0;
  const wanted = series.map((s) => ({ s, slots: expandSeries(s, fromKey, toKey) })).filter((x) => x.slots.length);
  if (!wanted.length) return 0;
  const existing: any[] = await db.agendaEvent.findMany({
    where: { seriesId: { in: wanted.map((x) => x.s.id) }, slotAt: { gte: startOfDayBrt(fromKey), lt: endOfDayBrt(toKey) } }, select: { seriesId: true, slotAt: true },
  });
  const have = new Set(existing.map((e) => e.seriesId + '|' + new Date(e.slotAt).getTime()));
  const rows = wanted.flatMap(({ s, slots }) => slots.filter((sl) => !have.has(s.id + '|' + sl.slotAt.getTime())).map((sl) => rowFromSeries(s, sl)));
  if (!rows.length) return 0;
  const res = await db.agendaEvent.createMany({ data: rows, skipDuplicates: true });
  return res?.count ?? rows.length;
}

/** Para o cron: garante os dias das séries de TODOS os coaches nos próximos `days` dias (sem isso, quem não abriu a agenda não receberia lembrete). */
export async function ensureAllSeries(db: Db, now: Date, days = 3): Promise<number> {
  const all: any[] = await db.agendaSeries.findMany({ where: { active: true } });
  const fromKey = dateKeyBrt(now), toKey = addDaysKey(fromKey, days - 1);
  const byCoach = new Map<string, any[]>();
  all.forEach((s) => byCoach.set(s.coachId, [...(byCoach.get(s.coachId) || []), s]));
  let n = 0;
  for (const [coachId, list] of byCoach) n += await ensureSeriesWindow(db, coachId, fromKey, toKey, list);
  return n;
}

// ───────────────────────────── listar ─────────────────────────────

export function checkWindow(fromKey: unknown, toKey: unknown): { ok: true; from: string; to: string } | { ok: false; error: string } {
  if (!isDateKey(fromKey) || !isDateKey(toKey)) return { ok: false, error: 'Informe from e to no formato AAAA-MM-DD.' };
  if (toKey < fromKey) return { ok: false, error: 'O período está invertido.' };
  if (diffDaysKeys(fromKey, toKey) + 1 > MAX_WINDOW_DAYS) return { ok: false, error: `Peça no máximo ${MAX_WINDOW_DAYS} dias por vez.` };
  return { ok: true, from: fromKey, to: toKey };
}

export async function listWindow(db: Db, coachId: string, fromKey: string, toKey: string) {
  await ensureSeriesWindow(db, coachId, fromKey, toKey);
  const events: any[] = await db.agendaEvent.findMany({ where: { coachId, startsAt: { gte: startOfDayBrt(fromKey), lt: endOfDayBrt(toKey) } }, orderBy: { startsAt: 'asc' } });
  return withPersons(db, events);
}

// ───────────────────────────── choque de horários ─────────────────────────────

async function conflictsFor(db: Db, coachId: string, spans: { startsAt: Date; endsAt: Date }[], ignore: { eventId?: string; seriesId?: string; fromSlot?: Date } = {}): Promise<Conflict[]> {
  if (!spans.length) return [];
  const lo = new Date(Math.min(...spans.map((s) => s.startsAt.getTime()))), hi = new Date(Math.max(...spans.map((s) => s.endsAt.getTime())));
  let rows: any[] = await db.agendaEvent.findMany({ where: { coachId, startsAt: { lt: hi }, endsAt: { gt: lo }, status: { notIn: ['CANCELLED', 'RESCHEDULED'] } } });
  // ao refazer uma série, os dias dela daqui em diante (refeitos ou mantidos no lugar) não contam como choque
  if (ignore.seriesId && ignore.fromSlot) rows = rows.filter((r) => !(r.seriesId === ignore.seriesId && new Date(r.slotAt) >= ignore.fromSlot!));
  const seen = new Map<string, any>();
  for (const sp of spans) for (const c of findConflicts(rows, sp.startsAt, sp.endsAt, ignore.eventId)) seen.set(c.id, c);
  const list = [...seen.values()].sort((a, b) => +new Date(a.startsAt) - +new Date(b.startsAt)).slice(0, 10);
  const persons = await loadPersons(db, list);
  return list.map((c) => ({ id: c.id, title: c.title ?? null, kind: c.kind, startsAt: new Date(c.startsAt), endsAt: new Date(c.endsAt), personName: personOf(persons, c)?.name || null }));
}

// ───────────────────────────── criar ─────────────────────────────

export async function createAgenda(db: Db, coachId: string, input: CreateInput, now: Date = new Date()): Promise<{ event?: any; series?: any; created?: number } | Fail> {
  if (!(await personBelongs(db, coachId, input.studentId, input.offlineClientId))) return { error: 'Essa pessoa não está na sua lista de alunos.', status: 403 };
  const startsAt = brtToUtc(input.date, input.time);
  const meta = { provider: input.kind === 'VIDEO' ? 'MEET' : null };

  if (!input.repeat) {
    const endsAt = new Date(startsAt.getTime() + input.durationMin * MIN);
    if (!input.force) {
      const conflicts = await conflictsFor(db, coachId, input.kind === 'LEMBRETE' ? [] : [{ startsAt, endsAt }]);
      if (conflicts.length) return { error: 'Já existe compromisso nesse horário.', status: 409, conflicts };
    }
    const event = await db.agendaEvent.create({ data: {
      coachId, slotAt: startsAt, kind: input.kind, title: input.title, studentId: input.studentId, offlineClientId: input.offlineClientId, startsAt, endsAt,
      location: input.location, meetProvider: meta.provider, meetUrl: input.meetUrl, notes: input.notes, notifyStudent: input.notifyStudent, notifyCoach: input.notifyCoach, status: 'SCHEDULED',
    } });
    return { event: (await withPersons(db, [event]))[0] };
  }

  const seriesData = {
    coachId, kind: input.kind, title: input.title, studentId: input.studentId, offlineClientId: input.offlineClientId, weekdays: input.repeat.weekdays, startTime: input.time,
    durationMin: input.durationMin, startDate: input.date, endDate: input.repeat.endDate, location: input.location, meetProvider: meta.provider, meetUrl: input.meetUrl, notes: input.notes, notifyStudent: input.notifyStudent, notifyCoach: input.notifyCoach, active: true,
  };
  const horizon = addDaysKey(input.date, SERIES_HORIZON_DAYS - 1);
  const until = input.repeat.endDate && input.repeat.endDate < horizon ? input.repeat.endDate : horizon;
  const slots = expandSeries({ weekdays: seriesData.weekdays, startTime: seriesData.startTime, durationMin: seriesData.durationMin, startDate: seriesData.startDate, endDate: seriesData.endDate }, input.date, until);
  if (!slots.length) return { error: 'Nenhum dia da série cai no período escolhido.', status: 400 };
  if (!input.force && input.kind !== 'LEMBRETE') {
    const conflicts = await conflictsFor(db, coachId, slots);
    if (conflicts.length) return { error: 'Já existe compromisso em algum dia dessa série.', status: 409, conflicts };
  }
  const series = await db.agendaSeries.create({ data: seriesData });
  await ensureSeriesWindow(db, coachId, input.date, until, [series]);
  return { series, created: slots.length };
}

// ───────────────────────────── editar ─────────────────────────────

const seriesFieldsOf = (p: PatchInput) => {
  const d: any = {};
  for (const k of ['title', 'location', 'meetUrl', 'notes', 'notifyStudent', 'notifyCoach'] as const) if (k in p) d[k] = (p as any)[k];
  if (p.time) d.startTime = p.time;
  if (p.durationMin) d.durationMin = p.durationMin;
  if (p.weekdays) d.weekdays = p.weekdays;
  return d;
};

export async function updateAgenda(db: Db, coachId: string, ev: any, p: PatchInput, now: Date = new Date()): Promise<{ event?: any; replaced?: number } | Fail> {
  if (ev.kind !== 'VIDEO' && 'meetUrl' in p) return { error: 'Só videochamada tem link.', status: 400 };

  // 1) este e os próximos dias de uma série: a série é DIVIDIDA no dia escolhido (como nas agendas de calendário). A antiga termina na véspera e
  //    guarda tudo o que já aconteceu; uma nova, com as mudanças, começa neste dia e refaz os dias futuros que ainda estão marcados.
  if (p.scope === 'future' && ev.seriesId) {
    const series = await db.agendaSeries.findUnique({ where: { id: ev.seriesId } });
    if (!series || series.coachId !== coachId) return { error: 'Série não encontrada.', status: 404 };
    const fields = seriesFieldsOf(p);
    const from = new Date(ev.slotAt), fromKey = dateKeyBrt(from);
    const next = { ...series, ...fields, startDate: fromKey };
    const until = addDaysKey(fromKey > dateKeyBrt(now) ? fromKey : dateKeyBrt(now), SERIES_HORIZON_DAYS - 1);
    if (!p.force && ATENDIMENTO_KINDS.concat(['BLOCO', 'BLOQUEIO']).includes(series.kind)) {
      const slots = expandSeries(next, fromKey, next.endDate && next.endDate < until ? next.endDate : until);
      const conflicts = await conflictsFor(db, coachId, slots, { seriesId: series.id, fromSlot: from });
      if (conflicts.length) return { error: 'Já existe compromisso em algum dos próximos dias.', status: 409, conflicts };
    }
    const del = await db.agendaEvent.deleteMany({ where: { seriesId: series.id, status: 'SCHEDULED', slotAt: { gte: from } } });
    // o que já foi feito/faltou/cancelado de hoje em diante não pode voltar a ser criado pela série nova
    const kept: any[] = await db.agendaEvent.findMany({ where: { seriesId: series.id, slotAt: { gte: from } } });
    if (fromKey <= series.startDate) await db.agendaSeries.update({ where: { id: series.id }, data: { active: false } });
    else await db.agendaSeries.update({ where: { id: series.id }, data: { endDate: addDaysKey(fromKey, -1) } });
    const fresh = await db.agendaSeries.create({ data: {
      coachId, kind: next.kind, title: next.title ?? null, studentId: next.studentId ?? null, offlineClientId: next.offlineClientId ?? null, weekdays: next.weekdays,
      startTime: next.startTime, durationMin: next.durationMin, startDate: fromKey, endDate: series.endDate ?? null, location: next.location ?? null,
      meetProvider: next.meetProvider ?? null, meetUrl: next.meetUrl ?? null, notes: next.notes ?? null, notifyStudent: next.notifyStudent !== false, notifyCoach: next.notifyCoach !== false, active: true,
    } });
    for (const k of kept) {
      const dk = dateKeyBrt(new Date(k.slotAt));
      if (next.weekdays.includes(weekdayOfKey(dk))) await db.agendaEvent.update({ where: { id: k.id }, data: { seriesId: fresh.id, slotAt: brtToUtc(dk, next.startTime) } });
    }
    await ensureSeriesWindow(db, coachId, fromKey, until, [fresh]);
    const first = await db.agendaEvent.findFirst({ where: { seriesId: fresh.id, status: 'SCHEDULED' }, orderBy: { startsAt: 'asc' } });
    return { event: first ? (await withPersons(db, [first]))[0] : null, replaced: del?.count ?? 0 };
  }

  // 2) só este dia
  const data: any = {};
  for (const k of ['title', 'location', 'meetUrl', 'notes', 'notifyStudent', 'notifyCoach'] as const) if (k in p) data[k] = (p as any)[k];
  if (p.status) { data.status = p.status; data.statusAt = p.status === 'SCHEDULED' ? null : now; }
  if (p.date || p.time || p.durationMin) {
    const curStart = new Date(ev.startsAt), curDur = Math.round((new Date(ev.endsAt).getTime() - curStart.getTime()) / MIN);
    const startsAt = brtToUtc(p.date || dateKeyBrt(curStart), p.time || timeKeyBrt(curStart));
    const endsAt = new Date(startsAt.getTime() + (p.durationMin || curDur) * MIN);
    if (!p.force && ev.kind !== 'LEMBRETE' && ev.status !== 'CANCELLED' && ev.status !== 'RESCHEDULED') {
      const conflicts = await conflictsFor(db, coachId, [{ startsAt, endsAt }], { eventId: ev.id });
      if (conflicts.length) return { error: 'Já existe compromisso nesse horário.', status: 409, conflicts };
    }
    data.startsAt = startsAt; data.endsAt = endsAt;
    if (startsAt.getTime() !== curStart.getTime()) { data.coachRemindedAt = null; data.studentRemindedAt = null; data.studentResponse = null; data.studentRespondedAt = null; }
  }
  if (!Object.keys(data).length) return { event: (await withPersons(db, [ev]))[0] };
  const event = await db.agendaEvent.update({ where: { id: ev.id }, data });
  return { event: (await withPersons(db, [event]))[0] };
}

// ───────────────────────────── apagar / cancelar ─────────────────────────────

export async function deleteAgenda(db: Db, coachId: string, ev: any, scope: 'this' | 'future', now: Date = new Date()): Promise<{ cancelled?: boolean; deleted: number }> {
  if (!ev.seriesId) { await db.agendaEvent.delete({ where: { id: ev.id } }); return { deleted: 1 }; }
  if (scope === 'future') {
    const series = await db.agendaSeries.findUnique({ where: { id: ev.seriesId } });
    const from = new Date(ev.slotAt), dayKey = dateKeyBrt(from);
    if (series && series.coachId === coachId) {
      if (dayKey <= series.startDate) await db.agendaSeries.update({ where: { id: series.id }, data: { active: false } });
      else await db.agendaSeries.update({ where: { id: series.id }, data: { endDate: addDaysKey(dayKey, -1) } });
    }
    const del = await db.agendaEvent.deleteMany({ where: { seriesId: ev.seriesId, status: 'SCHEDULED', slotAt: { gte: from } } });
    return { deleted: del?.count ?? 0 };
  }
  // um dia de série: fica como CANCELADO (o registro impede a série de recriar o dia)
  await db.agendaEvent.update({ where: { id: ev.id }, data: { status: 'CANCELLED', statusAt: now } });
  return { cancelled: true, deleted: 0 };
}

/** Quando uma pessoa é excluída/anonimizada, os compromissos dela somem da agenda (LGPD). */
export async function dropPersonAgenda(db: Db, o: { studentId?: string; offlineClientId?: string }) {
  const where = o.studentId ? { studentId: o.studentId } : o.offlineClientId ? { offlineClientId: o.offlineClientId } : null;
  if (!where) return;
  try {
    const evs: any[] = await db.agendaEvent.findMany({ where, select: { id: true } });
    await db.agendaEvent.deleteMany({ where }); await db.agendaSeries.deleteMany({ where });
    // anotações das pendências dessa pessoa (as chaves trazem o id dela ou o do compromisso)
    const ids = [o.studentId || o.offlineClientId, ...evs.map((e) => e.id)].filter(Boolean).slice(0, 300) as string[];
    if (ids.length) await db.agendaTaskNote.deleteMany({ where: { OR: ids.map((id) => ({ taskKey: { contains: id } })) } });
  } catch (e: any) { if (!isMissingTable(e)) console.error('[agenda] limpeza da pessoa falhou:', e?.message || e); }
}

/** Quando um coach é excluído, a agenda inteira dele vai junto. */
export async function dropCoachAgenda(db: Db, coachId: string) {
  try {
    await db.agendaEvent.deleteMany({ where: { coachId } }); await db.agendaSeries.deleteMany({ where: { coachId } });
    await db.agendaSettings.deleteMany({ where: { coachId } }); await db.agendaTaskSnooze.deleteMany({ where: { coachId } }); await db.agendaTaskNote.deleteMany({ where: { coachId } });
  } catch (e: any) { if (!isMissingTable(e)) console.error('[agenda] limpeza do coach falhou:', e?.message || e); }
}

// ───────────────────────────── lado do aluno ─────────────────────────────

/** Próximos atendimentos do aluno (sem as anotações do coach). */
export async function upcomingForStudent(db: Db, studentId: string, now: Date = new Date(), days = 21) {
  const rows: any[] = await db.agendaEvent.findMany({
    where: { studentId, status: 'SCHEDULED', kind: { in: ATENDIMENTO_KINDS }, endsAt: { gte: now }, startsAt: { lt: new Date(now.getTime() + days * 86400000) }, NOT: { notifyStudent: false } },
    orderBy: { startsAt: 'asc' }, take: 20,
  });
  if (!rows.length) return [];
  const coachIds = [...new Set(rows.map((r) => r.coachId))];
  const coaches: any[] = await db.user.findMany({ where: { id: { in: coachIds } }, select: { id: true, name: true } });
  const settings: any[] = await db.agendaSettings.findMany({ where: { coachId: { in: coachIds } } });
  const nameOf = new Map(coaches.map((c) => [c.id, c.name]));
  const meetOf = new Map(settings.map((s) => [s.coachId, s.meetUrl]));
  return rows.map((r) => ({
    id: r.id, kind: r.kind, title: r.title ?? null, startsAt: r.startsAt, endsAt: r.endsAt, location: r.location ?? null,
    meetUrl: r.kind === 'VIDEO' ? (r.meetUrl || meetOf.get(r.coachId) || null) : null,
    coachName: nameOf.get(r.coachId) || null, studentResponse: r.studentResponse ?? null,
  }));
}

export async function studentRespond(db: Db, studentId: string, eventId: string, response: string, now: Date = new Date()): Promise<{ event?: any } | Fail> {
  const ev = await db.agendaEvent.findUnique({ where: { id: eventId } });
  if (!ev || ev.studentId !== studentId || !ATENDIMENTO_KINDS.includes(ev.kind) || ev.notifyStudent === false) return { error: 'Compromisso não encontrado.', status: 404 };
  if (ev.status !== 'SCHEDULED' || new Date(ev.startsAt) <= now) return { error: 'Esse compromisso não aceita mais resposta.', status: 409 };
  const event = await db.agendaEvent.update({ where: { id: eventId }, data: { studentResponse: response, studentRespondedAt: now } });
  return { event };
}

