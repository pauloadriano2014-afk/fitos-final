import assert from 'assert';
import jwt from 'jsonwebtoken';
import prisma from '@/lib/prisma';
import { GET as historyGET } from '/home/user/fitos-final/app/api/admin/weekly-feedback/history/route';
import { clampWeeks, recentWeekStarts, computeAdherence, loadAdherenceHistory, parseMonth, monthWeekStarts, recentMonths, HISTORY_DEFAULT_WEEKS } from '/home/user/fitos-final/lib/weeklyHistory';
const P = prisma as any; const db = P.__db;
const tok = (id: string, role = 'COACH') => jwt.sign({ id, role, coachId: null }, 'dev-only-troque-isso-configurando-JWT_SECRET-no-env');
const NOW = new Date(Date.UTC(2026, 9, 1, 15, 0));   // quinta 01/10/2026 (semana avaliada: 21/09 a 27/09... segunda 28/09 é a corrente -> avaliada 21/09)

(async () => {
  // ── peças puras ──
  assert.equal(HISTORY_DEFAULT_WEEKS, 4, 'padrão: 4 semanas'); assert.equal(clampWeeks(undefined), 4); assert.equal(clampWeeks('abc'), 4); assert.equal(clampWeeks('5'), 5); assert.equal(clampWeeks(1), 2); assert.equal(clampWeeks(99), 12); assert.equal(clampWeeks(3.5), 4); assert.equal(clampWeeks(null), 4, 'rota sem ?weeks= manda null: padrão 4, não 2'); assert.equal(clampWeeks(''), 4); assert.equal(clampWeeks(true as any), 4); assert.equal(clampWeeks(' 6 '), 6);
  const ws = recentWeekStarts(NOW, 4); assert.deepEqual(ws, ['2026-09-07', '2026-09-14', '2026-09-21', '2026-09-28'].map((d, i, a) => a[i]).slice(0, 4).map((_, i) => ['2026-08-31', '2026-09-07', '2026-09-14', '2026-09-21'][i]), 'da mais antiga para a atual (a avaliada)');
  const users = [
    { id: 'a', coachId: 'c', createdAt: '2026-01-01T00:00:00Z', active: true }, { id: 'b', coachId: 'c', createdAt: '2026-01-01T00:00:00Z', active: true },
    { id: 'novo', coachId: 'c', createdAt: '2026-09-10T12:00:00Z', active: true },      // entrou em 10/09: só conta a partir da semana de 07/09
    { id: 'inativo', coachId: 'c', createdAt: '2026-01-01T00:00:00Z', active: false }, { id: 'semcoach', coachId: null, createdAt: '2026-01-01T00:00:00Z', active: true },
  ];
  const fbs = [{ userId: 'a', weekStart: '2026-09-21' }, { userId: 'b', weekStart: '2026-09-21' }, { userId: 'novo', weekStart: '2026-09-21' }, { userId: 'a', weekStart: '2026-09-14' }, { userId: 'inativo', weekStart: '2026-09-14' }, { userId: 'a', weekStart: '2026-09-14' }];
  const adh = computeAdherence(users, fbs, ['2026-08-31', '2026-09-07', '2026-09-14', '2026-09-21']);
  assert.deepEqual(adh.map((w) => [w.weekStart, w.students, w.answered, w.pct]), [['2026-08-31', 2, 0, 0], ['2026-09-07', 3, 0, 0], ['2026-09-14', 3, 1, 33], ['2026-09-21', 3, 3, 100]], 'quem deve responder: ativo, com coach e já na plataforma; resposta repetida/de inativo não conta');
  assert.equal(adh[3].weekLabel, '21/09 a 27/09'); assert.equal(computeAdherence([], [], ['2026-09-21'])[0].pct, null, 'sem alunos: sem porcentagem');
  console.log('OK  histórico (conta): quem deve responder em cada semana x quem respondeu; aluno novo só entra depois de chegar; sem alunos = sem %');

  // ── loadAdherenceHistory: filtra os alunos do coach (ou do time master) e usa UMA consulta de respostas ──
  const asked: any[] = []; const fake: any = {
    user: { findMany: async ({ where }: any) => { asked.push(where); return users.filter((u) => (where.coachId.in ? where.coachId.in.includes(u.coachId) : u.coachId === where.coachId)); } },
    weeklyFeedback: { findMany: async ({ where }: any) => { asked.push(where); return fbs.filter((f) => where.userId.in.includes(f.userId) && where.weekStart.in.includes(f.weekStart)); } },
  };
  const h = await loadAdherenceHistory(fake, { adminId: 'c', now: NOW, weeks: 4 }); assert.equal(h.weeks.length, 4); assert.equal(h.weeks.at(-1)!.answered, 3); assert.equal(asked[0].coachId, 'c'); assert.equal(asked.filter((x) => x.weekStart).length, 1, 'uma consulta de respostas só');
  asked.length = 0; await loadAdherenceHistory(fake, { adminId: '3c82f763-66b4-48da-836e-16817d4f57c0', now: NOW }); assert.ok(Array.isArray(asked[0].coachId.in) && asked[0].coachId.in.length === 2, 'master: alunos do time (Paulo + Adri)');
  const empty = await loadAdherenceHistory({ user: { findMany: async () => [] }, weeklyFeedback: { findMany: async () => { throw new Error('não devia consultar'); } } }, { adminId: 'x', now: NOW, weeks: 3 }); assert.deepEqual(empty.weeks.map((w) => w.students), [0, 0, 0]);
  console.log('OK  histórico (carga): só os alunos do coach (time master = Paulo + Adri), uma consulta de respostas, sem alunos nem consulta');

  // ── escolher o mês ──
  assert.deepEqual(parseMonth('2026-09'), { year: 2026, month: 9 }); for (const bad of ['2026-13', '2026-00', '2026-9', 'setembro', '', null, undefined, 202609, '2026-09-01', '1999-05']) assert.equal(parseMonth(bad as any), null, `mês inválido: ${String(bad)}`);
  assert.deepEqual(monthWeekStarts(2026, 9, NOW), ['2026-08-31', '2026-09-07', '2026-09-14', '2026-09-21'], 'setembro: desde a semana que contém o dia 1 (31/08), só até a semana já fechada (28/09 ainda não)');
  assert.deepEqual(monthWeekStarts(2026, 8, NOW), ['2026-07-27', '2026-08-03', '2026-08-10', '2026-08-17', '2026-08-24', '2026-08-31'], 'agosto: 6 semanas tocam o mês');
  assert.deepEqual(monthWeekStarts(2026, 10, NOW), [], 'outubro: nenhuma semana fechada ainda'); assert.deepEqual(monthWeekStarts(2027, 3, NOW), [], 'mês futuro: vazio');
  assert.deepEqual(monthWeekStarts(2026, 10, new Date(Date.UTC(2026, 9, 5, 15, 0))), ['2026-09-28'], 'segunda 05/10 a semana de 28/09 fecha e entra em outubro (e continua em setembro)');
  assert.deepEqual(monthWeekStarts(2026, 9, new Date(Date.UTC(2026, 9, 5, 15, 0))).at(-1), '2026-09-28');
  const months = recentMonths(NOW); assert.deepEqual(months.map((m) => m.key), ['2026-09', '2026-08', '2026-07', '2026-06', '2026-05'], 'os meses escolhíveis: do mais novo ao mais antigo; outubro ainda sem semana fechada fica de fora'); assert.deepEqual(months[0], { key: '2026-09', label: 'Setembro 2026', short: 'SET' });
  const jan = recentMonths(new Date(Date.UTC(2027, 0, 20, 15, 0))); assert.equal(jan[0].short, 'JAN'); assert.equal(jan[1].key, '2026-12'); assert.equal(jan[1].short, 'DEZ/26', 'mês de outro ano leva o ano abreviado'); assert.equal(jan[1].label, 'Dezembro 2026');
  const askedM: any[] = []; const fakeM: any = { user: { findMany: async () => users }, weeklyFeedback: { findMany: async ({ where }: any) => { askedM.push(where.weekStart.in); return fbs; } } };
  const hm = await loadAdherenceHistory(fakeM, { adminId: 'c', now: NOW, month: '2026-09' }); assert.deepEqual(hm.weeks.map((w) => w.weekStart), ['2026-08-31', '2026-09-07', '2026-09-14', '2026-09-21']); assert.equal(hm.month, '2026-09'); assert.equal(hm.monthLabel, 'Setembro 2026'); assert.equal(hm.months.length, 5); assert.deepEqual(askedM[0], ['2026-08-31', '2026-09-07', '2026-09-14', '2026-09-21'], 'busca só as semanas do mês');
  const hd = await loadAdherenceHistory(fakeM, { adminId: 'c', now: NOW, month: 'lixo' }); assert.equal(hd.weeks.length, 4, 'mês inválido: volta às 4 últimas semanas'); assert.equal(hd.month, null); assert.equal(hd.monthLabel, null); assert.equal(hd.months.length, 5, 'a lista de meses vem sempre (o app usa para mostrar as opções)');
  const hf = await loadAdherenceHistory({ user: { findMany: async () => users }, weeklyFeedback: { findMany: async () => { throw new Error('mês sem semana fechada não devia consultar respostas'); } } }, { adminId: 'c', now: NOW, month: '2026-10' }); assert.deepEqual(hf.weeks, [], 'outubro ainda sem semana fechada: vazio, sem consulta'); assert.equal(hf.month, '2026-10');
  console.log('OK  histórico por mês: padrão 4 semanas, mês = semanas que tocam o mês até a última fechada, lista de meses escolhíveis, mês inválido volta ao padrão');

  // ── a rota ──
  db.users.push({ id: 'coach-a', role: 'COACH', accountStatus: 'ACTIVE', name: 'A', coachId: null }, { id: 'coach-b', role: 'COACH', accountStatus: 'ACTIVE', name: 'B', coachId: null }, { id: 'pend', role: 'COACH', accountStatus: 'PENDING_APPROVAL', name: 'P', coachId: null }, { id: 's1', role: 'USER', name: 'Aluno', coachId: 'coach-a' });
  P.user.findMany = async ({ where }: any) => (where.coachId === 'coach-a' ? [{ id: 's1', coachId: 'coach-a', createdAt: new Date('2026-01-01'), active: true }] : []);
  let down = false; P.weeklyFeedback = { findMany: async () => { if (down) throw Object.assign(new Error('relation does not exist'), { code: 'P2021' }); return [{ userId: 's1', weekStart: '2026-09-21' }]; } };
  const call = async (url: string, as?: string, role = 'COACH') => { const r = await historyGET(new Request('http://x' + url, { headers: as ? { authorization: 'Bearer ' + tok(as, role) } : {} })); return { status: r.status, json: await r.json() }; };
  assert.equal((await call('/api/admin/weekly-feedback/history?adminId=coach-a')).status, 401, 'sem login');
  assert.equal((await call('/api/admin/weekly-feedback/history', 'coach-a')).status, 400, 'sem adminId');
  assert.equal((await call('/api/admin/weekly-feedback/history?adminId=coach-a', 'coach-b')).status, 403, 'outro coach não vê');
  assert.equal((await call('/api/admin/weekly-feedback/history?adminId=pend', 'pend')).status, 403, 'coach pendente não vê');
  assert.equal((await call('/api/admin/weekly-feedback/history?adminId=coach-a', 'coach-a')).json.weeks.length, 4, 'sem ?weeks=: 4 semanas');
  const ok = await call('/api/admin/weekly-feedback/history?adminId=coach-a&weeks=5', 'coach-a'); assert.equal(ok.status, 200); assert.equal(ok.json.available, true); assert.equal(ok.json.weeks.length, 5); assert.ok(ok.json.weeks.every((w: any) => typeof w.weekStart === 'string' && 'pct' in w));
  assert.equal((await call('/api/admin/weekly-feedback/history?adminId=coach-a&weeks=999', 'coach-a')).json.weeks.length, 12, 'limite de 12 semanas');
  const rm = await call('/api/admin/weekly-feedback/history?adminId=coach-a&month=2026-09', 'coach-a'); assert.equal(rm.status, 200); assert.equal(rm.json.month, '2026-09'); assert.ok(rm.json.weeks.length >= 4 && Array.isArray(rm.json.months) && rm.json.months.length > 0, 'a rota repassa o mês e devolve a lista de meses'); assert.equal((await call('/api/admin/weekly-feedback/history?adminId=coach-a&month=zzz', 'coach-a')).json.month, null);
  down = true; const miss = await call('/api/admin/weekly-feedback/history?adminId=coach-a', 'coach-a'); assert.equal(miss.status, 200); assert.equal(miss.json.available, false, 'sem a tabela: avisa em vez de quebrar'); down = false;
  console.log('OK  rota do histórico: exige login e ser o próprio coach ativo, limita semanas, sem a tabela responde "indisponível"');
  process.exit(0);
})().catch((e) => { console.error('FALHOU:', e.stack || e.message); process.exit(1); });
