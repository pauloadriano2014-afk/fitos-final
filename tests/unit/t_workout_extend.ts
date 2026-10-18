import assert from 'assert';
import jwt from 'jsonwebtoken';
import prisma from '@/lib/prisma';
import { POST as extendPOST } from '/home/user/fitos-final/app/api/workout/extend/route';
import { computeNewEnd, parseExtendDays, parseExtendStudents, extendCurrentWorkouts, DAY_MS, MAX_EXTEND_STUDENTS } from '/home/user/fitos-final/lib/workoutExtend';
import { PAULO_ID } from '/home/user/fitos-final/lib/masterIds';
import { dateKeyBrt } from '/home/user/fitos-final/lib/agenda';

const P = prisma as any; const S = P.__state;
const SECRET = 'dev-only-troque-isso-configurando-JWT_SECRET-no-env';
const tok = (id: string, role = 'COACH', coachId: string | null = null) => jwt.sign({ id, role, coachId }, SECRET);
const call = async (body: any, as: string | null) => {
  const headers: any = { 'content-type': 'application/json' }; if (as) headers.authorization = 'Bearer ' + as;
  const r = await extendPOST(new Request('http://x/api/workout/extend', { method: 'POST', headers, body: JSON.stringify(body) }));
  return { status: r.status, json: await r.json().catch(() => null) };
};
const NOW = new Date('2026-10-18T15:00:00Z');   // domingo 12h em Brasília
const at = (iso: string) => new Date(iso);
const seed = () => {
  P.__reset();
  S.user.push({ id: 'cA', role: 'COACH', coachId: null }, { id: 'cB', role: 'COACH', coachId: null });
  S.user.push({ id: 's1', role: 'USER', coachId: 'cA' }, { id: 's2', role: 'USER', coachId: 'cA' }, { id: 's3', role: 'USER', coachId: 'cB' });
};
const W = (id: string, userId: string, endDate: string | null, createdAt: string, archived = false) => S.workout.push({ id, userId, name: id, archived, endDate: endDate ? at(endDate) : null, createdAt: at(createdAt) });
const endOf = (id: string) => S.workout.find((w: any) => w.id === id).endDate as Date;
let ok = 0; const t = async (name: string, fn: () => Promise<void> | void) => { try { await fn(); ok++; console.log('  ok  ' + name); } catch (e: any) { console.log('FALHOU  ' + name + '\n' + String(e?.stack || e).split('\n').slice(0, 5).join('\n')); process.exitCode = 1; } };

