// lib/agenda.ts
// 📅 (6 out 2026) Regras PURAS da agenda do coach (sem banco, sem rede): datas de Brasília, série semanal, validação do que o app envia, choque de
// horários, link do Google Meet e horário dos lembretes. O banco fica em lib/agendaStore.ts e os avisos em lib/agendaCron.ts.
//
// HORÁRIO: a agenda vive em Brasília (UTC-3, sem horário de verão desde 2019, o mesmo "-3h" que o resto do backend usa). No banco tudo é UTC;
// "dia" e "hora" que o coach vê são sempre os de Brasília.

export const BRT_OFFSET_MS = 3 * 60 * 60 * 1000;
const MIN = 60 * 1000;

export const KINDS = ['PRESENCIAL', 'VIDEO', 'AVALIACAO', 'BLOCO', 'BLOQUEIO', 'LEMBRETE'] as const;
export type AgendaKind = (typeof KINDS)[number];
/** Atendimentos de verdade (têm presença, lembrete ao aluno e entram na central HOJE). */
export const ATENDIMENTO_KINDS: string[] = ['PRESENCIAL', 'VIDEO', 'AVALIACAO'];
export const STATUSES = ['SCHEDULED', 'DONE', 'MISSED', 'CANCELLED'] as const;
export type AgendaStatus = (typeof STATUSES)[number];
export const STUDENT_RESPONSES = ['CONFIRMED', 'RESCHEDULE'] as const;

export const KIND_LABEL: Record<string, string> = {
  PRESENCIAL: 'Atendimento presencial', VIDEO: 'Videochamada', AVALIACAO: 'Avaliação', BLOCO: 'Bloco de tempo', BLOQUEIO: 'Indisponível', LEMBRETE: 'Lembrete',
};
const DEFAULT_TITLE: Record<string, string> = { BLOCO: 'Bloco de tempo', BLOQUEIO: 'Indisponível', LEMBRETE: 'Lembrete' };

export const DEFAULT_DURATION_MIN = 60;
export const MIN_DURATION_MIN = 5;
export const MAX_DURATION_MIN = 600;
export const MAX_TITLE = 80;
export const MAX_LOCATION = 120;
export const MAX_NOTES = 1000;
/** A agenda aberta pelo app pede no máximo ~2 meses de uma vez. */
export const MAX_WINDOW_DAYS = 62;
/** Ao criar uma série, os dias das próximas semanas já são criados (o resto aparece quando a agenda é aberta). */
export const SERIES_HORIZON_DAYS = 56;

// ───────────────────────────── datas de Brasília ─────────────────────────────

export function isDateKey(s: unknown): s is string {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(s + 'T00:00:00Z');
  return !isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}
export function isTimeKey(s: unknown): s is string { return typeof s === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(s); }

