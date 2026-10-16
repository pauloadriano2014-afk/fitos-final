import assert from 'assert';
import { diffSubstitutes } from '/home/user/fitos-final/lib/substituteDiff';
import { describeSubstitutes } from '/home/user/fitos-final/lib/workoutAdjust';
import { cleanMessage, createStudentMessage, MESSAGE_KINDS, PUSH_TITLE } from '/home/user/fitos-final/lib/studentMessages';

let ok = 0, bad = 0;
const t = async (name: string, fn: () => any) => { try { await fn(); ok++; console.log('  ok  ' + name); } catch (e: any) { bad++; console.log('FALHOU ' + name + '\n   ' + String(e && e.stack || e).split('\n').slice(0, 3).join('\n   ')); } };
const NAMES: Record<string, string> = { rc: 'Remada curvada', rch: 'Remada curvada com halteres', rcav: 'Remada cavalinho', serr: 'Serrote', sup: 'Supino reto', pux: 'Puxada frontal' };
const row = (exerciseId: string, day: string, substitutes: string[] | null = []) => ({ exerciseId, day, substitutes });

(async () => {
  await t('o caso da Thiffany: remada curvada sem substitutos ganhou 2 -> avisa com os nomes e o treino', () => {
    const before = [row('rc', 'B', []), row('sup', 'A', [])];
    const after = [row('rc', 'B', ['rch', 'rcav']), row('sup', 'A', [])];
    const r = diffSubstitutes(before, after, NAMES);
    assert.equal(r.length, 1); assert.equal(r[0].exercise, 'Remada curvada'); assert.equal(r[0].day, 'B'); assert.deepEqual(r[0].added, ['Remada curvada com halteres', 'Remada cavalinho']); assert.deepEqual(r[0].addedIds, ['rch', 'rcav']);
  });
  await t('só conta o que é NOVO: já tinha 1 e entrou mais 1 -> só o novo; nada mudou -> vazio; tirar substituto não avisa', () => {
    assert.deepEqual(diffSubstitutes([row('rc', 'B', ['rch'])], [row('rc', 'B', ['rch', 'rcav'])], NAMES).map((x) => x.added), [['Remada cavalinho']]);
    assert.deepEqual(diffSubstitutes([row('rc', 'B', ['rch', 'rcav'])], [row('rc', 'B', ['rch', 'rcav'])], NAMES), []);
    assert.deepEqual(diffSubstitutes([row('rc', 'B', ['rch', 'rcav'])], [row('rc', 'B', ['rch'])], NAMES), [], 'tirar não gera aviso');
    assert.deepEqual(diffSubstitutes([row('rc', 'B', ['rch'])], [row('rc', 'B', ['rcav'])], NAMES).map((x) => x.added), [['Remada cavalinho']], 'trocar um por outro: o novo entra');
  });
  await t('exercício NOVO na ficha (já com substitutos) não conta como "opção de troca nova"; dias diferentes não se misturam', () => {
    assert.deepEqual(diffSubstitutes([row('sup', 'A', [])], [row('sup', 'A', []), row('rc', 'B', ['rch'])], NAMES), []);
    const r = diffSubstitutes([row('rc', 'A', []), row('rc', 'B', ['rch'])], [row('rc', 'A', ['rcav']), row('rc', 'B', ['rch'])], NAMES);
    assert.equal(r.length, 1); assert.equal(r[0].day, 'A'); assert.deepEqual(r[0].added, ['Remada cavalinho']);
  });
  await t('o mesmo exercício duas vezes no dia: casa por ocorrência; vários exercícios mudando saem na ordem da ficha', () => {
    const before = [row('rc', 'B', []), row('rc', 'B', []), row('pux', 'B', [])];
    const after = [row('rc', 'B', []), row('rc', 'B', ['rch']), row('pux', 'B', ['serr'])];
    const r = diffSubstitutes(before, after, NAMES); assert.deepEqual(r.map((x) => [x.exercise, x.added]), [['Remada curvada', ['Remada curvada com halteres']], ['Puxada frontal', ['Serrote']]]);
  });
  await t('ocorrência e dia contam: se muda a PRIMEIRA vez do exercício só ela avisa; reordenar os dias não cria aviso falso', () => {
    const r1 = diffSubstitutes([row('rc', 'B', []), row('rc', 'B', ['rch'])], [row('rc', 'B', ['rcav']), row('rc', 'B', ['rch'])], NAMES); assert.deepEqual(r1.map((x) => x.added), [['Remada cavalinho']]);
    const r2 = diffSubstitutes([row('rc', 'B', ['rch']), row('rc', 'A', [])], [row('rc', 'A', ['rcav']), row('rc', 'B', ['rch'])], NAMES); assert.deepEqual(r2.map((x) => [x.day, x.added]), [['A', ['Remada cavalinho']]], 'dias trocados de ordem: só o A mudou');
  });
  await t('entradas ruins não quebram: substitutes null/undefined/lixo, linhas vazias, ids sem nome', () => {
    assert.deepEqual(diffSubstitutes([row('rc', 'B', null)], [row('rc', 'B', ['x1', 'x1', ''])], {}).map((x) => [x.exercise, x.added, x.addedIds]), [['exercício', ['outro exercício'], ['x1']]], 'repetido/vazio some, sem nome vira texto neutro');
    assert.deepEqual(diffSubstitutes([] as any, [] as any, {}), []); assert.deepEqual(diffSubstitutes(null as any, undefined as any, {}), []);
    assert.deepEqual(diffSubstitutes([{ exerciseId: 'rc', day: null } as any], [{ exerciseId: 'rc', day: undefined, substitutes: 'abc' } as any], NAMES), [], 'substitutes que não é lista é ignorado');
  });
  await t('describeSubstitutes busca os nomes no banco (1 consulta) e NUNCA derruba o salvar (erro = lista vazia)', async () => {
    let calls = 0; const db = { exercise: { findMany: async (a: any) => { calls++; return a.where.id.in.filter((i: string) => NAMES[i]).map((i: string) => ({ id: i, name: NAMES[i] })); } } };
    const r = await describeSubstitutes([row('rc', 'B', [])] as any, [row('rc', 'B', ['rch', 'rcav'])] as any, db);
    assert.equal(calls, 1); assert.deepEqual(r[0].added, ['Remada curvada com halteres', 'Remada cavalinho']); assert.equal(r[0].exercise, 'Remada curvada');
    calls = 0; assert.deepEqual(await describeSubstitutes([row('rc', 'B', ['rch'])] as any, [row('rc', 'B', ['rch'])] as any, db), []); assert.equal(calls, 0, 'nada novo: nem consulta o banco');
    const boom = { exercise: { findMany: async () => { throw new Error('banco fora'); } } }; assert.deepEqual(await describeSubstitutes([row('rc', 'B', [])] as any, [row('rc', 'B', ['rch'])] as any, boom), []);
  });
  await t('mensagem ao aluno: o tipo SUBSTITUTOS é aceito, tem título de push próprio, e os tipos antigos seguem valendo', async () => {
    assert.ok((MESSAGE_KINDS as readonly string[]).includes('SUBSTITUTOS')); for (const k of ['AJUSTE_TREINO', 'APARELHO_TROCADO', 'LIVRE']) assert.ok((MESSAGE_KINDS as readonly string[]).includes(k), k);
    assert.ok(/opções de troca/i.test(PUSH_TITLE.SUBSTITUTOS)); assert.equal(Object.keys(PUSH_TITLE).sort().join(','), [...MESSAGE_KINDS].sort().join(','), 'todo tipo tem título de push');
    const c: any = cleanMessage({ kind: 'SUBSTITUTOS', title: 'Novas opções de troca no seu treino B', body: 'Oi, Thiffany! Adicionei opções de troca...', changes: [{ type: 'SUBSTITUTO', day: 'B', exercise: 'Remada curvada', text: 'Remada curvada: remada curvada com halteres ou remada cavalinho' }], workoutId: 'w1', day: 'B' });
    assert.equal(c.ok, true); assert.equal(c.value.kind, 'SUBSTITUTOS'); assert.equal(c.value.changes[0].exercise, 'Remada curvada');
    assert.equal((cleanMessage({ kind: 'OUTRO', title: 'x', body: 'y' }) as any).ok, false);
    const created: any[] = []; const db = { studentCoachMessage: { create: async (a: any) => { created.push(a.data); return { id: 'm1', ...a.data }; } }, user: { findUnique: async () => ({ id: 's1', pushToken: 'tok' }) } };
    const r = await createStudentMessage('c1', 's1', c.value, db); assert.equal(created[0].kind, 'SUBSTITUTOS'); assert.equal(created[0].userId, 's1'); assert.equal(r.pushed, true);
  });
  console.log(`\n${ok} ok, ${bad} falhas`); process.exit(bad ? 1 : 0);
})();
