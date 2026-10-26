import assert from 'assert';
import jwt from 'jsonwebtoken';
import prisma from '@/lib/prisma';
import { GET as listGET, POST as createPOST } from '/home/user/fitos-final/app/api/agenda/route';
import { PATCH as evPATCH, DELETE as evDELETE } from '/home/user/fitos-final/app/api/agenda/[id]/route';
import { GET as setGET, PUT as setPUT } from '/home/user/fitos-final/app/api/agenda/settings/route';
import { GET as hojeGET, POST as hojePOST } from '/home/user/fitos-final/app/api/agenda/hoje/route';
import { GET as meGET } from '/home/user/fitos-final/app/api/agenda/me/route';
import { POST as meRespond } from '/home/user/fitos-final/app/api/agenda/me/[id]/route';
import { GET as cronGET, POST as cronPOST } from '/home/user/fitos-final/app/api/cron/agenda/route';
import * as A from '/home/user/fitos-final/lib/agenda';
import * as ST from '/home/user/fitos-final/lib/agendaStore';
import * as HJ from '/home/user/fitos-final/lib/agendaHoje';
import * as CR from '/home/user/fitos-final/lib/agendaCron';
import { PAULO_ID, ADRI_ID } from '/home/user/fitos-final/lib/masterIds';

const P = prisma as any; const S = P.__state;
const SECRET = 'dev-only-troque-isso-configurando-JWT_SECRET-no-env';
const tok = (id: string, role = 'COACH', coachId: string | null = null) => jwt.sign({ id, role, coachId }, SECRET);
const call = async (fn: any, url: string, as: string | null, init: any = {}, ctx?: any) => {
  const headers: any = { 'content-type': 'application/json' }; if (as) headers.authorization = 'Bearer ' + as;
  const r = await fn(new Request('http://x' + url, { ...init, headers: { ...headers, ...(init.headers || {}) } }), ctx);
  return { status: r.status, json: await r.json().catch(() => null) };
};
const body = (o: any) => ({ method: 'POST', body: JSON.stringify(o) });
const pushes = () => (globalThis as any).__pushes || [];
const clearPushes = () => { (globalThis as any).__pushes = []; };

const TODAY = A.dateKeyBrt(new Date());
const day = (n: number) => A.addDaysKey(TODAY, n);
const MON = A.addDaysKey(A.mondayOfKey(TODAY), 7);   // a próxima segunda-feira (sempre no futuro)
const DAY = 86400000, H = 3600000, MIN = 60000;

const seed = () => {
  P.__reset(); clearPushes();
  const u = (o: any) => S.user.push({ role: 'USER', active: true, isFinanceActive: true, isTestAccount: false, name: o.id, phone: null, photoUrl: null, coachId: null, nutritionistId: null, ...o });
  u({ id: PAULO_ID, role: 'ADMIN', name: 'Paulo Master', pushToken: 'ExponentPushToken[paulo]' });
  u({ id: ADRI_ID, role: 'ADMIN', name: 'Adri Master' });
  u({ id: 'cA', role: 'COACH', name: 'Coach A', pushToken: 'ExponentPushToken[cA]' });
  u({ id: 'cB', role: 'COACH', name: 'Coach B', pushToken: 'ExponentPushToken[cB]' });
  u({ id: 's1', name: 'Samara Franco', phone: '5541999990001', coachId: 'cA', pushToken: 'ExponentPushToken[s1]', financeCategory: 'Personal Trainer' });
  u({ id: 's2', name: 'Bia Costa', coachId: 'cB' });
  u({ id: 'sm', name: 'Marco Master', coachId: PAULO_ID, pushToken: 'ExponentPushToken[sm]' });
  u({ id: 'sn', name: 'Nina Nutri', nutritionistId: 'cA' });
  u({ id: 'sx', name: 'Conta Teste', coachId: 'cA', isTestAccount: true, contractValue: 100, paymentDueDate: new Date(Date.now() - 5 * DAY) });
  S.offlineClient.push({ id: 'o1', name: 'Didio Silva', phone: '5541988880001', coachId: 'cA', financeCategory: 'Personal Trainer', isFinanceActive: true, contractValue: 400, paymentDueDate: null });
  S.offlineClient.push({ id: 'o2', name: 'Vilma Souza', phone: null, coachId: 'cB', financeCategory: 'Personal Trainer', isFinanceActive: true, contractValue: 400, paymentDueDate: null });
  S.offlineClient.push({ id: 'om', name: 'Bruno Master', phone: null, coachId: PAULO_ID, financeCategory: 'Personal Trainer', isFinanceActive: true, contractValue: 300, paymentDueDate: null });
};
const addEvent = (o: any) => { const startsAt = o.startsAt as Date; const row = { id: 'ev' + S.nextId++, coachId: 'cA', kind: 'PRESENCIAL', status: 'SCHEDULED', title: null, studentId: null, offlineClientId: null, seriesId: null, location: null, meetUrl: null, notes: null, studentResponse: null, coachRemindedAt: null, studentRemindedAt: null, ...o, slotAt: o.slotAt || startsAt, endsAt: o.endsAt || new Date(startsAt.getTime() + H) }; S.agendaEvent.push(row); return row; };
const mk = (key: string, hhmm: string, extra: any = {}) => ({ coachId: 'cA', kind: 'PRESENCIAL', studentId: 's1', date: key, time: hhmm, durationMin: 60, ...extra });
const list = (as: string | null, coachId: string, from: string, to: string) => call(listGET, `/api/agenda?coachId=${coachId}&from=${from}&to=${to}`, as);

let fails = 0, passed = 0;
const block = async (name: string, fn: () => Promise<void> | void) => {
  try { seed(); await fn(); passed++; console.log('  ok  ' + name); }
  catch (e: any) { fails++; console.log('  FALHOU  ' + name + '\n        ' + String(e && e.message || e).split('\n').slice(0, 6).join('\n        ')); }
};