/** "AAAA-MM-DD" do dia de Brasília em que `d` cai. */
export function dateKeyBrt(d: Date): string { return new Date(d.getTime() - BRT_OFFSET_MS).toISOString().slice(0, 10); }
/** "HH:MM" de Brasília. */
export function timeKeyBrt(d: Date): string { return new Date(d.getTime() - BRT_OFFSET_MS).toISOString().slice(11, 16); }
export function minutesOfDayBrt(d: Date): number { const s = new Date(d.getTime() - BRT_OFFSET_MS); return s.getUTCHours() * 60 + s.getUTCMinutes(); }
export function addDaysKey(key: string, n: number): string { const d = new Date(key + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }
export function diffDaysKeys(a: string, b: string): number { return Math.round((new Date(b + 'T00:00:00Z').getTime() - new Date(a + 'T00:00:00Z').getTime()) / 86400000); }
/** 0 = domingo ... 6 = sábado. */
export function weekdayOfKey(key: string): number { return new Date(key + 'T00:00:00Z').getUTCDay(); }
/** Instante (UTC) em que é `hhmm` de Brasília no dia `key`. */
export function brtToUtc(key: string, hhmm: string): Date { return new Date(`${key}T${hhmm}:00-03:00`); }
export function startOfDayBrt(key: string): Date { return brtToUtc(key, '00:00'); }
/** Início do dia seguinte (exclusivo) -- use como "< fim". */
export function endOfDayBrt(key: string): Date { return brtToUtc(addDaysKey(key, 1), '00:00'); }
/** Segunda-feira (AAAA-MM-DD) da semana de `key`. */
export function mondayOfKey(key: string): string { const wd = weekdayOfKey(key); return addDaysKey(key, wd === 0 ? -6 : 1 - wd); }

// ───────────────────────────── série semanal ─────────────────────────────

export type SeriesLike = { weekdays: number[]; startTime: string; durationMin: number; startDate: string; endDate?: string | null };
export type Slot = { dateKey: string; slotAt: Date; startsAt: Date; endsAt: Date };

/** Os dias que a série marca entre `fromKey` e `toKey` (inclusive), respeitando início e fim da série. */
export function expandSeries(s: SeriesLike, fromKey: string, toKey: string): Slot[] {
  const first = fromKey > s.startDate ? fromKey : s.startDate;
  const last = s.endDate && s.endDate < toKey ? s.endDate : toKey;
  if (!isDateKey(first) || !isDateKey(last) || first > last) return [];
  const days = new Set((s.weekdays || []).filter((n) => Number.isInteger(n) && n >= 0 && n <= 6));
  const out: Slot[] = [];
  let key = first;
  for (let guard = 0; key <= last && guard < 400; guard++) {
    if (days.has(weekdayOfKey(key))) {
      const startsAt = brtToUtc(key, s.startTime);
      out.push({ dateKey: key, slotAt: startsAt, startsAt, endsAt: new Date(startsAt.getTime() + s.durationMin * MIN) });
    }
    key = addDaysKey(key, 1);
  }
  return out;
}

// ───────────────────────────── link do Google Meet ─────────────────────────────

/** Provedores de videochamada aceitos. Por enquanto só o Google Meet: Zoom/WhatsApp entram aqui quando forem liberados (a coluna já guarda o provedor). */
export const MEET_PROVIDERS: Record<string, { label: string; hosts: string[] }> = {
  MEET: { label: 'Google Meet', hosts: ['meet.google.com', 'g.co'] },
};
export const MAX_MEET_URL = 200;

/** Aceita "meet.google.com/abc-defg-hij" (sem https), normaliza e recusa qualquer outro endereço. Vazio = sem link. */
export function normalizeMeetUrl(raw: unknown, provider = 'MEET'): { ok: true; url: string | null } | { ok: false; error: string } {
  if (raw == null) return { ok: true, url: null };
  if (typeof raw !== 'string') return { ok: false, error: 'Link inválido.' };
  let t = raw.trim();
  if (!t) return { ok: true, url: null };
  const cfg = MEET_PROVIDERS[provider];
  if (!cfg) return { ok: false, error: 'Provedor de videochamada não disponível.' };
  if (t.length > MAX_MEET_URL) return { ok: false, error: 'Link muito longo.' };
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(t)) t = 'https://' + t;
  let u: URL;
  try { u = new URL(t); } catch { return { ok: false, error: 'Link inválido.' }; }
  if (u.protocol !== 'https:') return { ok: false, error: 'O link precisa começar com https://.' };
  const host = u.hostname.toLowerCase();
  const hostOk = cfg.hosts.includes(host) && (host !== 'g.co' || u.pathname.startsWith('/meet/'));
  if (!hostOk) return { ok: false, error: `Use um link do ${cfg.label} (ex.: meet.google.com/abc-defg-hij).` };
  if (u.pathname.length <= 1) return { ok: false, error: `O link do ${cfg.label} precisa ter o código da sala (ex.: meet.google.com/abc-defg-hij).` };
  return { ok: true, url: u.toString() };
}

// ───────────────────────────── o que o app envia ─────────────────────────────

export type CreateInput = {
  kind: AgendaKind; title: string | null; studentId: string | null; offlineClientId: string | null;
  date: string; time: string; durationMin: number; location: string | null; meetUrl: string | null; notes: string | null;
  repeat: { weekdays: number[]; endDate: string | null } | null; force: boolean;
};
export type PatchInput = {
  status?: AgendaStatus; title?: string | null; location?: string | null; meetUrl?: string | null; notes?: string | null;
  date?: string; time?: string; durationMin?: number; weekdays?: number[]; scope: 'this' | 'future'; force: boolean;
};
type Parsed<T> = { ok: true; value: T } | { ok: false; error: string };

const cleanText = (v: unknown, max: number, label: string): { ok: true; v: string | null } | { ok: false; error: string } => {
  if (v == null) return { ok: true, v: null };
  if (typeof v !== 'string') return { ok: false, error: `${label} inválido.` };
  const t = v.replace(/\r\n/g, '\n').trim();
  if (t.length > max) return { ok: false, error: `${label} muito longo (máximo ${max} caracteres).` };
  return { ok: true, v: t || null };
};
const cleanId = (v: unknown): string | null => (typeof v === 'string' && v.trim() && v.length <= 80 ? v.trim() : null);

