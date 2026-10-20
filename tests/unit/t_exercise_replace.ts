import assert from 'assert';
import jwt from 'jsonwebtoken';
import prisma from '@/lib/prisma';
import { GET as repGET, POST as repPOST } from '/home/user/wt-back/app/api/exercise/replace/route';
import { DELETE as libDELETE } from '/home/user/wt-back/app/api/exercise/route';
import * as R from '/home/user/wt-back/lib/exerciseReplace';
import { PAULO_ID } from '/home/user/wt-back/lib/masterIds';

const P = prisma as any; const S = P.__state;
const SECRET = 'dev-only-troque-isso-configurando-JWT_SECRET-no-env';
const tok = (id: string, role = 'COACH') => jwt.sign({ id, role, coachId: null }, SECRET);
const call = async (fn: any, url: string, as: string | null, init: any = {}) => {
  const headers: any = { 'content-type': 'application/json' }; if (as) headers.authorization = 'Bearer ' + as;
  const r = await fn(new Request('http://x' + url, { ...init, headers }));
  return { status: r.status, json: await r.json().catch(() => null) };
};
const post = (o: any) => ({ method: 'POST', body: JSON.stringify(o) });
const C1 = 'coach-1', C2 = 'coach-2';
const ex = (id: string, name: string, coachId: string | null, o: any = {}) => ({ id, name, category: 'Pernas', subCategory: 'Panturrilha', coachId, videoUrl: 'https://x/' + id + '.mp4', defaultSubstitutes: [], tags: {}, ...o });
const we = (id: string, workoutId: string, exerciseId: string, o: any = {}) => ({ id, workoutId, exerciseId, title: null, substituteId: null, substitutes: [], ...o });

const seed = () => {
  P.__reset();
  S.user.push({ id: C1, role: 'COACH', name: 'Coach Um' }, { id: C2, role: 'COACH', name: 'Coach Dois' }, { id: 's1', role: 'USER', name: 'Ana Souza' }, { id: 's2', role: 'USER', name: 'Bruno Lima' }, { id: 's3', role: 'USER', name: 'Carla Dias' });
  S.exercise.push(
    ex('old', 'Panturrilha máquina NEWTECH', C1, { videoUrl: 'https://v/panturrilha.mp4' }),
    ex('dup', 'panturrilha maquina newtech', C1, { videoUrl: 'https://v/outro.mp4' }),
    ex('vid', 'Gêmeos sentado', C1, { videoUrl: 'https://v/panturrilha.mp4' }),
    ex('sim', 'Panturrilha em pé na máquina', C1),
    ex('other', 'Supino reto', C1, { category: 'Peito', subCategory: 'Medial' }),
    ex('mine-sub', 'Panturrilha sentado', C1, { defaultSubstitutes: ['old', 'sim'] }),
    ex('c2-old', 'Panturrilha máquina NEWTECH', C2), ex('c2-x', 'Panturrilha livre', C2),
  );
  S.workout.push({ id: 'w1', userId: 's1', archived: false }, { id: 'w2', userId: 's2', archived: false }, { id: 'w3', userId: 's2', archived: true }, { id: 'w4', userId: 's3', archived: false });
  S.workoutExercise.push(
    we('r1', 'w1', 'old', { title: 'Panturrilha máquina NEWTECH' }),
    we('r2', 'w2', 'old', { title: 'Minha panturrilha do jeito do coach' }),
    we('r3', 'w3', 'old'),
    we('r4', 'w4', 'sim', { substituteId: 'old' }),
    we('r5', 'w4', 'dup', { substitutes: ['old', 'sim', 'old'] }),   // a lista cita o antigo; o dono dela é o "dup" (o novo)
    we('r6', 'w4', 'other', { substitutes: ['sim', 'old'] }),
  );
  S.exerciseHistory.push({ id: 'h1', exerciseId: 'old', exerciseName: 'Panturrilha máquina NEWTECH', weight: 60 }, { id: 'h2', exerciseId: 'old', exerciseName: 'Panturrilha máquina NEWTECH', weight: 70 }, { id: 'h3', exerciseId: 'sim', exerciseName: 'x', weight: 10 });
  S.workoutTemplate.push({ id: 't1', coachId: C1, data: JSON.stringify([{ exerciseId: 'old', title: 'Panturrilha máquina NEWTECH' }, { exerciseId: 'other' }]) }, { id: 't2', coachId: C2, data: JSON.stringify([{ exerciseId: 'old' }]) });
  S.quickWorkout.push({ id: 'q1', coachId: C1, data: JSON.stringify({ days: [{ exercises: [{ exerciseId: 'old' }] }] }) });
  S.cardioPreset.push({ id: 'c1', coachId: C1, exercises: [{ exerciseId: 'other', title: 'Supino reto', substitutes: [{ id: 'old', name: 'Panturrilha máquina NEWTECH' }] }] });
  S.mobilityPreset.push({ id: 'm1', coachId: C1, exercises: [{ exerciseId: 'old', title: 'Panturrilha máquina NEWTECH', blocks: [] }, { exerciseId: 'old', title: 'Título do coach' }] });
};
const snap = () => JSON.stringify(Object.fromEntries(Object.entries(S).filter(([k]) => !['calls', 'nextId', 'failOn'].includes(k))));   // só os dados (sem os contadores do banco de mentira)
let ok = 0, bad = 0;
const t = async (name: string, fn: () => any) => { try { seed(); await fn(); ok++; console.log('  ok  ' + name); } catch (e: any) { bad++; console.log('FALHOU ' + name + '\n   ' + (e.stack || e)); } };
const rep = (as: string | null, body: any) => call(repPOST, '/api/exercise/replace', as, post(body));
const info = (as: string | null, id = 'old', adminId = C1) => call(repGET, `/api/exercise/replace?id=${id}&adminId=${adminId}`, as);

