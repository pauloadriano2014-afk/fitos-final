import assert from 'assert';
import { pyramidReps, shapeReps, variantFor, cleanRepChoice, choiceReps, describeRepChoice } from '/home/user/fitos-final/lib/ai/repSchemes';
import { refineWorkout, repRange, type GenEx, type RefineCtx, type PlanDay } from '/home/user/fitos-final/lib/ai/workoutPlanner';
let ok = 0; const t = async (name: string, fn: () => Promise<void> | void) => { try { await fn(); ok++; console.log('  ok  ' + name); } catch (e: any) { console.log('FALHOU  ' + name + '\n' + String(e?.stack || e).split('\n').slice(0, 6).join('\n')); process.exitCode = 1; } };
const B = (reps: string[], tech = '', sets = '1') => reps.map((r) => ({ sets, reps: r, load: '', restTime: '60', technique: tech }));
const H: [number, number] = [8, 15];

(async () => {
  await t('esquemas da hipertrofia = os do histórico: 3 séries 15-12-10 / 12-10-8 / 15-12-12; 4 séries 15-12-10-8 / 12-10-8-8 / 15-12-12-10; composto usa o mais pesado', () => {
    assert.deepEqual(pyramidReps(3, 'HIPERTROFIA', H, 0), ['15', '12', '10']); assert.deepEqual(pyramidReps(3, 'HIPERTROFIA', H, 1), ['12', '10', '8']); assert.deepEqual(pyramidReps(3, 'HIPERTROFIA', H, 2), ['15', '12', '12']);
    assert.deepEqual(pyramidReps(4, 'HIPERTROFIA', H, 0), ['15', '12', '10', '8']); assert.deepEqual(pyramidReps(4, 'HIPERTROFIA', H, 1), ['12', '10', '8', '8']); assert.deepEqual(pyramidReps(4, 'HIPERTROFIA', H, 2), ['15', '12', '12', '10']);
    assert.deepEqual(pyramidReps(2, 'hipertrofia', H), ['15', '12']); assert.equal(pyramidReps(5, undefined, H)!.length, 5, 'sem fase = hipertrofia'); assert.equal(pyramidReps(8, 'HIPERTROFIA', H)!.length, 8, 'mais de 6 séries: repete a última'); assert.equal(pyramidReps(1, 'HIPERTROFIA', H), null, '1 série não tem pirâmide');
    assert.equal(variantFor(true, 0), 1); assert.equal(variantFor(true, 5), 1); assert.deepEqual([0, 1, 2, 3, 4, 5].map((i) => variantFor(false, i)), [0, 0, 2, 0, 0, 2], 'isolados: 1 a cada 3 usa a variação');
  });
  await t('outras fases seguem a faixa delas; deload não vira pirâmide; faixa curta (iniciante) não inventa nada', () => {
    assert.deepEqual(pyramidReps(3, 'FORCA', [3, 6]), ['6', '5', '4']); assert.deepEqual(pyramidReps(4, 'CHOQUE', [6, 12]), ['12', '10', '8', '6']); assert.deepEqual(pyramidReps(3, 'EMAGRECIMENTO', [12, 20]), ['20', '15', '15']); assert.deepEqual(pyramidReps(4, 'DEFINICAO', [12, 15]), ['15', '15', '12', '12']);
    assert.equal(pyramidReps(3, 'DELOAD', [15, 20]), null); assert.deepEqual(pyramidReps(3, 'HIPERTROFIA', [8, 10], 1), ['10', '10', '8'], 'cada repetição respeita a faixa do nível'); assert.deepEqual(pyramidReps(3, 'HIPERTROFIA', [8, 10], 0), ['10', '10', '10'], 'a faixa deixou tudo igual: o chamador não muda nada');
    const flat = B(['10', '10', '10']); assert.strictEqual(shapeReps(flat, { phase: 'FORCA', range: [10, 10] }), flat, 'faixa de 1 número: tudo igual, devolve os mesmos blocos');
  });
  await t('shapeReps: só mexe quando TODAS as séries têm a mesma repetição; quem já varia, técnicas com repetição própria, 1 série e blocos com várias séries ficam como estão', () => {
    const r = shapeReps(B(['12', '12', '12', '12']), { phase: 'HIPERTROFIA', range: H }); assert.deepEqual(r.map((b) => b.reps), ['15', '12', '10', '8']); assert.ok(r.every((b) => b.sets === '1' && b.restTime === '60'), 'o resto do bloco fica igual');
    const comp = shapeReps(B(['10', '10', '10']), { phase: 'HIPERTROFIA', range: H, compound: true }); assert.deepEqual(comp.map((b) => b.reps), ['12', '10', '8']);
    const varies = B(['15', '12', '10']); assert.strictEqual(shapeReps(varies, { phase: 'HIPERTROFIA', range: H }), varies, 'já varia: intacto'); const half = B(['12', '12', '10']); assert.strictEqual(shapeReps(half, { phase: 'HIPERTROFIA', range: H }), half);
    for (const tech of ['DROPSET', 'RESTPAUSE', '21', 'CLUSTERSET', 'GVT', 'TUT']) { const b = B(['10', '10', '10'], tech); assert.strictEqual(shapeReps(b, { phase: 'HIPERTROFIA', range: H }), b, tech + ' mantém a repetição da técnica'); }
    assert.deepEqual(shapeReps(B(['10', '10', '10'], 'BISET'), { phase: 'HIPERTROFIA', range: H }).map((b) => b.reps), ['15', '12', '10'], 'bi-set: repetição comum, vira pirâmide'); assert.deepEqual(shapeReps(B(['10', '10'], 'TRISET'), { phase: 'HIPERTROFIA', range: H }).map((b) => b.reps), ['15', '12']);
    const one = B(['12']); assert.strictEqual(shapeReps(one, { phase: 'HIPERTROFIA', range: H }), one); const multi = B(['12', '12', '12'], '', '3'); assert.strictEqual(shapeReps(multi, { phase: 'HIPERTROFIA', range: H }), multi, 'bloco com 3 séries dentro: não mexe');
    const faixa = B(['10-12', '10-12', '10-12']); assert.strictEqual(shapeReps(faixa, { phase: 'HIPERTROFIA', range: H }), faixa, 'faixa escrita (10-12): intacta'); const del = B(['15', '15', '15']); assert.strictEqual(shapeReps(del, { phase: 'DELOAD', range: [15, 20] }), del);
    assert.deepEqual(shapeReps([], { phase: 'HIPERTROFIA', range: H }), []);
  });
  await t('a revisão do treino (refineWorkout) aplica a pirâmide em todo o treino: composto mais pesado, isolados 15-12-10, 1 a cada 3 com variação; cardio, técnicas e treino que já varia ficam; nada fora da faixa', () => {
    const lib = (id: string, name: string, mech: string) => ({ id, name, category: 'Musculação', subCategory: 'PEITO', videoUrl: '', tags: { target: 'PEITO', mechanic: mech, equipment: 'MAQUINA' }, environments: ['UNIVERSAL'], defaultSubstitutes: [] });
    const exs = [lib('p1', 'Supino', 'COMPOSTO'), lib('p2', 'Crucifixo', 'ISOLADO'), lib('p3', 'Peck deck', 'ISOLADO'), lib('p4', 'Crossover', 'ISOLADO')];
    const gx = (e: any, reps: string[], tech = ''): GenEx => ({ exerciseId: e.id, title: e.name, videoUrl: '', category: e.category, subCategory: e.subCategory, observation: '', substitute: null, blocks: B(reps, tech) });
    const days: PlanDay[] = [{ name: 'A', groups: [{ id: 'PEITO', qty: 4, sets: 4, rest: 60 }] }];
    const base: any = { days, phase: 'HIPERTROFIA', level: 'INTERMEDIARIO', levelRules: false, lib: new Map(exs.map((e) => [e.id, e])), pool: exs, cands: { byGroup: new Map([['PEITO', exs]]), latestNames: new Set(), olderNames: new Set() }, facts: [], hasPrev: false, env: 'UNIVERSAL', jointRisks: [], unavailable: new Set(), loaded: new Set(), pins: new Set(), makeEx: (e: any, blocks: any[]) => gx(e, blocks.map((b) => b.reps)) };
    const r = refineWorkout({ A: exs.map((e) => gx(e, ['12', '12', '12', '12'])) }, base as RefineCtx); const A = r.byDay.A; const rp = (ex: GenEx) => ex.blocks.map((b) => b.reps).join('-');
    assert.equal(rp(A[0]), '12-10-8-8', 'composto: o mais pesado'); assert.equal(rp(A[1]), '15-12-10-8'); assert.equal(rp(A[2]), '15-12-12-10', '3º da lista: variação'); assert.equal(rp(A[3]), '15-12-10-8'); assert.equal((r.quality.stats as any).repsShaped, 4);
    const keep = refineWorkout({ A: [gx(exs[0], ['15', '12', '10', '8']), gx(exs[1], ['10', '10', '10', '10'], 'DROPSET'), gx(exs[2], ['12', '12', '12', '12']), gx(exs[3], ['12', '12', '12', '12'])] }, base as RefineCtx).byDay.A; assert.equal(rp(keep[0]), '15-12-10-8', 'já variava: igual'); assert.equal(rp(keep[1]), '10-10-10-10', 'drop-set: igual');
    const fora = refineWorkout({ A: exs.map((e) => gx(e, ['20', '20', '20', '20'])) }, base as RefineCtx).byDay.A; assert.ok(fora.every((e) => e.blocks.every((b) => Number(b.reps) >= 8 && Number(b.reps) <= 15)) && new Set(rp(fora[1]).split('-')).size > 1, 'a faixa da fase continua mandando: 20 vira 15 e depois pirâmide');
    const deload = refineWorkout({ A: exs.map((e) => gx(e, ['15', '15', '15', '15'])) }, { ...base, phase: 'DELOAD' } as RefineCtx).byDay.A; assert.ok(deload.every((e) => new Set(e.blocks.map((b) => b.reps)).size === 1), 'deload: repetição igual é o esperado');
    const forca = refineWorkout({ A: exs.map((e) => gx(e, ['5', '5', '5', '5'])) }, { ...base, phase: 'FORCA' } as RefineCtx).byDay.A; assert.equal(rp(forca[1]), '6-5-4-4'); assert.deepEqual(repRange('FORCA', null), [3, 6]);
  });
  await t('a revisão do treino respeita a escolha do coach em todos os exercícios (reta 10 e faixa 15→8), inclusive no deload; sem escolha continua a pirâmide automática', () => {
    const lib = (id: string, name: string, mech: string) => ({ id, name, category: 'Musculação', subCategory: 'PEITO', videoUrl: '', tags: { target: 'PEITO', mechanic: mech, equipment: 'MAQUINA' }, environments: ['UNIVERSAL'], defaultSubstitutes: [] });
    const exs = [lib('p1', 'Supino', 'COMPOSTO'), lib('p2', 'Crucifixo', 'ISOLADO'), lib('p3', 'Peck deck', 'ISOLADO')];
    const gx = (e: any, reps: string[], tech = ''): GenEx => ({ exerciseId: e.id, title: e.name, videoUrl: '', category: e.category, subCategory: e.subCategory, observation: '', substitute: null, blocks: B(reps, tech) });
    const days: PlanDay[] = [{ name: 'A', groups: [{ id: 'PEITO', qty: 3, sets: 4, rest: 60 }] }];
    const base: any = { days, phase: 'HIPERTROFIA', level: 'INTERMEDIARIO', levelRules: false, lib: new Map(exs.map((e) => [e.id, e])), pool: exs, cands: { byGroup: new Map([['PEITO', exs]]), latestNames: new Set(), olderNames: new Set() }, facts: [], hasPrev: false, env: 'UNIVERSAL', jointRisks: [], unavailable: new Set(), loaded: new Set(), pins: new Set(), makeEx: (e: any, blocks: any[]) => gx(e, blocks.map((b) => b.reps)) };
    const rp = (ex: GenEx) => ex.blocks.map((b) => b.reps).join('-'); const run = (ctx: any, input: GenEx[]) => refineWorkout({ A: input }, { ...base, ...ctx } as RefineCtx).byDay.A;
    const mixed = () => [gx(exs[0], ['15', '12', '10', '8']), gx(exs[1], ['12', '12', '12', '12']), gx(exs[2], ['10', '10', '10', '10'], 'DROPSET')];
    const reta = run({ repChoice: { mode: 'RETA', flat: 10 } }, mixed()); assert.equal(rp(reta[0]), '10-10-10-10'); assert.equal(rp(reta[1]), '10-10-10-10'); assert.equal(rp(reta[2]), '10-10-10-10', 'drop-set manteve a repetição da técnica');
    const faixa = run({ repChoice: { mode: 'FAIXA', from: 15, to: 8 } }, mixed()); assert.equal(rp(faixa[0]), '15-12-10-8'); assert.equal(rp(faixa[1]), '15-12-10-8'); assert.equal(rp(faixa[2]), '10-10-10-10');
    const dl = run({ phase: 'DELOAD', repChoice: { mode: 'PESADA' } }, [gx(exs[0], ['15', '15', '15', '15']), gx(exs[1], ['15', '15', '15', '15']), gx(exs[2], ['15', '15', '15', '15'])]); assert.equal(rp(dl[1]), '12-10-8-8', 'escolha explícita vence o deload');
    const auto = run({}, [gx(exs[0], ['12', '12', '12', '12']), gx(exs[1], ['12', '12', '12', '12']), gx(exs[2], ['12', '12', '12', '12'])]); assert.equal(rp(auto[0]), '12-10-8-8'); assert.equal(rp(auto[1]), '15-12-10-8', 'sem escolha: pirâmide automática de antes');
  });
  await t('escolha do coach: lê o que vem da tela (quebrado/antigo vira AUTO), limita 3–30, inverte faixa ao contrário, faixa de um número vira reta', () => {
    assert.deepEqual(cleanRepChoice(undefined), { mode: 'AUTO' }); assert.deepEqual(cleanRepChoice('lixo'), { mode: 'AUTO' }); assert.deepEqual(cleanRepChoice({ mode: 'banana' }), { mode: 'AUTO' }); assert.deepEqual(cleanRepChoice({ mode: 'leve' }), { mode: 'LEVE' }); assert.deepEqual(cleanRepChoice({ mode: 'PESADA', flat: 99 }), { mode: 'PESADA' });
    assert.deepEqual(cleanRepChoice({ mode: 'RETA', flat: 12 }), { mode: 'RETA', flat: 12 }); assert.deepEqual(cleanRepChoice({ mode: 'RETA' }), { mode: 'RETA', flat: 12 }, 'sem número: 12'); assert.deepEqual(cleanRepChoice({ mode: 'RETA', flat: 500 }), { mode: 'RETA', flat: 30 }); assert.deepEqual(cleanRepChoice({ mode: 'RETA', flat: 1 }), { mode: 'RETA', flat: 3 });
    assert.deepEqual(cleanRepChoice({ mode: 'FAIXA', from: 15, to: 8 }), { mode: 'FAIXA', from: 15, to: 8 }); assert.deepEqual(cleanRepChoice({ mode: 'FAIXA', from: 8, to: 15 }), { mode: 'FAIXA', from: 15, to: 8 }, 'ao contrário: inverte'); assert.deepEqual(cleanRepChoice({ mode: 'FAIXA', from: 10, to: 10 }), { mode: 'RETA', flat: 10 }); assert.deepEqual(cleanRepChoice({ mode: 'FAIXA', from: 'x', to: 8 }), { mode: 'AUTO' });
  });
  await t('repetições da escolha: leve 15-12-10(-8), pesada 12-10-8(-8), reta, e faixa A→B com números redondos (15→8: 15-12-10-8); AUTO não decide nada', () => {
    assert.deepEqual(choiceReps({ mode: 'LEVE' }, 3), ['15', '12', '10']); assert.deepEqual(choiceReps({ mode: 'LEVE' }, 4), ['15', '12', '10', '8']); assert.deepEqual(choiceReps({ mode: 'PESADA' }, 3), ['12', '10', '8']); assert.deepEqual(choiceReps({ mode: 'PESADA' }, 4), ['12', '10', '8', '8']); assert.equal(choiceReps({ mode: 'LEVE' }, 8)!.length, 8);
    assert.deepEqual(choiceReps({ mode: 'RETA', flat: 10 }, 4), ['10', '10', '10', '10']); assert.deepEqual(choiceReps({ mode: 'FAIXA', from: 15, to: 8 }, 4), ['15', '12', '10', '8']); assert.deepEqual(choiceReps({ mode: 'FAIXA', from: 15, to: 10 }, 3), ['15', '12', '10']); assert.deepEqual(choiceReps({ mode: 'FAIXA', from: 20, to: 12 }, 4), ['20', '15', '15', '12']); assert.deepEqual(choiceReps({ mode: 'FAIXA', from: 12, to: 6 }, 2), ['12', '6']);
    assert.equal(choiceReps({ mode: 'AUTO' }, 4), null); assert.equal(choiceReps(undefined, 4), null); assert.equal(choiceReps({ mode: 'RETA', flat: 10 }, 1), null, '1 série: nada a fazer');
    assert.equal(describeRepChoice({ mode: 'AUTO' }), ''); assert.match(describeRepChoice({ mode: 'RETA', flat: 12 }), /MESMA repetição.*: 12/); assert.match(describeRepChoice({ mode: 'FAIXA', from: 15, to: 8 }), /de 15 até 8.*15\/12\/10\/8/); assert.match(describeRepChoice({ mode: 'PESADA' }), /PESADA/);
  });
  await t('shapeReps com escolha explícita: vale mesmo se a IA já variou, no deload e na faixa fora da fase; técnica com repetição própria e bloco com várias séries ficam', () => {
    const v = B(['15', '12', '10', '8']); assert.deepEqual(shapeReps(v, { phase: 'HIPERTROFIA', range: H, choice: { mode: 'RETA', flat: 10 } }).map((b) => b.reps), ['10', '10', '10', '10'], 'reta vale sobre a pirâmide que a IA mandou');
    assert.deepEqual(shapeReps(B(['15', '15', '15']), { phase: 'DELOAD', range: [15, 20], choice: { mode: 'PESADA' } }).map((b) => b.reps), ['12', '10', '8'], 'escolha explícita vence o deload'); assert.deepEqual(shapeReps(B(['12', '12', '12']), { phase: 'HIPERTROFIA', range: H, choice: { mode: 'FAIXA', from: 20, to: 12 } }).map((b) => b.reps), ['20', '15', '12'], 'e a faixa da fase (8–15)');
    const same = B(['15', '12', '10']); assert.strictEqual(shapeReps(same, { phase: 'HIPERTROFIA', range: H, choice: { mode: 'LEVE' } }), same, 'já está certo: mesmo objeto');
    for (const tech of ['DROPSET', 'RESTPAUSE', '21', 'CLUSTERSET', 'GVT']) { const b = B(['10', '10', '10'], tech); assert.strictEqual(shapeReps(b, { phase: 'HIPERTROFIA', range: H, choice: { mode: 'RETA', flat: 15 } }), b, tech); }
    const multi = B(['12', '12'], '', '3'); assert.strictEqual(shapeReps(multi, { phase: 'HIPERTROFIA', range: H, choice: { mode: 'LEVE' } }), multi); assert.deepEqual(shapeReps(B(['10', '10'], 'BISET'), { phase: 'HIPERTROFIA', range: H, choice: { mode: 'RETA', flat: 12 } }).map((b) => b.reps), ['12', '12']);
    assert.deepEqual(shapeReps(B(['12', '12', '12']), { phase: 'HIPERTROFIA', range: H, choice: { mode: 'AUTO' } }).map((b) => b.reps), ['15', '12', '10'], 'AUTO = comportamento de antes');
  });
  console.log(`\n${ok} blocos ok`);
})();
