import assert from 'assert';
import { compactToFull, parseReps } from '/home/user/fitos-final/lib/ai/compactOutput';
let ok = 0; const t = async (name: string, fn: () => Promise<void> | void) => { try { await fn(); ok++; console.log('  ok  ' + name); } catch (e: any) { console.log('FALHOU  ' + name + '\n' + String(e?.stack || e).split('\n').slice(0, 6).join('\n')); process.exitCode = 1; } };
const C = { rest: '45', sets: 4, isCardio: false };
const techs = (ex: any) => ex.blocks.map((b: any) => b.technique);

(async () => {
  await t('parseReps: lista, texto "15-12-10-8", "15,12,10", número solto, faixa de uma série "10-12", lixo', () => {
    assert.deepEqual(parseReps([15, 12, 10, 8]), ['15', '12', '10', '8']); assert.deepEqual(parseReps(['15', ' 12 ', '10-12']), ['15', '12', '10-12']); assert.deepEqual(parseReps('15-12-10-8'), ['15', '12', '10', '8']); assert.deepEqual(parseReps('15, 12, 10'), ['15', '12', '10']); assert.deepEqual(parseReps('15/12/10'), ['15', '12', '10']);
    assert.deepEqual(parseReps(12), ['12']); assert.deepEqual(parseReps('10-12'), ['10-12'], 'faixa de UMA série'); assert.deepEqual(parseReps('12 reps'), ['12'], 'palavra solta some'); assert.deepEqual(parseReps(undefined), []); assert.deepEqual(parseReps(null), []); assert.deepEqual(parseReps([]), []); assert.deepEqual(parseReps(['x', 12]), ['12'], 'item sem número some');
  });
  await t('formato compacto vira exercício completo: 1 bloco por série (sets "1"), descanso do grupo, carga vazia (o servidor põe a certa), id vira exerciseId', () => {
    const e = compactToFull({ id: 'E001', reps: [15, 12, 10, 8] }, C); assert.equal(e.exerciseId, 'E001'); assert.equal(e.blocks.length, 4); assert.deepEqual(e.blocks.map((b: any) => b.reps), ['15', '12', '10', '8']);
    assert.ok(e.blocks.every((b: any) => b.sets === '1' && b.restTime === '45' && b.load === '' && b.technique === ''), JSON.stringify(e.blocks[0]));
    assert.equal(compactToFull({ exerciseId: 'X9', reps: [12, 12] }, C).exerciseId, 'X9', 'exerciseId também vale'); assert.equal(compactToFull({ id: 'E2', reps: '12-10-8' }, C).blocks.length, 3);
  });
  await t('técnica: drop-set e rest-pause só na ÚLTIMA série (como nos treinos reais); bi-set, tri-set, TUT, 21, cluster e GVT em todas; "normal" ou vazio = sem técnica; minúscula e acento passam', () => {
    assert.deepEqual(techs(compactToFull({ id: 'a', reps: [12, 10, 8], t: 'DROPSET' }, C)), ['', '', 'DROPSET']); assert.deepEqual(techs(compactToFull({ id: 'a', reps: [12, 10, 8], t: 'restpause' }, C)), ['', '', 'RESTPAUSE']); assert.deepEqual(techs(compactToFull({ id: 'a', reps: [12, 10], t: 'Drop-set' }, C)), ['', 'DROPSET'], 'hífen e maiúscula passam: Drop-set = DROPSET');
    for (const tc of ['BISET', 'TRISET', 'TUT', '21', 'CLUSTERSET', 'GVT']) assert.deepEqual(techs(compactToFull({ id: 'a', reps: [12, 10, 8], t: tc }, C)), [tc, tc, tc], tc);
    assert.deepEqual(techs(compactToFull({ id: 'a', reps: [12, 10], t: 'normal' }, C)), ['', '']); assert.deepEqual(techs(compactToFull({ id: 'a', reps: [12, 10] }, C)), ['', '']); assert.deepEqual(techs(compactToFull({ id: 'a', reps: [12, 10], tech: 'biset' }, C)), ['BISET', 'BISET'], 'tech/technique também valem'); assert.deepEqual(techs(compactToFull({ id: 'a', reps: [10], t: 'DROPSET' }, C)), ['DROPSET'], '1 série: a última é a única');
  });
  await t('GVT compacto ("reps":[10]) segue para o expansor de 10 séries do servidor com o bloco certo; esqueceu as repetições: série reta de 12 no número de séries do grupo (a revisão põe a pirâmide); sem grupo: 3 séries', () => {
    const g = compactToFull({ id: 'a', reps: [10], t: 'GVT' }, C); assert.equal(g.blocks.length, 1); assert.equal(g.blocks[0].technique, 'GVT');
    const miss = compactToFull({ id: 'a' }, C); assert.deepEqual(miss.blocks.map((b: any) => b.reps), ['12', '12', '12', '12']); assert.equal(compactToFull({ id: 'a', reps: [] }, { rest: '60', sets: null, isCardio: false }).blocks.length, 3);
  });
  await t('formato antigo (com "blocks") passa intacto, inclusive cardio da IA; cardio sem blocks vira o bloco padrão (20 min, 200 kcal, Moderada) ou usa [minutos, kcal]; id e exerciseId não se perdem', () => {
    const old = { exerciseId: 'E5', title: 'x', blocks: [{ sets: '1', reps: '12', load: '20kg', restTime: '60', technique: '' }] }; assert.deepEqual(compactToFull(old, C), old, 'igual ao que veio'); assert.deepEqual(compactToFull({ id: 'E7', blocks: [{ sets: '20', reps: '200', technique: 'Moderada' }] }, C).blocks, [{ sets: '20', reps: '200', technique: 'Moderada' }]);
    const car = { rest: '0', sets: null, isCardio: true }; assert.deepEqual(compactToFull({ id: 'E9' }, car).blocks, [{ sets: '20', reps: '200', load: '', restTime: '0', technique: 'Moderada' }]); assert.deepEqual(compactToFull({ id: 'E9', reps: [30, 300], t: 'Zona 2' }, car).blocks, [{ sets: '30', reps: '300', load: '', restTime: '0', technique: 'Zona 2' }]);
    assert.equal(compactToFull(null, C), null); assert.equal(compactToFull('x' as any, C), 'x');
  });
  console.log(`\n${ok} blocos ok`);
})();