function parseWeekdays(v: unknown): Parsed<number[]> {
  if (!Array.isArray(v) || !v.length) return { ok: false, error: 'Escolha pelo menos um dia da semana.' };
  const days = [...new Set(v.map((n) => Number(n)))];
  if (days.some((n) => !Number.isInteger(n) || n < 0 || n > 6)) return { ok: false, error: 'Dia da semana inválido.' };
  return { ok: true, value: days.sort((a, b) => a - b) };
}
function parseDuration(v: unknown, fallback: number): Parsed<number> {
  if (v == null || v === '') return { ok: true, value: fallback };
  const n = Number(v);
  if (!Number.isInteger(n) || n < MIN_DURATION_MIN || n > MAX_DURATION_MIN) return { ok: false, error: `A duração precisa ficar entre ${MIN_DURATION_MIN} e ${MAX_DURATION_MIN} minutos.` };
  return { ok: true, value: n };
}

export function parseCreateBody(b: any): Parsed<CreateInput> {
  if (!b || typeof b !== 'object') return { ok: false, error: 'Corpo inválido.' };
  const kind = (b.kind == null ? 'PRESENCIAL' : String(b.kind).toUpperCase()) as AgendaKind;
  if (!KINDS.includes(kind)) return { ok: false, error: 'Tipo de compromisso inválido.' };
  const studentId = cleanId(b.studentId), offlineClientId = cleanId(b.offlineClientId);
  if (studentId && offlineClientId) return { ok: false, error: 'Escolha só uma pessoa.' };
  if (!isDateKey(b.date)) return { ok: false, error: 'Data inválida.' };
  if (!isTimeKey(b.time)) return { ok: false, error: 'Horário inválido (use HH:MM).' };
  const title = cleanText(b.title, MAX_TITLE, 'Título'); if (!title.ok) return title;
  const location = cleanText(b.location, MAX_LOCATION, 'Local'); if (!location.ok) return location;
  const notes = cleanText(b.notes, MAX_NOTES, 'Anotação'); if (!notes.ok) return notes;
  const dur = parseDuration(b.durationMin, kind === 'LEMBRETE' ? 15 : DEFAULT_DURATION_MIN); if (!dur.ok) return dur;
  let meetUrl: string | null = null;
  if (kind === 'VIDEO') { const m = normalizeMeetUrl(b.meetUrl); if (!m.ok) return m; meetUrl = m.url; }
  let finalTitle = title.v;
  if (!finalTitle) {
    if (DEFAULT_TITLE[kind]) finalTitle = DEFAULT_TITLE[kind];
    else if (!studentId && !offlineClientId) return { ok: false, error: 'Escolha a pessoa ou escreva um título.' };
  }
  let repeat: CreateInput['repeat'] = null;
  if (b.repeatWeekly === true) {
    const wd = b.weekdays == null ? { ok: true as const, value: [weekdayOfKey(b.date)] } : parseWeekdays(b.weekdays);
    if (!wd.ok) return wd;
    let endDate: string | null = null;
    if (b.endDate != null && b.endDate !== '') {
      if (!isDateKey(b.endDate)) return { ok: false, error: 'Data final inválida.' };
      if (b.endDate < b.date) return { ok: false, error: 'A data final não pode ser antes do início.' };
      endDate = b.endDate;
    }
    repeat = { weekdays: wd.value, endDate };
  }
  return { ok: true, value: { kind, title: finalTitle, studentId, offlineClientId, date: b.date, time: b.time, durationMin: dur.value, location: location.v, meetUrl, notes: notes.v, repeat, force: b.force === true } };
}

export function parsePatchBody(b: any): Parsed<PatchInput> {
  if (!b || typeof b !== 'object') return { ok: false, error: 'Corpo inválido.' };
  const out: PatchInput = { scope: b.scope === 'future' ? 'future' : 'this', force: b.force === true };
  if ('status' in b) {
    const st = String(b.status || '').toUpperCase();
    if (!(STATUSES as readonly string[]).includes(st)) return { ok: false, error: 'Situação inválida.' };
    out.status = st as AgendaStatus;
  }
  for (const [k, max, label] of [['title', MAX_TITLE, 'Título'], ['location', MAX_LOCATION, 'Local'], ['notes', MAX_NOTES, 'Anotação']] as const) {
    if (k in b) { const t = cleanText(b[k], max, label); if (!t.ok) return t; (out as any)[k] = t.v; }
  }
  if ('meetUrl' in b) { const m = normalizeMeetUrl(b.meetUrl); if (!m.ok) return m; out.meetUrl = m.url; }
  if ('date' in b) { if (!isDateKey(b.date)) return { ok: false, error: 'Data inválida.' }; out.date = b.date; }
  if ('time' in b) { if (!isTimeKey(b.time)) return { ok: false, error: 'Horário inválido (use HH:MM).' }; out.time = b.time; }
  if ('durationMin' in b) { const d = parseDuration(b.durationMin, DEFAULT_DURATION_MIN); if (!d.ok) return d; out.durationMin = d.value; }
  if ('weekdays' in b) { const w = parseWeekdays(b.weekdays); if (!w.ok) return w; out.weekdays = w.value; }
  return { ok: true, value: out };
}