(async () => {
  // ── funções puras ──
  await t('sugestão: nome igual (sem acento/maiúscula) e vídeo igual vêm antes dos parecidos; o de outra categoria e sem nome parecido some', () => {
    const target = S.exercise.find((e: any) => e.id === 'old'); const pool = S.exercise.filter((e: any) => e.coachId === C1);
    const r = R.rankReplacements(target, pool, 8);
    assert.deepEqual(r.map((x) => x.id), ['dup', 'vid', 'sim', 'mine-sub'], r.map((x) => x.id + ':' + x.score).join(' '));
    assert.deepEqual(r.map((x) => x.reason), ['MESMO_NOME', 'MESMO_VIDEO', 'PARECIDO', 'PARECIDO']);
    assert.ok(R.isSameExercise(r[0].reason) && R.isSameExercise(r[1].reason) && !R.isSameExercise(r[2].reason));
    assert.ok(!r.some((x) => x.id === 'old' || x.id === 'other'), 'nunca o próprio, nunca Supino para panturrilha');
    assert.equal(R.rankReplacements(target, pool, 2).length, 2, 'respeita o limite');
    const sem = R.rankReplacements({ id: 'z', name: 'Rosca direta', category: 'Biceps' }, [{ id: 'a', name: 'Panturrilha em pé', category: 'Pernas' }, { id: 'b', name: 'Rosca martelo', category: 'Biceps' }]); assert.deepEqual(sem.map((x) => x.id), ['b']);
    const nome = R.rankReplacements({ id: 'z', name: 'Agachamento sumô c/ halter', category: 'Pernas' }, [{ id: 'a', name: 'Agachamento sumô com halter', category: 'Outra' }]); assert.equal(nome[0]?.id, 'a', 'nome muito parecido vale mesmo com categoria diferente');
    assert.deepEqual(R.rankReplacements({ id: 'z', name: 'Rosca direta alternada com halter', category: 'Biceps' }, [{ id: 'a', name: 'Remada alternada com halter', category: 'Costas' }]), [], 'outra categoria com nome só um pouco parecido não serve');
    assert.equal(R.similarity('', 'x'), 0); assert.equal(R.similarity('Remada curvada', 'remada  Curvada'), 1);
  });
  await t('listas de troca: troca o id, tira repetido e tira o próprio dono; título só acompanha se era o nome do antigo', () => {
    assert.deepEqual(R.replaceInList(['a', 'old', 'b', 'old'], 'old', 'new', 'x'), ['a', 'new', 'b']);
    assert.deepEqual(R.replaceInList(['old', 'a'], 'old', 'new', 'new'), ['a'], 'o novo não vira substituto de si mesmo');
    assert.deepEqual(R.replaceInList(['a', 'new', 'old'], 'old', 'new'), ['a', 'new'], 'já tinha o novo: não duplica');
    assert.deepEqual(R.replaceInList(null, 'o', 'n'), []);
    assert.equal(R.swapTitle('Panturrilha Máquina', 'panturrilha maquina', 'Novo'), 'Novo'); assert.equal(R.swapTitle('Do coach', 'Antigo', 'Novo'), 'Do coach'); assert.equal(R.swapTitle(null, 'a', 'b'), null);
    assert.deepEqual(R.replaceIdInText('["old","x","old"]', 'old', 'new'), { text: '["new","x","new"]', count: 2 }); assert.equal(R.replaceIdInText('abc', 'old', 'new').count, 0);
    const j = R.replaceIdInJson([{ exerciseId: 'old', title: 'A', substitutes: [{ id: 'old', name: 'A' }, { id: 'z', name: 'Z' }] }], 'old', 'new', 'A', 'B'); assert.equal(j.count, 2); assert.deepEqual(j.value, [{ exerciseId: 'new', title: 'B', substitutes: [{ id: 'new', name: 'B' }, { id: 'z', name: 'Z' }] }]);
  });

  // ── GET: onde está sendo usado ──
  await t('GET: conta treinos, alunos (só primeiro nome), ficha arquivada, "troque por" e listas; e sugere quem substitui (só da mesma biblioteca)', async () => {
    const r = await info(tok(C1)); assert.equal(r.status, 200);
    assert.deepEqual({ ...r.json.usage, studentNames: [...r.json.usage.studentNames].sort() }, { rows: 3, workouts: 3, activeWorkouts: 2, students: 2, studentNames: ['Ana', 'Bruno'], asSubstitute: 1, listed: 2, defaults: 1 });
    assert.equal(r.json.inUse, true); assert.deepEqual(r.json.suggestions.map((s: any) => s.id).slice(0, 3), ['dup', 'vid', 'sim']);
    assert.ok(!r.json.suggestions.some((s: any) => ['c2-old', 'c2-x', 'old'].includes(s.id)), 'nada de outro coach nem o próprio'); assert.deepEqual(r.json.sameExercise, ['dup', 'vid']);
    assert.ok(!('tags' in r.json.suggestions[0]) && !('coachId' in r.json.suggestions[0]), 'só o que a tela precisa');
    S.workoutExercise.length = 0; S.exercise.find((e: any) => e.id === 'mine-sub').defaultSubstitutes = [];
    const free = await info(tok(C1)); assert.equal(free.json.inUse, false); assert.equal(free.json.usage.rows, 0);
  });
  await t('GET: sem login 401; coach que não é o dono 403; time master pode; exercício que não existe 404; sem id 400', async () => {
    assert.equal((await info(null)).status, 401);
    assert.equal((await info(tok(C2), 'old', C2)).status, 403, 'outro coach, mesmo com o próprio adminId');
    assert.equal((await info(tok(C1), 'old', C2)).status, 403, 'adminId de outro coach');
    assert.equal((await info(tok(PAULO_ID, 'ADMIN'), 'old', PAULO_ID)).status, 200);
    assert.equal((await info(tok(C1), 'nao-existe')).status, 404);
    assert.equal((await call(repGET, `/api/exercise/replace?adminId=${C1}`, tok(C1))).status, 400);
  });

  // ── POST: trocar e apagar ──
  await t('POST (mesmo exercício): fichas, título, "troque por", listas, padrões e histórico passam para o novo; o antigo é apagado', async () => {
    const r = await rep(tok(C1), { id: 'old', replaceWithId: 'dup', adminId: C1 }); assert.equal(r.status, 200, JSON.stringify(r.json));
    assert.deepEqual(r.json.moved, { rows: 3, substituteId: 1, lists: 2, defaults: 1, history: 2, templates: 1, quick: 1, presets: 2 });
    assert.equal(r.json.keepHistory, true, 'mesmo exercício: leva o histórico por padrão'); assert.equal(r.json.replacedBy.id, 'dup');
    assert.ok(!S.exercise.some((e: any) => e.id === 'old'), 'antigo apagado'); assert.ok(S.exercise.some((e: any) => e.id === 'c2-old'), 'o do outro coach continua');
    const row = (id: string) => S.workoutExercise.find((x: any) => x.id === id);
    assert.equal(row('r1').exerciseId, 'dup'); assert.equal(row('r1').title, 'panturrilha maquina newtech', 'título era o nome do antigo: vira o do novo');
    assert.equal(row('r2').exerciseId, 'dup'); assert.equal(row('r2').title, 'Minha panturrilha do jeito do coach', 'título escrito pelo coach não muda'); assert.equal(row('r3').exerciseId, 'dup', 'ficha arquivada também');
    assert.equal(row('r4').substituteId, 'dup'); assert.deepEqual(row('r5').substitutes, ['sim'], 'a lista do próprio novo não o cita'); assert.deepEqual(row('r6').substitutes, ['sim', 'dup']);
    assert.deepEqual(S.exercise.find((e: any) => e.id === 'mine-sub').defaultSubstitutes, ['dup', 'sim']);
    assert.ok(S.exerciseHistory.filter((h: any) => h.exerciseId === 'dup').length === 2 && S.exerciseHistory.find((h: any) => h.id === 'h3').exerciseId === 'sim');
    assert.ok(S.workoutExercise.every((x: any) => x.exerciseId !== 'old' && x.substituteId !== 'old' && !(x.substitutes || []).includes('old')), 'nada aponta mais para o antigo');
    assert.ok(S.workoutTemplate.find((x: any) => x.id === 't1').data.includes('"dup"') && !S.workoutTemplate.find((x: any) => x.id === 't1').data.includes('old')); assert.ok(S.workoutTemplate.find((x: any) => x.id === 't2').data.includes('old'), 'modelo de outro coach não é mexido');
    assert.ok(S.quickWorkout[0].data.includes('"dup"'));
    assert.deepEqual(S.cardioPreset[0].exercises[0].substitutes, [{ id: 'dup', name: 'panturrilha maquina newtech' }]);
    assert.deepEqual(S.mobilityPreset[0].exercises.map((e: any) => [e.exerciseId, e.title]), [['dup', 'panturrilha maquina newtech'], ['dup', 'Título do coach']]);
  });
  await t('POST (só parecido): o histórico de cargas NÃO vai por padrão (é outro exercício); vai se o coach pedir', async () => {
    let r = await rep(tok(C1), { id: 'old', replaceWithId: 'sim', adminId: C1 }); assert.equal(r.status, 200); assert.equal(r.json.keepHistory, false); assert.equal(r.json.moved.history, 0);
    assert.equal(S.exerciseHistory.filter((h: any) => h.exerciseId === 'old').length, 2, 'histórico fica com o id antigo');
    assert.equal(S.workoutExercise.find((x: any) => x.id === 'r1').title, 'Panturrilha em pé na máquina');
    assert.equal(S.workoutExercise.find((x: any) => x.id === 'r4').substituteId, null, 'ele era o "troque por" do próprio novo: sai (não pode ser substituto de si mesmo)');
    seed(); r = await rep(tok(C1), { id: 'old', replaceWithId: 'sim', adminId: C1, keepHistory: true }); assert.equal(r.json.moved.history, 2); assert.equal(S.exerciseHistory.filter((h: any) => h.exerciseId === 'sim').length, 3);
    seed(); r = await rep(tok(C1), { id: 'old', replaceWithId: 'dup', adminId: C1, keepHistory: false }); assert.equal(r.json.moved.history, 0, 'o coach pode recusar mesmo sendo o mesmo exercício');
  });
  await t('POST: o time master apaga exercício de coach parceiro; coach que não é dono e login ausente são barrados', async () => {
    assert.equal((await rep(null, { id: 'old', replaceWithId: 'dup', adminId: C1 })).status, 401);
    assert.equal((await rep(tok(C2), { id: 'old', replaceWithId: 'dup', adminId: C2 })).status, 403); assert.ok(S.exercise.some((e: any) => e.id === 'old'));
    assert.equal((await rep(tok(PAULO_ID, 'ADMIN'), { id: 'old', replaceWithId: 'dup', adminId: PAULO_ID })).status, 200); assert.ok(!S.exercise.some((e: any) => e.id === 'old'));
  });
  await t('POST: pedidos errados voltam 400/404 e NADA muda (mesmo id, sem substituto, substituto de outro coach, id que não existe)', async () => {
    const before = snap();
    for (const [body, st] of [[{ id: 'old', replaceWithId: 'old' }, 400], [{ id: 'old' }, 400], [{ replaceWithId: 'dup' }, 400], [{ id: 'old', replaceWithId: 'c2-x' }, 400], [{ id: 'old', replaceWithId: 'nao-existe' }, 404], [{ id: 'nao-existe', replaceWithId: 'dup' }, 404]] as any[]) {
      const r = await rep(tok(C1), { ...body, adminId: C1 }); assert.equal(r.status, st, JSON.stringify(body) + ' → ' + r.status);
    }
    assert.equal(snap(), before, 'nada foi alterado');
  });
  await t('POST: se algo falhar no meio, volta TUDO atrás (nenhuma ficha fica trocada com o exercício ainda existindo)', async () => {
    const before = snap(); S.failOn.exercise = { message: 'banco caiu', op: 'delete' };
    const r = await rep(tok(C1), { id: 'old', replaceWithId: 'dup', adminId: C1 }); assert.equal(r.status, 500); assert.match(r.json.error, /Nada foi alterado/);
    S.failOn = {}; assert.equal(snap(), before, 'tudo como estava');
    assert.ok(S.exercise.some((e: any) => e.id === 'old') && S.workoutExercise.find((x: any) => x.id === 'r1').exerciseId === 'old');
  });
  await t('apagar direto (rota antiga): quando o banco recusa por estar em ficha, devolve 409 explicando e `inUse`, e não mais "Erro ao excluir"', async () => {
    S.failOn.exercise = { message: 'FK', code: 'P2003', op: 'delete' };
    const r = await call(libDELETE, `/api/exercise?id=old&adminId=${PAULO_ID}`, tok(PAULO_ID, 'ADMIN'), { method: 'DELETE' });
    assert.equal(r.status, 409); assert.equal(r.json.inUse, true); assert.match(r.json.error, /treinos de alunos/);
    S.failOn.exercise = { message: 'outro erro', code: 'P1001', op: 'delete' };
    const o = await call(libDELETE, `/api/exercise?id=old&adminId=${PAULO_ID}`, tok(PAULO_ID, 'ADMIN'), { method: 'DELETE' }); assert.equal(o.status, 500); assert.equal(o.json.error, 'Erro ao excluir');
  });
  console.log(`\n${bad ? 'FALHOU' : 'OK'}: ${ok} ok, ${bad} falharam`); process.exit(bad ? 1 : 0);
})();
