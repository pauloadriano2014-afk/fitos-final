import assert from 'assert';
import jwt from 'jsonwebtoken';
import prisma from '@/lib/prisma';
import { POST as finishPOST } from '/home/user/fitos-final/app/api/workout/finish/route';
import { GET as workoutGET } from '/home/user/fitos-final/app/api/workout/route';
import { cleanWeight, isPerSide, sideValue, describeLoad, buildLastLoads } from '/home/user/fitos-final/lib/exerciseLoad';
import fs from 'fs';
const P = prisma as any; const S = P.__state;
const tok = (id: string) => jwt.sign({ id, role: id.startsWith('c') ? 'COACH' : 'ALUNO', coachId: null }, 'dev-only-troque-isso-configurando-JWT_SECRET-no-env');
const reset = () => { P.__reset(); P.__addUser({ id: 'c1', role: 'COACH', pushToken: 'tok' }); P.__addUser({ id: 's1', name: 'Ana Souza', coachId: 'c1' }); };
const finish = async (exercisesData: any[], extra: any = {}) => { const r = await finishPOST(new Request('http://x/api/workout/finish', { method: 'POST', headers: { authorization: 'Bearer ' + tok('s1'), 'content-type': 'application/json' }, body: JSON.stringify({ userId: 's1', workoutName: 'FICHA PERNAS', day: 'A', workoutId: 'w1', exercisesData, duration: 40, rpe: 7, feedback: '', clientKey: 'k' + Math.random(), ...extra }) })); return { status: r.status, json: await r.json() }; };
const getWorkout = async (as = 's1') => { const r = await workoutGET(new Request('http://x/api/workout?userId=s1&workoutId=w1', { headers: { authorization: 'Bearer ' + tok(as) } })); return { status: r.status, json: await r.json() }; };
const ago = (n: number) => new Date(Date.now() - n * 86400000);