// ───────────────────────────── choque de horários ─────────────────────────────

export type Busy = { id: string; kind: string; status: string; startsAt: Date | string; endsAt: Date | string };
/** Lembrete não ocupa tempo; cancelado também não. Faltou/feito ainda ocupam o horário. */
export const occupiesTime = (e: { kind: string; status: string }) => e.kind !== 'LEMBRETE' && e.status !== 'CANCELLED';

export function findConflicts<T extends Busy>(existing: T[], startsAt: Date, endsAt: Date, ignoreId?: string | null): T[] {
  return existing.filter((e) => e.id !== ignoreId && occupiesTime(e) && new Date(e.startsAt) < endsAt && startsAt < new Date(e.endsAt));
}

// ───────────────────────────── lembretes ─────────────────────────────

export const STUDENT_QUIET_FROM_MIN = 22 * 60;       // depois das 22h não manda push ao aluno
export const STUDENT_QUIET_UNTIL_MIN = 6 * 60 + 30;  // nem antes das 06:30

export function isQuietNow(now: Date): boolean { const m = minutesOfDayBrt(now); return m >= STUDENT_QUIET_FROM_MIN || m < STUDENT_QUIET_UNTIL_MIN; }

/** Quando avisar o coach: `leadMin` minutos antes (a qualquer hora: quem atende cedo quer o aviso cedo). */
export const coachReminderAt = (startsAt: Date, leadMin: number) => new Date(startsAt.getTime() - leadMin * MIN);

/** Quando avisar o aluno: `leadMin` antes, mas nunca de madrugada ou de noite -- cai para as 20h da véspera. */
export function studentReminderAt(startsAt: Date, leadMin: number): Date {
  const at = new Date(startsAt.getTime() - leadMin * MIN);
  const m = minutesOfDayBrt(at), key = dateKeyBrt(at);
  if (m >= STUDENT_QUIET_FROM_MIN) return brtToUtc(key, '20:00');
  if (m < STUDENT_QUIET_UNTIL_MIN) return brtToUtc(addDaysKey(key, -1), '20:00');
  return at;
}

export const firstName = (name?: string | null) => String(name || '').trim().split(/\s+/)[0] || '';

const dayWord = (startsAt: Date, now: Date) => {
  const diff = diffDaysKeys(dateKeyBrt(now), dateKeyBrt(startsAt));
  return diff <= 0 ? 'hoje' : diff === 1 ? 'amanhã' : 'em ' + startsAt.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit' });
};

export function coachReminderText(ev: { kind: string; title?: string | null; startsAt: Date; endsAt: Date; location?: string | null }, personName: string | null, now: Date) {
  const who = personName || ev.title || KIND_LABEL[ev.kind] || 'Compromisso';
  const mins = Math.max(0, Math.round((ev.startsAt.getTime() - now.getTime()) / MIN));
  const dw = dayWord(ev.startsAt, now);
  const when = mins <= 1 ? 'Agora' : mins < 60 ? `Em ${mins} min` : `${dw.charAt(0).toUpperCase() + dw.slice(1)} às ${timeKeyBrt(ev.startsAt)}`;
  const parts = [KIND_LABEL[ev.kind] || 'Compromisso', `${timeKeyBrt(ev.startsAt)} às ${timeKeyBrt(ev.endsAt)}`];
  if (ev.location) parts.push(ev.location);
  return { title: `📅 ${when}: ${who}`, body: parts.join(' · ') };
}

export function studentReminderText(ev: { kind: string; startsAt: Date }, coachName: string | null, now: Date) {
  const day = dayWord(ev.startsAt, now), hour = timeKeyBrt(ev.startsAt), who = firstName(coachName);
  if (ev.kind === 'VIDEO') return { title: `📹 Videochamada ${day} às ${hour}`, body: `${who ? 'Com ' + who + '. ' : ''}Toque para ver o horário e abrir o link da sala.` };
  return { title: `📅 Atendimento ${day} às ${hour}`, body: `${who ? 'Com ' + who + '. ' : ''}Confirme a sua presença no app.` };
}

export function summaryText(o: { events: { startsAt: Date; kind: string }[]; late: number; today: number }) {
  const n = o.events.length;
  const first = n ? ` (o primeiro às ${timeKeyBrt(o.events[0].startsAt)})` : '';
  const parts: string[] = [n ? `${n} ${n === 1 ? 'compromisso' : 'compromissos'}${first}` : 'Sem compromissos marcados'];
  const pend = o.late + o.today;
  if (pend) parts.push(`${pend} ${pend === 1 ? 'pendência' : 'pendências'}${o.late ? ` (${o.late} atrasada${o.late > 1 ? 's' : ''})` : ''}`);
  return { title: '☀️ Seu dia na agenda', body: parts.join(' · ') };
}
