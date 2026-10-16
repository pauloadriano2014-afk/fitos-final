import assert from 'assert';
import { resolveTechnique } from '/home/user/fitos-final/lib/voiceWorkout/techniques';
import { normalizeReps } from '/home/user/fitos-final/lib/voiceWorkout/normalize';
const T: Array<[string, any]> = [
 ['drop set','DROPSET'],['Drop-Set','DROPSET'],['dropset','DROPSET'],['DROPSET','DROPSET'],['drop','DROPSET'],
 ['rest pause','RESTPAUSE'],['rest-pause','RESTPAUSE'],['Rest Pause','RESTPAUSE'],['restpause','RESTPAUSE'],
 ['bi-set','BISET'],['bi set','BISET'],['biset','BISET'],['tri-set','TRISET'],['triset','TRISET'],
 ['método 21','21'],['21','21'],['metodo vinte e um','21'],
 ['cluster','CLUSTERSET'],['cluster set','CLUSTERSET'],['1.5 reps','1_5_REPS'],['uma e meia','1_5_REPS'],['1 e meio','1_5_REPS'],
 ['TUT','TUT'],['tempo sob tensão','TUT'],['GVT','GVT'],['método GVT','GVT'],['método alemão','GVT'],['volume alemão','GVT'],
 ['normal',null],['',null],[null as any,null],['nenhuma',null],['OUTRA','UNKNOWN'],['superset','UNKNOWN'],['pirâmide','UNKNOWN'],
];
for (const [i,e] of T) assert.equal(resolveTechnique(i), e, `resolveTechnique(${JSON.stringify(i)})`);
const R: Array<[any,any]> = [['12','12'],[12,'12'],['8 a 10','8-10'],['8 à 10','8-10'],['8–10','8-10'],['8-10','8-10'],['até a falha','Falha'],['falha','Falha'],
 ['máximo','Máx'],['10 reps','10'],['10 repetições','10'],['abc',null],['',null],[null,null],[0,null],['1000',null]];
for (const [i,e] of R) assert.equal(normalizeReps(i), e, `normalizeReps(${JSON.stringify(i)})`);
console.log('OK', T.length, 'variações de técnica +', R.length, 'formatos de repetição');

import { TECH_DEFAULTS } from '/home/user/fitos-final/lib/voiceWorkout/techniques';
import { normalizeExercise } from '/home/user/fitos-final/lib/voiceWorkout/normalize';
const m21 = normalizeExercise({ nome_falado: 'rosca scott', tecnica_geral: '21', blocos: [{ series: 3 }] } as any, null)!;
assert.deepEqual(m21.blocks.map(b => [b.sets, b.reps, b.technique]), [['3','21','21']]);
assert.ok(m21.assumed.includes('reps'));
const m21b = normalizeExercise({ nome_falado: 'rosca scott', tecnica_geral: '21', blocos: [{ series: 2, reps: '12' }] } as any, null)!;
assert.equal(m21b.blocks[0].reps, '12', 'o que o coach falou vence o padrão');
assert.equal(TECH_DEFAULTS['21']?.reps, '21');
console.log('OK  método 21: padrão 21 reps; reps faladas vencem');