(async () => {
  await t('regras puras: só 1, 3 ou 7 dias; lista de alunos limpa; conta a partir do vencimento (ou de agora se já venceu)', () => {
    for (const [v, e] of [[1, 1], ['3', 3], [' 7 ', 7], [2, null], [0, null], [-1, null], ['abc', null], [null, null], [undefined, null], [30, null], [1.5, null]] as const) assert.strictEqual(parseExtendDays(v), e, String(v));
    assert.deepStrictEqual(parseExtendStudents({ studentId: 'a' }), ['a']); assert.deepStrictEqual(parseExtendStudents({ studentIds: ['a', 'b', 'a', ' ', '', 5, 'c '] }), ['a', 'b', 'c']);
    assert.strictEqual(parseExtendStudents({}), null); assert.strictEqual(parseExtendStudents({ studentIds: [] }), null); assert.strictEqual(parseExtendStudents({ studentIds: Array.from({ length: 61 }, (_, i) => 'x' + i) }), null); assert.strictEqual(parseExtendStudents({ studentIds: Array.from({ length: 60 }, (_, i) => 'x' + i) })!.length, 60);
    const future = at('2026-10-19T15:00:00Z'); assert.strictEqual(computeNewEnd(future, NOW, 1).getTime(), future.getTime() + DAY_MS, 'vence amanhã: +1 dia vira depois de amanhã'); assert.strictEqual(computeNewEnd(future, NOW, 7).getTime(), future.getTime() + 7 * DAY_MS);
    const old = at('2026-10-01T15:00:00Z'); assert.strictEqual(computeNewEnd(old, NOW, 1).getTime(), NOW.getTime() + DAY_MS, 'vencido há semanas: conta a partir de agora, não do passado'); assert.strictEqual(computeNewEnd(old, NOW, 3).getTime(), NOW.getTime() + 3 * DAY_MS);
    assert.strictEqual(computeNewEnd(NOW, NOW, 1).getTime(), NOW.getTime() + DAY_MS, 'vence exatamente agora: conta a partir de agora');
  });

  await t('prorrogar: treino que vence amanhã anda o dia certo; o dia de Brasília muda exatamente N dias', async () => {
    seed(); W('w1', 's1', '2026-10-19T20:00:00Z', '2026-09-20T00:00:00Z');
    const r: any = await extendCurrentWorkouts(P, 's1', 3, NOW); assert.strictEqual(r.ok, true); assert.strictEqual(r.count, 1); assert.strictEqual(r.wasExpired, false);
    assert.strictEqual(dateKeyBrt(endOf('w1')), '2026-10-22', 'de 19 para 22'); assert.strictEqual(r.newEnd, endOf('w1').toISOString()); assert.strictEqual(r.previousEnd, '2026-10-19T20:00:00.000Z');
  });
  await t('prorrogar: treino JÁ vencido volta a valer (conta de agora) e avisa que estava vencido', async () => {
    seed(); W('w1', 's1', '2026-10-10T20:00:00Z', '2026-09-01T00:00:00Z');
    const r: any = await extendCurrentWorkouts(P, 's1', 1, NOW); assert.strictEqual(r.ok, true); assert.strictEqual(r.wasExpired, true);
    assert.ok(endOf('w1').getTime() > NOW.getTime() + 20 * 3600 * 1000, 'ficou valendo até amanhã'); assert.strictEqual(dateKeyBrt(endOf('w1')), '2026-10-19');
  });
  await t('prorrogar: treinos A/B/C do mesmo vencimento andam juntos; o de outra data, o arquivado e o de outro aluno não mexem', async () => {
    seed(); W('a', 's1', '2026-10-20T20:00:00Z', '2026-09-20T00:00:03Z'); W('b', 's1', '2026-10-20T21:00:00Z', '2026-09-20T00:00:02Z'); W('c', 's1', '2026-10-20T22:00:00Z', '2026-09-20T00:00:01Z');
    W('antigo', 's1', '2026-08-01T20:00:00Z', '2026-07-01T00:00:00Z'); W('arq', 's1', '2026-10-20T20:00:00Z', '2026-09-30T00:00:00Z', true); W('outro', 's2', '2026-10-20T20:00:00Z', '2026-09-20T00:00:00Z');
    const antes = { antigo: endOf('antigo').getTime(), arq: endOf('arq').getTime(), outro: endOf('outro').getTime() };
    const r: any = await extendCurrentWorkouts(P, 's1', 7, NOW); assert.strictEqual(r.ok, true); assert.strictEqual(r.count, 3);
    for (const id of ['a', 'b', 'c']) assert.strictEqual(dateKeyBrt(endOf(id)), '2026-10-27', id);
    assert.strictEqual(endOf('antigo').getTime(), antes.antigo, 'treino antigo do mesmo aluno fica'); assert.strictEqual(endOf('arq').getTime(), antes.arq, 'arquivado não é mexido'); assert.strictEqual(endOf('outro').getTime(), antes.outro, 'outro aluno não é mexido');
  });
  await t('prorrogar: sem treino ativo, só arquivado, ou treino SEM prazo = mensagem clara e nada muda', async () => {
    seed(); let r: any = await extendCurrentWorkouts(P, 's1', 1, NOW); assert.strictEqual(r.ok, false); assert.ok(/não tem treino ativo/.test(r.error));
    W('arq', 's1', '2026-10-20T20:00:00Z', '2026-09-30T00:00:00Z', true); r = await extendCurrentWorkouts(P, 's1', 1, NOW); assert.strictEqual(r.ok, false);
    W('sp', 's1', null, '2026-10-01T00:00:00Z'); const before = S.workout.map((w: any) => w.endDate && w.endDate.getTime()); r = await extendCurrentWorkouts(P, 's1', 1, NOW); assert.strictEqual(r.ok, false); assert.ok(/sem prazo|não tem prazo/.test(r.error));
    assert.deepStrictEqual(S.workout.map((w: any) => w.endDate && w.endDate.getTime()), before, 'nada mudou');
  });

  await t('rota: sem login 401; dias inválidos e lista vazia/grande 400; o aluno NÃO prorroga o próprio treino', async () => {
    seed(); W('w1', 's1', '2026-10-20T20:00:00Z', '2026-09-20T00:00:00Z');
    assert.strictEqual((await call({ studentId: 's1', days: 1 }, null)).status, 401);
    assert.strictEqual((await call({ studentId: 's1', days: 2 }, tok('cA'))).status, 400); assert.strictEqual((await call({ studentId: 's1' }, tok('cA'))).status, 400); assert.strictEqual((await call({ days: 1 }, tok('cA'))).status, 400); assert.strictEqual((await call({ studentIds: [], days: 1 }, tok('cA'))).status, 400);
    const before = endOf('w1').getTime(); const r = await call({ studentId: 's1', days: 1 }, tok('s1', 'USER', 'cA')); assert.strictEqual(r.status, 200); assert.strictEqual(r.json.ok, false, 'o aluno não conseguiu'); assert.strictEqual(r.json.results[0].ok, false); assert.strictEqual(endOf('w1').getTime(), before, 'treino intocado');
  });
  await t('rota: coach prorroga o aluno DELE; aluno de outro coach responde igual a "não existe"; master prorroga qualquer um; vários de uma vez, cada um com seu resultado', async () => {
    seed(); W('w1', 's1', '2026-10-20T20:00:00Z', '2026-09-20T00:00:00Z'); W('w2', 's2', null, '2026-09-20T00:00:00Z'); W('w3', 's3', '2026-10-20T20:00:00Z', '2026-09-20T00:00:00Z');
    let r = await call({ studentIds: ['s1', 's2', 's3', 'nao-existe'], days: 3 }, tok('cA')); assert.strictEqual(r.status, 200); assert.strictEqual(r.json.ok, true); assert.strictEqual(r.json.days, 3);
    const by = Object.fromEntries(r.json.results.map((x: any) => [x.studentId, x])); assert.strictEqual(by.s1.ok, true); assert.ok(by.s1.newEnd); assert.strictEqual(by.s2.ok, false); assert.ok(/prazo/.test(by.s2.error)); assert.strictEqual(by.s3.ok, false); assert.strictEqual(by.s3.error, by['nao-existe'].error, 'não revela aluno de outro coach');
    assert.strictEqual(dateKeyBrt(endOf('w1')), '2026-10-23'); assert.strictEqual(dateKeyBrt(endOf('w3')), '2026-10-20', 'aluno do outro coach intocado');
    r = await call({ studentId: 's3', days: 1 }, tok(PAULO_ID)); assert.strictEqual(r.json.results[0].ok, true, 'master pode'); assert.strictEqual(dateKeyBrt(endOf('w3')), '2026-10-21');
    r = await call({ studentId: 's1', days: 1 }, tok('cB')); assert.strictEqual(r.json.ok, false); assert.strictEqual(dateKeyBrt(endOf('w1')), '2026-10-23', 'coach errado não mexe');
  });
  await t('rota: dado quebrado em um aluno não derruba os outros; banco fora do ar vira erro genérico (sem detalhe interno) e nada muda', async () => {
    seed(); W('w1', 's1', '2026-10-20T20:00:00Z', '2026-09-20T00:00:00Z'); W('w2', 's2', '2026-10-20T20:00:00Z', '2026-09-20T00:00:00Z');
    S.workout.find((x: any) => x.id === 'w1').endDate = 'lixo';   // data inválida gravada por engano (texto)
    let r = await call({ studentIds: ['s1', 's2'], days: 1 }, tok('cA')); const by = Object.fromEntries(r.json.results.map((x: any) => [x.studentId, x]));
    assert.strictEqual(by.s1.ok, false); assert.strictEqual(by.s1.error, 'Não foi possível prorrogar agora.'); assert.strictEqual(by.s2.ok, true); assert.strictEqual(dateKeyBrt(endOf('w2')), '2026-10-21');
    seed(); W('w1', 's1', '2026-10-20T20:00:00Z', '2026-09-20T00:00:00Z'); S.failOn.workout = { message: 'segredo-interno' };
    r = await call({ studentIds: ['s1'], days: 1 }, tok('cA')); assert.strictEqual(r.status, 200); assert.strictEqual(r.json.ok, false); assert.ok(!JSON.stringify(r.json).includes('segredo-interno'), 'não vaza detalhe do banco'); delete S.failOn.workout;
    assert.strictEqual(dateKeyBrt(endOf('w1')), '2026-10-20');
  });
  console.log(`\n${process.exitCode ? 'FALHOU' : 'OK'}: ${ok} blocos ok`);
})();