(async () => {
  // ───────────── regras puras ─────────────
  await block('datas de Brasília: 23:30 BRT ainda é o mesmo dia; meia-noite vira o dia', () => {
    assert.strictEqual(A.dateKeyBrt(new Date('2026-10-13T02:30:00Z')), '2026-10-12');    // 23:30 de Brasília
    assert.strictEqual(A.dateKeyBrt(new Date('2026-10-13T03:00:00Z')), '2026-10-13');    // 00:00 de Brasília
    assert.strictEqual(A.timeKeyBrt(new Date('2026-10-13T02:30:00Z')), '23:30');
    assert.strictEqual(A.brtToUtc('2026-10-12', '07:00').toISOString(), '2026-10-12T10:00:00.000Z');
    assert.strictEqual(A.brtToUtc('2026-10-12', '23:30').toISOString(), '2026-10-13T02:30:00.000Z');
    assert.strictEqual(A.startOfDayBrt('2026-10-12').toISOString(), '2026-10-12T03:00:00.000Z');
    assert.strictEqual(A.endOfDayBrt('2026-10-12').toISOString(), '2026-10-13T03:00:00.000Z');
    assert.strictEqual(A.minutesOfDayBrt(new Date('2026-10-12T10:30:00Z')), 7 * 60 + 30);
  });
  await block('chaves de data: validação real, somar dias, dia da semana, segunda-feira', () => {
    for (const bad of ['2026-02-30', '2026-13-01', '26-01-01', '2026-1-1', '', null, undefined, 20260101]) assert.strictEqual(A.isDateKey(bad as any), false, String(bad));
    assert.strictEqual(A.isDateKey('2028-02-29'), true); assert.strictEqual(A.isDateKey('2026-02-29'), false);
    assert.strictEqual(A.addDaysKey('2026-12-31', 1), '2027-01-01'); assert.strictEqual(A.addDaysKey('2026-03-01', -1), '2026-02-28');
    assert.strictEqual(A.diffDaysKeys('2026-10-01', '2026-10-08'), 7);
    assert.strictEqual(A.weekdayOfKey('2026-10-12'), 1); assert.strictEqual(A.weekdayOfKey('2026-10-11'), 0); assert.strictEqual(A.weekdayOfKey('2026-10-17'), 6);
    assert.strictEqual(A.mondayOfKey('2026-10-14'), '2026-10-12'); assert.strictEqual(A.mondayOfKey('2026-10-12'), '2026-10-12'); assert.strictEqual(A.mondayOfKey('2026-10-18'), '2026-10-12');
    assert.strictEqual(A.isTimeKey('07:00'), true); assert.strictEqual(A.isTimeKey('24:00'), false); assert.strictEqual(A.isTimeKey('7:00'), false); assert.strictEqual(A.isTimeKey('07:60'), false);
  });
  await block('série semanal: dias certos, início/fim e recorte da janela', () => {
    const s = { weekdays: [1, 3, 5], startTime: '07:00', durationMin: 45, startDate: '2026-10-12', endDate: '2026-10-23' };
    const all = A.expandSeries(s, '2026-10-01', '2026-12-31');
    assert.deepStrictEqual(all.map((x) => x.dateKey), ['2026-10-12', '2026-10-14', '2026-10-16', '2026-10-19', '2026-10-21', '2026-10-23']);
    assert.strictEqual(all[0].startsAt.toISOString(), '2026-10-12T10:00:00.000Z'); assert.strictEqual(all[0].endsAt.toISOString(), '2026-10-12T10:45:00.000Z');
    assert.deepStrictEqual(A.expandSeries(s, '2026-10-14', '2026-10-17').map((x) => x.dateKey), ['2026-10-14', '2026-10-16']);   // recorte nas duas pontas
    assert.deepStrictEqual(A.expandSeries(s, '2026-10-24', '2026-11-30'), []);                                                  // depois do fim
    assert.deepStrictEqual(A.expandSeries(s, '2026-09-01', '2026-10-11'), []);                                                  // antes do início
    assert.strictEqual(A.expandSeries({ ...s, endDate: null }, '2026-10-12', '2026-11-12').length, 14);
    assert.deepStrictEqual(A.expandSeries({ ...s, weekdays: [] }, '2026-10-12', '2026-10-20'), []);
    assert.deepStrictEqual(A.expandSeries(s, '2026-10-20', '2026-10-12'), []);
  });
  await block('link do Meet: aceita sem https, recusa outros sites, http e parecidos', () => {
    const ok = (v: any) => { const r: any = A.normalizeMeetUrl(v); assert.ok(r.ok, JSON.stringify(v) + ' -> ' + r.error); return r.url; };
    const no = (v: any) => assert.strictEqual((A.normalizeMeetUrl(v) as any).ok, false, String(v));
    assert.strictEqual(ok('meet.google.com/abc-defg-hij'), 'https://meet.google.com/abc-defg-hij');
    assert.strictEqual(ok('  https://meet.google.com/abc-defg-hij?authuser=1 '), 'https://meet.google.com/abc-defg-hij?authuser=1');
    assert.strictEqual(ok('https://g.co/meet/sala-do-paulo'), 'https://g.co/meet/sala-do-paulo');
    assert.strictEqual(ok(''), null); assert.strictEqual(ok(null), null); assert.strictEqual(ok(undefined), null);
    for (const bad of ['https://zoom.us/j/123456', 'http://meet.google.com/abc-defg-hij', 'https://meet.google.com.evil.com/abc', 'https://evil.com/meet.google.com/abc', 'javascript:alert(1)', 'https://g.co/outra', 'https://meet.google.com/', 'https://meet.google.com', 'ftp://meet.google.com/abc', 'não é link', 123, 'https://meet.google.com/' + 'a'.repeat(250)]) no(bad);
    assert.strictEqual((A.normalizeMeetUrl('https://meet.google.com/abc-defg-hij', 'ZOOM') as any).ok, false);   // provedor ainda não liberado
  });
  await block('o que o app envia (criar): padrões e todos os erros', () => {
    const pc = (o: any) => A.parseCreateBody({ studentId: 's1', date: '2026-10-12', time: '07:00', ...o });
    const v: any = pc({}); assert.ok(v.ok); assert.strictEqual(v.value.kind, 'PRESENCIAL'); assert.strictEqual(v.value.durationMin, 60); assert.strictEqual(v.value.repeat, null); assert.strictEqual(v.value.force, false);
    assert.strictEqual((pc({ kind: 'lembrete' }) as any).value.durationMin, 15);
    assert.strictEqual((pc({ kind: 'bloqueio', studentId: null }) as any).value.title, 'Indisponível');
    assert.strictEqual((pc({ kind: 'bloco', studentId: null }) as any).value.title, 'Bloco de tempo');
    assert.strictEqual((pc({ studentId: null, title: 'Visita' }) as any).value.title, 'Visita');
    const err = (o: any, re: RegExp) => { const r: any = pc(o); assert.strictEqual(r.ok, false, JSON.stringify(o)); assert.match(r.error, re); };
    err({ kind: 'XYZ' }, /Tipo/); err({ offlineClientId: 'o1' }, /só uma pessoa/); err({ date: '2026-02-30' }, /Data inválida/); err({ time: '25:00' }, /Horário/);
    err({ durationMin: 3 }, /duração/); err({ durationMin: 601 }, /duração/); err({ durationMin: 'x' }, /duração/); err({ title: 'x'.repeat(81) }, /Título muito longo/); err({ location: 'x'.repeat(121) }, /Local/); err({ notes: 'x'.repeat(1001) }, /Anotação/);
    err({ studentId: null }, /pessoa ou escreva um título/); err({ kind: 'VIDEO', meetUrl: 'https://zoom.us/j/1' }, /Google Meet/);
    assert.strictEqual((pc({ kind: 'PRESENCIAL', meetUrl: 'https://zoom.us/j/1' }) as any).ok, true);   // só videochamada tem link: nos outros o campo é ignorado
    assert.strictEqual((pc({ kind: 'PRESENCIAL', meetUrl: 'https://zoom.us/j/1' }) as any).value.meetUrl, null);
    assert.strictEqual((pc({ kind: 'VIDEO', meetUrl: 'meet.google.com/abc-defg-hij' }) as any).value.meetUrl, 'https://meet.google.com/abc-defg-hij');
    const r: any = pc({ repeatWeekly: true }); assert.deepStrictEqual(r.value.repeat, { weekdays: [1], endDate: null });   // sem dias = o dia da data
    assert.deepStrictEqual((pc({ repeatWeekly: true, weekdays: [5, 1, 1, 3], endDate: '2026-12-01' }) as any).value.repeat, { weekdays: [1, 3, 5], endDate: '2026-12-01' });
    err({ repeatWeekly: true, weekdays: [] }, /dia da semana/); err({ repeatWeekly: true, weekdays: [7] }, /inválido/); err({ repeatWeekly: true, endDate: '2026-10-01' }, /antes do início/); err({ repeatWeekly: true, endDate: 'x' }, /Data final/);
    assert.strictEqual((A.parseCreateBody(null) as any).ok, false);
  });
  await block('o que o app envia (editar): só o que veio, escopo e erros', () => {
    const v: any = A.parsePatchBody({ status: 'done', title: '  Novo  ', time: '08:00' });
    assert.ok(v.ok); assert.strictEqual(v.value.status, 'DONE'); assert.strictEqual(v.value.title, 'Novo'); assert.strictEqual(v.value.scope, 'this'); assert.strictEqual('date' in v.value, false);
    assert.strictEqual((A.parsePatchBody({ scope: 'future', force: true }) as any).value.scope, 'future'); assert.strictEqual((A.parsePatchBody({ force: true }) as any).value.force, true);
    for (const bad of [{ status: 'X' }, { date: '2026-02-31' }, { time: '9:00' }, { durationMin: 2 }, { weekdays: [9] }, { meetUrl: 'https://zoom.us/j/1' }, { title: 'x'.repeat(81) }]) assert.strictEqual((A.parsePatchBody(bad) as any).ok, false, JSON.stringify(bad));
    assert.strictEqual((A.parsePatchBody({ title: '' }) as any).value.title, null);   // limpar o título
  });
  await block('choque de horários: encostar não é choque; cancelado e lembrete não ocupam', () => {
    const e = (id: string, a: string, b: string, o: any = {}) => ({ id, kind: 'PRESENCIAL', status: 'SCHEDULED', startsAt: new Date(a), endsAt: new Date(b), ...o });
    const base = [e('a', '2026-10-12T10:00:00Z', '2026-10-12T11:00:00Z')];
    const t = (s: string, f: string) => A.findConflicts(base, new Date(s), new Date(f)).length;
    assert.strictEqual(t('2026-10-12T11:00:00Z', '2026-10-12T12:00:00Z'), 0);   // começa quando o outro termina
    assert.strictEqual(t('2026-10-12T09:00:00Z', '2026-10-12T10:00:00Z'), 0);   // termina quando o outro começa
    assert.strictEqual(t('2026-10-12T10:30:00Z', '2026-10-12T11:30:00Z'), 1); assert.strictEqual(t('2026-10-12T09:30:00Z', '2026-10-12T10:30:00Z'), 1);
    assert.strictEqual(t('2026-10-12T10:15:00Z', '2026-10-12T10:45:00Z'), 1); assert.strictEqual(t('2026-10-12T09:00:00Z', '2026-10-12T12:00:00Z'), 1);
    assert.strictEqual(A.findConflicts([e('c', '2026-10-12T10:00:00Z', '2026-10-12T11:00:00Z', { status: 'CANCELLED' })], new Date('2026-10-12T10:00:00Z'), new Date('2026-10-12T11:00:00Z')).length, 0);
    assert.strictEqual(A.findConflicts([e('l', '2026-10-12T10:00:00Z', '2026-10-12T11:00:00Z', { kind: 'LEMBRETE' })], new Date('2026-10-12T10:00:00Z'), new Date('2026-10-12T11:00:00Z')).length, 0);
    for (const st of ['DONE', 'MISSED', 'SCHEDULED']) assert.strictEqual(A.findConflicts([e('d', '2026-10-12T10:00:00Z', '2026-10-12T11:00:00Z', { status: st })], new Date('2026-10-12T10:30:00Z'), new Date('2026-10-12T11:30:00Z')).length, 1, st);
    assert.strictEqual(A.findConflicts(base, new Date('2026-10-12T10:00:00Z'), new Date('2026-10-12T11:00:00Z'), 'a').length, 0);   // ignora ele mesmo ao remarcar
  });
  await block('horário dos lembretes: coach a qualquer hora, aluno nunca de madrugada nem de noite', () => {
    const at = (iso: string) => new Date(iso);
    assert.strictEqual(A.coachReminderAt(at('2026-10-12T10:00:00Z'), 30).toISOString(), '2026-10-12T09:30:00.000Z');
    // aluno, atendimento 18:00 BRT (21:00Z), aviso 2h antes = 16:00 BRT: normal
    assert.strictEqual(A.studentReminderAt(at('2026-10-12T21:00:00Z'), 120).toISOString(), '2026-10-12T19:00:00.000Z');
    // atendimento 07:00 BRT: 2h antes = 05:00 (madrugada) -> 20:00 da véspera (23:00Z do dia 11)
    assert.strictEqual(A.studentReminderAt(at('2026-10-12T10:00:00Z'), 120).toISOString(), '2026-10-11T23:00:00.000Z');
    // 08:30 BRT: 2h antes = 06:30 (limite exato: pode)
    assert.strictEqual(A.studentReminderAt(at('2026-10-12T11:30:00Z'), 120).toISOString(), '2026-10-12T09:30:00.000Z');
    // 08:29 -> 06:29 (madrugada) -> véspera
    assert.strictEqual(A.studentReminderAt(at('2026-10-12T11:29:00Z'), 120).toISOString(), '2026-10-11T23:00:00.000Z');
    // atendimento 00:30 BRT: 2h antes = 22:30 da véspera (noite) -> 20:00 da véspera
    assert.strictEqual(A.studentReminderAt(at('2026-10-12T03:30:00Z'), 120).toISOString(), '2026-10-11T23:00:00.000Z');
    assert.strictEqual(A.isQuietNow(at('2026-10-12T09:29:00Z')), true);    // 06:29
    assert.strictEqual(A.isQuietNow(at('2026-10-12T09:30:00Z')), false);   // 06:30
    assert.strictEqual(A.isQuietNow(at('2026-10-13T00:59:00Z')), false);   // 21:59
    assert.strictEqual(A.isQuietNow(at('2026-10-13T01:00:00Z')), true);    // 22:00
    const now = at('2026-10-12T09:00:00Z');
    assert.match(A.coachReminderText({ kind: 'PRESENCIAL', startsAt: at('2026-10-12T09:30:00Z'), endsAt: at('2026-10-12T10:30:00Z'), location: 'Academia X' }, 'Samara', now).title, /Em 30 min: Samara/);
    assert.match(A.coachReminderText({ kind: 'VIDEO', startsAt: at('2026-10-12T09:00:30Z'), endsAt: at('2026-10-12T10:00:00Z') }, 'Samara', now).title, /Agora: Samara/);
    assert.strictEqual(A.coachReminderText({ kind: 'PRESENCIAL', startsAt: at('2026-10-12T09:30:00Z'), endsAt: at('2026-10-12T10:30:00Z'), location: 'Academia X' }, 'Samara', now).body, 'Atendimento presencial · 06:30 às 07:30 · Academia X');
    assert.match(A.studentReminderText({ kind: 'VIDEO', startsAt: at('2026-10-12T21:00:00Z') }, 'Paulo Adriano', now).title, /Videochamada hoje às 18:00/);
    assert.match(A.studentReminderText({ kind: 'PRESENCIAL', startsAt: at('2026-10-13T10:00:00Z') }, 'Paulo Adriano', now).title, /Atendimento amanhã às 07:00/);
    assert.match(A.studentReminderText({ kind: 'PRESENCIAL', startsAt: at('2026-10-13T10:00:00Z') }, null, now).body, /^Confirme/);
    assert.deepStrictEqual(A.summaryText({ events: [{ startsAt: at('2026-10-12T10:00:00Z'), kind: 'PRESENCIAL' }, { startsAt: at('2026-10-12T12:00:00Z'), kind: 'VIDEO' }], late: 1, today: 2 }), { title: '☀️ Seu dia na agenda', body: '2 compromissos (o primeiro às 07:00) · 3 pendências (1 atrasada)' });
    assert.strictEqual(A.summaryText({ events: [], late: 0, today: 1 }).body, 'Sem compromissos marcados · 1 pendência');
  });

  // ───────────── acesso ─────────────
  await block('acesso: sem token 401, aluno 403, outro coach 403, dono e master passam, sem coachId 400', async () => {
    const q = (as: string | null, c: string) => list(as, c, day(0), day(6));
    assert.strictEqual((await q(null, 'cA')).status, 401);
    assert.strictEqual((await q(tok('s1', 'USER', 'cA'), 'cA')).status, 403);
    assert.strictEqual((await q(tok('cB'), 'cA')).status, 403);
    assert.strictEqual((await q(tok('cA'), 'cA')).status, 200);
    assert.strictEqual((await q(tok(PAULO_ID, 'ADMIN'), 'cA')).status, 200);       // master vê a agenda de qualquer coach
    assert.strictEqual((await q(tok(ADRI_ID, 'ADMIN'), PAULO_ID)).status, 200);
    assert.strictEqual((await call(listGET, `/api/agenda?from=${day(0)}&to=${day(1)}`, tok('cA'))).status, 400);
    assert.strictEqual((await call(createPOST, '/api/agenda', null, body(mk(day(1), '07:00')))).status, 401);
    assert.strictEqual((await call(createPOST, '/api/agenda', tok('cB'), body(mk(day(1), '07:00')))).status, 403);       // coachId cA com token do cB
    assert.strictEqual((await call(createPOST, '/api/agenda', tok('s1', 'USER'), body({ ...mk(day(1), '07:00'), coachId: 's1' }))).status, 403);   // aluno nunca cria
    assert.strictEqual((await call(setGET, '/api/agenda/settings?coachId=cA', tok('cB'))).status, 403);
    assert.strictEqual((await call(hojeGET, '/api/agenda/hoje?coachId=cA', tok('cB'))).status, 403);
    assert.strictEqual((await call(meGET, '/api/agenda/me', null)).status, 401);
  });
  await block('janela do GET: datas inválidas, invertida e maior que 62 dias', async () => {
    const t = tok('cA');
    assert.strictEqual((await list(t, 'cA', 'x', day(1))).status, 400); assert.strictEqual((await list(t, 'cA', day(5), day(1))).status, 400);
    assert.strictEqual((await list(t, 'cA', day(0), day(62))).status, 400); assert.strictEqual((await list(t, 'cA', day(0), day(61))).status, 200);   // 62 dias exatos passa
  });

  // ───────────── criar ─────────────
  await block('criar compromisso avulso com aluno e com cadastro do financeiro', async () => {
    const a = await call(createPOST, '/api/agenda', tok('cA'), body(mk(day(1), '07:00', { location: 'Academia X', notes: 'joelho' })));
    assert.strictEqual(a.status, 201); const ev = a.json.event;
    assert.strictEqual(ev.startsAt, A.brtToUtc(day(1), '07:00').toISOString()); assert.strictEqual(ev.endsAt, A.brtToUtc(day(1), '08:00').toISOString());
    assert.strictEqual(ev.person.name, 'Samara Franco'); assert.strictEqual(ev.person.kind, 'student'); assert.strictEqual(ev.status, 'SCHEDULED'); assert.strictEqual(ev.seriesId, null);
    const b = await call(createPOST, '/api/agenda', tok('cA'), body({ coachId: 'cA', kind: 'PRESENCIAL', offlineClientId: 'o1', date: day(1), time: '09:00' }));
    assert.strictEqual(b.status, 201); assert.strictEqual(b.json.event.person.kind, 'offline'); assert.strictEqual(b.json.event.person.name, 'Didio Silva'); assert.strictEqual(b.json.event.person.phone, '5541988880001');
    const l = await list(tok('cA'), 'cA', day(1), day(1)); assert.strictEqual(l.json.events.length, 2); assert.strictEqual(l.json.events[0].notes, 'joelho');   // o coach vê a anotação
  });
  await block('criar: a pessoa precisa ser do coach (aluno e cadastro de outro coach dão 403); master atende os dele e os sem dono', async () => {
    assert.strictEqual((await call(createPOST, '/api/agenda', tok('cA'), body(mk(day(1), '07:00', { studentId: 's2' })))).status, 403);
    assert.strictEqual((await call(createPOST, '/api/agenda', tok('cA'), body({ coachId: 'cA', date: day(1), time: '07:00', offlineClientId: 'o2' }))).status, 403);
    assert.strictEqual((await call(createPOST, '/api/agenda', tok('cA'), body(mk(day(1), '07:00', { studentId: 'sm' })))).status, 403);   // aluno do master
    assert.strictEqual((await call(createPOST, '/api/agenda', tok('cA'), body(mk(day(1), '07:00', { studentId: 'cB' })))).status, 403);   // um coach não é aluno
    assert.strictEqual((await call(createPOST, '/api/agenda', tok('cA'), body(mk(day(1), '07:00', { studentId: 'nao-existe' })))).status, 403);
    assert.strictEqual((await call(createPOST, '/api/agenda', tok('cA'), body(mk(day(1), '07:00', { studentId: 'sn' })))).status, 201);     // aluno da nutri (nutritionistId = cA)
    assert.strictEqual((await call(createPOST, '/api/agenda', tok(PAULO_ID, 'ADMIN'), body({ coachId: PAULO_ID, date: day(1), time: '07:00', studentId: 'sm' }))).status, 201);
    assert.strictEqual((await call(createPOST, '/api/agenda', tok(PAULO_ID, 'ADMIN'), body({ coachId: PAULO_ID, date: day(1), time: '09:00', offlineClientId: 'om' }))).status, 201);
    assert.strictEqual((await call(createPOST, '/api/agenda', tok(PAULO_ID, 'ADMIN'), body({ coachId: PAULO_ID, date: day(1), time: '11:00', studentId: 's1' }))).status, 403);   // aluno de coach parceiro
  });
  await block('choque de horário: 409 com a lista dos que atrapalham; force cria mesmo assim', async () => {
    const t = tok('cA');
    assert.strictEqual((await call(createPOST, '/api/agenda', t, body(mk(day(1), '07:00')))).status, 201);
    const c = await call(createPOST, '/api/agenda', t, body(mk(day(1), '07:30', { studentId: null, offlineClientId: 'o1' })));
    assert.strictEqual(c.status, 409); assert.strictEqual(c.json.conflicts.length, 1); assert.strictEqual(c.json.conflicts[0].personName, 'Samara Franco'); assert.strictEqual(c.json.conflicts[0].kind, 'PRESENCIAL');
    assert.strictEqual(S.agendaEvent.length, 1);   // o 409 não criou nada
    assert.strictEqual((await call(createPOST, '/api/agenda', t, body({ ...mk(day(1), '07:30', { studentId: null, offlineClientId: 'o1' }), force: true }))).status, 201);
    const dois = await call(createPOST, '/api/agenda', t, body(mk(day(1), '07:15', { studentId: null, title: 'Visita', durationMin: 120 })));
    assert.strictEqual(dois.status, 409); assert.strictEqual(dois.json.conflicts.length, 2);   // pega os dois de uma vez
  });
  await block('choque: encostar passa (08:00 depois de 07:00-08:00); lembrete nunca choca; bloqueio choca', async () => {
    const t = tok('cA');
    await call(createPOST, '/api/agenda', t, body(mk(day(1), '07:00')));
    assert.strictEqual((await call(createPOST, '/api/agenda', t, body(mk(day(1), '08:00', { studentId: null, offlineClientId: 'o1' })))).status, 201);
    assert.strictEqual((await call(createPOST, '/api/agenda', t, body({ coachId: 'cA', kind: 'LEMBRETE', title: 'Ligar', date: day(1), time: '07:15' }))).status, 201);
    assert.strictEqual((await call(createPOST, '/api/agenda', t, body({ coachId: 'cA', kind: 'BLOQUEIO', date: day(1), time: '07:30', durationMin: 60 }))).status, 409);
    assert.strictEqual((await call(createPOST, '/api/agenda', t, body({ coachId: 'cA', kind: 'BLOQUEIO', date: day(2), time: '07:30', durationMin: 60 }))).status, 201);
    const other = await call(createPOST, '/api/agenda', tok('cB'), body({ coachId: 'cB', kind: 'PRESENCIAL', studentId: 's2', date: day(1), time: '07:00' }));
    assert.strictEqual(other.status, 201);   // a agenda de outro coach não conta
  });
  await block('série semanal: cria 8 semanas, o GET completa o resto sem duplicar, e cancelado/remarcado não voltam', async () => {
    const t = tok('cA');
    const r = await call(createPOST, '/api/agenda', t, body(mk(MON, '07:00', { repeatWeekly: true, weekdays: [1, 3, 5] })));
    assert.strictEqual(r.status, 201); assert.strictEqual(r.json.created, 24);   // 8 semanas x 3 dias
    assert.strictEqual(S.agendaEvent.length, 24); assert.strictEqual(S.agendaSeries.length, 1);
    assert.deepStrictEqual(S.agendaSeries[0].weekdays, [1, 3, 5]);
    // abrir uma janela mais adiante materializa o que falta (semanas 9 e 10)
    const far = await list(t, 'cA', A.addDaysKey(MON, 56), A.addDaysKey(MON, 69));
    assert.strictEqual(far.json.events.length, 6); assert.strictEqual(S.agendaEvent.length, 30);
    await list(t, 'cA', A.addDaysKey(MON, 56), A.addDaysKey(MON, 69)); assert.strictEqual(S.agendaEvent.length, 30);   // idempotente
    // cancelar um dia e mover outro: a série não recria nenhum dos dois
    const evs = S.agendaEvent.slice().sort((a: any, b: any) => +a.startsAt - +b.startsAt);
    await call(evDELETE, `/api/agenda/${evs[1].id}`, t, { method: 'DELETE' }, { params: { id: evs[1].id } });
    await call(evPATCH, `/api/agenda/${evs[2].id}`, t, { method: 'PATCH', body: JSON.stringify({ date: A.addDaysKey(MON, 3), time: '10:00' }) }, { params: { id: evs[2].id } });
    await list(t, 'cA', MON, A.addDaysKey(MON, 6)); assert.strictEqual(S.agendaEvent.length, 30);
    const w = (await list(t, 'cA', MON, A.addDaysKey(MON, 6))).json.events;
    assert.strictEqual(w.filter((e: any) => e.status !== 'CANCELLED').length, 2);   // seg ok, qua cancelada, sex movida para o sábado... (conta os não cancelados)
  });
  await block('série: choque em algum dia dá 409 sem criar nada; fim da série e dias fora do período', async () => {
    const t = tok('cA');
    await call(createPOST, '/api/agenda', t, body({ coachId: 'cA', kind: 'BLOQUEIO', date: A.addDaysKey(MON, 9), time: '07:00', durationMin: 60 }));   // uma quarta da semana 2
    const c = await call(createPOST, '/api/agenda', t, body(mk(MON, '07:00', { repeatWeekly: true, weekdays: [3] })));
    assert.strictEqual(c.status, 409); assert.strictEqual(S.agendaSeries.length, 0); assert.strictEqual(S.agendaEvent.length, 1);
    const f = await call(createPOST, '/api/agenda', t, body({ ...mk(MON, '07:00', { repeatWeekly: true, weekdays: [3] }), force: true })); assert.strictEqual(f.status, 201);
    const fim = await call(createPOST, '/api/agenda', t, body(mk(MON, '12:00', { repeatWeekly: true, weekdays: [1], endDate: A.addDaysKey(MON, 14) })));
    assert.strictEqual(fim.json.created, 3);   // 3 segundas: dia 0, 7 e 14
    const nada = await call(createPOST, '/api/agenda', t, body(mk(MON, '18:00', { repeatWeekly: true, weekdays: [2], endDate: MON })));   // terça fora do período (só existe a segunda)
    assert.strictEqual(nada.status, 400);
  });

  // ───────────── editar / presença / apagar ─────────────
  await block('presença: marcar feito, faltou, voltar a marcado; lembretes e resposta do aluno zeram só quando o horário muda', async () => {
    const t = tok('cA');
    const ev = (await call(createPOST, '/api/agenda', t, body(mk(day(1), '07:00')))).json.event;
    const patch = (b: any, id = ev.id) => call(evPATCH, `/api/agenda/${id}`, t, { method: 'PATCH', body: JSON.stringify(b) }, { params: { id } });
    let r = await patch({ status: 'DONE' }); assert.strictEqual(r.json.event.status, 'DONE'); assert.ok(r.json.event.statusAt);
    r = await patch({ status: 'MISSED' }); assert.strictEqual(r.json.event.status, 'MISSED');
    r = await patch({ status: 'SCHEDULED' }); assert.strictEqual(r.json.event.status, 'SCHEDULED'); assert.strictEqual(r.json.event.statusAt, null);
    const row = S.agendaEvent[0]; row.coachRemindedAt = new Date(); row.studentRemindedAt = new Date(); row.studentResponse = 'CONFIRMED';
    await patch({ notes: 'só anotação' }); assert.strictEqual(S.agendaEvent[0].studentResponse, 'CONFIRMED'); assert.ok(S.agendaEvent[0].coachRemindedAt);
    r = await patch({ time: '09:00' });
    assert.strictEqual(r.json.event.startsAt, A.brtToUtc(day(1), '09:00').toISOString()); assert.strictEqual(r.json.event.endsAt, A.brtToUtc(day(1), '10:00').toISOString());   // mantém a duração
    assert.strictEqual(S.agendaEvent[0].coachRemindedAt, null); assert.strictEqual(S.agendaEvent[0].studentRemindedAt, null); assert.strictEqual(S.agendaEvent[0].studentResponse, null);
    r = await patch({ durationMin: 30 }); assert.strictEqual(r.json.event.endsAt, A.brtToUtc(day(1), '09:30').toISOString());
    r = await patch({ date: day(2) }); assert.strictEqual(r.json.event.startsAt, A.brtToUtc(day(2), '09:00').toISOString());
    assert.strictEqual((await patch({ status: 'XX' })).status, 400);
    assert.strictEqual((await patch({ meetUrl: 'https://meet.google.com/abc-defg-hij' })).status, 400);   // presencial não tem link
    assert.strictEqual((await call(evPATCH, '/api/agenda/nao-existe', t, { method: 'PATCH', body: '{}' }, { params: { id: 'nao-existe' } })).status, 404);
    assert.strictEqual((await call(evPATCH, `/api/agenda/${ev.id}`, tok('cB'), { method: 'PATCH', body: JSON.stringify({ status: 'DONE' }) }, { params: { id: ev.id } })).status, 403);
    assert.strictEqual((await call(evPATCH, `/api/agenda/${ev.id}`, tok(PAULO_ID, 'ADMIN'), { method: 'PATCH', body: JSON.stringify({ status: 'DONE' }) }, { params: { id: ev.id } })).status, 200);
  });
  await block('remarcar para horário ocupado: 409; force passa; remarcar dia de série mantém o slot', async () => {
    const t = tok('cA');
    const a = (await call(createPOST, '/api/agenda', t, body(mk(day(1), '07:00')))).json.event;
    const b = (await call(createPOST, '/api/agenda', t, body(mk(day(1), '09:00', { studentId: null, offlineClientId: 'o1' })))).json.event;
    const patch = (id: string, o: any) => call(evPATCH, `/api/agenda/${id}`, t, { method: 'PATCH', body: JSON.stringify(o) }, { params: { id } });
    const c = await patch(b.id, { time: '07:30' }); assert.strictEqual(c.status, 409); assert.strictEqual(c.json.conflicts[0].id, a.id);
    assert.strictEqual((await patch(b.id, { time: '08:00' })).status, 200);                      // encosta
    assert.strictEqual((await patch(b.id, { time: '07:30', force: true })).status, 200);
    assert.strictEqual((await patch(b.id, { title: 'só o título' })).status, 200);                // não reclama do choque que já existe
    const s = await call(createPOST, '/api/agenda', t, body(mk(MON, '15:00', { repeatWeekly: true, weekdays: [1] })));
    const occ = S.agendaEvent.filter((e: any) => e.seriesId)[0]; const slot = +occ.slotAt;
    await patch(occ.id, { time: '16:00' });
    const after = S.agendaEvent.find((e: any) => e.id === occ.id); assert.strictEqual(+after.slotAt, slot); assert.notStrictEqual(+after.startsAt, slot);
  });
  await block('este e os próximos: a série se divide no dia (a antiga guarda o passado); feito/cancelado não voltam nem duplicam', async () => {
    const t = tok('cA');
    await call(createPOST, '/api/agenda', t, body(mk(MON, '07:00', { repeatWeekly: true, weekdays: [1] })));
    const evs = S.agendaEvent.slice().sort((a: any, b: any) => +a.startsAt - +b.startsAt);
    const patch = (id: string, o: any) => call(evPATCH, `/api/agenda/${id}`, t, { method: 'PATCH', body: JSON.stringify(o) }, { params: { id } });
    await patch(evs[1].id, { status: 'DONE' }); await patch(evs[3].id, { status: 'CANCELLED' });
    const oldId = S.agendaSeries[0].id;
    const r = await patch(evs[2].id, { scope: 'future', time: '18:00', durationMin: 45 });
    assert.strictEqual(r.status, 200); assert.strictEqual(S.agendaSeries.length, 2);
    const oldS = S.agendaSeries.find((x: any) => x.id === oldId), newS = S.agendaSeries.find((x: any) => x.id !== oldId);
    assert.strictEqual(oldS.startTime, '07:00'); assert.strictEqual(oldS.endDate, A.addDaysKey(MON, 13)); assert.strictEqual(oldS.active, true);
    assert.strictEqual(newS.startTime, '18:00'); assert.strictEqual(newS.durationMin, 45); assert.strictEqual(newS.startDate, A.addDaysKey(MON, 14)); assert.strictEqual(newS.endDate, null);
    const get = (id: string) => S.agendaEvent.find((e: any) => e.id === id);
    assert.strictEqual(A.timeKeyBrt(new Date(get(evs[0].id).startsAt)), '07:00'); assert.strictEqual(get(evs[1].id).status, 'DONE'); assert.strictEqual(A.timeKeyBrt(new Date(get(evs[1].id).startsAt)), '07:00');
    assert.strictEqual(get(evs[2].id), undefined);   // o dia editado foi refeito na série nova
    assert.strictEqual(get(evs[3].id).status, 'CANCELLED');   // o cancelado continua cancelado...
    assert.strictEqual(get(evs[3].id).seriesId, newS.id);     // ...agora preso à série nova, no horário novo (a série não o recria)
    const future = S.agendaEvent.filter((e: any) => e.seriesId === newS.id && e.status === 'SCHEDULED');
    assert.ok(future.length >= 6); assert.ok(future.every((e: any) => A.timeKeyBrt(new Date(e.startsAt)) === '18:00' && (+e.endsAt - +e.startsAt) === 45 * MIN));
    assert.strictEqual(S.agendaEvent.filter((e: any) => A.dateKeyBrt(new Date(e.startsAt)) === A.addDaysKey(MON, 21)).length, 1);   // sem segundo evento no dia cancelado
    assert.strictEqual(r.json.event.id, future.sort((a: any, b: any) => +a.startsAt - +b.startsAt)[0].id);
    // reabrir a agenda (janelas passada e futura) nunca duplica nem mexe no histórico
    const n = S.agendaEvent.length; await list(t, 'cA', MON, A.addDaysKey(MON, 60)); await list(t, 'cA', MON, A.addDaysKey(MON, 6)); assert.strictEqual(S.agendaEvent.length, n);
    assert.strictEqual(S.agendaEvent.filter((e: any) => A.dateKeyBrt(new Date(e.startsAt)) === MON).length, 1);
    // mudar o dia da semana também: o cancelado de outro dia fica na série antiga
    await patch(S.agendaEvent.find((e: any) => e.seriesId === newS.id && e.status === 'SCHEDULED').id, { scope: 'future', weekdays: [2] });
    assert.ok(S.agendaEvent.filter((e: any) => e.status === 'SCHEDULED').every((e: any) => A.weekdayOfKey(A.dateKeyBrt(new Date(e.startsAt))) === 1 || A.weekdayOfKey(A.dateKeyBrt(new Date(e.startsAt))) === 2));
  });
  await block('este e os próximos: choque com outro compromisso dá 409 e não mexe em nada; o próprio dia da série não conta', async () => {
    const t = tok('cA');
    await call(createPOST, '/api/agenda', t, body(mk(MON, '07:00', { repeatWeekly: true, weekdays: [1] })));
    const evs = S.agendaEvent.slice().sort((a: any, b: any) => +a.startsAt - +b.startsAt);
    await call(createPOST, '/api/agenda', t, body({ coachId: 'cA', kind: 'BLOQUEIO', date: A.addDaysKey(MON, 14), time: '18:00', durationMin: 60 }));
    const before = JSON.stringify(S.agendaEvent.map((e: any) => [e.id, e.startsAt]));
    const r = await call(evPATCH, `/api/agenda/${evs[0].id}`, t, { method: 'PATCH', body: JSON.stringify({ scope: 'future', time: '18:00' }) }, { params: { id: evs[0].id } });
    assert.strictEqual(r.status, 409); assert.strictEqual(S.agendaSeries[0].startTime, '07:00');
    assert.strictEqual(JSON.stringify(S.agendaEvent.filter((e: any) => e.seriesId).map((e: any) => [e.id, e.startsAt])), JSON.stringify(JSON.parse(before).filter((x: any) => S.agendaEvent.find((e: any) => e.id === x[0] && e.seriesId))));
    const ok = await call(evPATCH, `/api/agenda/${evs[0].id}`, t, { method: 'PATCH', body: JSON.stringify({ scope: 'future', time: '07:30' }) }, { params: { id: evs[0].id } });
    assert.strictEqual(ok.status, 200);   // 07:30 passa por cima do 07:00 da própria série
  });
  await block('apagar: avulso some; dia de série vira cancelado; "e os próximos" encerra a série', async () => {
    const t = tok('cA');
    const solo = (await call(createPOST, '/api/agenda', t, body(mk(day(1), '07:00')))).json.event;
    const del = (id: string, q = '') => call(evDELETE, `/api/agenda/${id}${q}`, t, { method: 'DELETE' }, { params: { id } });
    assert.strictEqual((await del(solo.id)).status, 200); assert.strictEqual(S.agendaEvent.length, 0);
    await call(createPOST, '/api/agenda', t, body(mk(MON, '07:00', { repeatWeekly: true, weekdays: [1] })));
    const evs = S.agendaEvent.slice().sort((a: any, b: any) => +a.startsAt - +b.startsAt);
    const r1 = await del(evs[1].id); assert.strictEqual(r1.json.cancelled, true);
    assert.strictEqual(S.agendaEvent.find((e: any) => e.id === evs[1].id).status, 'CANCELLED');
    const r2 = await del(evs[3].id, '?scope=future'); assert.ok(r2.json.deleted >= 4);
    assert.strictEqual(S.agendaSeries[0].endDate, A.addDaysKey(A.dateKeyBrt(new Date(evs[3].slotAt)), -1));
    assert.strictEqual(S.agendaEvent.filter((e: any) => +e.slotAt >= +evs[3].slotAt).length, 0);
    assert.ok(S.agendaEvent.some((e: any) => e.id === evs[0].id) && S.agendaEvent.some((e: any) => e.id === evs[2].id));
    await list(t, 'cA', MON, A.addDaysKey(MON, 60)); assert.strictEqual(S.agendaEvent.filter((e: any) => +e.slotAt >= +evs[3].slotAt).length, 0);   // não volta
    // encerrar a série a partir do 1º dia a desativa
    const first = S.agendaEvent.slice().sort((a: any, b: any) => +a.startsAt - +b.startsAt)[0];
    await del(first.id, '?scope=future'); assert.strictEqual(S.agendaSeries[0].active, false);
    assert.strictEqual((await del('nao-existe')).status, 404);
    const e2 = (await call(createPOST, '/api/agenda', t, body(mk(day(2), '07:00')))).json.event;
    assert.strictEqual((await call(evDELETE, `/api/agenda/${e2.id}`, tok('cB'), { method: 'DELETE' }, { params: { id: e2.id } })).status, 403);
  });
  await block('videochamada: link do Meet normalizado e só em videochamada', async () => {
    const t = tok('cA');
    const v = await call(createPOST, '/api/agenda', t, body(mk(day(1), '19:00', { kind: 'VIDEO', meetUrl: 'meet.google.com/abc-defg-hij' })));
    assert.strictEqual(v.status, 201); assert.strictEqual(v.json.event.meetUrl, 'https://meet.google.com/abc-defg-hij'); assert.strictEqual(v.json.event.meetProvider, 'MEET');
    assert.strictEqual((await call(createPOST, '/api/agenda', t, body(mk(day(1), '20:00', { kind: 'VIDEO', meetUrl: 'https://zoom.us/j/9' })))).status, 400);
    const sem = await call(createPOST, '/api/agenda', t, body(mk(day(1), '20:00', { kind: 'VIDEO' }))); assert.strictEqual(sem.json.event.meetUrl, null);   // sem link próprio: usa o do coach nos ajustes
    const p = await call(createPOST, '/api/agenda', t, body(mk(day(1), '21:00'))); assert.strictEqual(p.json.event.meetProvider, null);
    const up = await call(evPATCH, `/api/agenda/${v.json.event.id}`, t, { method: 'PATCH', body: JSON.stringify({ meetUrl: 'meet.google.com/zzz-yyyy-xxx' }) }, { params: { id: v.json.event.id } });
    assert.strictEqual(up.json.event.meetUrl, 'https://meet.google.com/zzz-yyyy-xxx');
  });

  // ───────────── ajustes ─────────────
  await block('ajustes: padrões, salvar, validar', async () => {
    const t = tok('cA'); const put = (o: any, as = t) => call(setPUT, '/api/agenda/settings', as, { method: 'PUT', body: JSON.stringify({ coachId: 'cA', ...o }) });
    const g = await call(setGET, '/api/agenda/settings?coachId=cA', t); assert.strictEqual(g.json.settings.remindCoachMin, 30); assert.strictEqual(g.json.settings.remindStudentMin, 120); assert.strictEqual(g.json.settings.summaryHour, 7); assert.strictEqual(g.json.settings.meetUrl, null);
    const r = await put({ meetUrl: 'meet.google.com/abc-defg-hij', remindCoachMin: 15, summaryHour: 8, workStart: '05:00', workEnd: '22:00', dailySummary: false });
    assert.strictEqual(r.status, 200); assert.strictEqual(r.json.settings.meetUrl, 'https://meet.google.com/abc-defg-hij'); assert.strictEqual(r.json.settings.remindCoachMin, 15); assert.strictEqual(r.json.settings.dailySummary, false);
    const g2 = await call(setGET, '/api/agenda/settings?coachId=cA', t); assert.strictEqual(g2.json.settings.summaryHour, 8); assert.strictEqual(g2.json.settings.remindStudentMin, 120);
    assert.strictEqual((await put({ meetUrl: 'https://zoom.us/j/1' })).status, 400); assert.strictEqual((await put({ summaryHour: 4 })).status, 400); assert.strictEqual((await put({ summaryHour: 12 })).status, 400);
    assert.strictEqual((await put({ remindCoachMin: -1 })).status, 400); assert.strictEqual((await put({ remindStudentMin: 3000 })).status, 400); assert.strictEqual((await put({ workStart: '8h' })).status, 400);
    assert.strictEqual((await put({ workStart: '10:00', workEnd: '09:00' })).status, 400); assert.strictEqual((await put({ workEnd: '04:00' })).status, 400);   // fim antes do início salvo (05:00)
    assert.strictEqual((await put({ dailySummary: 'sim' })).status, 400); assert.strictEqual((await put({ meetUrl: '' })).json.settings.meetUrl, null);
    assert.strictEqual((await put({ remindCoachMin: 10 }, tok('cB'))).status, 403);
    assert.strictEqual(S.agendaSettings.length, 1);   // um por coach
  });

  // ───────────── lado do aluno ─────────────
  await block('aluno: vê só os próprios atendimentos marcados, sem anotações; Meet do coach como reserva', async () => {
    const t = tok('cA'); const now = Date.now();
    await call(setPUT, '/api/agenda/settings', t, { method: 'PUT', body: JSON.stringify({ coachId: 'cA', meetUrl: 'meet.google.com/aaa-bbbb-ccc' }) });
    await call(createPOST, '/api/agenda', t, body(mk(day(1), '07:00', { notes: 'SEGREDO DO COACH', location: 'Academia X', title: 'Perna' })));
    await call(createPOST, '/api/agenda', t, body(mk(day(2), '19:00', { kind: 'VIDEO' })));
    await call(createPOST, '/api/agenda', t, body(mk(day(3), '19:00', { kind: 'VIDEO', meetUrl: 'meet.google.com/ddd-eeee-fff' })));
    await call(createPOST, '/api/agenda', t, body(mk(day(4), '19:00', { kind: 'BLOCO', studentId: null, title: 'Bloco' })));
    await call(createPOST, '/api/agenda', t, body(mk(day(5), '07:00')));
    const cancel = (await call(createPOST, '/api/agenda', t, body(mk(day(6), '07:00')))).json.event; await call(evPATCH, `/api/agenda/${cancel.id}`, t, { method: 'PATCH', body: JSON.stringify({ status: 'CANCELLED' }) }, { params: { id: cancel.id } });
    await call(createPOST, '/api/agenda', t, body(mk(day(40), '07:00')));   // longe demais
    addEvent({ startsAt: new Date(now + 2 * DAY), studentId: 's2' });        // de outro aluno
    const r = await call(meGET, '/api/agenda/me', tok('s1', 'USER', 'cA'));
    assert.strictEqual(r.status, 200); const ev = r.json.events;
    assert.strictEqual(ev.length, 4);   // presencial, 2 vídeos, o do dia 5 (bloco, cancelado, longe e do outro aluno ficam de fora)
    assert.ok(ev.every((e: any) => !('notes' in e) && !('coachId' in e) && !('status' in e)));
    assert.strictEqual(ev[0].location, 'Academia X'); assert.strictEqual(ev[0].title, 'Perna'); assert.strictEqual(ev[0].coachName, 'Coach A'); assert.strictEqual(ev[0].meetUrl, null);
    assert.strictEqual(ev[1].meetUrl, 'https://meet.google.com/aaa-bbbb-ccc');   // sem link próprio: o do coach
    assert.strictEqual(ev[2].meetUrl, 'https://meet.google.com/ddd-eeee-fff');   // o próprio do compromisso vence
    assert.ok(JSON.stringify(r.json).indexOf('SEGREDO') < 0);
    const none = await call(meGET, '/api/agenda/me', tok('sn', 'USER', 'cA')); assert.deepStrictEqual(none.json.events, []);
  });
  await block('aluno responde: confirma ou pede remarcar, o coach recebe push; não pode responder o dos outros nem o que já passou', async () => {
    const t = tok('cA'); const sA = tok('s1', 'USER', 'cA');
    const ev = (await call(createPOST, '/api/agenda', t, body(mk(day(2), '07:00')))).json.event;
    const respond = (id: string, as: string | null, b: any) => call(meRespond, `/api/agenda/me/${id}`, as, body(b), { params: { id } });
    assert.strictEqual((await respond(ev.id, null, { response: 'CONFIRMED' })).status, 401);
    assert.strictEqual((await respond(ev.id, tok('s2', 'USER', 'cB'), { response: 'CONFIRMED' })).status, 404);
    assert.strictEqual((await respond(ev.id, sA, { response: 'TALVEZ' })).status, 400);
    clearPushes(); const ok = await respond(ev.id, sA, { response: 'CONFIRMED' });
    assert.strictEqual(ok.status, 200); assert.strictEqual(S.agendaEvent[0].studentResponse, 'CONFIRMED'); assert.ok(S.agendaEvent[0].studentRespondedAt);
    assert.strictEqual(pushes().length, 1); assert.strictEqual(pushes()[0].to, 'cA'); assert.match(pushes()[0].title, /Samara confirmou presença/); assert.strictEqual(pushes()[0].data.type, 'agenda_response');
    clearPushes(); await respond(ev.id, sA, { response: 'RESCHEDULE' }); assert.strictEqual(S.agendaEvent[0].studentResponse, 'RESCHEDULE'); assert.match(pushes()[0].title, /Samara pediu para remarcar/);
    const past = addEvent({ studentId: 's1', startsAt: new Date(Date.now() - 2 * H), endsAt: new Date(Date.now() - H) });
    assert.strictEqual((await respond(past.id, sA, { response: 'CONFIRMED' })).status, 409);
    const done = addEvent({ studentId: 's1', startsAt: new Date(Date.now() + 5 * H), status: 'DONE' }); assert.strictEqual((await respond(done.id, sA, { response: 'CONFIRMED' })).status, 409);
    const bloco = addEvent({ studentId: 's1', kind: 'BLOCO', startsAt: new Date(Date.now() + 5 * H) }); assert.strictEqual((await respond(bloco.id, sA, { response: 'CONFIRMED' })).status, 404);
    S.agendaEvent[0].status = 'SCHEDULED';
    (globalThis as any).__pushFail = true; clearPushes();
    const still = await respond(ev.id, sA, { response: 'CONFIRMED' }); assert.strictEqual(still.status, 200);   // push fora do ar não derruba a resposta
    (globalThis as any).__pushFail = false;
  });
  await block('tabelas ainda não criadas: coach recebe 503; aluno recebe lista vazia', async () => {
    S.failOn.agendaEvent = { code: 'P2021', message: 'The table `public.AgendaEvent` does not exist' };
    S.failOn.agendaSettings = { code: 'P2021', message: 'The table `public.AgendaSettings` does not exist' };
    const a = await list(tok('cA'), 'cA', day(0), day(6)); assert.strictEqual(a.status, 503); assert.strictEqual(a.json.unavailable, true);
    assert.strictEqual((await call(createPOST, '/api/agenda', tok('cA'), body(mk(day(1), '07:00')))).status, 503);
    assert.strictEqual((await call(setGET, '/api/agenda/settings?coachId=cA', tok('cA'))).status, 503);
    const m = await call(meGET, '/api/agenda/me', tok('s1', 'USER', 'cA')); assert.strictEqual(m.status, 200); assert.deepStrictEqual(m.json.events, []);
    S.failOn = { agendaEvent: { code: 'XX', message: 'boom' } };
    assert.strictEqual((await list(tok('cA'), 'cA', day(0), day(6))).status, 500);   // outro erro continua sendo 500
  });

  // ───────────── central HOJE ─────────────
  const hoje = async (id = 'cA', as = tok(id)) => (await call(hojeGET, `/api/agenda/hoje?coachId=${id}`, as)).json;
  const keys = (h: any) => h.tasks.map((t: any) => t.key.split(':')[0]);
  await block('HOJE: agenda do dia, presença por marcar (ontem = atrasada), pedido de remarcar', async () => {
    const now = Date.now();
    const hojeEv = (await call(createPOST, '/api/agenda', tok('cA'), body(mk(TODAY, '23:00', { durationMin: 30 })))).json.event;
    addEvent({ studentId: 's1', startsAt: new Date(now - 3 * H), endsAt: new Date(now - 2 * H) });                    // acabou há 2h: marcar presença
    addEvent({ studentId: 's1', startsAt: new Date(now - 3 * DAY), endsAt: new Date(now - 3 * DAY + H) });             // 3 dias atrás: atrasada
    addEvent({ studentId: 's1', startsAt: new Date(now - 4 * DAY), endsAt: new Date(now - 4 * DAY + H), status: 'DONE' });   // já marcado: não aparece
    addEvent({ studentId: 's1', startsAt: new Date(now - 20 * DAY), endsAt: new Date(now - 20 * DAY + H) });           // velho demais (>7 dias): fora
    addEvent({ kind: 'BLOCO', title: 'Treinos', startsAt: new Date(now - 3 * H), endsAt: new Date(now - 2 * H) });     // bloco não tem presença
    addEvent({ offlineClientId: 'o1', startsAt: new Date(now + 3 * H), studentResponse: null });
    addEvent({ studentId: 's1', startsAt: new Date(now + 2 * DAY), studentResponse: 'RESCHEDULE' });
    addEvent({ studentId: 's1', startsAt: new Date(now + 3 * DAY), studentResponse: 'CONFIRMED' });
    addEvent({ studentId: 's2', coachId: 'cB', startsAt: new Date(now - 3 * H), endsAt: new Date(now - 2 * H) });     // de outro coach
    const h = await hoje();
    const pres = h.tasks.filter((t: any) => t.type === 'presenca'); assert.strictEqual(pres.length, 2);
    assert.deepStrictEqual(pres.map((t: any) => t.severity).sort(), ['late', 'today']);
    assert.strictEqual(h.tasks.filter((t: any) => t.type === 'remarcar').length, 1);
    assert.ok(h.tasks.find((t: any) => t.type === 'presenca').title.startsWith('Marcar presença: Samara Franco'));
    const pt = h.tasks.find((t: any) => t.type === 'presenca'); assert.strictEqual(pt.event.id, pt.target.id); assert.strictEqual(pt.event.person.name, 'Samara Franco'); assert.strictEqual(pt.event.kind, 'PRESENCIAL');
    const rt = h.tasks.find((t: any) => t.type === 'remarcar'); assert.strictEqual(rt.event.id, rt.target.id); assert.strictEqual(rt.event.studentResponse, 'RESCHEDULE');
    assert.ok(h.agenda.some((e: any) => e.id === hojeEv.id) && h.agenda.every((e: any) => A.dateKeyBrt(new Date(e.startsAt)) === TODAY));
    assert.ok(h.agenda.every((e: any) => e.status !== 'CANCELLED')); assert.strictEqual(h.date, TODAY);
    assert.strictEqual(h.tasks[0].severity, 'late');   // o mais urgente primeiro
    assert.strictEqual(h.tasks.find((t: any) => t.type === 'presenca').person.name, 'Samara Franco');
  });
  await block('HOJE: feedback da semana, observações e avaliações viram uma linha cada, atrasadas depois de 48h', async () => {
    const now = Date.now();
    S.weeklyFeedback.push({ id: 'w1', userId: 's1', createdAt: new Date(now - 3 * DAY), coachSeenAt: null, coachReplyAt: null });
    S.weeklyFeedback.push({ id: 'w2', userId: 'sn', createdAt: new Date(now - 1 * H), coachSeenAt: null, coachReplyAt: null });
    S.weeklyFeedback.push({ id: 'w3', userId: 's1', createdAt: new Date(now - 1 * H), coachSeenAt: new Date(), coachReplyAt: null });    // já visto
    S.weeklyFeedback.push({ id: 'w4', userId: 's1', createdAt: new Date(now - 1 * H), coachSeenAt: null, coachReplyAt: new Date() });   // já respondido
    S.weeklyFeedback.push({ id: 'w5', userId: 's1', createdAt: new Date(now - 20 * DAY), coachSeenAt: null, coachReplyAt: null });      // velho demais
    S.weeklyFeedback.push({ id: 'w6', userId: 's2', createdAt: new Date(now - 1 * H), coachSeenAt: null, coachReplyAt: null });         // aluno de outro coach
    S.studentAlert.push({ id: 'a1', type: 'EXERCISE_NOTE', isRead: false, userId: 's1', createdAt: new Date(now - 1 * H) }, { id: 'a2', type: 'EXERCISE_NOTE', isRead: true, userId: 's1', createdAt: new Date() }, { id: 'a3', type: 'OUTRO', isRead: false, userId: 's1', createdAt: new Date() }, { id: 'a4', type: 'EXERCISE_NOTE', isRead: false, userId: 's2', createdAt: new Date() });
    S.checkIn.push({ id: 'c1', userId: 's1', coachFeedback: null, createdAt: new Date(now - 4 * DAY) }, { id: 'c2', userId: 's1', coachFeedback: 'ok', createdAt: new Date(now - 1 * DAY) }, { id: 'c3', userId: 's1', coachFeedback: null, createdAt: new Date(now - 60 * DAY) }, { id: 'c4', userId: 's2', coachFeedback: null, createdAt: new Date() });
    const h = await hoje();
    const w = h.tasks.find((t: any) => t.type === 'semanal'); assert.strictEqual(w.count, 2); assert.strictEqual(w.severity, 'late'); assert.strictEqual(w.key, 'semanal:w2');   // a chave é a do feedback mais novo: chegou outro, a pendência volta mesmo se tinha sido adiada
    assert.match(w.title, /2 feedbacks da semana aguardando você/); assert.match(w.subtitle, /Samara/); assert.strictEqual(w.target.type, 'weekly');
    const o = h.tasks.find((t: any) => t.type === 'obs'); assert.strictEqual(o.count, 1); assert.strictEqual(o.severity, 'today'); assert.match(o.title, /1 observação de exercício sem resposta/);
    const c = h.tasks.find((t: any) => t.type === 'avaliacao'); assert.strictEqual(c.count, 1); assert.strictEqual(c.severity, 'late'); assert.match(c.title, /1 avaliação sem retorno/);
    // o do outro coach nunca aparece
    assert.ok(!JSON.stringify(h).includes('Bia'));
  });
  await block('HOJE: treino vencendo/vencido, avaliação atrasada, aluno de teste e inativo fora', async () => {
    const now = Date.now();
    const wk = (userId: string, endDate: Date | null, o: any = {}) => S.workout.push({ id: 'wk' + S.nextId++, userId, endDate, archived: false, createdAt: new Date(now - 10 * DAY), ...o });
    wk('s1', new Date(now - 2 * DAY)); wk('sn', A.brtToUtc(day(2), '12:00')); wk('s1', new Date(now + 40 * DAY), { createdAt: new Date(now - 1 * DAY), archived: true });   // o arquivado não conta
    wk('sx', new Date(now - 2 * DAY));
    S.user.find((u: any) => u.id === 'sn').nextCheckInDate = new Date(now - 3 * DAY);
    S.user.find((u: any) => u.id === 's1').nextCheckInDate = new Date(now - 10 * DAY); S.user.find((u: any) => u.id === 's1').disableCheckIn = false;
    S.user.push({ id: 'sd', role: 'USER', name: 'Dora Desativada', coachId: 'cA', active: false, nextCheckInDate: new Date(now - 30 * DAY) });
    const h = await hoje();
    const tr = h.tasks.filter((t: any) => t.type === 'treino'); assert.strictEqual(tr.length, 2);
    assert.strictEqual(tr.find((t: any) => t.person.id === 's1').severity, 'late'); assert.match(tr.find((t: any) => t.person.id === 's1').title, /Treino vencido: Samara/);
    assert.strictEqual(tr.find((t: any) => t.person.id === 'sn').severity, 'soon'); assert.match(tr.find((t: any) => t.person.id === 'sn').title, /Treino vence em 2 dias: Nina/);
    const ck = h.tasks.filter((t: any) => t.type === 'checkin'); assert.strictEqual(ck.length, 2);
    assert.strictEqual(ck.find((t: any) => t.person.id === 's1').severity, 'late'); assert.strictEqual(ck.find((t: any) => t.person.id === 'sn').severity, 'today');
    assert.ok(!JSON.stringify(h).includes('Teste') && !JSON.stringify(h).includes('Dora'));
    S.user.find((u: any) => u.id === 'sn').disableCheckIn = true; assert.ok(!(await hoje()).tasks.some((t: any) => t.type === 'checkin' && t.person.id === 'sn'));
  });
  await block('HOJE: aluno congelado não gera pendência (feedback, avaliação, treino, cobrança); no dia da volta prevista (ou depois) aparece "Hora de descongelar"; sem data de volta ou volta no futuro, não', async () => {
    const now = Date.now(); const U = (id: string) => S.user.find((u: any) => u.id === id);
    Object.assign(U('s1'), { nextCheckInDate: new Date(now - 10 * DAY), disableCheckIn: false, contractValue: 250, paymentDueDate: new Date(now - 3 * DAY) });
    let h = await hoje(); assert.ok(h.tasks.some((t: any) => t.person && t.person.id === 's1' && t.type === 'checkin') && h.tasks.some((t: any) => t.person && t.person.id === 's1' && t.type === 'cobranca'), 'antes de congelar ela aparece');
    Object.assign(U('s1'), { frozenAt: new Date(now - 10 * DAY), frozenUntil: null, isFinanceActive: false });
    h = await hoje(); assert.ok(!h.tasks.some((t: any) => t.person && t.person.id === 's1' && ['checkin', 'cobranca', 'treino'].includes(t.type)), 'congelada: nada de avaliação, cobrança nem treino vencido: ' + JSON.stringify(h.tasks.filter((t: any) => t.person && t.person.id === 's1').map((t: any) => t.type)));
    assert.ok(!h.tasks.some((t: any) => t.type === 'descongelar'), 'sem data de volta: nenhum aviso');
    U('s1').frozenUntil = new Date(now + 3 * DAY); h = await hoje(); assert.ok(!h.tasks.some((t: any) => t.type === 'descongelar'), 'volta no futuro: ainda não');
    U('s1').frozenUntil = new Date(now); h = await hoje(); let d = h.tasks.filter((t: any) => t.type === 'descongelar'); assert.strictEqual(d.length, 1); assert.strictEqual(d[0].severity, 'today'); assert.match(d[0].title, /Hora de descongelar: Samara/); assert.strictEqual(d[0].subtitle, 'a volta prevista é hoje'); assert.strictEqual(d[0].target.id, 's1');
    U('s1').frozenUntil = new Date(now - 5 * DAY); h = await hoje(); d = h.tasks.filter((t: any) => t.type === 'descongelar'); assert.strictEqual(d[0].severity, 'late'); assert.match(d[0].subtitle, /5 dias/);
    U('s1').frozenAt = null; U('s1').frozenUntil = null; h = await hoje(); assert.ok(!h.tasks.some((t: any) => t.type === 'descongelar') && h.tasks.some((t: any) => t.person && t.person.id === 's1' && t.type === 'checkin'), 'descongelou: volta ao normal');
  });
  await block('HOJE: cobrança (atrasada, hoje, em até 2 dias), "já paguei", sem valor/inativa/longe ficam fora; cadastros do financeiro entram', async () => {
    const now = Date.now(); const U = (id: string) => S.user.find((u: any) => u.id === id);
    Object.assign(U('s1'), { contractValue: 250, paymentDueDate: new Date(now - 3 * DAY) });
    Object.assign(U('sn'), { contractValue: 200, paymentDueDate: new Date(now + 1 * DAY) });
    S.user.push({ id: 'sp', role: 'USER', name: 'Paula Paguei', coachId: 'cA', active: true, isFinanceActive: true, contractValue: 300, paymentDueDate: new Date(now - 2 * DAY), paymentClaimStatus: 'PENDING' });
    S.user.push({ id: 'sz', role: 'USER', name: 'Zero Valor', coachId: 'cA', active: true, isFinanceActive: true, contractValue: 0, paymentDueDate: new Date(now - 2 * DAY) });
    S.user.push({ id: 'si', role: 'USER', name: 'Inativo Fin', coachId: 'cA', active: true, isFinanceActive: false, contractValue: 100, paymentDueDate: new Date(now - 2 * DAY) });
    S.user.push({ id: 'sl', role: 'USER', name: 'Longe Venc', coachId: 'cA', active: true, isFinanceActive: true, contractValue: 100, paymentDueDate: new Date(now + 5 * DAY) });
    Object.assign(S.offlineClient.find((o: any) => o.id === 'o1'), { paymentDueDate: new Date(now - 1 * DAY) });
    Object.assign(S.offlineClient.find((o: any) => o.id === 'o2'), { paymentDueDate: new Date(now - 9 * DAY) });   // de outro coach
    const h = await hoje(); const cb = h.tasks.filter((t: any) => t.type === 'cobranca');
    assert.deepStrictEqual(cb.map((t: any) => t.person.name).sort(), ['Didio Silva', 'Nina Nutri', 'Samara Franco']);
    const s1 = cb.find((t: any) => t.person.id === 's1'); assert.strictEqual(s1.severity, 'late'); assert.match(s1.title, /Cobrança atrasada: Samara/); assert.match(s1.subtitle, /venceu há 3 dias/); assert.match(s1.subtitle, /R\$\s?250,00/);
    assert.strictEqual(cb.find((t: any) => t.person.id === 'sn').severity, 'soon'); assert.match(cb.find((t: any) => t.person.id === 'sn').title, /vence em 1 dia: Nina/);
    const off = cb.find((t: any) => t.person.kind === 'offline'); assert.strictEqual(off.person.id, 'o1'); assert.strictEqual(off.person.phone, '5541988880001');
    const pg = h.tasks.filter((t: any) => t.type === 'paguei'); assert.strictEqual(pg.length, 1); assert.strictEqual(pg[0].person.name, 'Paula Paguei');
    assert.ok(!cb.some((t: any) => t.person.id === 'sp'));   // com "já paguei" pendente não duplica a cobrança
    // vence hoje
    Object.assign(U('sn'), { paymentDueDate: new Date(now) }); const t0 = (await hoje()).tasks.find((t: any) => t.type === 'cobranca' && t.person.id === 'sn'); assert.strictEqual(t0.severity, 'today'); assert.match(t0.title, /vence hoje: Nina/);
  });
  await block('HOJE: lista longa de um tipo vira as 8 mais urgentes + "+N"', async () => {
    const now = Date.now();
    for (let i = 0; i < 12; i++) S.user.push({ id: 'm' + i, role: 'USER', name: 'Aluno ' + i, coachId: 'cA', active: true, isFinanceActive: true, contractValue: 100, paymentDueDate: new Date(now - (i + 1) * DAY) });
    const h = await hoje(); const cb = h.tasks.filter((t: any) => t.type === 'cobranca'); assert.strictEqual(cb.length, HJ.MAX_PER_TYPE);
    const more = h.tasks.find((t: any) => t.type === 'cobranca_mais'); assert.ok(more); assert.strictEqual(more.count, 4); assert.strictEqual(more.title, '+ 4 cobranças em aberto no financeiro'); assert.strictEqual(more.severity, 'late');
    assert.ok(cb.some((t: any) => t.person.name === 'Aluno 11'));   // as mais atrasadas ficam
    assert.ok(!cb.some((t: any) => t.person.name === 'Aluno 0'));   // a menos atrasada foi para o "+N"
  });
  await block('HOJE: teste grátis — resultado pronto, link parado e terminando sem treino; só links de teste do coach', async () => {
    const now = Date.now(); const sh = (o: any) => S.workoutShare.push({ id: 'sh' + S.nextId++, code: 'C' + S.nextId, trial: true, createdById: 'cA', revokedAt: null, displayName: 'Rafael', viewCount: 0, doneCount: 0, createdAt: new Date(now - 3 * DAY), expiresAt: new Date(now + 4 * DAY), ...o });
    sh({ displayName: 'Rafael', viewCount: 3, doneCount: 3 });                                    // concluiu os 3
    sh({ displayName: 'Camila', viewCount: 2, doneCount: 1, expiresAt: new Date(now + 1 * DAY) }); // 1 treino e acaba amanhã
    sh({ displayName: 'Lucas', viewCount: 0, createdAt: new Date(now - 2 * DAY) });                // nunca abriu
    sh({ displayName: 'Nina', viewCount: 4, doneCount: 0, expiresAt: new Date(now + 1 * DAY) });   // abriu e não treinou, termina em breve
    sh({ displayName: 'Novo', viewCount: 0, createdAt: new Date(now - 2 * H) });                   // acabou de criar: ainda cedo
    sh({ displayName: 'Calmo', viewCount: 2, doneCount: 1 });                                      // 1 treino, sobram 4 dias: ainda cedo
    sh({ displayName: 'Revogado', viewCount: 0, revokedAt: new Date(), createdAt: new Date(now - 2 * DAY) });
    sh({ displayName: 'Normal', trial: false, viewCount: 0, createdAt: new Date(now - 2 * DAY) });   // link comum, não é teste
    sh({ displayName: 'Do Outro', createdById: 'cB', viewCount: 0, createdAt: new Date(now - 2 * DAY) });
    sh({ displayName: 'Velho', viewCount: 0, createdAt: new Date(now - 30 * DAY) });
    sh({ displayName: 'Vencido', viewCount: 0, createdAt: new Date(now - 2 * DAY), expiresAt: new Date(now - 1 * H) });
    const h = await hoje(); const by = (type: string) => h.tasks.filter((t: any) => t.type === type).map((t: any) => t.title);
    assert.deepStrictEqual(by('teste_resultado').sort(), ['Resultado do teste de Camila pronto', 'Resultado do teste de Rafael pronto']);
    assert.deepStrictEqual(by('teste_parado'), ['Teste de Lucas ainda não foi aberto']);
    assert.deepStrictEqual(by('teste_fim'), ['Teste de Nina termina em breve sem treino feito']);
    assert.ok(h.tasks.find((t: any) => t.type === 'teste_resultado').target.code);
  });
  await block('HOJE: corrida — montar protocolo (anamnese respondida, sem protocolo ativo) e escolher o próximo desafio (concluído); some sozinha', async () => {
    const now = Date.now();
    const an = (userId: string, ago: number, o: any = {}) => S.runningAnamnese.push({ id: 'an' + S.nextId++, userId, filled: true, filledAt: new Date(now - ago * DAY), ...o });
    const pr = (userId: string, o: any = {}) => S.runningProtocol.push({ id: 'pr' + S.nextId++, userId, isActive: true, protocolType: '5K', completedAt: null, ...o });
    an('s1', 0);                                  // hoje, do cA
    an('sn', 0); S.user.find((u: any) => u.id === 'sn').coachId = 'cA';   // outro aluno do cA, respondeu há 3 dias
    S.runningAnamnese.find((a: any) => a.userId === 'sn').filledAt = new Date(now - 3 * DAY);
    an('s2', 0);                                  // aluno do cB: não aparece para o cA
    S.user.push({ id: 's3', role: 'USER', active: true, isFinanceActive: true, isTestAccount: false, name: 'Tais Lima', coachId: 'cA', phone: null });
    S.user.push({ id: 's4', role: 'USER', active: true, isFinanceActive: true, isTestAccount: false, name: 'Ugo Reis', coachId: 'cA', phone: null });
    S.user.push({ id: 's5', role: 'USER', active: true, isFinanceActive: true, isTestAccount: false, name: 'Vera Dias', coachId: 'cA', phone: null });
    an('s3', 0, { filled: false });               // link enviado e ainda não respondido: não é pendência
    an('s4', 1); an('s5', 2);                     // ontem (ainda "hoje" de urgência) e há 2 dias (já atrasada)
    let h = await hoje(); const by = (type: string) => h.tasks.filter((t: any) => t.type === type);
    const mont = by('corrida_montar');
    assert.deepStrictEqual(mont.map((t: any) => t.title).sort(), ['Montar protocolo de corrida: Nina Nutri', 'Montar protocolo de corrida: Samara Franco', 'Montar protocolo de corrida: Ugo Reis', 'Montar protocolo de corrida: Vera Dias'], 'o link não respondido (Tais) fica de fora');
    const u4 = mont.find((t: any) => t.person.id === 's4'), u5 = mont.find((t: any) => t.person.id === 's5');
    assert.deepStrictEqual([u4.severity, u4.subtitle, u5.severity, u5.subtitle], ['today', 'respondeu a anamnese há 1 dia', 'late', 'respondeu a anamnese há 2 dias'], 'atrasa a partir de 2 dias');
    const s1 = mont.find((t: any) => t.person.id === 's1'), sn = mont.find((t: any) => t.person.id === 'sn');
    assert.deepStrictEqual([s1.severity, s1.subtitle, sn.severity, sn.subtitle], ['today', 'respondeu a anamnese hoje', 'late', 'respondeu a anamnese há 3 dias']);
    assert.deepStrictEqual(s1.target, { type: 'student', id: 's1', openRunning: true }); assert.strictEqual(s1.person.phone, '5541999990001');
    assert.ok(/^corrida_montar:s1:\d{4}-\d\d-\d\d$/.test(s1.key), s1.key);
    // ativou o protocolo: a pendência some sozinha
    pr('s1'); h = await hoje(); assert.deepStrictEqual(by('corrida_montar').map((t: any) => t.person.id).sort(), ['s4', 's5', 'sn']);
    // protocolo antigo (desativado) não conta como ativo; anamnese de mais de 30 dias não vira atraso eterno; anamnese não preenchida não aparece
    pr('sn', { isActive: false }); an('sm', 40); S.user.find((u: any) => u.id === 'sm').coachId = 'cA'; an('sx', 0, { filled: false });
    h = await hoje(); assert.deepStrictEqual(by('corrida_montar').map((t: any) => t.person.id).sort(), ['s4', 's5', 'sn']);
    // conta de teste nunca aparece
    an('sx', 0); h = await hoje(); assert.ok(!by('corrida_montar').some((t: any) => t.person.id === 'sx'));
    // concluiu o protocolo: pede o próximo desafio; protocolo em andamento ou concluído há mais de 30 dias não
    S.runningProtocol.find((p: any) => p.userId === 's1').completedAt = new Date(now - 2 * DAY); S.runningProtocol.find((p: any) => p.userId === 's1').protocolType = '10K';
    h = await hoje(); const fim = by('corrida_fim');
    assert.deepStrictEqual(fim.map((t: any) => [t.title, t.subtitle, t.severity]), [['Samara Franco concluiu o protocolo de 10K', 'escolha o próximo desafio', 'today']]);
    assert.deepStrictEqual(fim[0].target, { type: 'student', id: 's1', openRunning: true }); assert.ok(/^corrida_fim:s1:\d{4}-\d\d-\d\d$/.test(fim[0].key), fim[0].key);
    pr('sn', { completedAt: new Date(now - 40 * DAY) }); pr('s2', { completedAt: new Date(now - 1 * DAY) }); h = await hoje(); assert.strictEqual(by('corrida_fim').length, 1, 'antigo (40 dias) e de outro coach ficam de fora');
    // ativar o próximo protocolo (desativa o antigo) resolve
    S.runningProtocol.find((p: any) => p.userId === 's1').isActive = false; pr('s1'); h = await hoje(); assert.strictEqual(by('corrida_fim').length, 0);
    // adiar vale (JÁ TRATEI)
    S.runningProtocol = S.runningProtocol.filter((p: any) => p.userId !== 'sn'); h = await hoje(); const key = by('corrida_montar').find((t: any) => t.person.id === 'sn').key;
    assert.strictEqual((await call(hojePOST, '/api/agenda/hoje', tok('cA'), body({ coachId: 'cA', taskKey: key, days: 7 }))).status, 200); h = await hoje(); assert.ok(!by('corrida_montar').some((t: any) => t.key === key));
  });
  await block('HOJE: corrida — tabela ainda não criada não derruba a central', async () => {
    S.failOn = { runningAnamnese: { code: 'P2021', message: 'The table does not exist' } };
    const h = await hoje(); assert.ok(h.unavailable.includes('corrida')); assert.strictEqual(h.tasks.filter((t: any) => /^corrida_/.test(t.type)).length, 0);
  });
  await block('HOJE: personal ativo sem horário (info); com série ou compromisso marcado some; lista longa vira "+N"', async () => {
    let h = await hoje(); const sem = () => h.tasks.filter((t: any) => t.type === 'semhorario');
    assert.deepStrictEqual(sem().map((t: any) => t.person.name).sort(), ['Didio Silva', 'Samara Franco']);    // só os "Personal" do cA
    assert.ok(sem().every((t: any) => t.severity === 'info'));
    assert.deepStrictEqual(sem().find((t: any) => t.person.id === 'o1').target, { type: 'agenda_setup', personKind: 'offline', personId: 'o1' });
    await call(createPOST, '/api/agenda', tok('cA'), body(mk(MON, '07:00', { repeatWeekly: true, weekdays: [1] })));                          // série da Samara
    addEvent({ offlineClientId: 'o1', startsAt: new Date(Date.now() + 2 * DAY) });                                                           // compromisso avulso do Didio
    h = await hoje(); assert.deepStrictEqual(sem(), []);
    // do master: o Bruno (sem dono do master) aparece só para o master
    const hm = await hoje(PAULO_ID, tok(PAULO_ID, 'ADMIN')); assert.deepStrictEqual(hm.tasks.filter((t: any) => t.type === 'semhorario').map((t: any) => t.person.name), ['Bruno Master']);
    for (let i = 0; i < 10; i++) S.offlineClient.push({ id: 'p' + i, name: 'Personal ' + i, coachId: 'cA', financeCategory: 'Personal Trainer', isFinanceActive: true, contractValue: 0 });
    h = await hoje(); assert.strictEqual(sem().length, HJ.MAX_PER_TYPE); assert.ok(h.tasks.find((t: any) => t.type === 'semhorario_mais'));
  });
  await block('HOJE: adiar some até a data; "tratada" (30 dias); chave nova volta; só o próprio coach; valida entrada', async () => {
    const t = tok('cA'); const now = Date.now();
    S.weeklyFeedback.push({ id: 'wA', userId: 's1', createdAt: new Date(now - 3 * H), coachSeenAt: null, coachReplyAt: null });
    let h = await hoje(); const k = h.tasks.find((x: any) => x.type === 'semanal').key; assert.strictEqual(k, 'semanal:wA');
    const snooze = (o: any, as = t) => call(hojePOST, '/api/agenda/hoje', as, body({ coachId: 'cA', ...o }));
    const r = await snooze({ taskKey: k, days: 3 }); assert.strictEqual(r.status, 200);
    assert.ok(Math.abs(new Date(r.json.until).getTime() - (Date.now() + 3 * DAY)) < 5000);
    h = await hoje(); assert.ok(!h.tasks.some((x: any) => x.type === 'semanal'));
    S.weeklyFeedback.push({ id: 'wB', userId: 'sn', createdAt: new Date(), coachSeenAt: null, coachReplyAt: null });
    h = await hoje(); assert.ok(h.tasks.some((x: any) => x.type === 'semanal' && x.key === 'semanal:' + S.weeklyFeedback.find((w: any) => w.id === 'wB').id), 'feedback novo faz a pendência voltar');
    await snooze({ taskKey: 'semanal:wB', days: 30 }); assert.ok(!(await hoje()).tasks.some((x: any) => x.type === 'semanal'));
    assert.ok(!(await hoje()).tasks.some((x: any) => x.type === 'semanal'));   // a de 3 dias (wA) não afeta a de 30 (wB)
    S.agendaTaskSnooze.find((x: any) => x.taskKey === 'semanal:wB').until = new Date(Date.now() - 1000);   // venceu: volta sozinha
    assert.ok((await hoje()).tasks.some((x: any) => x.type === 'semanal' && x.key === 'semanal:wB'));
    assert.strictEqual((await snooze({ taskKey: k, days: 2 })).status, 400); assert.strictEqual((await snooze({ taskKey: '', days: 1 })).status, 400); assert.strictEqual((await snooze({ taskKey: 'x'.repeat(121) })).status, 400);
    assert.strictEqual((await snooze({ taskKey: k })).status, 200);   // padrão 1 dia
    assert.strictEqual((await snooze({ taskKey: k, days: 1 }, tok('cB'))).status, 403);
    await snooze({ taskKey: k, days: 7 }); assert.strictEqual(S.agendaTaskSnooze.filter((x: any) => x.taskKey === k).length, 1);   // não duplica
    assert.strictEqual((await call(hojePOST, '/api/agenda/hoje', null, body({ coachId: 'cA', taskKey: 'a' }))).status, 401);
    // snooze de um coach não esconde a pendência do outro
    S.weeklyFeedback.push({ id: 'wC', userId: 's2', createdAt: new Date(), coachSeenAt: null, coachReplyAt: null });
    assert.ok((await hoje('cB', tok('cB'))).tasks.some((x: any) => x.type === 'semanal'));
  });
  await block('HOJE: uma fonte fora do ar não derruba as outras (e aparece em unavailable)', async () => {
    S.weeklyFeedback.push({ id: 'wX', userId: 's1', createdAt: new Date(), coachSeenAt: null, coachReplyAt: null });
    S.studentAlert.push({ id: 'aX', type: 'EXERCISE_NOTE', isRead: false, userId: 's1', createdAt: new Date() });
    S.failOn.weeklyFeedback = { code: 'P2021', message: 'The table `public.WeeklyFeedback` does not exist' };
    const h = await hoje(); assert.deepStrictEqual(h.unavailable, ['feedback da semana']); assert.ok(h.tasks.some((t: any) => t.type === 'obs'));
    assert.ok(!h.tasks.some((t: any) => t.type === 'semanal'));
    S.failOn = { agendaTaskSnooze: { code: 'P2021', message: 'does not exist' } }; const h2 = await hoje(); assert.deepStrictEqual(h2.unavailable, ['adiadas']); assert.ok(h2.tasks.length > 0);
  });
  await block('HOJE: ordem — atrasadas, hoje, em breve, informativas', async () => {
    const now = Date.now();
    S.workout.push({ id: 'wz', userId: 'sn', endDate: new Date(now + 2 * DAY), archived: false, createdAt: new Date() });        // soon
    S.weeklyFeedback.push({ id: 'wQ', userId: 's1', createdAt: new Date(now - 1 * H), coachSeenAt: null, coachReplyAt: null });   // today
    S.checkIn.push({ id: 'cq', userId: 's1', coachFeedback: null, createdAt: new Date(now - 5 * DAY) });                       // late
    const h = await hoje(); const sev = h.tasks.map((t: any) => t.severity); const rank: any = { late: 0, today: 1, soon: 2, info: 3 };
    assert.deepStrictEqual(sev, sev.slice().sort((a: string, b: string) => rank[a] - rank[b]));
    assert.deepStrictEqual(h.counts, { late: sev.filter((s: string) => s === 'late').length, today: sev.filter((s: string) => s === 'today').length, soon: sev.filter((s: string) => s === 'soon').length, info: sev.filter((s: string) => s === 'info').length });
    assert.ok(h.counts.late >= 1 && h.counts.today >= 1 && h.counts.soon >= 1 && h.counts.info >= 1);
  });

  // ───────────── avisos (cron) ─────────────
  const T0 = new Date('2026-10-14T12:00:00Z');   // quarta 09:00 BRT
  const sentTo = () => pushes().map((p: any) => p.to + ':' + p.data.type);
  const deps = (now: Date = T0) => ({ db: P, now, sendToUser: async (user: any, title: string, body: string, data: any) => { (globalThis as any).__pushes.push({ to: user.id, title, body, data }); } });
  await block('lembretes: coach 30 min antes, uma vez só; aluno 2h antes e só com app; bloqueio e passado nunca', async () => {
    const ev = addEvent({ studentId: 's1', startsAt: new Date(T0.getTime() + 25 * MIN), endsAt: new Date(T0.getTime() + 85 * MIN), location: 'Academia X' });
    addEvent({ kind: 'BLOQUEIO', title: 'Folga', startsAt: new Date(T0.getTime() + 10 * MIN) });
    addEvent({ studentId: 's1', startsAt: new Date(T0.getTime() - 10 * MIN) });                                     // já começou
    addEvent({ studentId: 's1', startsAt: new Date(T0.getTime() + 90 * MIN), status: 'CANCELLED' });
    addEvent({ studentId: 's1', startsAt: new Date(T0.getTime() + 3 * H) });                                          // longe: coach ainda não, aluno só às 10:00
    const r = await CR.runAgendaReminders(deps());
    assert.deepStrictEqual(sentTo().sort(), ['cA:agenda_event', 's1:agenda_event_student']);
    assert.deepStrictEqual(r, { checked: 3, coach: 1, student: 1 });
    const c = pushes().find((p: any) => p.to === 'cA'); assert.match(c.title, /Em 25 min: Samara Franco/); assert.strictEqual(c.body, 'Atendimento presencial · 09:25 às 10:25 · Academia X'); assert.strictEqual(c.data.eventId, ev.id);
    const s = pushes().find((p: any) => p.to === 's1'); assert.match(s.title, /Atendimento hoje às 09:25/); assert.match(s.body, /Com Coach\./);
    clearPushes(); const r2 = await CR.runAgendaReminders(deps()); assert.deepStrictEqual(pushes(), []);              // segunda execução: nada de novo
    assert.strictEqual(r2.checked, 2);   // só olha os que ainda esperam algum aviso (o bloqueio e o das 12h); o já avisado fica de fora
    assert.ok(S.agendaEvent.find((e: any) => e.id === ev.id).coachRemindedAt && S.agendaEvent.find((e: any) => e.id === ev.id).studentRemindedAt);
    // duas execuções AO MESMO TEMPO não repetem
    S.agendaEvent.find((e: any) => e.id === ev.id).coachRemindedAt = null; S.agendaEvent.find((e: any) => e.id === ev.id).studentRemindedAt = null; clearPushes();
    await Promise.all([CR.runAgendaReminders(deps()), CR.runAgendaReminders(deps())]); assert.deepStrictEqual(sentTo().sort(), ['cA:agenda_event', 's1:agenda_event_student']);
  });
  await block('lembretes: usa os ajustes do coach (0 = desliga); aluno sem app e cadastro do financeiro só no coach', async () => {
    await call(setPUT, '/api/agenda/settings', tok('cA'), { method: 'PUT', body: JSON.stringify({ coachId: 'cA', remindCoachMin: 60, remindStudentMin: 0 }) });
    addEvent({ studentId: 's1', startsAt: new Date(T0.getTime() + 50 * MIN) });
    addEvent({ offlineClientId: 'o1', startsAt: new Date(T0.getTime() + 55 * MIN) });
    addEvent({ studentId: 'sn', startsAt: new Date(T0.getTime() + 59 * MIN) });   // aluno sem pushToken
    await CR.runAgendaReminders(deps()); assert.strictEqual(pushes().filter((p: any) => p.to === 'cA').length, 3); assert.strictEqual(pushes().filter((p: any) => p.to !== 'cA').length, 0);   // aluno: 0 = desligado
    const o = pushes().find((p: any) => /Didio/.test(p.title)); assert.ok(o);
    clearPushes(); S.agendaEvent.forEach((e: any) => { e.coachRemindedAt = null; });
    await call(setPUT, '/api/agenda/settings', tok('cA'), { method: 'PUT', body: JSON.stringify({ coachId: 'cA', remindCoachMin: 0 }) });
    await CR.runAgendaReminders(deps()); assert.deepStrictEqual(pushes(), []);   // coach 0 também desliga
  });
  await block('lembretes: aluno nunca de madrugada nem à noite; atendimento cedo avisa 20h da véspera; coach recebe a qualquer hora', async () => {
    const ev = addEvent({ studentId: 's1', startsAt: A.brtToUtc('2026-10-15', '07:00') });                  // quinta 07:00 BRT
    await CR.runAgendaReminders(deps(new Date('2026-10-14T22:30:00Z')));                                      // quarta 19:30 BRT: ainda não é 20h
    assert.deepStrictEqual(sentTo(), []);
    await CR.runAgendaReminders(deps(new Date('2026-10-14T23:05:00Z')));                                      // quarta 20:05 BRT
    assert.deepStrictEqual(sentTo(), ['s1:agenda_event_student']); assert.match(pushes()[0].title, /amanhã às 07:00/);
    clearPushes();
    await CR.runAgendaReminders(deps(new Date('2026-10-15T09:45:00Z')));                                      // quinta 06:45 BRT: coach (30 min antes = 06:30)
    assert.deepStrictEqual(sentTo(), ['cA:agenda_event']);
    // evento criado na noite anterior, na madrugada o aluno espera até 06:30
    clearPushes(); const ev2 = addEvent({ studentId: 's1', startsAt: A.brtToUtc('2026-10-16', '07:00') });
    await CR.runAgendaReminders(deps(new Date('2026-10-16T08:00:00Z')));                                      // 05:00 BRT (silêncio)
    assert.strictEqual(pushes().filter((p: any) => p.to === 's1').length, 0);
    await CR.runAgendaReminders(deps(new Date('2026-10-16T09:31:00Z')));                                      // 06:31 BRT
    assert.strictEqual(pushes().filter((p: any) => p.to === 's1').length, 1);
  });
  await block('lembretes: eventos de série são criados pelo cron mesmo se o coach nunca abriu a agenda', async () => {
    S.agendaSeries.push({ id: 'sr1', coachId: 'cA', kind: 'PRESENCIAL', studentId: 's1', offlineClientId: null, weekdays: [3], startTime: '09:25', durationMin: 60, startDate: '2026-10-01', endDate: null, active: true, title: null, location: null, meetUrl: null, meetProvider: null, notes: null });
    assert.strictEqual(S.agendaEvent.length, 0);
    await CR.runAgendaReminders(deps()); assert.strictEqual(S.agendaEvent.length >= 1, true);
    assert.deepStrictEqual(sentTo().sort(), ['cA:agenda_event', 's1:agenda_event_student']);
    const n = S.agendaEvent.length; await CR.runAgendaReminders(deps()); assert.strictEqual(S.agendaEvent.length, n);
    S.agendaSeries[0].active = false; S.agendaEvent.length = 0; await CR.runAgendaReminders(deps(new Date(T0.getTime() + 7 * DAY))); assert.strictEqual(S.agendaEvent.length, 0);   // série desativada não cria
  });
  await block('resumo do dia: uma vez por dia, depois da hora, só com algo a dizer; respeita ajustes', async () => {
    const t = tok('cA'); const day9 = new Date('2026-10-14T10:30:00Z');   // 07:30 BRT
    addEvent({ studentId: 's1', startsAt: new Date('2026-10-14T13:00:00Z') }); addEvent({ offlineClientId: 'o1', startsAt: new Date('2026-10-14T18:00:00Z') });
    S.weeklyFeedback.push({ id: 'wS', userId: 's1', createdAt: new Date('2026-10-10T12:00:00Z'), coachSeenAt: null, coachReplyAt: null });
    let r = await CR.runAgendaSummary(deps(new Date('2026-10-14T09:59:00Z'))); assert.strictEqual(r.sent, 0); assert.deepStrictEqual(pushes(), []);   // 06:59: cedo
    r = await CR.runAgendaSummary(deps(day9)); assert.strictEqual(r.sent, 1); const p = pushes()[0]; assert.strictEqual(p.to, 'cA'); assert.strictEqual(p.title, '☀️ Seu dia na agenda'); assert.match(p.body, /2 compromissos \(o primeiro às 10:00\)/); assert.match(p.body, /pendência/); assert.strictEqual(p.data.type, 'agenda_summary');
    clearPushes(); r = await CR.runAgendaSummary(deps(day9)); assert.strictEqual(r.sent, 0); assert.deepStrictEqual(pushes(), []);   // já mandou hoje
    assert.strictEqual(S.agendaSettings[0].summarySentOn, '2026-10-14');
    r = await CR.runAgendaSummary(deps(new Date('2026-10-15T10:30:00Z'))); assert.strictEqual(r.sent, 1);   // no dia seguinte volta
    clearPushes(); S.agendaSettings[0].summarySentOn = null; r = await CR.runAgendaSummary(deps(new Date('2026-10-14T15:30:00Z'))); assert.strictEqual(r.sent, 0);   // 12:30: tarde demais para um "bom dia"
    // desligado nos ajustes
    await call(setPUT, '/api/agenda/settings', t, { method: 'PUT', body: JSON.stringify({ coachId: 'cA', dailySummary: false }) });
    r = await CR.runAgendaSummary(deps(day9)); assert.strictEqual(r.sent, 0);
    // hora própria do coach
    await call(setPUT, '/api/agenda/settings', t, { method: 'PUT', body: JSON.stringify({ coachId: 'cA', dailySummary: true, summaryHour: 9 }) });
    r = await CR.runAgendaSummary(deps(day9)); assert.strictEqual(r.sent, 0); r = await CR.runAgendaSummary(deps(new Date('2026-10-14T12:10:00Z'))); assert.strictEqual(r.sent, 1);
  });
  await block('resumo: sem compromisso e sem pendência não manda nada; duas execuções juntas mandam uma só; coach que nunca usou a agenda não recebe', async () => {
    S.agendaSeries.push({ id: 'srx', coachId: 'cB', kind: 'PRESENCIAL', studentId: 's2', weekdays: [1], startTime: '07:00', durationMin: 60, startDate: '2026-12-01', endDate: null, active: true });   // cB usa a agenda, mas hoje não tem nada
    const r = await CR.runAgendaSummary(deps(new Date('2026-10-14T10:30:00Z'))); assert.strictEqual(r.sent, 0); assert.strictEqual(r.coaches, 1); assert.deepStrictEqual(pushes(), []);   // cA nunca usou; cB não tem o que dizer
    addEvent({ coachId: 'cB', studentId: 's2', startsAt: new Date('2026-10-14T13:00:00Z') }); S.agendaSettings.length = 0;
    clearPushes(); await Promise.all([CR.runAgendaSummary(deps(new Date('2026-10-14T10:30:00Z'))), CR.runAgendaSummary(deps(new Date('2026-10-14T10:30:00Z')))]);
    assert.deepStrictEqual(sentTo(), ['cB:agenda_summary']);
  });
  await block('resumo: treino vencendo entra no resumo da manhã (mesmo sem compromisso) e sozinho já basta para mandar; sem treino vencendo nada muda', async () => {
    assert.strictEqual(A.summaryText({ events: [], late: 0, today: 0, treinos: 2 }).body, 'Sem compromissos marcados · 2 treinos vencendo (dá para prorrogar no assistente)'); assert.strictEqual(A.summaryText({ events: [], late: 0, today: 1, treinos: 1 }).body, 'Sem compromissos marcados · 1 pendência · 1 treino vencendo (dá para prorrogar no assistente)'); assert.strictEqual(A.summaryText({ events: [], late: 0, today: 1, treinos: 0 }).body, 'Sem compromissos marcados · 1 pendência'); assert.strictEqual(A.summaryText({ events: [], late: 0, today: 1 }).body, 'Sem compromissos marcados · 1 pendência');
    S.agendaSeries.push({ id: 'srt', coachId: 'cA', kind: 'PRESENCIAL', studentId: 's1', weekdays: [1], startTime: '07:00', durationMin: 60, startDate: '2026-12-01', endDate: null, active: true });   // cA usa a agenda, mas hoje nada marcado
    let r = await CR.runAgendaSummary(deps(new Date('2026-10-14T10:30:00Z'))); assert.strictEqual(r.sent, 0, 'sem compromisso, sem pendência, sem treino vencendo: nada'); assert.deepStrictEqual(pushes(), []);
    S.agendaSettings.length = 0; S.workout.push({ id: 'wv', userId: 's1', endDate: new Date('2026-10-15T20:00:00Z'), archived: false, createdAt: new Date('2026-09-20T00:00:00Z') });   // vence amanhã
    clearPushes(); r = await CR.runAgendaSummary(deps(new Date('2026-10-14T10:30:00Z'))); assert.strictEqual(r.sent, 1); const p = pushes()[0]; assert.strictEqual(p.to, 'cA'); assert.match(p.body, /1 treino vencendo/); assert.strictEqual(p.data.type, 'agenda_summary');
  });
  await block('cron: sem CRON_SECRET desligado (503), segredo errado 401, certo roda; task inválida 400', async () => {
    delete process.env.CRON_SECRET;
    assert.strictEqual((await call(cronPOST, '/api/cron/agenda', null)).status, 503);
    process.env.CRON_SECRET = 'segredo-teste';
    assert.strictEqual((await call(cronPOST, '/api/cron/agenda', null)).status, 401);
    assert.strictEqual((await call(cronPOST, '/api/cron/agenda', null, { headers: { authorization: 'Bearer errado' } })).status, 401);
    assert.strictEqual((await call(cronPOST, '/api/cron/agenda?task=xx', null, { headers: { authorization: 'Bearer segredo-teste' } })).status, 400);
    const ok = await call(cronPOST, '/api/cron/agenda', null, { headers: { authorization: 'Bearer segredo-teste' } }); assert.strictEqual(ok.status, 200); assert.ok(ok.json.reminders && ok.json.summary);
    const g = await call(cronGET, '/api/cron/agenda?task=reminders', null, { headers: { 'x-cron-secret': 'segredo-teste' } }); assert.strictEqual(g.status, 200); assert.ok(g.json.reminders && !g.json.summary);
    S.failOn.agendaEvent = { code: 'P2021', message: 'does not exist' }; const miss = await call(cronPOST, '/api/cron/agenda', null, { headers: { authorization: 'Bearer segredo-teste' } }); assert.strictEqual(miss.status, 200); assert.ok(miss.json.skipped);
    delete process.env.CRON_SECRET;
  });

  // ───────────── limpeza ─────────────
  await block('excluir pessoa/coach limpa a agenda; falha de tabela não trava', async () => {
    addEvent({ studentId: 's1', startsAt: new Date(Date.now() + DAY) }); addEvent({ offlineClientId: 'o1', startsAt: new Date(Date.now() + DAY) }); addEvent({ coachId: 'cB', studentId: 's2', startsAt: new Date(Date.now() + DAY) });
    S.agendaSeries.push({ id: 'sr', coachId: 'cA', studentId: 's1', weekdays: [1], startTime: '07:00', startDate: TODAY }); S.agendaSeries.push({ id: 'so', coachId: 'cA', offlineClientId: 'o1', weekdays: [1], startTime: '08:00', startDate: TODAY });
    await ST.dropPersonAgenda(P, { studentId: 's1' }); assert.strictEqual(S.agendaEvent.length, 2); assert.deepStrictEqual(S.agendaSeries.map((s: any) => s.id), ['so']);
    await ST.dropPersonAgenda(P, { offlineClientId: 'o1' }); assert.strictEqual(S.agendaEvent.length, 1); assert.strictEqual(S.agendaSeries.length, 0);
    await ST.dropPersonAgenda(P, {}); assert.strictEqual(S.agendaEvent.length, 1);   // sem pessoa não apaga nada
    S.agendaSettings.push({ coachId: 'cB' }); S.agendaTaskSnooze.push({ coachId: 'cB', taskKey: 'x', until: new Date() });
    await ST.dropCoachAgenda(P, 'cB'); assert.strictEqual(S.agendaEvent.length, 0); assert.strictEqual(S.agendaSettings.length, 0); assert.strictEqual(S.agendaTaskSnooze.length, 0);
    S.failOn.agendaEvent = { code: 'P2021', message: 'does not exist' }; await ST.dropPersonAgenda(P, { studentId: 'x' }); await ST.dropCoachAgenda(P, 'x');   // não lança
  });


  // ───────────── reforços (mutação) ─────────────
  await block('reforço lista: janela de 1 dia cria a série; só os do coach, em ordem; ajustes vêm junto', async () => {
    const t = tok('cA');
    await call(createPOST, '/api/agenda', t, body(mk(MON, '07:00', { repeatWeekly: true, weekdays: [1] })));
    const far = A.addDaysKey(MON, 70);   // segunda fora do horizonte de 8 semanas
    assert.strictEqual((await list(t, 'cA', far, far)).json.events.length, 1);
    addEvent({ coachId: 'cB', studentId: 's2', startsAt: A.brtToUtc(MON, '09:00') });
    addEvent({ coachId: 'cA', studentId: 'sn', startsAt: A.brtToUtc(MON, '16:00') });
    addEvent({ coachId: 'cA', offlineClientId: 'o1', startsAt: A.brtToUtc(MON, '12:00') });
    const d = await list(t, 'cA', MON, MON);
    assert.deepStrictEqual(d.json.events.map((e: any) => A.timeKeyBrt(new Date(e.startsAt))), ['07:00', '12:00', '16:00']);
    assert.ok(d.json.events.every((e: any) => e.coachId === 'cA')); assert.strictEqual(d.json.settings.remindCoachMin, 30);
  });
  await block('reforço validação: repeatWeekly/force só booleano; anotação e título editáveis; telefone; slot; choques limitados; acesso do aluno; master e coach', async () => {
    const pc = (o: any) => A.parseCreateBody({ studentId: 's1', date: '2026-10-12', time: '07:00', ...o }) as any;
    assert.strictEqual(pc({ repeatWeekly: 'sim' }).value.repeat, null); assert.strictEqual(pc({ repeatWeekly: 1 }).value.repeat, null);
    assert.strictEqual(pc({ force: 'false' }).value.force, false); assert.strictEqual(pc({ force: 1 }).value.force, false);
    const t = tok('cA');
    const ev = (await call(createPOST, '/api/agenda', t, body(mk(day(1), '07:00')))).json.event;
    assert.strictEqual(ev.person.phone, '5541999990001'); assert.strictEqual(+new Date(S.agendaEvent[0].slotAt), +new Date(S.agendaEvent[0].startsAt));
    const up = await call(evPATCH, `/api/agenda/${ev.id}`, t, { method: 'PATCH', body: JSON.stringify({ notes: 'nova anotação', title: 'Perna', location: 'Sala 2' }) }, { params: { id: ev.id } });
    assert.strictEqual(up.json.event.notes, 'nova anotação'); assert.strictEqual(up.json.event.title, 'Perna'); assert.strictEqual(up.json.event.location, 'Sala 2');
    const put = (o: any) => call(setPUT, '/api/agenda/settings', t, { method: 'PUT', body: JSON.stringify({ coachId: 'cA', ...o }) });
    assert.strictEqual((await put({ workEnd: '9pm' })).status, 400); assert.strictEqual((await put({ workStart: '5:00' })).status, 400);
    assert.strictEqual((await list(tok('s1', 'USER'), 's1', day(0), day(6))).status, 403);   // o aluno usando o próprio id como "coach"
    assert.strictEqual((await call(createPOST, '/api/agenda', tok(PAULO_ID, 'ADMIN'), body({ coachId: PAULO_ID, date: day(1), time: '07:00', studentId: 'cA' }))).status, 403);   // coach sem dono não é aluno do master
    for (let i = 0; i < 12; i++) addEvent({ coachId: 'cA', studentId: 'sn', startsAt: A.brtToUtc(day(2), '06:00'), endsAt: A.brtToUtc(day(2), '06:10') }), S.agendaEvent[S.agendaEvent.length - 1].startsAt = new Date(A.brtToUtc(day(2), '06:00').getTime() + i * 15 * MIN), S.agendaEvent[S.agendaEvent.length - 1].endsAt = new Date(A.brtToUtc(day(2), '06:00').getTime() + i * 15 * MIN + 10 * MIN);
    const big = await call(createPOST, '/api/agenda', t, body(mk(day(2), '06:00', { durationMin: 240, studentId: null, offlineClientId: 'o1' })));
    assert.strictEqual(big.status, 409); assert.strictEqual(big.json.conflicts.length, 10);
    assert.deepStrictEqual(big.json.conflicts.map((c: any) => +new Date(c.startsAt)), big.json.conflicts.map((c: any) => +new Date(c.startsAt)).sort((a: number, b: number) => a - b));   // em ordem
  });
  await block('reforço séries: fim preservado; lembrete repetido não choca; dia da semana; força; avulso com escopo future; apagar mantém o feito; DONE não gera choque falso', async () => {
    const t = tok('cA');
    const patch = (id: string, o: any) => call(evPATCH, `/api/agenda/${id}`, t, { method: 'PATCH', body: JSON.stringify(o) }, { params: { id } });
    const del = (id: string, q = '') => call(evDELETE, `/api/agenda/${id}${q}`, t, { method: 'DELETE' }, { params: { id } });
    const ordered = () => S.agendaEvent.slice().sort((a: any, b: any) => +a.startsAt - +b.startsAt);
    // série com fim: a nova herda o fim
    await call(createPOST, '/api/agenda', t, body(mk(MON, '07:00', { repeatWeekly: true, weekdays: [1], endDate: A.addDaysKey(MON, 28) })));
    let evs = ordered(); assert.strictEqual(evs.length, 5);
    await patch(evs[2].id, { scope: 'future', time: '08:00' });
    const ns = S.agendaSeries.find((x: any) => x.startDate === A.addDaysKey(MON, 14)); assert.strictEqual(ns.endDate, A.addDaysKey(MON, 28));
    assert.ok(S.agendaEvent.every((e: any) => A.dateKeyBrt(new Date(e.startsAt)) <= A.addDaysKey(MON, 28)));
    await list(t, 'cA', A.addDaysKey(MON, 30), A.addDaysKey(MON, 60)); assert.ok(S.agendaEvent.every((e: any) => A.dateKeyBrt(new Date(e.startsAt)) <= A.addDaysKey(MON, 28)));
    // lembrete que se repete por cima de compromisso: não é choque
    assert.strictEqual((await call(createPOST, '/api/agenda', t, body({ coachId: 'cA', kind: 'LEMBRETE', title: 'Pesar', date: MON, time: '07:30', repeatWeekly: true, weekdays: [1] }))).status, 201);
    // avulso com escopo future vale só para ele
    const solo = (await call(createPOST, '/api/agenda', t, body(mk(day(3), '15:00')))).json.event;
    const sp = await patch(solo.id, { scope: 'future', title: 'Solo' }); assert.strictEqual(sp.status, 200); assert.strictEqual(sp.json.event.title, 'Solo');
    S.agendaEvent.length = 0; S.agendaSeries.length = 0;
    // mudar o dia da semana: o feito de um dia que sai da série fica na série antiga
    await call(createPOST, '/api/agenda', t, body(mk(MON, '07:00', { repeatWeekly: true, weekdays: [1] })));
    evs = ordered(); const oldId = S.agendaSeries[0].id; await patch(evs[2].id, { status: 'DONE' });
    const wk = await patch(evs[1].id, { scope: 'future', weekdays: [2] }); assert.strictEqual(wk.status, 200);
    assert.strictEqual(S.agendaEvent.find((e: any) => e.id === evs[2].id).seriesId, oldId);
    const fresh = S.agendaSeries.find((x: any) => x.id !== oldId); assert.deepStrictEqual(fresh.weekdays, [2]);
    const sched = S.agendaEvent.filter((e: any) => e.seriesId === fresh.id && e.status === 'SCHEDULED'); assert.ok(sched.length >= 6 && sched.every((e: any) => A.weekdayOfKey(A.dateKeyBrt(new Date(e.startsAt))) === 2));
    S.agendaEvent.length = 0; S.agendaSeries.length = 0;
    // force no "este e os próximos"
    await call(createPOST, '/api/agenda', t, body(mk(MON, '07:00', { repeatWeekly: true, weekdays: [1] }))); evs = ordered();
    await call(createPOST, '/api/agenda', t, body({ coachId: 'cA', kind: 'BLOQUEIO', date: A.addDaysKey(MON, 14), time: '18:00', durationMin: 60 }));
    assert.strictEqual((await patch(evs[0].id, { scope: 'future', time: '18:00' })).status, 409);
    assert.strictEqual((await patch(evs[0].id, { scope: 'future', time: '18:00', force: true })).status, 200);
    S.agendaEvent.length = 0; S.agendaSeries.length = 0;
    // apagar "e os próximos" não apaga o que já foi marcado como feito
    await call(createPOST, '/api/agenda', t, body(mk(MON, '07:00', { repeatWeekly: true, weekdays: [1] }))); evs = ordered();
    await patch(evs[3].id, { status: 'DONE' }); await del(evs[2].id, '?scope=future');
    assert.ok(S.agendaEvent.some((e: any) => e.id === evs[3].id && e.status === 'DONE')); assert.ok(!S.agendaEvent.some((e: any) => e.id === evs[4].id)); assert.ok(!S.agendaEvent.some((e: any) => e.id === evs[2].id));
    S.agendaEvent.length = 0; S.agendaSeries.length = 0;
    // o feito de um dia que a série vai refazer não vira choque com ela mesma
    await call(createPOST, '/api/agenda', t, body(mk(MON, '07:00', { repeatWeekly: true, weekdays: [1] }))); evs = ordered();
    await patch(evs[2].id, { status: 'DONE' });
    const ok = await patch(evs[1].id, { scope: 'future', time: '07:30' }); assert.strictEqual(ok.status, 200);
    assert.strictEqual(S.agendaEvent.filter((e: any) => A.dateKeyBrt(new Date(e.startsAt)) === A.addDaysKey(MON, 14)).length, 1);
  });
  await block('reforço editar: remarcar mantém a duração; mudar só a duração ou repetir o horário não zera a confirmação', async () => {
    const t = tok('cA');
    const ev = (await call(createPOST, '/api/agenda', t, body(mk(day(1), '07:00', { durationMin: 90 })))).json.event;
    const patch = (o: any) => call(evPATCH, `/api/agenda/${ev.id}`, t, { method: 'PATCH', body: JSON.stringify(o) }, { params: { id: ev.id } });
    const r = await patch({ time: '08:00' }); assert.strictEqual(r.json.event.endsAt, A.brtToUtc(day(1), '09:30').toISOString());
    S.agendaEvent[0].studentResponse = 'CONFIRMED'; S.agendaEvent[0].coachRemindedAt = new Date();
    await patch({ durationMin: 60 }); assert.strictEqual(S.agendaEvent[0].studentResponse, 'CONFIRMED'); assert.ok(S.agendaEvent[0].coachRemindedAt);
    await patch({ time: '08:00' }); assert.strictEqual(S.agendaEvent[0].studentResponse, 'CONFIRMED');
    await patch({ title: 'só título' }); assert.strictEqual(S.agendaEvent[0].studentResponse, 'CONFIRMED');
  });
  await block('reforço aluno: só atendimentos de verdade e que ainda não acabaram', async () => {
    const now = Date.now();
    addEvent({ kind: 'BLOCO', studentId: 's1', startsAt: new Date(now + DAY) });
    addEvent({ studentId: 's1', startsAt: new Date(now - 3 * H), endsAt: new Date(now - 2 * H) });
    const live = addEvent({ studentId: 's1', startsAt: new Date(now - 10 * MIN), endsAt: new Date(now + 50 * MIN) });
    const r = await call(meGET, '/api/agenda/me', tok('s1', 'USER', 'cA')); assert.deepStrictEqual(r.json.events.map((e: any) => e.id), [live.id]);
  });
  await block('reforço HOJE 1: série sem abrir a agenda, presença limitada, cancelado fora, em andamento, quem não é aluno', async () => {
    const now = Date.now();
    S.agendaSeries.push({ id: 'srH', coachId: 'cA', kind: 'PRESENCIAL', studentId: 's1', offlineClientId: null, weekdays: [0, 1, 2, 3, 4, 5, 6], startTime: '05:00', durationMin: 60, startDate: day(-30), endDate: null, active: true });
    S.agendaSeries.push({ id: 'srH2', coachId: 'cA', kind: 'PRESENCIAL', studentId: null, offlineClientId: 'o1', weekdays: [0, 1, 2, 3, 4, 5, 6], startTime: '04:00', durationMin: 30, startDate: day(-30), endDate: null, active: true });
    addEvent({ studentId: 's1', startsAt: A.brtToUtc(TODAY, '22:00'), status: 'CANCELLED' });
    addEvent({ studentId: 'sn', startsAt: new Date(now - 30 * MIN), endsAt: new Date(now + 30 * MIN), studentResponse: 'RESCHEDULE' });
    const h = await hoje();
    assert.ok(h.agenda.some((e: any) => e.seriesId === 'srH'));
    assert.ok(h.agenda.every((e: any) => e.status !== 'CANCELLED'));
    assert.strictEqual(h.tasks.filter((t: any) => t.type === 'presenca').length, HJ.MAX_PER_TYPE); const mais = h.tasks.find((t: any) => t.type === 'presenca_mais'); assert.ok(mais && mais.count >= 1); assert.match(mais.title, /atendimentos sem presença marcada/);
    assert.strictEqual(h.tasks.filter((t: any) => t.type === 'remarcar').length, 0);   // em andamento não pede remarcar
  });
  await block('reforço HOJE 2: texto no singular, observação antiga atrasada, avaliação de hoje, treinos, quem é coach, chave da cobrança, ordem e limite exato', async () => {
    const now = Date.now(); const U = (id: string) => S.user.find((u: any) => u.id === id);
    S.weeklyFeedback.push({ id: 'wOne', userId: 's1', createdAt: new Date(now - H), coachSeenAt: null, coachReplyAt: null });
    S.studentAlert.push({ id: 'aOld', type: 'EXERCISE_NOTE', isRead: false, userId: 's1', createdAt: new Date(now - 3 * DAY) });
    U('sn').nextCheckInDate = A.brtToUtc(TODAY, '12:00');
    const wk = (userId: string, endDate: Date | null, createdAt: Date, archived = false) => S.workout.push({ id: 'wk' + S.nextId++, userId, endDate, archived, createdAt });
    wk('s1', new Date(now + 40 * DAY), new Date(now - 1 * DAY)); wk('s1', new Date(now - 5 * DAY), new Date(now - 20 * DAY));   // o mais novo vale: sem pendência
    S.user.push({ id: 'w5', role: 'USER', name: 'Cinco Dias', coachId: 'cA', active: true }); wk('w5', A.brtToUtc(day(5), '12:00'), new Date(now - 9 * DAY));   // vence daqui a 5 dias: ainda longe
    S.user.push({ id: 'w0', role: 'USER', name: 'Hoje Vence', coachId: 'cA', active: true }); wk('w0', A.brtToUtc(TODAY, '12:00'), new Date(now - 9 * DAY));
    S.user.push({ id: 'wn', role: 'USER', name: 'Sem Prazo', coachId: 'cA', active: true }); wk('wn', null, new Date(now - 9 * DAY));
    S.user.push({ id: 'cx', role: 'COACH', name: 'Coach Sub', coachId: 'cA', active: true, isFinanceActive: true, contractValue: 100, paymentDueDate: new Date(now - 3 * DAY) });
    let h = await hoje();
    assert.strictEqual(h.tasks.find((t: any) => t.type === 'semanal').title, '1 feedback da semana aguardando você');
    assert.strictEqual(h.tasks.find((t: any) => t.type === 'obs').severity, 'late');
    assert.ok(!h.tasks.some((t: any) => t.type === 'checkin' && t.person.id === 'sn'));
    assert.deepStrictEqual(h.tasks.filter((t: any) => t.type === 'treino').map((t: any) => t.person.id), ['w0']);
    assert.strictEqual(h.tasks.find((t: any) => t.type === 'treino').severity, 'today'); assert.match(h.tasks.find((t: any) => t.type === 'treino').title, /Treino vence hoje: Hoje/);
    assert.ok(!JSON.stringify(h).includes('Coach Sub'));
    // chave da cobrança leva a data de vencimento: adiar um vencimento não esconde o próximo
    Object.assign(U('s1'), { contractValue: 250, paymentDueDate: new Date(now - 3 * DAY) });
    h = await hoje(); const k1 = h.tasks.find((t: any) => t.type === 'cobranca').key; assert.match(k1, /^cobranca:ss1:\d{4}-\d{2}-\d{2}$/);
    await call(hojePOST, '/api/agenda/hoje', tok('cA'), body({ coachId: 'cA', taskKey: k1, days: 30 }));
    assert.ok(!(await hoje()).tasks.some((t: any) => t.type === 'cobranca'));
    U('s1').paymentDueDate = new Date(now - 2 * DAY); const k2 = (await hoje()).tasks.find((t: any) => t.type === 'cobranca').key; assert.notStrictEqual(k1, k2);
    // ordem: "para hoje" sem data vem antes de "em breve" com data; dentro do mesmo grau, a data mais antiga primeiro
    S.agendaTaskSnooze.length = 0; U('s1').paymentDueDate = new Date(now - 6 * DAY);
    S.user.push({ id: 'sa', role: 'USER', name: 'Atrasa Mais', coachId: 'cA', active: true, isFinanceActive: true, contractValue: 100, paymentDueDate: new Date(now - 9 * DAY) });
    S.user.push({ id: 'sp2', role: 'USER', name: 'Paguei Já', coachId: 'cA', active: true, isFinanceActive: true, contractValue: 100, paymentDueDate: new Date(now - 1 * DAY), paymentClaimStatus: 'PENDING' });
    U('sn').contractValue = 200; U('sn').paymentDueDate = new Date(now + DAY);
    h = await hoje(); const ids = h.tasks.filter((t: any) => ['cobranca', 'paguei'].includes(t.type)).map((t: any) => t.type + ':' + (t.person && t.person.id));
    assert.deepStrictEqual(ids, ['cobranca:sa', 'cobranca:s1', 'paguei:sp2', 'cobranca:sn']);   // atrasadas: a de vencimento mais antigo primeiro, mesmo entrando depois na lista
    // exatamente 8 do mesmo tipo não viram "+N"
    S.user.length = 0; seed(); for (let i = 0; i < 8; i++) S.user.push({ id: 'e' + i, role: 'USER', name: 'Oito ' + i, coachId: 'cA', active: true, isFinanceActive: true, contractValue: 100, paymentDueDate: new Date(now - (i + 1) * DAY) });
    h = await hoje(); assert.strictEqual(h.tasks.filter((t: any) => t.type === 'cobranca').length, 8); assert.ok(!h.tasks.some((t: any) => t.type === 'cobranca_mais'));
  });
  await block('reforço HOJE 3: teste grátis e personal sem horário', async () => {
    const now = Date.now(); const sh = (o: any) => S.workoutShare.push({ id: 'sh' + S.nextId++, code: 'C' + S.nextId, trial: true, createdById: 'cA', revokedAt: null, displayName: 'X', viewCount: 0, doneCount: 0, createdAt: new Date(now - 3 * DAY), expiresAt: new Date(now + 4 * DAY), ...o });
    sh({ displayName: 'Recente', viewCount: 0, createdAt: new Date(now - 2 * H), expiresAt: new Date(now + 1 * DAY) });
    sh({ displayName: 'Folga', viewCount: 3, doneCount: 0, expiresAt: new Date(now + 3 * DAY) });
    let h = await hoje(); assert.ok(!h.tasks.some((t: any) => /^teste_/.test(t.type)));
    // personal: categoria, financeiro ativo, só avulso, só série no futuro
    S.user.push({ id: 'sc', role: 'USER', name: 'Consultoria Aluno', coachId: 'cA', active: true, isFinanceActive: true, financeCategory: 'Consultoria Online' });
    S.user.find((u: any) => u.id === 's1').isFinanceActive = false;
    h = await hoje(); assert.ok(!h.tasks.some((t: any) => t.type === 'semhorario' && ['sc', 's1'].includes(t.person.id)));
    S.user.find((u: any) => u.id === 's1').isFinanceActive = true;
    addEvent({ studentId: 's1', startsAt: new Date(now + 2 * DAY) });                                                                  // só um avulso
    S.agendaSeries.push({ id: 'srF', coachId: 'cA', kind: 'PRESENCIAL', studentId: null, offlineClientId: 'o1', weekdays: [1], startTime: '07:00', durationMin: 60, startDate: day(70), endDate: null, active: true });   // série que só começa depois
    h = await hoje(); assert.deepStrictEqual(h.tasks.filter((t: any) => t.type === 'semhorario'), []);
    S.agendaSeries[0].active = false; h = await hoje(); assert.strictEqual(h.tasks.filter((t: any) => t.type === 'semhorario').length, 1);   // série encerrada não conta
    // os dois mestres: cada um vê só os alunos dele e os sem dono; adiar é de cada um
    S.user.push({ id: 'sNull', role: 'USER', name: 'Sem Dono', coachId: null, active: true, isFinanceActive: true });
    S.weeklyFeedback.push({ id: 'wM', userId: 'sm', createdAt: new Date(), coachSeenAt: null, coachReplyAt: null });      // aluno do Paulo
    S.weeklyFeedback.push({ id: 'wN', userId: 'sNull', createdAt: new Date(Date.now() - 5 * H), coachSeenAt: null, coachReplyAt: null });   // sem dono
    const hp = await hoje(PAULO_ID, tok(PAULO_ID, 'ADMIN')); const ha = await hoje(ADRI_ID, tok(ADRI_ID, 'ADMIN'));
    assert.strictEqual(hp.tasks.find((t: any) => t.type === 'semanal').count, 2); assert.strictEqual(ha.tasks.find((t: any) => t.type === 'semanal').count, 1);   // Adri não vê o aluno do Paulo
    assert.ok(!JSON.stringify(ha).includes('Marco Master'));
    assert.deepStrictEqual(ha.tasks.filter((t: any) => t.type === 'semhorario').map((t: any) => t.person.name), []);   // o Bruno (cadastro do Paulo) não é da Adri
    S.weeklyFeedback.splice(S.weeklyFeedback.findIndex((w: any) => w.id === 'wM'), 1);
    const key = (await hoje(PAULO_ID, tok(PAULO_ID, 'ADMIN'))).tasks.find((t: any) => t.type === 'semanal').key;
    await call(hojePOST, '/api/agenda/hoje', tok(PAULO_ID, 'ADMIN'), body({ coachId: PAULO_ID, taskKey: key, days: 7 }));
    assert.ok(!(await hoje(PAULO_ID, tok(PAULO_ID, 'ADMIN'))).tasks.some((t: any) => t.type === 'semanal'));
    assert.ok((await hoje(ADRI_ID, tok(ADRI_ID, 'ADMIN'))).tasks.some((t: any) => t.type === 'semanal' && t.key === key));   // adiou o Paulo, a Adri continua vendo
  });
  await block('reforço HOJE 4: cadastro do financeiro sem dono é do master (não de coach parceiro)', async () => {
    S.offlineClient.push({ id: 'on', name: 'Sem Dono Off', coachId: null, financeCategory: 'Personal Trainer', isFinanceActive: true, contractValue: 0 });
    const hp = await hoje(PAULO_ID, tok(PAULO_ID, 'ADMIN')); assert.ok(hp.tasks.some((t: any) => t.type === 'semhorario' && t.person.id === 'on'));
    assert.ok(!(await hoje()).tasks.some((t: any) => t.person && t.person.id === 'on'));
  });
  await block('reforço rota HOJE: dias permitidos e padrão de 1 dia', async () => {
    const t = tok('cA'); const sn = (o: any) => call(hojePOST, '/api/agenda/hoje', t, body({ coachId: 'cA', taskKey: 'k', ...o }));
    assert.strictEqual((await sn({ days: 60 })).status, 400); assert.strictEqual((await sn({ days: 0 })).status, 400);
    const r = await sn({}); assert.ok(Math.abs(new Date(r.json.until).getTime() - (Date.now() + DAY)) < 5000);
  });
  await block('reforço cron: cria os dias dos próximos 3 dias; aluno só em atendimento; lead 0 do aluno desliga mesmo cedo; resumo ignora faltas', async () => {
    S.agendaSeries.push({ id: 'srC', coachId: 'cA', kind: 'PRESENCIAL', studentId: 's1', offlineClientId: null, weekdays: [4, 5], startTime: '15:00', durationMin: 60, startDate: '2026-10-01', endDate: null, active: true });
    await CR.runAgendaReminders(deps());   // T0 = quarta: quinta e sexta cabem nos 3 dias
    assert.deepStrictEqual(S.agendaEvent.map((e: any) => A.dateKeyBrt(new Date(e.startsAt))).sort(), ['2026-10-15', '2026-10-16']);
    S.agendaEvent.length = 0; S.agendaSeries.length = 0; clearPushes();
    addEvent({ kind: 'BLOCO', title: 'Treinos', studentId: 's1', startsAt: new Date(T0.getTime() + 30 * MIN) });
    await CR.runAgendaReminders(deps()); assert.strictEqual(pushes().filter((p: any) => p.to === 's1').length, 0); assert.strictEqual(pushes().filter((p: any) => p.to === 'cA').length, 1);
    assert.strictEqual(S.agendaEvent[0].studentRemindedAt, null);   // bloco não é atendimento: o aviso do aluno nem fica reservado
    S.agendaEvent.length = 0; clearPushes();
    await call(setPUT, '/api/agenda/settings', tok('cA'), { method: 'PUT', body: JSON.stringify({ coachId: 'cA', remindStudentMin: 0 }) });
    addEvent({ studentId: 's1', startsAt: A.brtToUtc('2026-10-15', '05:30') });
    await CR.runAgendaReminders(deps(new Date('2026-10-14T23:30:00Z'))); assert.strictEqual(pushes().filter((p: any) => p.to === 's1').length, 0);   // quarta 20:30: "0" = desligado
    // resumo: faltou não é compromisso do dia
    S.agendaEvent.length = 0; S.agendaSettings.length = 0; clearPushes();
    addEvent({ studentId: 's1', status: 'MISSED', startsAt: new Date('2026-10-14T13:00:00Z') });
    S.agendaSeries.push({ id: 'srS', coachId: 'cA', kind: 'PRESENCIAL', studentId: 's1', weekdays: [1], startTime: '07:00', durationMin: 60, startDate: '2026-12-01', endDate: null, active: true });
    const r = await CR.runAgendaSummary(deps(new Date('2026-10-14T10:30:00Z'))); assert.strictEqual(r.sent, 0); assert.deepStrictEqual(pushes(), []);
  });
  await block('reforço acesso: a lista traz os ajustes e cancelado não recebe lembrete', async () => {
    const ev = addEvent({ studentId: 's1', status: 'CANCELLED', startsAt: new Date(T0.getTime() + 90 * MIN) });
    await CR.runAgendaReminders(deps()); assert.deepStrictEqual(pushes(), []); assert.strictEqual(S.agendaEvent.find((e: any) => e.id === ev.id).studentRemindedAt, null);
  });

  // ───────────── anotações nas pendências ─────────────
  await block('anotações: guarda, aparece na pendência, edita sem duplicar, anota e adia junto, apaga com texto vazio', async () => {
    const t = tok('cA'); const now = Date.now();
    S.weeklyFeedback.push({ id: 'wN', userId: 's1', createdAt: new Date(now - 3 * H), coachSeenAt: null, coachReplyAt: null });
    const sem = async (id = 'cA', as = tok(id)) => (await hoje(id, as)).tasks.find((x: any) => x.type === 'semanal'); const key = (await sem()).key;
    const post = (o: any, as = t, id = 'cA') => call(hojePOST, '/api/agenda/hoje', as, body({ coachId: id, taskKey: key, ...o }));
    assert.ok(!('note' in (await sem())) && !('noteAt' in (await sem())));
    let r = await post({ note: '  Já cobrei; falta ele mandar as fotos  ' }); assert.strictEqual(r.status, 200); assert.strictEqual(r.json.note, 'Já cobrei; falta ele mandar as fotos'); assert.strictEqual(r.json.until, null);
    let tk = await sem(); assert.strictEqual(tk.note, 'Já cobrei; falta ele mandar as fotos'); assert.ok(Math.abs(new Date(tk.noteAt).getTime() - Date.now()) < 5000);
    assert.strictEqual(S.agendaTaskSnooze.length, 0);   // só anotar NÃO adia: a pendência continua na lista
    await post({ note: 'Nova versão' }); assert.strictEqual(S.agendaTaskNote.length, 1); assert.strictEqual((await sem()).note, 'Nova versão');
    r = await post({ note: 'Volta na sexta', days: 3 }); assert.strictEqual(r.status, 200); assert.ok(Math.abs(new Date(r.json.until).getTime() - (Date.now() + 3 * DAY)) < 5000);
    assert.ok(!(await sem()), 'anotou e adiou: some da lista');
    S.agendaTaskSnooze[0].until = new Date(Date.now() - 1000); assert.strictEqual((await sem()).note, 'Volta na sexta');   // venceu: volta já com a anotação
    r = await post({ note: '   ' }); assert.strictEqual(r.status, 200); assert.strictEqual(r.json.note, null); assert.strictEqual(S.agendaTaskNote.length, 0); assert.ok(!('note' in (await sem())));
    assert.strictEqual(S.agendaTaskSnooze.length, 1);   // apagar a anotação não mexe no adiamento
  });
  await block('anotações: limite de 300 letras, só texto, linha "+N" não aceita, outro coach não escreve nem vê, sem login 401', async () => {
    const t = tok('cA'); const key = 'semanal:wZ';
    const post = (o: any, as: string | null = t, id = 'cA', k = key) => call(hojePOST, '/api/agenda/hoje', as, body({ coachId: id, taskKey: k, ...o }));
    assert.strictEqual((await post({ note: 'x'.repeat(300) })).status, 200); assert.strictEqual((await post({ note: 'x'.repeat(301) })).status, 400); assert.strictEqual((await post({ note: 'é'.repeat(300) })).status, 200);
    assert.strictEqual((await post({ note: 5 })).status, 400); assert.strictEqual((await post({ note: ['a'] })).status, 400);
    assert.strictEqual((await post({ note: 'junta várias' }, t, 'cA', 'cobranca:mais')).status, 400); assert.strictEqual((await post({ note: '' }, t, 'cA', 'cobranca:mais')).status, 200);   // apagar numa linha dessas não dá erro
    assert.strictEqual((await post({ note: 'x', days: 2 })).status, 400);   // dias inválidos continuam recusados com nota junto
    assert.strictEqual((await post({ note: 'x' }, tok('cB'))).status, 403); assert.strictEqual((await post({ note: 'x' }, null)).status, 401);
    S.weeklyFeedback.push({ id: 'wZ', userId: 's2', createdAt: new Date(), coachSeenAt: null, coachReplyAt: null });
    await post({ note: 'só do coach A' }); assert.ok(!JSON.stringify(await hoje('cB')).includes('só do coach A'));
  });
  await block('anotações: o master não enxerga a anotação do outro master; some sozinha 90 dias depois da última edição', async () => {
    S.user.push({ id: 'sp1', role: 'USER', name: 'Aluno Paulo', coachId: PAULO_ID, active: true });
    S.weeklyFeedback.push({ id: 'wP', userId: 'sp1', createdAt: new Date(), coachSeenAt: null, coachReplyAt: null });
    S.user.push({ id: 'sa1', role: 'USER', name: 'Aluno Adri', coachId: ADRI_ID, active: true }); S.weeklyFeedback.push({ id: 'wA2', userId: 'sa1', createdAt: new Date(), coachSeenAt: null, coachReplyAt: null });
    const tp = tok(PAULO_ID, 'ADMIN'), ta = tok(ADRI_ID, 'ADMIN');
    await call(hojePOST, '/api/agenda/hoje', tp, body({ coachId: PAULO_ID, taskKey: 'semanal:wP', note: 'do Paulo' }));
    await call(hojePOST, '/api/agenda/hoje', ta, body({ coachId: ADRI_ID, taskKey: 'semanal:wP', note: 'da Adri' }));   // mesma chave, outro dono
    assert.strictEqual((await hoje(PAULO_ID, tp)).tasks.find((x: any) => x.key === 'semanal:wP').note, 'do Paulo');
    const ha = (await hoje(ADRI_ID, ta)); assert.ok(!JSON.stringify(ha).includes('do Paulo')); assert.strictEqual(S.agendaTaskNote.length, 2);
    S.agendaTaskNote.find((n: any) => n.coachId === PAULO_ID).updatedAt = new Date(Date.now() - 91 * DAY);
    assert.ok(!('note' in (await hoje(PAULO_ID, tp)).tasks.find((x: any) => x.key === 'semanal:wP')), 'passou de 90 dias: não aparece mais');
    await call(hojePOST, '/api/agenda/hoje', tp, body({ coachId: PAULO_ID, taskKey: 'semanal:outra', note: 'nova' }));   // salvar qualquer anotação faz a faxina das velhas
    assert.ok(!S.agendaTaskNote.some((n: any) => n.coachId === PAULO_ID && n.taskKey === 'semanal:wP')); assert.ok(S.agendaTaskNote.some((n: any) => n.coachId === ADRI_ID));
    await call(hojePOST, '/api/agenda/hoje', tp, body({ coachId: PAULO_ID, taskKey: 'semanal:wP', note: 'de novo' })); S.agendaTaskNote.find((n: any) => n.coachId === PAULO_ID && n.taskKey === 'semanal:wP').updatedAt = new Date(Date.now() - 89 * DAY);
    assert.strictEqual((await hoje(PAULO_ID, tp)).tasks.find((x: any) => x.key === 'semanal:wP').note, 'de novo');   // com 89 dias ainda vale
    await call(hojePOST, '/api/agenda/hoje', ta, body({ coachId: ADRI_ID, taskKey: 'semanal:wP', note: '' }));   // a Adri apagar a dela não mexe na do Paulo (mesma chave)
    assert.ok(S.agendaTaskNote.some((n: any) => n.coachId === PAULO_ID && n.taskKey === 'semanal:wP')); assert.ok(!S.agendaTaskNote.some((n: any) => n.coachId === ADRI_ID && n.taskKey === 'semanal:wP'));
  });
  await block('anotações: tabela ainda não criada não derruba a central nem o adiar; anotar avisa 503', async () => {
    S.weeklyFeedback.push({ id: 'wT', userId: 's1', createdAt: new Date(), coachSeenAt: null, coachReplyAt: null });
    S.failOn = { agendaTaskNote: { code: 'P2021', message: 'The table `public.AgendaTaskNote` does not exist' } };
    const h = await hoje(); assert.deepStrictEqual(h.unavailable, ['anotações']); assert.ok(h.tasks.some((x: any) => x.type === 'semanal'));
    const t = tok('cA'); assert.strictEqual((await call(hojePOST, '/api/agenda/hoje', t, body({ coachId: 'cA', taskKey: 'semanal:wT', note: 'oi' }))).status, 503);
    assert.strictEqual((await call(hojePOST, '/api/agenda/hoje', t, body({ coachId: 'cA', taskKey: 'semanal:wT', days: 1 }))).status, 200);
  });
  await block('anotações (LGPD): excluir a pessoa apaga as anotações das pendências dela; excluir o coach apaga todas as dele', async () => {
    const note = (coachId: string, taskKey: string) => S.agendaTaskNote.push({ id: 'n' + S.nextId++, coachId, taskKey, note: 'x', createdAt: new Date(), updatedAt: new Date() });
    const ev = addEvent({ studentId: 's1', startsAt: new Date(Date.now() - 3 * H) });
    note('cA', 'treino:s1:2026-10-10'); note('cA', 'cobranca:ss1:2026-10-01'); note('cA', 'presenca:' + ev.id); note('cA', 'treino:s2:2026-10-10'); note('cA', 'semhorario:oo1'); note('cB', 'treino:s1:2026-10-10');
    await ST.dropPersonAgenda(prisma as any, { studentId: 's1' });
    assert.ok(!S.agendaTaskNote.some((n: any) => /s1|presenca/.test(n.taskKey)), 'as do aluno e as do compromisso dele saem');
    assert.ok(S.agendaTaskNote.some((n: any) => n.taskKey === 'treino:s2:2026-10-10') && S.agendaTaskNote.some((n: any) => n.taskKey === 'semhorario:oo1'));
    await ST.dropPersonAgenda(prisma as any, { offlineClientId: 'oo1' }); assert.ok(!S.agendaTaskNote.some((n: any) => n.taskKey === 'semhorario:oo1'));
    note('cB', 'treino:s2:2026-10-10'); await ST.dropCoachAgenda(prisma as any, 'cA'); assert.deepStrictEqual(S.agendaTaskNote.map((n: any) => n.coachId), ['cB']);
  });

  // ───────────── avisos por compromisso, "remarcado" e categoria da pessoa ─────────────
  await block('avisos por compromisso (cron): aluno e coach desligados não recebem push; sem os campos (linha antiga) continua ligado', async () => {
    const quiet = addEvent({ studentId: 's1', startsAt: new Date(T0.getTime() + 25 * MIN), notifyStudent: false, notifyCoach: false });
    const loud = addEvent({ studentId: 's1', startsAt: new Date(T0.getTime() + 28 * MIN) });
    const half = addEvent({ studentId: 's1', startsAt: new Date(T0.getTime() + 29 * MIN), notifyStudent: false, notifyCoach: true });
    const onlyStudent = addEvent({ studentId: 's1', startsAt: new Date(T0.getTime() + 26 * MIN), notifyStudent: true, notifyCoach: false });
    await CR.runAgendaReminders(deps());
    const got = (to: string) => pushes().filter((p: any) => p.to === to).map((p: any) => p.data.eventId).sort();
    assert.deepStrictEqual(got('cA'), [loud.id, half.id].sort()); assert.deepStrictEqual(got('s1'), [loud.id, onlyStudent.id].sort());
    assert.ok(!pushes().some((p: any) => p.data.eventId === quiet.id), 'o compromisso só de registro não manda nada');
  });
  await block('avisos por compromisso (rota): vale na criação e na edição; só verdadeiro/falso; o cartão do aluno e a resposta respeitam', async () => {
    const t = tok('cA'); const mkp = (time: string, o: any = {}) => call(createPOST, '/api/agenda', t, body(mk(day(1), time, o)));
    const a = await mkp('07:00', { notifyStudent: false, notifyCoach: false }); assert.strictEqual(a.status, 201); assert.strictEqual(a.json.event.notifyStudent, false); assert.strictEqual(a.json.event.notifyCoach, false);
    const b = await mkp('09:00'); assert.strictEqual(b.json.event.notifyStudent, true); assert.strictEqual(b.json.event.notifyCoach, true);   // sem dizer nada: ligado
    assert.strictEqual((await mkp('11:00', { notifyStudent: 'não' })).status, 400); assert.strictEqual((await mkp('11:00', { notifyCoach: 1 })).status, 400); assert.match((await mkp('11:00', { notifyStudent: 'x' })).json.error, /Aviso inválido/);
    const card = await call(meGET, '/api/agenda/me', tok('s1', 'USER', 'cA')); assert.deepStrictEqual(card.json.events.map((e: any) => e.id), [b.json.event.id]);   // o de registro não aparece para o aluno
    assert.strictEqual((await call(meRespond, `/api/agenda/me/${a.json.event.id}`, tok('s1', 'USER', 'cA'), body({ response: 'CONFIRMED' }), { params: { id: a.json.event.id } })).status, 404);
    const patch = (id: string, o: any) => call(evPATCH, `/api/agenda/${id}`, t, { method: 'PATCH', body: JSON.stringify(o) }, { params: { id } });
    assert.strictEqual((await patch(b.json.event.id, { notifyStudent: false })).json.event.notifyStudent, false); assert.strictEqual(S.agendaEvent.find((e: any) => e.id === b.json.event.id).notifyCoach, true);   // mexe só no que veio
    assert.strictEqual((await patch(b.json.event.id, { notifyCoach: 'x' })).status, 400);
    assert.deepStrictEqual((await call(meGET, '/api/agenda/me', tok('s1', 'USER', 'cA'))).json.events, []);
  });
  await block('avisos por compromisso (série): os dias nascem com a escolha; "este e os próximos" mantém ou muda; só este dia não mexe na série', async () => {
    const t = tok('cA'); const patch = (id: string, o: any) => call(evPATCH, `/api/agenda/${id}`, t, { method: 'PATCH', body: JSON.stringify(o) }, { params: { id } });
    const r = await call(createPOST, '/api/agenda', t, body(mk(MON, '07:00', { repeatWeekly: true, weekdays: [1, 4], notifyStudent: false, notifyCoach: false })));
    assert.strictEqual(r.status, 201); assert.strictEqual(S.agendaSeries[0].notifyStudent, false); assert.strictEqual(S.agendaSeries[0].notifyCoach, false);
    assert.ok(S.agendaEvent.length >= 2 && S.agendaEvent.every((e: any) => e.notifyStudent === false && e.notifyCoach === false));
    const first = S.agendaEvent.slice().sort((x: any, y: any) => +new Date(x.startsAt) - +new Date(y.startsAt))[0];
    await patch(first.id, { scope: 'future', time: '08:00' });   // só muda o horário: os avisos continuam desligados na série nova
    const fresh = S.agendaSeries.find((x: any) => x.active && x.startTime === '08:00'); assert.strictEqual(fresh.notifyStudent, false); assert.strictEqual(fresh.notifyCoach, false);
    assert.ok(S.agendaEvent.filter((e: any) => e.seriesId === fresh.id).every((e: any) => e.notifyStudent === false && e.notifyCoach === false));
    const second = S.agendaEvent.filter((e: any) => e.seriesId === fresh.id).sort((x: any, y: any) => +new Date(x.startsAt) - +new Date(y.startsAt))[1];
    await patch(second.id, { notifyStudent: true }); assert.strictEqual(S.agendaEvent.find((e: any) => e.id === second.id).notifyStudent, true); assert.strictEqual(S.agendaSeries.find((x: any) => x.id === fresh.id).notifyStudent, false);   // só aquele dia
    await patch(second.id, { scope: 'future', notifyStudent: true, notifyCoach: true });
    const again = S.agendaSeries.find((x: any) => x.active && x.startDate === A.dateKeyBrt(new Date(second.slotAt))); assert.strictEqual(again.notifyStudent, true); assert.strictEqual(again.notifyCoach, true);
    assert.ok(S.agendaEvent.filter((e: any) => e.seriesId === again.id && e.status === 'SCHEDULED').every((e: any) => e.notifyStudent === true && e.notifyCoach === true));
  });
  await block('remarcado: o aluno pediu outra data — vale como registro, libera o horário, tira as pendências e volta com desfazer', async () => {
    const t = tok('cA'); const patch = (id: string, o: any) => call(evPATCH, `/api/agenda/${id}`, t, { method: 'PATCH', body: JSON.stringify(o) }, { params: { id } });
    const past = addEvent({ studentId: 's1', startsAt: new Date(Date.now() - 3 * H) }); const future = addEvent({ studentId: 's1', startsAt: new Date(Date.now() + 5 * H), studentResponse: 'RESCHEDULE' });
    let h = await hoje(); assert.ok(h.tasks.some((x: any) => x.key === 'presenca:' + past.id) && h.tasks.some((x: any) => x.key === 'remarcar:' + future.id));
    const r = await patch(past.id, { status: 'RESCHEDULED' }); assert.strictEqual(r.status, 200); assert.strictEqual(r.json.event.status, 'RESCHEDULED'); assert.ok(r.json.event.statusAt);
    await patch(future.id, { status: 'RESCHEDULED' });
    h = await hoje(); assert.ok(!h.tasks.some((x: any) => /^(presenca|remarcar):/.test(x.key)), 'remarcado não vira pendência');
    assert.ok(h.agenda.some((e: any) => e.id === past.id && e.status === 'RESCHEDULED'), 'continua no histórico do dia');
    // o horário volta a ficar livre: marcar outra coisa no mesmo lugar não dá choque
    const same = A.dateKeyBrt(new Date(past.startsAt)), hh = A.timeKeyBrt(new Date(past.startsAt));
    assert.strictEqual((await call(createPOST, '/api/agenda', t, body({ coachId: 'cA', kind: 'BLOCO', title: 'Treinos', date: same, time: hh }))).status, 201);
    assert.strictEqual((await call(meGET, '/api/agenda/me', tok('s1', 'USER', 'cA'))).json.events.some((e: any) => e.id === future.id), false);
    assert.strictEqual((await patch(past.id, { status: 'XX' })).status, 400);
    assert.strictEqual((await patch(past.id, { status: 'SCHEDULED' })).json.event.status, 'SCHEDULED'); assert.strictEqual(S.agendaEvent.find((e: any) => e.id === past.id).statusAt, null);
    // choque entre dois que estão marcados continua valendo, e um remarcado não bloqueia a edição de outro
    const x = addEvent({ studentId: 's1', startsAt: new Date(Date.now() + 30 * H) }), y = addEvent({ studentId: 's1', startsAt: new Date(Date.now() + 40 * H), status: 'RESCHEDULED' });
    assert.strictEqual((await patch(x.id, { date: A.dateKeyBrt(new Date(y.startsAt)), time: A.timeKeyBrt(new Date(y.startsAt)) })).status, 200);
    assert.strictEqual((await patch(y.id, { date: A.dateKeyBrt(new Date(x.startsAt)), time: A.timeKeyBrt(new Date(x.startsAt)) })).status, 200);   // o remarcado não ocupa nada: mexer nele não gera choque
  });
  await block('categoria da pessoa vem junto (para a tela dizer "personal"): aluno e cadastro do financeiro', async () => {
    const a = await call(createPOST, '/api/agenda', tok('cA'), body(mk(day(1), '07:00'))); assert.strictEqual(a.json.event.person.category, 'Personal Trainer');
    const b = await call(createPOST, '/api/agenda', tok('cA'), body({ coachId: 'cA', kind: 'PRESENCIAL', offlineClientId: 'o1', date: day(1), time: '09:00' })); assert.strictEqual(b.json.event.person.category, 'Personal Trainer');
    S.user.find((u: any) => u.id === 'sn').financeCategory = null; const c = await call(createPOST, '/api/agenda', tok('cA'), body({ coachId: 'cA', kind: 'PRESENCIAL', studentId: 'sn', date: day(1), time: '11:00' })); assert.strictEqual(c.json.event.person.category, null);
    const l = await list(tok('cA'), 'cA', day(1), day(1)); assert.deepStrictEqual(l.json.events.map((e: any) => e.person.category), ['Personal Trainer', 'Personal Trainer', null]);
  });

  console.log(`\n${passed} blocos ok, ${fails} com falha`);
  process.exit(fails ? 1 : 0);
})();