(async () => {
  // ── 1. helpers ──
  assert.equal(cleanWeight('40'), 40); assert.equal(cleanWeight('42,5'), 42.5); assert.equal(cleanWeight(''), 0); assert.equal(cleanWeight(null), 0); assert.equal(cleanWeight('abc'), 0); assert.equal(cleanWeight(0), 0); assert.equal(cleanWeight(' 7.25kg'), 7.25, 'igual ao parseFloat de sempre');
  assert.equal(isPerSide({ perSide: true }), true); for (const bad of [{}, { perSide: false }, { perSide: 'true' }, { perSide: 1 }, { perSide: 'sim' }, null, undefined, 'x', 7]) assert.equal(isPerSide(bad), false, 'só true de verdade: ' + JSON.stringify(bad));
  assert.equal(sideValue(40), 20); assert.equal(sideValue(45), 22.5); assert.equal(sideValue(7.5), 3.75); assert.equal(sideValue(0), 0);
  assert.equal(describeLoad(40, true), '20 kg cada lado'); assert.equal(describeLoad(45, true), '22,5 kg cada lado'); assert.equal(describeLoad(40, false), '40 kg'); assert.equal(describeLoad(42.5, false), '42,5 kg');
  const hist = [ // do mais novo para o mais velho (como o banco devolve)
    { details: [{ exerciseId: 'e1', setNumber: 1, weight: 100, perSide: true }, { exerciseId: 'e1', setNumber: 2, weight: 110, perSide: true }] },
    { details: [{ exerciseId: 'e1', setNumber: 1, weight: 60, perSide: false }, { exerciseId: 'e1', setNumber: 2, weight: 60 }, { exerciseId: 'e1', setNumber: 3, weight: 60, perSide: null }, { exerciseId: 'e2', setNumber: 1, weight: 30 }] },
  ];
  const ll = buildLastLoads(hist as any);
  assert.deepEqual(ll.weights, { e1: { 1: 100, 2: 110, 3: 60 }, e2: { 1: 30 } }, 'a mais recente vence por série; o resto continua do histórico antigo');
  assert.deepEqual(ll.modes, { e1: { 1: true, 2: true, 3: false }, e2: { 1: false } }, 'null/ausente = total');
  assert.deepEqual(buildLastLoads([]), { weights: {}, modes: {}, reps: {} }); assert.deepEqual(buildLastLoads([{ details: null }, {}] as any), { weights: {}, modes: {}, reps: {} });
  console.log('OK  ajudantes: limpeza do número, só "true" vale, metade do total, texto "cada lado", última carga por série + modo');

  // ── 2. finalizar: total fica em `weight`, `perSide` só marca o jeito de anotar ──
  reset();
  const r1 = await finish([
    { exerciseId: 'e1', name: 'Leg Press', sets: [{ index: 1, weight: '160', reps: '10', perSide: true }, { index: 2, weight: '170', reps: '10', perSide: true }] },
    { exerciseId: 'e2', name: 'Supino', sets: [{ index: 1, weight: '40', reps: '10' }, { index: 2, weight: '42,5', reps: '10', perSide: false }, { index: 3, weight: '45', reps: '8', perSide: 'true' }] },
  ]);
  assert.equal(r1.status, 200); assert.equal(r1.json.success, true);
  const rows = S.histories[0].details;
  assert.deepEqual(rows.map((d: any) => [d.exerciseId, d.setNumber, d.weight, d.perSide]), [['e1', 1, 160, true], ['e1', 2, 170, true], ['e2', 1, 40, false], ['e2', 2, 42.5, false], ['e2', 3, 45, false]], 'cada lado gravado como total + marca; app antigo (sem o campo) e valores estranhos = total');
  console.log('OK  finalizar: "cada lado" vira total + perSide=true; sem o campo (app antigo), false ou texto = total como sempre');

  // ── 3. a ficha devolve a última carga em TOTAL (igual a antes) e o modo de cada série ──
  reset();
  S.workout = { id: 'w1', name: 'FICHA PERNAS', exercises: [] };
  await finish([{ exerciseId: 'e1', name: 'Leg Press', sets: [{ index: 1, weight: '100', reps: '10' }, { index: 2, weight: '100', reps: '10' }] }]); S.histories[0].date = ago(10);
  await finish([{ exerciseId: 'e1', name: 'Leg Press', sets: [{ index: 1, weight: '160', reps: '10', perSide: true }, { index: 2, weight: '170', reps: '10', perSide: true }] }, { exerciseId: 'e9', name: 'Rosca', sets: [{ index: 1, weight: '20', reps: '12' }] }]); S.histories[1].date = ago(2);
  const g = await getWorkout(); assert.equal(g.status, 200);
  assert.deepEqual(g.json.lastWeights, { e1: { 1: 160, 2: 170 }, e9: { 1: 20 } }, 'lastWeights = total em kg, exatamente como antes (a mais recente vence)');
  assert.deepEqual(g.json.lastWeightModes, { e1: { 1: true, 2: true }, e9: { 1: false } });
  console.log('OK  GET da ficha: lastWeights continua em kg TOTAL e vem lastWeightModes (app antigo ignora o campo novo)');

  // ── 4. quem lê o número (evolução, estagnação, tonelagem) continua vendo o total ──
  const totals = S.histories.flatMap((h: any) => h.details).filter((d: any) => d.exerciseId === 'e1').map((d: any) => d.weight);
  assert.deepEqual(totals, [100, 100, 160, 170], 'mesma unidade em todo o histórico (kg total), seja qual for o jeito de anotar');
  console.log('OK  histórico: todos os registros na mesma unidade (kg total) para evolução/estagnação/volume');

  // ── 5. permissão e fiação ──
  reset(); S.workout = { id: 'w1', name: 'x', exercises: [] };
  P.__addUser({ id: 's2', name: 'Outro', coachId: 'c9' });
  const denied = await getWorkout('s2'); assert.equal(denied.status, 403);
  const src = (p: string) => fs.readFileSync('/home/user/fitos-final/' + p, 'utf8');
  assert.ok(/perSide\s+Boolean\s+@default\(false\)/.test(src('prisma/schema/workout.prisma')), 'coluna nova com padrão false (registros antigos = total)');
  assert.ok(/perSide: isPerSide\(s\)/.test(src('app/api/workout/finish/route.ts')) && /weight: cleanWeight\(s\.weight\)/.test(src('app/api/workout/finish/route.ts')));
  assert.ok(/lastWeightModes: lastWeightModesMap/.test(src('app/api/workout/route.ts')) && /buildLastLoads\(history\)/.test(src('app/api/workout/route.ts')));
  const ai = src('lib/ai/workoutGen.ts'); assert.ok(/buildLastLoads\(history\)/.test(ai) && /lastWeight: sideValue\(total\), lastWeightUnit: 'cada lado'/.test(ai) && /: \{ \.\.\.b, lastWeight: total \}/.test(ai) && /lastWeightUnit="cada lado"/.test(ai), 'a IA recebe o valor de um lado + a unidade e escreve o load igual');
  console.log('OK  acesso negado a outro coach; coluna/rotas/IA ligadas');
})().catch((e) => { console.log('FALHOU:', e); process.exit(1); });
