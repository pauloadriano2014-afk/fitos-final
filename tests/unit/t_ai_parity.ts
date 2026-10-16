import assert from 'assert';
import * as FE from '/home/user/FIT-OS-FRONTEND/src/utils/macroPlanner.js';
import * as BE from '/home/user/fitos-final/lib/macroPlanner';
import * as FC from '/home/user/FIT-OS-FRONTEND/src/components/GerarTreino/_constants.js';
import * as FH from '/home/user/FIT-OS-FRONTEND/src/components/GerarTreino/_helpers.js';
import * as SP from '/home/user/fitos-final/lib/ai/splitPresets';

// macros: a conta do servidor é a do app, em centenas de combinações
const objs = ['Hipertrofia', 'Emagrecimento', 'Definição', 'Saúde', 'Ganho de massa', 'perda de peso', '', undefined];
const genders: any[] = ['Masculino', 'Feminino', 'masculino', 'male', 'Não informado', undefined];
const births = ['1990-05-10', '10/05/1985', '2010-01-01', '1950-12-31', undefined, 'lixo'];
const cfgs: any[] = [null, { equation: 'harris' }, { equation: 'fao' }, { equation: 'cunningham', bodyFatPct: 18 }, { equation: 'manual', manualTmb: 1700 }, { goal: { mode: 'percent', value: -15 } }, { goal: { mode: 'kcal', value: -400 } }, { macros: { mode: 'gkg', protGkg: 2.4, fatGkg: 0.9 } }, { macros: { mode: 'pct', pct: { prot: 35, carb: 35, fat: 30 } } }, { kcalManual: { TREINO: 2500, DESCANSO: 1500 } }, { activity: { mode: 'factor', factor: 1.9 } }];
let n = 0;
for (const peso of [45, 62.5, 80, 110]) for (const altura of [150, 168, 185]) for (const frequencia of [0, 1, 3, 5, 7]) for (const objetivo of objs) for (const g of genders) for (const b of births) {
  const cfg = cfgs[n % cfgs.length]; n++;
  const a = { peso, altura, frequencia, objetivo, gender: n % 3 === 0 ? g : undefined };
  const x = FE.calcWeeklyPlan(a, b, g, null, cfg), y = BE.calcWeeklyPlan(a, b, g, null, cfg);
  assert.deepEqual(y, x, `macros divergem: ${JSON.stringify({ a, b, g, cfg })}`);
}
assert.ok(n > 2000, 'combinações testadas: ' + n);
assert.equal(BE.calcAge('1990-01-01'), FE.calcAge('1990-01-01')); assert.deepEqual(BE.sanitizeTargets({ equation: 'x' }), FE.sanitizeTargets({ equation: 'x' }));
assert.deepEqual(BE.suggestWeekDistribution(4, 'Hipertrofia'), FE.suggestWeekDistribution(4, 'Hipertrofia'));

// presets de divisão
assert.deepEqual(SP.MUSCLE_GROUPS, FC.MUSCLE_GROUPS); assert.deepEqual(SP.DEFAULT_LIMITATION_RULES, FC.DEFAULT_LIMITATION_RULES);
for (const g of ['Feminino', 'Masculino', undefined, 'Não informado']) {
  assert.deepEqual(SP.buildPresets(g), FC.buildPresets(g), 'presets ' + g);
  for (let f = 0; f <= 8; f++) assert.deepEqual(SP.buildDefaultSplit(f, g), FH.buildDefaultSplit(f, g), `split ${f} ${g}`);
}
for (const e of [[], ['Em Casa'], ['Academia Completa'], ['Em Casa', 'Academia Completa'], ['Academia de Condomínio'], ['Academia de Condomínio', 'Academia Completa'], ['Em Casa', 'Academia de Condomínio'], undefined])
  assert.equal(SP.deriveTrainingEnvironment(e as any), FH.deriveTrainingEnvironment(e as any), 'ambiente ' + JSON.stringify(e));
for (const o of ['Emagrecimento', 'Definição', 'Força', 'Hipertrofia', '', undefined]) assert.equal(SP.suggestPhase(o as any), FH.suggestPhase(o as any));
for (const ph of ['EMAGRECIMENTO', 'DEFINICAO', 'HIPERTROFIA', 'FORCA']) for (const groups of [[{ id: 'PEITO' }], [{ id: 'QUADRICEPS' }], [{ id: 'PEITO' }, { id: 'CARDIO' }], [{ id: 'ABDOMEN' }], []]) assert.equal(SP.dayNeedsCardio(groups, ph), FH.dayNeedsCardio(groups, ph));
console.log('OK paridade app x servidor: macros (' + n + ' combinações) e presets de divisão');
