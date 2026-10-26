import assert from 'assert';
import prisma from '@/lib/prisma';
import * as AP from '/home/user/fitos-final/lib/autoPlan';
import * as Q from '/home/user/fitos-final/lib/autoPlanQuality';
import { generateWorkoutPlan } from '/home/user/fitos-final/lib/ai/workoutGen';
import { estimateArgonUsd } from '/home/user/fitos-final/lib/ai/argon';
import { PAULO_ID, ADRI_ID } from '/home/user/fitos-final/lib/masterIds';

const db: any = (prisma as any).__db;
const G: any = globalThis;
AP.tuning.retryDelayMs = 5;
const quiet = async <T,>(fn: () => Promise<T>) => { const w = console.warn, e = console.error; console.warn = console.error = () => {}; try { return await fn(); } finally { console.warn = w; console.error = e; } };
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const waitFor = async (cond: () => any, ms = 4000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await cond()) return true; await sleep(10); } return false; };
const TERMINAL = ['DONE', 'FAILED', 'MANUAL'];
const settle = async (runId: string) => { assert.ok(await waitFor(async () => TERMINAL.includes(((await AP.runStore.get(runId)) as any)?.status)), 'corrida terminou'); return (await AP.runStore.get(runId)) as any; };

(async () => {
  // ═════ 1) Triagem (pura) ═════
  const born = (years: number, birthdayPassed = true) => { const d = new Date(); d.setFullYear(d.getFullYear() - years); d.setDate(d.getDate() + (birthdayPassed ? -1 : 1)); return d.toISOString().slice(0, 10); };   // faz exatamente `years` anos (ou falta 1 dia para fazer)
  const clean = { peso: 70, altura: 170, imc: 24.2, healthConditions: ['Nenhuma'], medications: ['Nenhum'], limitacoes: ['Nenhuma'], cirurgias: ['Nenhuma'], bariatric: false };
  const fat = { fatLoss: true }, muscle = { fatLoss: false };
  const adult = { birthDate: '1990-05-10' };
  let t = Q.triage(clean, adult, fat); assert.equal(t.manual, null); assert.deepEqual(t.conservative, []); assert.deepEqual(t.excludeJointRisk, [], '"Nenhuma/Nenhum/Nenhuma" não contam como limitação');
  const man = (a: any, u: any = adult, s: any = fat) => Q.triage({ ...clean, ...a }, u, s).manual;
  assert.equal(man({ healthConditions: ['Gestante'] })!.code, 'GESTANTE_LACTANTE'); assert.equal(man({ healthConditions: ['Lactante (amamentando)'] })!.code, 'GESTANTE_LACTANTE'); assert.equal(man({ healthConditions: ['Grávida'] })!.code, 'GESTANTE_LACTANTE');
  assert.equal(man({}, { birthDate: born(15) })!.code, 'MENOR_DE_IDADE'); assert.equal(man({}, { birthDate: born(16, false) })!.code, 'MENOR_DE_IDADE', 'falta 1 dia para os 16: ainda menor'); assert.equal(man({}, { birthDate: born(16) }), null, '16 anos já pode');
  assert.equal(man({}, { birthDate: null }), null, 'sem data de nascimento não vira "menor"'); assert.equal(man({}, { birthDate: 'lixo' }), null);
  assert.equal(man({ imc: 18.4 })!.code, 'IMC_BAIXO'); assert.equal(man({ imc: 18.5 }), null, '18,5 ainda passa'); assert.equal(man({ imc: 17 }, adult, muscle), null, 'IMC baixo só trava quem quer emagrecer');
  assert.equal(man({ imc: 40 })!.code, 'OBESIDADE_GRAU_3'); assert.equal(man({ imc: 39.9 }), null); assert.equal(man({ imc: 41 }, adult, muscle)!.code, 'OBESIDADE_GRAU_3', 'obesidade grau III trava qualquer objetivo');
  assert.equal(man({ imc: undefined, peso: 45, altura: 170 })!.code, 'IMC_BAIXO', 'sem IMC salvo, calcula por peso e altura'); assert.equal(man({ imc: undefined, peso: 130, altura: 170 })!.code, 'OBESIDADE_GRAU_3'); assert.equal(man({ imc: undefined, peso: undefined, altura: undefined }), null, 'sem medidas: não trava');
  assert.equal(man({ bariatric: true })!.code, 'BARIATRICA'); assert.equal(man({ bariatric: 'yes' }), null, 'só o booleano da anamnese vale'); assert.equal(man({ healthConditions: ['Diabetes Tipo 1'] })!.code, 'DIABETES_TIPO_1'); assert.equal(man({ healthConditions: ['Diabetes Tipo 2'] }), null, 'DM2 não trava (modo seguro)');
  const multi = man({ healthConditions: ['Gestante', 'Diabetes Tipo 1'], bariatric: true })!; assert.equal(multi.code, 'GESTANTE_LACTANTE', 'o código é o primeiro motivo'); assert.ok(multi.reason.includes('Gestante') && multi.reason.includes('bariátrica') && multi.reason.includes('Diabetes tipo 1'), 'a mensagem lista todos: ' + multi.reason);
  // modo seguro
  const cons = (a: any, u: any = adult, s: any = fat) => Q.triage({ ...clean, ...a }, u, s).conservative;
  assert.deepEqual(cons({ healthConditions: ['Hipertensão'] }), ['Hipertensão']); assert.ok(cons({ healthConditions: ['Resistência à Insulina'] })[0].startsWith('Diabetes tipo 2')); assert.ok(cons({ healthConditions: ['Pré-diabetes'] }).length === 1); assert.deepEqual(cons({ healthConditions: ['Hipertireoidismo'] }), ['Hipertireoidismo']);
  assert.deepEqual(cons({ healthConditions: ['Hipotireoidismo'] }), [], 'hipotireoidismo não precisa de modo seguro (a dieta já trata)');
  assert.ok(cons({ medications: ['Anti-hipertensivo', 'Metformina'] })[0].includes('Anti-hipertensivo') && !cons({ medications: ['Metformina'] }).length); assert.ok(cons({ medications: ['Corticoide'] })[0].includes('Corticoide'));
  assert.deepEqual(cons({}, { birthDate: born(60) }), ['Idade 60 anos'], 'exatamente 60 anos: modo seguro'); assert.deepEqual(cons({}, { birthDate: born(61) }), ['Idade 61 anos']); assert.deepEqual(cons({}, { birthDate: born(60, false) }), [], 'falta 1 dia para os 60: ainda não');
  assert.ok(cons({ imc: 35 })[0].startsWith('IMC 35')); assert.deepEqual(cons({ imc: 34.9 }), []);
  assert.deepEqual(cons({ limitacoes: ['Punho', 'Cervical'] }), ['Limitações/cirurgias: Punho, Cervical']); assert.equal(Q.triage({ ...clean, limitacoes: ['Punho'] }, adult, fat).excludeJointRisk.length, 0, 'articulação sem etiqueta na biblioteca: só modo seguro');
  const jr = (a: any) => Q.triage({ ...clean, ...a }, adult, fat).excludeJointRisk.sort();
  assert.deepEqual(jr({ limitacoes: ['Joelho'] }), ['JOELHO']); assert.deepEqual(jr({ cirurgias: ['LCA/Menisco'] }), ['JOELHO']); assert.deepEqual(jr({ limitacoes: ['Lombar'], cirurgias: ['Hérnia'] }), ['LOMBAR']); assert.deepEqual(jr({ cirurgias: ['Coluna'] }), ['LOMBAR']); assert.deepEqual(jr({ limitacoes: ['Ombro'], cirurgias: ['Manguito'] }), ['OMBRO']); assert.deepEqual(jr({ limitacoes: ['Joelho', 'Lombar', 'Ombro'] }), ['JOELHO', 'LOMBAR', 'OMBRO']);
  assert.equal(man({ healthConditions: ['Amamentando'] })!.code, 'GESTANTE_LACTANTE'); assert.equal(man({ healthConditions: ['Lactante'] })!.code, 'GESTANTE_LACTANTE'); assert.equal(man({ healthConditions: ['Gestante'] })!.code, 'GESTANTE_LACTANTE'); assert.equal(man({ healthConditions: ['Grávida'] })!.code, 'GESTANTE_LACTANTE'); assert.equal(man({ healthConditions: ['GESTANTE'] })!.code, 'GESTANTE_LACTANTE', 'sem diferenciar maiúscula/acento');
  assert.deepEqual(cons({ limitacoes: ['', 'Joelho'] }), ['Limitações/cirurgias: Joelho'], 'item vazio não conta'); assert.deepEqual(Q.triage({ ...clean, limitacoes: null, cirurgias: undefined, healthConditions: undefined, medications: 'Corticoide' } as any, adult, fat).conservative, [], 'valor que não é lista é ignorado (nada de "null" virando limitação)');
  assert.deepEqual(jr({ cirurgias: ['Hérnia'] }), ['LOMBAR']); assert.deepEqual(jr({ cirurgias: ['Manguito'] }), ['OMBRO']); assert.deepEqual(jr({ limitacoes: ['Lombar'] }), ['LOMBAR']); assert.deepEqual(jr({ cirurgias: ['Abdominoplastia', 'Prótese de Silicone', 'Cesárea'] }), [], 'cirurgia sem etiqueta na biblioteca não filtra');
  assert.equal(Q.imcOf({ imc: Infinity, peso: 70, altura: 170 })! > 24 && Q.imcOf({ imc: Infinity, peso: 70, altura: 170 })! < 25, true, 'IMC infinito é ignorado');
  assert.deepEqual(Q.safeTechniques(['BISET', 'TRISET', 'DROPSET', 'RESTPAUSE']), ['BISET']); assert.deepEqual(Q.safeTechniques(['DROPSET']), []);
  assert.equal(Q.imcOf({ imc: 22 }), 22); assert.ok(Math.abs(Q.imcOf({ peso: 70, altura: 170 })! - 24.22) < 0.01); assert.equal(Q.imcOf({}), null); assert.equal(Q.imcOf({ imc: 0, peso: 0, altura: 170 }), null);

  // ═════ 2) Cobertura da biblioteca depois do filtro de articulação ═════
  assert.deepEqual(Q.TARGET_ALIASES, { PERNAS_MULTI: ['PERNAS_MULTI'], QUADRICEPS: ['QUADRICEPS', 'PERNAS', 'PERNAS_MULTI'], POSTERIORES: ['POSTERIORES', 'POSTERIOR', 'PERNAS', 'PERNAS_MULTI'], GLUTEOS: ['GLUTEOS', 'PERNAS', 'PERNAS_MULTI'], PANTURRILHA: ['PANTURRILHA'], ADUTOR: ['ADUTOR', 'PERNAS', 'PERNAS_MULTI'], ABDUTOR: ['ABDUTOR', 'GLUTEOS', 'PERNAS', 'PERNAS_MULTI'], COSTAS_PUXADA: ['COSTAS_PUXADA', 'COSTAS'], COSTAS_REMADA: ['COSTAS_REMADA', 'COSTAS'], COSTAS_LOMBAR: ['COSTAS_LOMBAR'], OMBRO_MULTI: ['OMBRO_MULTI', 'OMBROS', 'OMBRO_FRONTAL'], OMBRO_FRONTAL: ['OMBRO_FRONTAL', 'OMBROS'], OMBRO_LATERAL: ['OMBRO_LATERAL', 'OMBROS'], OMBRO_POST: ['OMBRO_POST', 'OMBROS'], TRAPEZIO: ['TRAPEZIO', 'OMBROS'], PEITO: ['PEITO', 'PEITO_SUPERIOR', 'PEITO_MEDIAL', 'PEITO_INFERIOR'], PEITO_SUPERIOR: ['PEITO_SUPERIOR'], PEITO_MEDIAL: ['PEITO_MEDIAL'], PEITO_INFERIOR: ['PEITO_INFERIOR'], BICEPS: ['BICEPS'], TRICEPS: ['TRICEPS'], ANTEBRACO: ['ANTEBRACO'], ABDOMEN: ['ABDOMEN', 'ABDÔMEN'], CARDIO: ['CARDIO'] }, 'mapa grupo do plano → target da biblioteca');
  assert.deepEqual(Q.aliasesOf('POSTERIORES'), ['POSTERIORES', 'POSTERIOR', 'PERNAS', 'PERNAS_MULTI']); assert.deepEqual(Q.aliasesOf('PERNAS_MULTI'), ['PERNAS_MULTI']); assert.deepEqual(Q.aliasesOf('XYZ'), ['XYZ']); assert.ok(Q.aliasesOf('OMBRO_MULTI').includes('OMBROS')); assert.ok(Q.aliasesOf('ABDUTOR').includes('GLUTEOS'));
  const daysQ = [{ name: 'A', groups: [{ id: 'QUADRICEPS', qty: 3 }, { id: 'CARDIO', qty: 1 }, { id: 'MOBILIDADE', qty: 2 }] }, { name: 'B', groups: [{ id: 'QUADRICEPS', qty: 2 }, { id: 'PEITO', qty: 2 }] }];
  const bankBefore = ['QUADRICEPS', 'QUADRICEPS', 'QUADRICEPS', 'PERNAS', 'PEITO', 'PEITO', 'CARDIO'];
  assert.deepEqual(Q.jointFilterIssues(daysQ, bankBefore, bankBefore), [], 'sem tirar nada, sem problema');
  assert.deepEqual(Q.jointFilterIssues(daysQ, bankBefore, ['QUADRICEPS', 'PERNAS', 'PEITO', 'PEITO', 'CARDIO']), [], 'sobraram 2: ok');
  const iss = Q.jointFilterIssues(daysQ, bankBefore, ['PERNAS', 'PEITO', 'PEITO']); assert.equal(iss.length, 1); assert.ok(iss[0].startsWith('QUADRICEPS: sobraram 1 de 4'), iss[0]);
  assert.equal(Q.jointFilterIssues(daysQ, ['PEITO'], ['PEITO']).length, 0, 'grupo que já tinha menos de 2 não é culpa do filtro'); assert.deepEqual(Q.jointFilterIssues(daysQ, [...bankBefore, 'PEITO'], ['QUADRICEPS', 'QUADRICEPS', 'PERNAS']).map((x) => x.split(':')[0]), ['PEITO'], 'peito esvaziado');
  assert.deepEqual(Q.jointFilterIssues([{ name: 'A', groups: [{ id: 'PEITO', qty: 2 }] }], ['PEITO', 'PEITO'], ['PEITO']), ['PEITO: sobraram 1 de 2 exercícios depois de tirar os de risco'], 'tinha exatamente 2 e sobrou 1: vale');
  assert.deepEqual(Q.jointFilterIssues([{ name: 'A', groups: [{ id: 'MOBILIDADE', qty: 2 }] }], ['MOBILIDADE', 'MOBILIDADE'], []), [], 'mobilidade não entra na conta');
  assert.ok(!Q.jointFilterIssues([{ name: 'A', groups: [{ id: 'CARDIO', qty: 1 }] }], ['CARDIO', 'CARDIO'], []).length, 'cardio e mobilidade não entram na conta');

  // ═════ 3) Conferência do treino (pura) ═════
  const mk = (id: string, cat = 'Musculação', n = 4, technique = '') => ({ exerciseId: id, title: id, category: cat, blocks: Array.from({ length: n }, () => ({ sets: '1', reps: '12', load: '20kg', restTime: '60', technique })) });
  const days = [
    { name: 'A', groups: [{ id: 'PEITO', qty: 2, sets: 4 }, { id: 'TRICEPS', qty: 2, sets: 3 }, { id: 'CARDIO', qty: 1, sets: 1 }] },
    { name: 'B', groups: [{ id: 'QUADRICEPS', qty: 3, sets: 4 }, { id: 'GLUTEOS', qty: 2, sets: 4 }, { id: 'MOBILIDADE', qty: 4 }] },
  ];
  const meta: any = { p1: { target: 'PEITO' }, p2: { target: 'PEITO' }, t1: { target: 'TRICEPS' }, t2: { target: 'TRICEPS' }, c1: { target: 'CARDIO' }, q1: { target: 'QUADRICEPS' }, q2: { target: 'QUADRICEPS' }, q3: { target: 'QUADRICEPS' }, g1: { target: 'GLUTEOS' }, g2: { target: 'GLUTEOS' } };
  const goodA = () => [mk('p1'), mk('p2'), mk('t1', 'Musculação', 3), mk('t2', 'Musculação', 3), mk('c1', 'Cardio', 1)];
  const goodB = () => [mk('q1'), mk('q2'), mk('q3'), mk('g1'), mk('g2')];
  const run = (byDay: any, m = meta, cfg: any = { days }) => Q.checkWorkout(cfg, { workoutName: 'x', exercisesByDay: byDay }, m);
  let r = run({ A: goodA(), B: goodB() }); assert.deepEqual(r.blocking, []); assert.deepEqual(r.notes, []); assert.equal(r.repairs, 0); assert.deepEqual(r.body.workoutTabs, ['A', 'B']); assert.equal(r.body.workoutName, 'x', 'o resto do corpo é preservado'); assert.equal(r.body.exercisesByDay.A.length, 5);
  // repetido
  r = run({ A: [...goodA(), mk('p1')], B: goodB() }); assert.equal(r.body.exercisesByDay.A.length, 5, 'repetido sai'); assert.equal(r.repairs, 1); assert.ok(r.notes.some((n) => n.includes('repetido')));
  r = run({ A: [mk('p1'), mk('p1'), mk('p2'), mk('t1', 'Musculação', 3), mk('c1', 'Cardio', 1)], B: goodB() }); assert.equal(r.body.exercisesByDay.A.map((e: any) => e.exerciseId).join(), 'p1,p2,t1,c1', 'fica o primeiro'); assert.ok(r.notes.some((n) => n.includes('Dia A: 4 de 5')), 'e avisa que ficou com menos: ' + r.notes);
  // séries
  const a6 = goodA(); a6[0] = mk('p1', 'Musculação', 6); a6[2] = mk('t1', 'Musculação', 1); const input = { A: a6, B: goodB() };
  r = run(input); assert.equal(r.body.exercisesByDay.A[0].blocks.length, 4, '6 blocos viram 4'); assert.equal(r.body.exercisesByDay.A[2].blocks.length, 3, '1 bloco vira 3'); assert.deepEqual(r.body.exercisesByDay.A[2].blocks[2], a6[2].blocks[0], 'os novos copiam o último'); assert.equal(r.repairs, 2); assert.equal(a6[0].blocks.length, 6, 'o original não é alterado');
  for (const tech of ['GVT', 'DROPSET', 'RESTPAUSE', '21', 'CLUSTERSET']) { const a = goodA(); a[0] = mk('p1', 'Musculação', 10, tech); r = run({ A: a, B: goodB() }); assert.equal(r.body.exercisesByDay.A[0].blocks.length, 10, tech + ' tem regra própria de blocos'); assert.equal(r.repairs, 0); }
  { const a = goodA(); a[0] = mk('p1', 'Musculação', 6, 'BISET'); r = run({ A: a, B: goodB() }); assert.equal(r.body.exercisesByDay.A[0].blocks.length, 4, 'BISET não tem regra própria'); }
  { const a = goodA(); a[0] = mk('px', 'Musculação', 6); r = run({ A: a, B: goodB() }, meta); assert.equal(r.body.exercisesByDay.A[0].blocks.length, 6, 'exercício sem target conhecido: não mexe'); }
  { const ambiguous = [{ name: 'A', groups: [{ id: 'QUADRICEPS', qty: 1, sets: 4 }, { id: 'GLUTEOS', qty: 1, sets: 3 }] }]; const m2 = { x: { target: 'PERNAS' } }; r = run({ A: [mk('x', 'Musculação', 6), mk('y', 'Musculação', 4)] }, m2, { days: ambiguous }); assert.equal(r.body.exercisesByDay.A[0].blocks.length, 6, 'dois grupos com séries diferentes para o mesmo target: não adivinha'); }
  { const alias = [{ name: 'A', groups: [{ id: 'POSTERIORES', qty: 2, sets: 3 }] }]; r = run({ A: [mk('x', 'Musculação', 5), mk('y', 'Musculação', 3)] }, { x: { target: 'POSTERIOR' }, y: { target: 'POSTERIOR' } }, { days: alias }); assert.equal(r.body.exercisesByDay.A[0].blocks.length, 3, 'POSTERIOR da biblioteca vale como POSTERIORES do plano'); }
  { const a = goodA(); a[4] = mk('c1', 'Cardio', 3); r = run({ A: a, B: goodB() }); assert.equal(r.body.exercisesByDay.A[4].blocks.length, 3, 'cardio não é normalizado'); }
  { const a = goodA(); a[0] = { ...mk('p1'), blocks: [] }; r = run({ A: a, B: goodB() }); assert.equal(r.body.exercisesByDay.A[0].blocks.length, 0, 'sem blocos não inventa'); }
  { const d10 = [{ name: 'A', groups: [{ id: 'PEITO', qty: 10, sets: 4 }] }]; const m10: any = {}; const ex10 = (n: number) => Array.from({ length: n }, (_, i) => { m10['e' + i] = { target: 'PEITO' }; return mk('e' + i); });
    r = run({ A: ex10(7) }, m10, { days: d10 }); assert.deepEqual(r.blocking, [], '7 de 10 (70%) passa'); assert.deepEqual(r.notes, ['Dia A: 7 de 10 exercícios']); r = run({ A: ex10(6) }, m10, { days: d10 }); assert.deepEqual(r.blocking, ['Dia A: só 6 de 10 exercícios'], '6 de 10 (60%) refaz'); }
  { const nosets = [{ name: 'A', groups: [{ id: 'PEITO', qty: 2 }] }]; r = run({ A: [mk('p1', 'Musculação', 6), mk('p2', 'Musculação', 4)] }, meta, { days: nosets as any }); assert.equal(r.body.exercisesByDay.A[0].blocks.length, 6, 'grupo sem séries definidas: não mexe'); assert.equal(r.repairs, 0); }
  { const pyr = (loads: string[]) => ({ exerciseId: 'p1', title: 'p1', category: 'Musculação', blocks: loads.map((l) => ({ sets: '1', reps: '12', load: l, restTime: '60', technique: '' })) }); const a = goodA(); a[0] = pyr(['10', '20']) as any; r = run({ A: a, B: goodB() }); assert.deepEqual(r.body.exercisesByDay.A[0].blocks.map((b: any) => b.load), ['10', '20', '20', '20'], 'séries que faltam copiam o último bloco'); }
  // dia vazio, ausente, poucos exercícios
  r = run({ A: goodA(), B: [] }); assert.deepEqual(r.blocking, ['Dia B veio sem exercícios']); r = run({ A: goodA() }); assert.deepEqual(r.blocking, ['Dia B veio sem exercícios']); assert.deepEqual(r.body.workoutTabs, ['A'], 'só entram os dias com exercício');
  r = run({ A: goodA().slice(0, 3), B: goodB() }); assert.ok(r.blocking[0].includes('Dia A: só 3 de 5'), 'abaixo de 70% refaz (3 de 5 é 60%)');
  r = run({ A: [mk('p1'), mk('p2'), mk('t1', 'Musculação', 3), mk('c1', 'Cardio', 1)], B: goodB() }); assert.deepEqual(r.blocking, [], '4 de 5 (80%) passa'); assert.ok(r.notes.some((n) => n === 'Dia A: 4 de 5 exercícios'));
  r = run({ A: goodA(), B: [mk('q1'), mk('q2'), mk('g1')] }); assert.deepEqual(r.blocking, ['Dia B: só 3 de 5 exercícios'], 'B pede 3+2 (a mobilidade não conta): 3 de 5 é 60%');
  // mobilidade não entra na conta (B pede 3+2+4 mas só 5 contam)
  assert.equal(run({ A: goodA(), B: goodB() }).blocking.length, 0, 'mobilidade manual não conta como exercício pedido à IA');
  // cardio
  r = run({ A: goodA().slice(0, 4), B: goodB() }); assert.ok(r.blocking.some((b) => b === 'Dia A veio sem cardio'), 'plano pede cardio e não veio');
  { const a = goodA().slice(0, 4); a.push(mk('c1', 'Musculação', 1)); r = run({ A: a, B: goodB() }); assert.deepEqual(r.blocking, [], 'cardio reconhecido pelo target da biblioteca'); }
  { const a = goodA().slice(0, 4); a.push(mk('cx', 'Cardio', 1)); r = run({ A: a, B: goodB() }, meta); assert.deepEqual(r.blocking, [], 'cardio reconhecido pela categoria'); }
  { const noCardio = [{ name: 'A', groups: [{ id: 'PEITO', qty: 2, sets: 4 }] }]; r = run({ A: [mk('p1'), mk('p2')] }, meta, { days: noCardio }); assert.deepEqual(r.blocking, [], 'sem cardio pedido, sem cobrança'); }
  // dia que a IA inventou
  r = run({ A: goodA(), B: goodB(), C: goodA() }); assert.deepEqual(Object.keys(r.body.exercisesByDay), ['A', 'B']); assert.ok(r.repairs >= 1 && r.notes.some((n) => n.includes('C')), 'dia C removido: ' + r.notes); assert.deepEqual(r.body.workoutTabs, ['A', 'B']);
  assert.equal(Q.checkWorkout({ days }, { exercisesByDay: undefined }, {}).blocking.length, 2, 'corpo sem exercisesByDay: todos os dias faltam'); assert.equal(Q.checkWorkout({ days }, null, {}).blocking.length, 2);
  // cargas
  const bl = Q.blankLoads({ workoutName: 'w', exercisesByDay: { A: goodA() } }); assert.ok(bl.exercisesByDay.A.every((e: any) => e.blocks.every((b: any) => b.load === '')), 'cargas em branco'); assert.equal(bl.exercisesByDay.A[0].blocks[0].reps, '12', 'o resto do bloco fica'); assert.equal(bl.workoutName, 'w'); const orig = goodA(); Q.blankLoads({ exercisesByDay: { A: orig } }); assert.equal(orig[0].blocks[0].load, '20kg', 'não altera o original'); assert.deepEqual(Q.blankLoads({}).exercisesByDay, {});

  // ═════ 4) Conferência da dieta (pura) ═════
  const it = (id: string, group: string, kcal100: number, amount: number, name = id) => ({ id, name, groupId: group, calories_per_100: kcal100, amount: String(amount) });
  const allowed = new Set(['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']);
  const meal = (name: string, items: any[]) => ({ name, items });
  const okMeals = () => [meal('Café', [it('a', 'g1', 100, 400), it('b', 'g1', 100, 400)]), meal('Almoço', [it('c', 'g2', 100, 800), it('d', 'g3', 100, 200)]), meal('Jantar', [it('e', 'g4', 100, 400)])];
  assert.equal(Q.dayKcal(okMeals()), 1800, 'só o 1º item de cada grupo conta'); assert.equal(Q.dayKcal([meal('x', [it('a', 'g', 100, 100)]), meal('y', [it('a', 'g', 100, 100)])]), 200, 'grupos de refeições diferentes não se misturam'); assert.equal(Q.dayKcal([]), 0);
  let dc = Q.checkDietDay(okMeals(), 1800, allowed); assert.deepEqual(dc.blocking, []); assert.equal(dc.removed, 0); assert.equal(dc.kcal, 1800); assert.equal(dc.meals.length, 3);
  dc = Q.checkDietDay([meal('Café', [it('a', 'g1', 100, 400), it('z', 'g1', 100, 400, 'Queijo X')]), ...okMeals().slice(1)], 1800, allowed); assert.equal(dc.removed, 1); assert.deepEqual(dc.meals[0].items.map((x: any) => x.id), ['a']); assert.ok(dc.notes[0].includes('Queijo X')); assert.deepEqual(dc.blocking, [], '1 de 5 (20%): só conserta');
  const many = (n: number) => [meal('Café', [it('a', 'g1', 100, 400), ...Array.from({ length: n }, (_, i) => it('z' + i, 'g1', 100, 400))]), ...okMeals().slice(1)];
  assert.deepEqual(Q.checkDietDay(many(1), 1800, allowed).blocking, [], '1 de 5 (20%) passa');
  { const meals = [meal('Café', [it('a', 'g1', 100, 400), it('z1', 'g1', 100, 400)]), meal('Almoço', [it('c', 'g2', 100, 800), it('d', 'g3', 100, 200), it('z2', 'g3', 100, 200)]), meal('Jantar', [it('e', 'g4', 100, 400), it('f', 'g4', 100, 400)]), meal('Ceia', [it('g', 'g5', 0, 100), it('h', 'g5', 0, 100), it('a', 'g6', 0, 10)])]; dc = Q.checkDietDay(meals, 1800, allowed); assert.equal(dc.removed, 2); assert.equal(dc.meals.flatMap((m: any) => m.items).length, 8); assert.deepEqual(dc.blocking, [], '2 de 10 (20%) ainda passa'); }
  dc = Q.checkDietDay(many(2), 1800, allowed); assert.ok(dc.blocking.some((b) => b.includes('2 de 6')), 'acima de 20% (2 de 6) refaz: ' + dc.blocking);
  dc = Q.checkDietDay(okMeals().slice(0, 2), 1400, allowed); assert.ok(dc.blocking.some((b) => b === 'Só 2 refeições'), 'menos de 3 refeições'); assert.deepEqual(Q.checkDietDay([], 1800, allowed).blocking.length >= 1, true);
  dc = Q.checkDietDay([meal('Café', [it('z', 'g1', 100, 400)]), ...okMeals().slice(1)], 1400, allowed); assert.ok(dc.blocking.some((b) => b.includes('Refeição sem alimento: Café')), 'refeição que ficou vazia');
  const kcalMeals = (k: number) => [meal('A', [it('a', 'g1', 100, k - 600)]), meal('B', [it('c', 'g2', 100, 400)]), meal('C', [it('e', 'g3', 100, 200)])];   // soma exatamente k kcal
  assert.equal(Q.dayKcal(kcalMeals(1760)), 1760);
  assert.deepEqual(Q.checkDietDay(kcalMeals(1760), 2000, allowed).blocking, [], 'exatamente 12% abaixo da meta passa'); assert.ok(Q.checkDietDay(kcalMeals(1759), 2000, allowed).blocking.includes('Calorias 1759 kcal, meta 2000 kcal'), '1 kcal além de 12% abaixo refaz');
  assert.deepEqual(Q.checkDietDay(kcalMeals(2240), 2000, allowed).blocking, [], 'exatamente 12% acima da meta passa'); assert.ok(Q.checkDietDay(kcalMeals(2241), 2000, allowed).blocking.includes('Calorias 2241 kcal, meta 2000 kcal'), '1 kcal além de 12% acima refaz');
  assert.deepEqual(Q.checkDietDay(okMeals(), 0, allowed).blocking, [], 'sem meta de calorias não cobra');
  const orig2 = okMeals(); Q.checkDietDay([...orig2, meal('X', [it('z', 'g', 1, 1)])], 1800, allowed); assert.equal(orig2.length, 3);
  { const specB = AP.planSpec('FICHA_8S', { objetivo: 'Hipertrofia', nivel: 'Intermediário', frequencia: 3 }); const ph = { ...specB.phases[0], techniques: ['DROPSET', 'RESTPAUSE'] };
    assert.deepEqual(AP.buildCycleConfig(specB, ph, clean, 'Feminino', { conservative: ['x'], excludeJointRisk: [] }).techniques, ['BISET'], 'modo seguro sem técnica calma na fase: usa BISET (nunca vazio)'); assert.deepEqual(AP.buildCycleConfig(specB, ph, clean, 'Feminino').techniques, ['DROPSET', 'RESTPAUSE'], 'sem modo seguro: as da fase');
    assert.deepEqual(AP.buildCycleConfig(specB, ph, clean, 'Feminino', { conservative: [], excludeJointRisk: [] }).techniques, ['DROPSET', 'RESTPAUSE'], 'triagem sem motivo = plano normal'); assert.equal((AP.buildCycleConfig(specB, ph, clean, 'Feminino', { conservative: [], excludeJointRisk: [] }) as any).excludeJointRisk, undefined);
    const cs = AP.buildCycleConfig(specB, specB.phases[0], clean, 'Feminino', { conservative: ['Hipertensão'], excludeJointRisk: ['LOMBAR'] }) as any; assert.deepEqual(cs.excludeJointRisk, ['LOMBAR']); assert.ok(cs.limitationRules.some((x: any) => x.id === 'MODO_SEGURO')); assert.ok(!(AP.buildCycleConfig(specB, specB.phases[0], clean, 'Feminino') as any).limitationRules.some((x: any) => x.id === 'MODO_SEGURO')); }
  // ── cobertura semanal: todo grupo principal aparece na semana (a divisão padrão do app é só ponto de partida para o coach revisar) ──
  const REQ = [['PEITO'], ['COSTAS_PUXADA', 'COSTAS_REMADA'], ['OMBRO_MULTI', 'OMBRO_LATERAL', 'OMBRO_FRONTAL', 'OMBRO_POST'], ['BICEPS'], ['TRICEPS'], ['QUADRICEPS'], ['POSTERIORES', 'GLUTEOS']];
  const covered = (days: any[], req: string[]) => days.some((d) => d.groups.some((g: any) => req.includes(g.id)));
  for (const gender of ['Feminino', 'Masculino']) for (const fatLoss of [true, false]) for (let freq = 2; freq <= 6; freq++) for (const focus of [null, 'Glúteos', 'Braços', 'Abdômen', 'Peito']) {
    const spec: any = AP.planSpec('FICHA_8S', { objetivo: fatLoss ? 'Emagrecimento' : 'Hipertrofia', nivel: 'Intermediário', frequencia: freq, focoPrincipal: focus });
    const sp = AP.buildSplit(spec, gender); assert.equal(sp.length, fatLoss ? Math.min(freq, 5) : freq, `${gender} ${fatLoss} ${freq}x`);
    for (const req of REQ) assert.ok(covered(sp, req), `${gender} ${fatLoss ? 'emagrecer' : 'músculo'} ${freq}x foco ${focus}: falta ${req[0]}`);
    assert.ok(sp.every((d: any) => d.groups.length > 0), 'nenhum dia vazio');
  }
  for (const kind of ['CHALLENGE_21'] as const) for (const gender of ['Feminino', 'Masculino']) for (let freq = 3; freq <= 5; freq++) { const sp = AP.buildSplit(AP.planSpec(kind, { frequencia: freq, nivel: 'Iniciante' }), gender); for (const req of REQ) assert.ok(covered(sp, req), `desafio ${gender} ${freq}x: falta ${req[0]}`); }
  const dayOf = (id: string, name: string, groups: any[]) => ({ id, name, groups });
  let cov = AP.ensureCoverage([dayOf('1', 'A', [{ id: 'PEITO', qty: 3 }]), dayOf('2', 'B', [{ id: 'QUADRICEPS', qty: 2 }])]);
  assert.deepEqual(cov.map((d: any) => d.groups.map((g: any) => g.id)), [['PEITO', 'OMBRO_LATERAL', 'TRICEPS'], ['QUADRICEPS', 'COSTAS_PUXADA', 'BICEPS', 'POSTERIORES']], 'o que falta entra, sempre no dia mais leve');
  assert.deepEqual(cov[0].groups[1], { id: 'OMBRO_LATERAL', qty: 2 }, 'entram 2 exercícios');
  cov = AP.ensureCoverage([dayOf('1', 'A', [{ id: 'PEITO', qty: 2 }]), dayOf('2', 'B', [{ id: 'QUADRICEPS', qty: 2 }])]); assert.ok(cov[0].groups.some((g: any) => g.id === 'COSTAS_PUXADA'), 'empate: o primeiro dia');
  cov = AP.ensureCoverage([dayOf('1', 'A', [{ id: 'PEITO', qty: 2 }, { id: 'CARDIO', qty: 5 }]), dayOf('2', 'B', [{ id: 'QUADRICEPS', qty: 3 }])]); assert.ok(cov[0].groups.some((g: any) => g.id === 'COSTAS_PUXADA'), 'cardio não pesa na conta do dia mais leve (A=2, B=3)');
  cov = AP.ensureCoverage([dayOf('1', 'A', [{ id: 'PEITO', qty: 2 }, { id: 'MOBILIDADE', qty: 9 }]), dayOf('2', 'B', [{ id: 'QUADRICEPS', qty: 3 }])]); assert.ok(cov[0].groups.some((g: any) => g.id === 'COSTAS_PUXADA'), 'mobilidade também não pesa');
  assert.deepEqual(AP.ensureCoverage([]), []);
  const full = [dayOf('1', 'A', [{ id: 'PEITO', qty: 2 }, { id: 'COSTAS_REMADA', qty: 2 }, { id: 'OMBRO_POST', qty: 1 }, { id: 'BICEPS', qty: 2 }, { id: 'TRICEPS', qty: 2 }, { id: 'QUADRICEPS', qty: 2 }, { id: 'GLUTEOS', qty: 2 }])];
  const fullCopy = AP.ensureCoverage(full); assert.deepEqual(fullCopy, full, 'divisão completa não muda'); assert.notEqual(fullCopy[0].groups, full[0].groups, 'devolve cópia'); assert.deepEqual(AP.ensureCoverage(AP.ensureCoverage([dayOf('1', 'A', [{ id: 'PEITO', qty: 1 }])])), AP.ensureCoverage([dayOf('1', 'A', [{ id: 'PEITO', qty: 1 }])]), 'idempotente');
  // cada exigência da semana, uma por uma: faltando, entra o grupo certo (2 exercícios); cada alternativa aceita já basta
  const ALL7 = ['PEITO', 'COSTAS_REMADA', 'OMBRO_POST', 'BICEPS', 'TRICEPS', 'QUADRICEPS', 'GLUTEOS']; const ADDS = ['PEITO', 'COSTAS_PUXADA', 'OMBRO_LATERAL', 'BICEPS', 'TRICEPS', 'QUADRICEPS', 'POSTERIORES'];
  REQ.forEach((req, i) => {
    const without = [dayOf('1', 'A', ALL7.filter((g) => !req.includes(g)).map((id) => ({ id, qty: 2 })))]; const got = AP.ensureCoverage(without);
    assert.deepEqual(got[0].groups.slice(-1), [{ id: ADDS[i], qty: 2 }], `falta ${req[0]}: entra ${ADDS[i]}`); assert.equal(got[0].groups.length, without[0].groups.length + 1, 'só um grupo entra');
    for (const member of req) { const only = AP.ensureCoverage([dayOf('1', 'A', [...ALL7.filter((g) => !req.includes(g)), member].map((id) => ({ id, qty: 2 })))]); assert.equal(only[0].groups.length, 7 - req.filter((x) => ALL7.includes(x)).length + 1, `${member} sozinho já cobre ${req[0]}`); }
  });
  const orig3 = [dayOf('1', 'A', [{ id: 'PEITO', qty: 3 }])]; AP.ensureCoverage(orig3); assert.equal(orig3[0].groups.length, 1, 'não altera o original');
  assert.deepEqual(AP.buildSplit(AP.planSpec('FICHA_8S', { objetivo: 'Hipertrofia', nivel: 'Intermediário', frequencia: 4 }), 'Masculino').map((d: any) => d.groups.map((g: any) => g.id).join()), AP.buildSplit(AP.planSpec('FICHA_8S', { objetivo: 'Hipertrofia', nivel: 'Intermediário', frequencia: 4 }), 'Masculino').map((d: any) => d.groups.map((g: any) => g.id).join()), 'estável');
  // ── calorias do emagrecimento: 1.000–1.500 kcal; o resto segue o cálculo do app ──
  { const kp = (a: any, who: any, spec: any) => Q.kcalPlan(a, who, spec); const F = { gender: 'Feminino', birthDate: born(32) }, M = { gender: 'Masculino', birthDate: born(40) };
    const w = kp({ peso: 78, altura: 165 }, F, { fatLoss: true, freq: 3, objective: 'Emagrecimento' }); assert.ok(w.kcal.TREINO >= 1000 && w.kcal.TREINO <= 1500 && w.kcal.DESCANSO >= 1000 && w.kcal.DESCANSO <= w.kcal.TREINO, JSON.stringify(w)); assert.ok(w.clamped, 'o cálculo normal daria mais que 1.500'); assert.equal(w.kcal.TREINO, 1500); assert.ok(w.deficit > 0.3 && w.deficit < 0.4, 'déficit ' + w.deficit); assert.ok(w.tdee > 2000);
    const small = kp({ peso: 40, altura: 145 }, { gender: 'Feminino', birthDate: born(70) }, { fatLoss: true, freq: 1, objective: 'Emagrecimento' }); assert.deepEqual(small.kcal, { TREINO: 1200, DESCANSO: 1200 }, 'o piso de segurança do app (1.200 kcal para mulher) vale antes da faixa; descanso nunca acima do treino'); assert.ok(!small.clamped, '1.200 está dentro de 1.000–1.500');
    const smallM = kp({ peso: 50, altura: 155 }, { gender: 'Masculino', birthDate: born(65) }, { fatLoss: true, freq: 1, objective: 'Emagrecimento' }); assert.ok(smallM.kcal.TREINO >= 1395 && smallM.kcal.TREINO <= 1405 && smallM.kcal.DESCANSO >= 1395 && smallM.kcal.DESCANSO <= 1405, 'homem: piso de 1.400 kcal ' + JSON.stringify(smallM.kcal));
    const mid = kp({ peso: 50, altura: 155 }, { gender: 'Feminino', birthDate: born(35) }, { fatLoss: true, freq: 2, objective: 'Emagrecimento' }); assert.ok(mid.kcal.TREINO > 1000 && mid.kcal.TREINO < 1500, 'dentro da faixa fica como o cálculo: ' + mid.kcal.TREINO); assert.equal(mid.clamped, false); assert.ok(Math.abs(mid.deficit - 0.2) < 0.01, 'déficit de 20% do app'); assert.ok(mid.kcal.DESCANSO < mid.kcal.TREINO, 'descanso abaixo do treino (90%)');
    const bulk = kp({ peso: 62, altura: 164 }, F, { fatLoss: false, freq: 4, objective: 'Hipertrofia' }); assert.ok(bulk.kcal.TREINO > 1500 && !bulk.clamped, 'hipertrofia não é limitada: ' + bulk.kcal.TREINO); assert.ok(bulk.deficit < 0, 'superávit');
    const dm = (a: any, who: any, spec: any) => Q.dietMacros(a, who, spec);
    const m1 = dm({ peso: 78, altura: 165 }, F, { fatLoss: true, freq: 3, objective: 'Emagrecimento' }); for (const d of ['TREINO', 'DESCANSO']) { const x = m1[d]; assert.ok(x.kcal >= 1000 && x.kcal <= 1500, d + ' ' + x.kcal); assert.ok(Math.abs(x.prot * 4 + x.carb * 4 + x.fat * 9 - x.kcal) <= 2, 'macros fecham: ' + JSON.stringify(x)); assert.ok(x.prot >= 90 && x.carb >= 80 && x.fat >= 30, JSON.stringify(x)); }
    assert.ok(Math.abs(m1.TREINO.prot - Math.round(1500 * 0.35 / 4)) <= 1 && Math.abs(m1.TREINO.fat - Math.round(1500 * 0.30 / 9)) <= 1, '35% proteína, 30% gordura');
    const m2 = dm({ peso: 40, altura: 145 }, { gender: 'Feminino', birthDate: born(70) }, { fatLoss: true, freq: 1, objective: 'Emagrecimento' }); assert.ok(m2.TREINO.kcal >= 1195 && m2.TREINO.kcal <= 1205 && m2.DESCANSO.kcal >= 1195 && m2.DESCANSO.kcal <= 1205, JSON.stringify(m2));
    const m3 = dm({ peso: 62, altura: 164 }, F, { fatLoss: false, freq: 4, objective: 'Hipertrofia' }); assert.ok(m3.TREINO.kcal > 1500, 'hipertrofia segue o cálculo normal: ' + m3.TREINO.kcal);
    // déficit alto vai para o coach (só dieta de emagrecer); o desafio (sem dieta da IA) e a hipertrofia não passam por isso
    const big = { peso: 95, altura: 178, imc: 30 }; const dsp = (diet: boolean, fatLoss = true) => Q.triage({ ...clean, ...big }, M, { fatLoss, diet, freq: 4, objective: fatLoss ? 'Emagrecimento' : 'Hipertrofia' }).manual;
    const hi = dsp(true)!; assert.equal(hi.code, 'DEFICIT_ALTO'); assert.ok(/Gasto estimado de \d{4} kcal: uma dieta de 1500 kcal seria um déficit de \d\d%/.test(hi.reason), hi.reason); assert.equal(dsp(false), null, 'desafio: sem dieta da IA, sem essa regra'); assert.equal(dsp(true, false), null, 'hipertrofia: sem essa regra');
    assert.equal(Q.triage({ ...clean, peso: 78, altura: 165, imc: 28.6 }, F, { fatLoss: true, diet: true, freq: 3, objective: 'Emagrecimento' }).manual, null, 'mulher de 78 kg: déficit de ~35%, segue');
    assert.equal(Q.triage({ ...clean, peso: 80, altura: 178, imc: 25.2 }, M, { fatLoss: true, diet: true, freq: 4, objective: 'Emagrecimento' })!.manual!.code, 'DEFICIT_ALTO', 'homem de 80 kg também passaria dos 40%');
    assert.equal(Q.triage({ ...clean, ...big }, M, { fatLoss: true }).manual, null, 'sem informar a dieta, a regra não roda'); assert.equal(Q.LIMITS.maxDeficit, 0.4); assert.deepEqual(Q.KCAL_RANGE, { min: 1000, max: 1500 }); assert.deepEqual(Q.LOW_KCAL_MACROS, { prot: 35, carb: 35, fat: 30 });
    const both = Q.triage({ ...clean, ...big, healthConditions: ['Gestante'] }, M, { fatLoss: true, diet: true, freq: 4, objective: 'Emagrecimento' }).manual!; assert.ok(both.reason.includes('Gestante') && both.reason.includes('déficit'), 'os motivos se somam'); }
  { // bordas do déficit e da frequência assumida quando o plano não informa
    const kp = (a: any, who: any, spec: any) => Q.kcalPlan(a, who, spec); const at30 = (g: string) => ({ gender: g, birthDate: born(30) });
    const only = kp({ peso: 45, altura: 172 }, at30('Feminino'), { fatLoss: true, freq: 4, objective: 'Emagrecimento' }); assert.equal(only.kcal.TREINO, 1500); assert.ok(only.kcal.DESCANSO < 1500 && only.kcal.DESCANSO > 1000, JSON.stringify(only.kcal)); assert.equal(only.clamped, true, 'só o dia de treino passou de 1.500: já conta como ajustado');
    const edge = { peso: 68, altura: 199 }; const kEdge = kp(edge, at30('Feminino'), { fatLoss: true, freq: 4, objective: 'Emagrecimento' }); assert.equal(kEdge.deficit, Q.LIMITS.maxDeficit, 'caso exatamente em 40%: ' + kEdge.deficit);
    assert.equal(Q.triage({ ...clean, ...edge, imc: 17.2 + 8 }, at30('Feminino'), { fatLoss: true, diet: true, freq: 4, objective: 'Emagrecimento' }).manual, null, '40% exatos ainda passa (só acima disso vai pro coach)');
    const A = { peso: 62, altura: 169, imc: 21.7 }, B = { peso: 82, altura: 193, imc: 22 };   // A: 37% com 3 treinos e 43% com 5; B: 36% com 2 e 44% com 3
    const tz = (a: any, g: string, spec: any) => Q.triage({ ...clean, ...a }, at30(g), { fatLoss: true, diet: true, objective: 'Emagrecimento', ...spec }).manual;
    assert.equal(tz(A, 'Masculino', {}), null, 'sem a frequência no plano, assume 3 treinos (37%): segue'); assert.equal(tz(A, 'Masculino', { freq: 5 })!.code, 'DEFICIT_ALTO'); assert.equal(tz(A, 'Masculino', { freq: 3 }), null);
    assert.equal(tz(B, 'Feminino', {})!.code, 'DEFICIT_ALTO', 'sem a frequência no plano, assume 3 treinos (44%): vai pro coach'); assert.equal(tz(B, 'Feminino', { freq: 2 }), null); assert.equal(tz(B, 'Feminino', { freq: 3 })!.code, 'DEFICIT_ALTO');
    { const heavy = { peso: 110, altura: 180, imc: 34 }; const kh = Q.kcalPlan(heavy, at30('Masculino'), { fatLoss: true, freq: 5, objective: 'Emagrecimento' }); assert.ok(kh.deficit > 0.5, 'déficit ' + kh.deficit); assert.ok(tz(heavy, 'Masculino', { freq: 5 })!.reason.endsWith(`déficit de ${Math.round(kh.deficit * 100)}%`), tz(heavy, 'Masculino', { freq: 5 })!.reason + ' vs ' + kh.deficit); }
    assert.equal(tz(B, 'Feminino', { objective: undefined })!.code, 'DEFICIT_ALTO', 'sem objetivo no plano, assume emagrecimento'); assert.match(tz(B, 'Feminino', {})!.reason, /déficit de 44%/, 'o motivo mostra a porcentagem arredondada');
  }
  console.log('OK  conferência pura: triagem, modo seguro, cobertura da biblioteca, treino (repete, séries, cardio, dias) e dieta (lista liberada, refeições, calorias)');

  // ═════ 5) Pipeline com a conferência ═════
  const TARGETS = ['QUADRICEPS', 'POSTERIORES', 'GLUTEOS', 'PANTURRILHA', 'ADUTOR', 'ABDUTOR', 'COSTAS_PUXADA', 'COSTAS_REMADA', 'OMBRO_MULTI', 'OMBRO_FRONTAL', 'OMBRO_LATERAL', 'OMBRO_POST', 'TRAPEZIO', 'PEITO', 'BICEPS', 'TRICEPS', 'ABDOMEN', 'CARDIO'];
  const exId = (tg: string, n: number) => `ex-${tg.toLowerCase()}-${n}`;
  const cfg: any = { workout: null, diet: null, wCalls: 0, dCalls: 0 };
  const baseMeals = () => [
    ['Café da Manhã', '07:00', [['67b01945', 'Ovos Inteiros', '100', 'g1'], ['4b6eb78f', 'Pão de Forma Tradicional', '60', 'g2']]],
    ['Almoço', '12:30', [['7fa55081', 'Frango Grelhado', '150', 'g3'], ['928041e8', 'Tilápia Grelhada', '190', 'g3'], ['fa4ba3b8', 'Arroz Branco', '150', 'g4'], ['7ff6a7f4', 'Batata Doce Cozida', '200', 'g4']]],
    ['Jantar', '20:00', [['d965922a', 'Peito de Peru Grelhado', '150', 'g5'], ['7ff6a7f4', 'Batata Doce Cozida', '200', 'g6']]],
  ].map(([name, time, items]: any) => ({ name, time, notes: 'dica', items: items.map(([food_id, food_name, amount, groupId]: any) => ({ food_id, food_name, amount, unit: 'g', groupId })) }));
  const dairy = (id: string, name: string, g: string) => ({ food_id: id, food_name: name, amount: '50', unit: 'g', groupId: g });
  const installAI = () => {
    cfg.workout = null; cfg.diet = null; cfg.wCalls = 0; cfg.dCalls = 0;
    G.__GEMINI = async ({ contents }: any) => {
      const text = String(contents);
      if (text.includes('Nutricionista Especialista')) {
        cfg.dCalls++;
        let meals: any[] = baseMeals(); if (cfg.diet) meals = cfg.diet(meals, cfg.dCalls, text);
        return { text: JSON.stringify({ reasoning: 'ok', meals }), usageMetadata: { promptTokenCount: 3000, candidatesTokenCount: 1500 } };
      }
      cfg.wCalls++;
      // modo inteligente: candidatos por grupo ("## GRUPO" e linhas "E001 | nome | ..."); modo antigo (cycleConfig.smart=false): JSON do banco
      const bankM = text.match(/BANCO \(ambiente [^)]*\):\n(\[.*\])\n/); const bank: any[] = bankM ? JSON.parse(bankM[1]) : [];
      if (!bankM) { let tg = ''; for (const line of text.split('\n')) { const h = line.match(/^## ([A-Z_]+)/); if (h) { tg = h[1]; continue; } const m = line.match(/^(E\d{3}) \| (.+?) \| /); if (m && tg) bank.push({ id: m[1], name: m[2], target: tg }); } }
      const byTarget: Record<string, any[]> = {}; for (const b of bank) (byTarget[b.target] = byTarget[b.target] || []).push(b);
      const exercisesByDay: any = {};
      for (const [, d, body] of text.matchAll(/Dia ([A-Z]):\n((?:    - .*\n?)*)/g)) {
        const list: any[] = [];
        for (const [, g, qty, sets] of (body as string).matchAll(/- ([A-Z_]+): (\d+) exercício\(s\)(?:, (\d+) séries)?/g)) {
          for (let n = 1; n <= Number(qty); n++) {
            const b = (byTarget[g] || [])[n - 1]; if (!b) continue;
            const cardio = g === 'CARDIO';
            list.push({ exerciseId: b.id, title: b.name, category: cardio ? 'Cardio' : 'Musculação', subCategory: g, observation: '', substitute: null,
              blocks: cardio ? [{ sets: '30', reps: '300', load: '', restTime: '0', technique: 'Moderada' }] : Array.from({ length: Number(sets || 4) }, () => ({ sets: '1', reps: '12', load: '20kg', restTime: '60', technique: '' })) });
          }
        }
        exercisesByDay[d] = list;
      }
      const out = cfg.workout ? cfg.workout(exercisesByDay, cfg.wCalls, text) : exercisesByDay;
      return { text: JSON.stringify({ workoutName: 'Rotina IA', workoutModel: 'CARGA', reasoning: 'x', exercisesByDay: out }) };
    };
  };
  const base = { peso: 70, altura: 170, imc: 24.2, objetivo: 'Emagrecimento', nivel: 'Intermediário', frequencia: 3, tempoDisponivel: 60, limitacoes: ['Nenhuma'], cirurgias: ['Nenhuma'], equipamentos: ['Academia Completa'], healthConditions: ['Nenhuma'], medications: ['Nenhum'], digestiveIssues: ['Nenhum'], wakeUpTime: '07:00', sleepTime: '23:00', trainTime: '18:00', freeDays: [], budget: 'moderado', favoriteFoodIds: [], createdAt: new Date() };
  function seed(user: any = {}, anam: any = {}, userId = 'q1') {
    for (const k of Object.keys(db)) db[k].length = 0;
    G.__pushes = []; G.__AI_CALLS = [];
    db.user.push(
      { id: PAULO_ID, role: 'ADMIN', email: 'paulo@x.com', name: 'Paulo', accountStatus: 'ACTIVE', active: true },
      { id: ADRI_ID, role: 'ADMIN', email: 'adri.personal@hotmail.com', name: 'Adri', accountStatus: 'ACTIVE', active: true },
      { id: userId, role: 'USER', email: 'q@x.com', name: 'Aluna Q', plan: 'FICHA_8S', coachId: PAULO_ID, gender: 'Feminino', birthDate: '1995-05-10', dietModule: false, ...user },
    );
    for (const tg of TARGETS) for (let n = 1; n <= 6; n++) db.exercise.push({ id: exId(tg, n), coachId: PAULO_ID, name: `${tg} ${'BDFGHJ'[n - 1]}`, category: tg === 'CARDIO' ? 'Cardio' : 'Musculação', subCategory: tg, videoUrl: '', tags: { target: tg, equipment: 'MAQUINA', mechanic: 'COMPOSTO' }, environments: ['UNIVERSAL'], defaultSubstitutes: [] });
    db.anamnese.push({ id: 'a-' + userId, userId, ...base, ...anam });
    db.workout.push({ id: 'ph', userId, name: 'FICHA EM CONSTRUÇÃO 🚧', archived: false, createdAt: new Date(Date.now() - 1000) });
    AP.__resetAutoPlanMemory(); installAI();
  }
  const start = async (userId = 'q1', opts: any = {}) => { const s = await AP.startAutoPlan(userId, opts); assert.ok(s.runId, 'corrida criada'); return settle(s.runId!); };
  const wCalls = () => G.__AI_CALLS.map((c: any) => String(c.contents)).filter((c: string) => c.includes('CONFIGURAÇÃO DO CICLO'));
  const savedRows = (userId = 'q1') => { const wids = db.workout.filter((w: any) => w.userId === userId && w.id !== 'ph').map((w: any) => w.id); return db.workoutExercise.filter((e: any) => wids.includes(e.workoutId)); };
  const cases: Array<[string, any, any, string, string]> = [
    ['gestante', {}, { healthConditions: ['Gestante'] }, 'GESTANTE_LACTANTE', 'Gestante ou lactante'],
    ['lactante', {}, { healthConditions: ['Lactante (amamentando)'] }, 'GESTANTE_LACTANTE', 'Gestante ou lactante'],
    ['menor de idade', { birthDate: born(14) }, {}, 'MENOR_DE_IDADE', 'Menor de 16'],
    ['abaixo do peso', {}, { peso: 45, altura: 170, imc: 15.6 }, 'IMC_BAIXO', 'abaixo do peso'],
    ['obesidade grau III', {}, { peso: 125, altura: 170, imc: 43.2 }, 'OBESIDADE_GRAU_3', 'obesidade grau III'],
    ['bariátrica', {}, { bariatric: true }, 'BARIATRICA', 'bariátrica'],
    ['diabetes tipo 1', {}, { healthConditions: ['Diabetes Tipo 1'] }, 'DIABETES_TIPO_1', 'Diabetes tipo 1'],
    ['déficit alto (1.500 kcal para um gasto de ~2.900)', { gender: 'Masculino', birthDate: born(40) }, { peso: 95, altura: 178, imc: 30, frequencia: 4 }, 'DEFICIT_ALTO', 'déficit de'],
  ];
  for (const [label, userPatch, anamPatch, code, text] of cases) {
    seed(userPatch, anamPatch);
    const run1 = await start();
    assert.equal(run1.status, 'MANUAL', label); assert.equal(run1.error, code, label); assert.equal(run1.summary.triage.code, code); assert.ok(run1.summary.triage.reason.includes(text), label + ': ' + run1.summary.triage.reason);
    assert.equal(cfg.wCalls + cfg.dCalls, 0, label + ': nenhuma chamada de IA'); assert.equal(db.diet.length, 0, label + ': sem dieta'); assert.equal(db.workout.filter((w: any) => w.id !== 'ph').length, 0, label + ': sem treino'); assert.equal(db.workout.find((w: any) => w.id === 'ph').archived, false, 'o "EM CONSTRUÇÃO" fica até o coach montar');
    const pc = G.__pushes.filter((p: any) => p.to === PAULO_ID); assert.equal(pc.length, 1, label); assert.equal(pc[0].data.type, 'auto_plan_manual'); assert.ok(pc[0].body.includes(text) && pc[0].body.includes('Aluna Q') && pc[0].body.includes('FICHA 8 SEMANAS'), pc[0].body); assert.equal(G.__pushes.filter((p: any) => p.to === 'q1').length, 0, 'aluno não recebe "plano pronto"');
    const st = await AP.getAutoPlanStatus('q1'); assert.equal(st.status, 'MANUAL'); assert.ok(st.message.includes('coach'));
    const again = await AP.startAutoPlan('q1'); assert.equal(again.started, false); assert.equal(again.reason, 'JA_MANUAL', 'nova anamnese não refaz a triagem sozinha');
    if (label === 'gestante') {
      const forcedRun = await start('q1', { force: true });   // o coach assume: refaz mesmo assim
      assert.equal(forcedRun.status, 'DONE', 'coach força: monta ' + forcedRun.error); assert.equal(forcedRun.summary.forced, true); assert.ok(cfg.wCalls > 0 && cfg.dCalls > 0);
    }
  }
  // sem coach cadastrado: o aviso vai pro Paulo
  seed({ coachId: null }, { healthConditions: ['Gestante'] }); { const rn = await start(); assert.equal(rn.status, 'MANUAL'); assert.equal(G.__pushes.filter((p: any) => p.to === PAULO_ID && p.data.type === 'auto_plan_manual').length, 1, 'sem coach, o master recebe'); }
  // IMC baixo só trava quem quer emagrecer; objetivo de ganhar músculo passa
  seed({}, { peso: 50, altura: 170, imc: 17.3, objetivo: 'Hipertrofia', focoPrincipal: 'Glúteos' }); assert.equal((await start()).status, 'DONE', 'ficha de hipertrofia com IMC baixo segue');
  seed({ plan: 'CHALLENGE_21', gender: 'Masculino' }, { peso: 50, altura: 170, imc: 17.3 }); assert.equal((await start()).status, 'MANUAL', 'desafio é sempre emagrecimento: IMC baixo vai pro coach');
  console.log('OK  triagem no pipeline: 8 motivos mandam para o coach sem gastar IA, aviso com o motivo, coach pode forçar, sem coach avisa o master');

  // modo seguro + filtro de articulação
  seed({}, { objetivo: 'Hipertrofia', focoPrincipal: 'Glúteos', frequencia: 4, limitacoes: ['Joelho'], healthConditions: ['Hipertensão'] });
  for (let n = 1; n <= 3; n++) db.exercise.find((e: any) => e.id === exId('QUADRICEPS', n)).tags.jointRisk = ['JOELHO'];
  db.exercise.find((e: any) => e.id === exId('PEITO', 1)).tags.jointRisk = ['OMBRO'];   // outra articulação: não deve sair
  let rs = await start(); assert.equal(rs.status, 'DONE'); let wc = wCalls(); assert.equal(wc.length, 2);
  const techOf = (txt: string) => (txt.match(/TÉCNICAS: (.*)\n/) || [])[1];
  assert.equal(techOf(wc[0]), 'BISET'); assert.equal(techOf(wc[1]), 'BISET', 'fase de choque no modo seguro: só BISET (sem DROPSET/RESTPAUSE)');
  assert.ok(wc[0].includes('- CARDIO: carga LEVE. Intensidade leve a moderada (Zona 2), sem HIIT nem tiros.') && wc[0].includes('- GERAL: observação: "Cargas moderadas, execução controlada e sem levar nenhuma série à falha."'), 'regra de cardio leve e cargas moderadas chega à IA, nos formatos que a IA já entende: ' + wc[0].slice(wc[0].indexOf('LIMITAÇÕES')));
  // quais exercícios (pelo nome "GRUPO n" da biblioteca de teste) chegaram à IA como candidatos
  const bankIds = (txt: string) => [...txt.matchAll(/^E\d{3} \| ([A-Z_]+) ([BDFGHJ]) \| /gm)].map((m) => exId(m[1], 'BDFGHJ'.indexOf(m[2]) + 1));
  for (const txt of wc) { const ids = bankIds(txt); for (let n = 1; n <= 3; n++) assert.ok(!ids.includes(exId('QUADRICEPS', n)), 'exercício de risco para joelho não chega à IA'); assert.ok(ids.includes(exId('QUADRICEPS', 4)) && ids.includes(exId('PEITO', 1)), 'os demais ficam (peito marcado só para ombro)'); }
  assert.ok(savedRows().every((e: any) => ![1, 2, 3].some((n) => e.exerciseId === exId('QUADRICEPS', n))), 'e não entram no treino salvo');
  assert.deepEqual(rs.summary.safety, { conservative: ['Hipertensão', 'Limitações/cirurgias: Joelho'], excludeJointRisk: ['JOELHO'] }); assert.ok(G.__pushes.find((p: any) => p.to === PAULO_ID && p.data.type === 'auto_plan_done').body.includes('modo seguro'), 'o coach sabe que foi modo seguro');
  // aluno sem restrição: plano normal, biblioteca inteira
  seed({}, { objetivo: 'Hipertrofia', frequencia: 4 }); rs = await start(); wc = wCalls(); assert.equal(techOf(wc[1]), 'DROPSET, RESTPAUSE, BISET', 'sem restrição: técnicas normais'); assert.ok(!wc[0].includes('Intensidade leve a moderada (Zona 2), sem HIIT') && !wc[0].includes('sem levar nenhuma série à falha') && bankIds(wc[0]).includes(exId('QUADRICEPS', 1)), 'sem modo seguro e sem filtro'); assert.deepEqual(rs.summary.safety, { conservative: [], excludeJointRisk: [] });
  assert.ok(!G.__pushes.find((p: any) => p.to === PAULO_ID && p.data.type === 'auto_plan_done').body.includes('modo seguro'));
  // o filtro não pode esvaziar um grupo: sobra 1 -> coach monta o treino (a dieta sai)
  seed({}, { objetivo: 'Hipertrofia', frequencia: 4, limitacoes: ['Joelho'] }); for (let n = 1; n <= 5; n++) db.exercise.find((e: any) => e.id === exId('QUADRICEPS', n)).tags.jointRisk = ['JOELHO'];
  rs = await start(); assert.equal(rs.status, 'MANUAL'); assert.equal(rs.error, 'BANCO_INSUFICIENTE'); assert.ok(rs.summary.triage.reason.includes('QUADRICEPS') && rs.summary.triage.reason.includes('JOELHO'), rs.summary.triage.reason); assert.equal(db.workout.filter((w: any) => w.id !== 'ph').length, 0, 'sem treino'); assert.ok(rs.dietId, 'a dieta já saiu e fica'); assert.equal(cfg.wCalls, 0, 'a IA do treino nem foi chamada');
  const pm = G.__pushes.filter((p: any) => p.to === PAULO_ID); assert.equal(pm.length, 1); assert.equal(pm[0].data.type, 'auto_plan_manual'); assert.ok(pm[0].body.includes('Biblioteca insuficiente'));
  seed({ coachId: null }, { objetivo: 'Hipertrofia', frequencia: 4, limitacoes: ['Joelho'] }); for (let n = 1; n <= 5; n++) db.exercise.find((e: any) => e.id === exId('QUADRICEPS', n)).tags.jointRisk = ['JOELHO'];
  rs = await start(); assert.equal(rs.status, 'MANUAL'); assert.equal(G.__pushes.filter((p: any) => p.to === PAULO_ID && p.data.type === 'auto_plan_manual' && p.body.includes('Biblioteca insuficiente')).length, 1, 'aluno sem coach: o master recebe o aviso da biblioteca insuficiente');
  // o filtro direto no motor: aceita risco em minúsculas e só devolve o resumo quando usado
  seed({}, { objetivo: 'Hipertrofia', frequencia: 4 }); for (let n = 1; n <= 2; n++) db.exercise.find((e: any) => e.id === exId('QUADRICEPS', n)).tags.jointRisk = ['joelho'];
  { const spec = AP.planSpec('FICHA_8S', { objetivo: 'Hipertrofia', nivel: 'Intermediário', frequencia: 4 }); const cc: any = AP.buildCycleConfig(spec, spec.phases[0], base, 'Feminino'); cc.excludeJointRisk = ['joelho'];
    const res: any = await generateWorkoutPlan({ userId: 'q1', adminId: PAULO_ID, cycleConfig: cc }); assert.equal(res.status, 200); assert.deepEqual(res.body.jointFilter, { risks: ['JOELHO'], excluded: 2 });
    const ids = bankIds(String(G.__AI_CALLS.at(-1).contents)); assert.ok(!ids.includes(exId('QUADRICEPS', 1)) && !ids.includes(exId('QUADRICEPS', 2)) && ids.includes(exId('QUADRICEPS', 3)), 'risco em minúsculas também filtra');
    cc.excludeJointRisk = []; const res2: any = await generateWorkoutPlan({ userId: 'q1', adminId: PAULO_ID, cycleConfig: cc }); assert.equal(res2.status, 200); assert.equal(res2.body.jointFilter, undefined, 'sem filtro: corpo igual ao de sempre'); assert.ok(bankIds(String(G.__AI_CALLS.at(-1).contents)).includes(exId('QUADRICEPS', 1))); }
  console.log('OK  modo seguro: só BISET e cardio leve, exercícios de risco articular fora da biblioteca da IA, aviso ao coach; biblioteca esvaziada manda para o coach');

  // 🧠 motores da Anthropic (HAIKU / CLAUDE): mesmo prompt, mesma validação, cache do prompt fixo, registro de custo; parceiro não escolhe
  { seed({}, { objetivo: 'Hipertrofia', frequencia: 4 });
    const spec = AP.planSpec('FICHA_8S', { objetivo: 'Hipertrofia', nivel: 'Intermediário', frequencia: 4 }); const mk = (ai: string) => { const cc: any = AP.buildCycleConfig(spec, spec.phases[0], base, 'Feminino'); cc.selectedAI = ai; return cc; };
    const seen: any[] = [];
    G.__LLM = async ({ model, args }: any) => { seen.push({ model, args }); const text = String(args.system[0].text) + '\n\n' + String(args.messages[0].content); const r = await G.__GEMINI({ contents: text }); return { content: [{ type: 'text', text: r.text }] }; };
    const res: any = await generateWorkoutPlan({ userId: 'q1', adminId: PAULO_ID, cycleConfig: mk('HAIKU') }); assert.equal(res.status, 200); assert.ok(Object.keys(res.body.exercisesByDay).length >= 2 && res.body.workoutTabs.length >= 2, 'treino montado e validado');
    assert.equal(seen.length, 1); assert.equal(seen[0].model, 'claude-haiku-5-5'); const a = seen[0].args; assert.deepEqual(a.system[0].cache_control, { type: 'ephemeral' }, 'prompt fixo em cache'); assert.ok(!String(a.system[0].text).includes('BANCO DE CANDIDATOS (ambiente') && String(a.messages[0].content).includes('BANCO DE CANDIDATOS (ambiente'), 'regras no prompt fixo; aluno, rotina anterior e candidatos na mensagem'); assert.deepEqual(a.output_config, { effort: 'low' }); assert.equal(a.max_tokens, 20000); assert.deepEqual(a.thinking, { type: 'disabled' }, 'Haiku: sem pensamento (gastava o limite e cortava o treino)'); assert.ok(!('tool_choice' in a) && !('temperature' in a), 'nada forçado');
    const log = db.aiLog.filter((l: any) => l.question === 'gerar-treino:HAIKU'); assert.equal(log.length, 1, 'custo registrado'); assert.equal(log[0].userId, PAULO_ID); const lj = JSON.parse(log[0].answer); assert.equal(lj.model, 'claude-haiku-5-5'); assert.equal(lj.inputTokens, 1500); assert.equal(lj.outputTokens, 700); assert.equal(lj.studentId, 'q1'); assert.ok(lj.bankExercises > 10 && lj.exercises > 0 && lj.days >= 2 && lj.usd > 0);
    seen.length = 0; const res2: any = await generateWorkoutPlan({ userId: 'q1', adminId: PAULO_ID, cycleConfig: mk('CLAUDE') }); assert.equal(res2.status, 200); assert.equal(seen[0].model, 'claude-sonnet-5-5'); assert.deepEqual(seen[0].args.output_config, { effort: 'medium' }); assert.deepEqual(seen[0].args.thinking, { type: 'between_tools' }, 'Sonnet 5.5 recusa thinking disabled'); assert.equal(db.aiLog.filter((l: any) => l.question === 'gerar-treino:CLAUDE').length, 1);
    // parceiro (não é do time master) não escolhe HAIKU: cai no Gemini Flash
    db.user.push({ id: 'coach-x', role: 'ADMIN', email: 'x@x.com', name: 'Parceiro', accountStatus: 'ACTIVE', active: true }); db.user.find((u: any) => u.id === 'q1').coachId = 'coach-x'; for (const e of db.exercise) e.coachId = 'coach-x';
    seen.length = 0; G.__AI_CALLS.length = 0; const res3: any = await generateWorkoutPlan({ userId: 'q1', adminId: 'coach-x', cycleConfig: mk('HAIKU') }); assert.equal(res3.status, 200); assert.equal(seen.length, 0, 'parceiro: a Anthropic nem foi chamada'); assert.ok(G.__AI_CALLS.length >= 1, 'foi para o Gemini');
    G.__LLM = null; }
  console.log('OK  motores Anthropic: Haiku e Sonnet montam treino pelo mesmo prompt e validação, prompt fixo em cache, custo registrado, parceiro não escolhe');

  // 🧪 motor ARGON (Gemini 4 Argon, só masters): mesmo prompt e validação, pensamento no nível pedido, tokens + custo no registro; parceiro não escolhe; erro do Google vira aviso claro
  { seed({}, { objetivo: 'Hipertrofia', frequencia: 4 });
    const spec = AP.planSpec('FICHA_8S', { objetivo: 'Hipertrofia', nivel: 'Intermediário', frequencia: 4 }); const mk = (ai: string) => { const cc: any = AP.buildCycleConfig(spec, spec.phases[0], base, 'Feminino'); cc.selectedAI = ai; return cc; };
    const baseGemini = G.__GEMINI; const argonSeen: any[] = []; let argonFail: any = null;
    G.__GEMINI = async (args: any) => {
      if (args.model !== 'gemini-4-argon') return baseGemini(args);
      argonSeen.push(args); await new Promise((r) => setTimeout(r, 25)); if (argonFail) throw argonFail;   // 25 ms de demora: limite de tempo curto demais derrubaria a geração
      const r = await baseGemini({ model: args.model, contents: String(args.config.systemInstruction) + '\n\n' + String(args.contents[0].parts[0].text) });
      return { ...r, candidates: [{ finishReason: 'STOP' }], usageMetadata: { promptTokenCount: 60000, candidatesTokenCount: 8000, thoughtsTokenCount: 5000, cachedContentTokenCount: 0 } };
    };
    const res: any = await quiet(() => generateWorkoutPlan({ userId: 'q1', adminId: PAULO_ID, cycleConfig: mk('ARGON') })); assert.equal(res.status, 200, JSON.stringify(res.body)); assert.ok(res.body.workoutTabs.length >= 2 && res.body.quality && typeof res.body.quality.score === 'number', 'treino montado, validado e com nota');
    assert.equal(argonSeen.length, 1); const a = argonSeen[0]; assert.equal(a.model, 'gemini-4-argon'); assert.equal(a.config.thinkingConfig.thinkingLevel, 'MEDIUM', 'pensamento no padrão do Google'); assert.equal(a.config.maxOutputTokens, 48000);
    assert.ok(!String(a.config.systemInstruction).includes('BANCO DE CANDIDATOS (ambiente') && String(a.contents[0].parts[0].text).includes('BANCO DE CANDIDATOS (ambiente'), 'regras na instrução fixa; aluno e candidatos na mensagem'); assert.ok(a.config.abortSignal, 'tempo limite com cancelamento');
    const log = db.aiLog.filter((l: any) => l.question === 'gerar-treino:ARGON'); assert.equal(log.length, 1, 'custo registrado'); assert.equal(log[0].userId, PAULO_ID); const lj = JSON.parse(log[0].answer);
    assert.equal(lj.model, 'gemini-4-argon'); assert.equal(lj.thinking, 'medium'); assert.equal(lj.inputTokens, 60000); assert.equal(lj.outputTokens, 8000); assert.equal(lj.thinkingTokens, 5000); assert.equal(lj.usd, estimateArgonUsd({ inputTokens: 60000, outputTokens: 8000, thinkingTokens: 5000, cacheReadTokens: 0 }), 'custo = entrada + (texto + pensamento) pelo preço do dia'); assert.ok(lj.usd > 0.2 && lj.usd < 0.6); assert.equal(lj.score, res.body.quality.score, 'nota guardada junto do custo, para comparar com os outros motores'); assert.equal(lj.studentId, 'q1');
    // erro do Google (modelo ainda não liberado na chave) -> aviso claro, nada salvo; sem saldo -> aviso claro
    argonFail = Object.assign(new Error('models/gemini-4-argon is not found for API version v1beta'), { status: 404 }); await assert.rejects(() => quiet(() => generateWorkoutPlan({ userId: 'q1', adminId: PAULO_ID, cycleConfig: mk('ARGON') })), /Gemini Argon ainda não está liberado/);
    argonFail = Object.assign(new Error('RESOURCE_EXHAUSTED: prepayment credits are depleted'), { status: 429 }); await assert.rejects(() => quiet(() => generateWorkoutPlan({ userId: 'q1', adminId: PAULO_ID, cycleConfig: mk('ARGON') })), /sem saldo ou no limite/); argonFail = null;
    assert.equal(db.aiLog.filter((l: any) => l.question === 'gerar-treino:ARGON').length, 1, 'falha não gera registro de custo');
    // parceiro (não é do time master) não escolhe ARGON: cai no Gemini Flash
    db.user.push({ id: 'coach-y', role: 'ADMIN', email: 'y@y.com', name: 'Parceiro Y', accountStatus: 'ACTIVE', active: true }); db.user.find((u: any) => u.id === 'q1').coachId = 'coach-y'; for (const e of db.exercise) e.coachId = 'coach-y';
    argonSeen.length = 0; G.__AI_CALLS.length = 0; const res3: any = await quiet(() => generateWorkoutPlan({ userId: 'q1', adminId: 'coach-y', cycleConfig: mk('ARGON') })); assert.equal(res3.status, 200); assert.equal(argonSeen.length, 0, 'parceiro: o Argon nem foi chamado'); assert.ok(G.__AI_CALLS.length >= 1 && G.__AI_CALLS.every((c: any) => c.model !== 'gemini-4-argon'), 'foi para o Gemini Flash');
    G.__GEMINI = baseGemini; }
  console.log('OK  motor Argon: masters escolhem, mesmo prompt e validação, nível de pensamento, tokens e custo no registro com a nota; parceiro não escolhe; erros viram aviso claro');

  // 🧠 montagem inteligente (lib/ai/workoutPlanner.ts) de ponta a ponta: nível, rotina anterior (MANTER/TROCAR), candidatos com códigos curtos, revisão depois da IA
  { const mkCfg = (over: any = {}) => ({ selectedAI: 'GEMINI', phase: 'HIPERTROFIA', techniques: ['BISET'], techniqueScope: 'CYCLE', gender: 'Feminino', trainingEnvironment: 'ACADEMIA_PADRAO', manualExercisesByDay: {}, limitationRules: [],
      days: [{ name: 'A', groups: [{ id: 'PEITO', qty: 3, sets: 3, rest: 60 }, { id: 'BICEPS', qty: 2, sets: 3, rest: 30 }] }, { name: 'B', groups: [{ id: 'COSTAS_REMADA', qty: 3, sets: 3, rest: 60 }, { id: 'TRICEPS', qty: 2, sets: 3, rest: 30 }] }], ...over });
    const prevRoutine = () => {
      db.workout.push({ id: 'wp', userId: 'q1', name: 'Ficha anterior', workoutModel: 'CARGA', createdAt: new Date(Date.now() - 5000) }); let o = 0;
      const row = (day: string, g: string, n: number) => db.workoutExercise.push({ id: `we-${day}-${g}-${n}`, workoutId: 'wp', exerciseId: exId(g, n), day, order: o++, sets: 3, reps: '10', restTime: 60, technique: JSON.stringify({ t: '', b: [{ sets: '1', reps: '10', restTime: '60', technique: '' }] }) });
      [1, 2, 3].forEach((n) => row('A', 'PEITO', n)); [1, 2].forEach((n) => row('A', 'BICEPS', n)); [1, 2, 3].forEach((n) => row('B', 'COSTAS_REMADA', n)); [1, 2].forEach((n) => row('B', 'TRICEPS', n));
    };
    const lastPrompt = () => String(G.__AI_CALLS.at(-1).contents);
    const gen = async (cc: any) => { const r: any = await quiet(() => generateWorkoutPlan({ userId: 'q1', adminId: PAULO_ID, cycleConfig: cc })); assert.equal(r.status, 200, JSON.stringify(r.body)); return r; };
    const idsOf = (r: any, day: string) => r.body.exercisesByDay[day].map((e: any) => e.exerciseId);

    // 1) a IA obedece: prompt com códigos, rotina anterior com MANTER/TROCAR, candidatos; ids verdadeiros nunca vão para a IA; a resposta volta com ids verdadeiros
    seed({}, { objetivo: 'Hipertrofia', frequencia: 4 }); prevRoutine(); let r = await gen(mkCfg()); let p = lastPrompt();
    assert.ok(p.includes('ROTINA ANTERIOR "Ficha anterior"') && p.includes('→ MANTER') && p.includes('→ TROCAR') && p.includes('BANCO DE CANDIDATOS (ambiente ACADEMIA_PADRAO)') && p.includes('## PEITO — vagas por dia (A:3)'), p.slice(p.indexOf('ALUNO:'), p.indexOf('ALUNO:') + 1500));
    assert.ok(!p.includes('ex-peito-1') && /E001/.test(p) && !p.includes('GUIA DE VARIAÇÕES') && !p.includes('"suggestedSubstitutes"'), 'só códigos curtos, sem a biblioteca inteira em JSON'); assert.ok(p.includes('Nível: Intermediário') && p.includes('NÍVEL DO ALUNO: Intermediário'));
    assert.ok(/Dia A:\n    - PEITO: 3 exercício\(s\), 3 séries \(exceto GVT=10\), descanso 60s/.test(p), 'a estrutura do ciclo segue na mensagem');
    assert.deepEqual(idsOf(r, 'A').slice(0, 2), [exId('PEITO', 1), exId('PEITO', 2)], 'âncoras (MANTER) repetidas'); assert.ok(!idsOf(r, 'A').includes(exId('PEITO', 3)) && !idsOf(r, 'A').includes(exId('BICEPS', 1)) && !idsOf(r, 'A').includes(exId('BICEPS', 2)), 'os TROCAR saíram');
    assert.equal(r.body.levelInfo.level, 'INTERMEDIARIO'); assert.equal(r.body.quality.stats.kept, 4, 'PEITO B–2 e COSTAS B–2'); assert.equal(r.body.quality.stats.newPct, 60); assert.equal(r.body.quality.stats.swapped, 0); assert.equal(r.body.quality.score, 100 - 10 * r.body.quality.issues.length);
    assert.ok(idsOf(r, 'A').every((id: string) => id.startsWith('ex-')), 'ids verdadeiros no resultado'); assert.equal(r.body.exercisesByDay.A.length, 5); assert.equal(r.body.exercisesByDay.B.length, 5);
    const lg = JSON.parse(db.aiLog.filter((l: any) => l.question === 'gerar-treino:GEMINI').at(-1).answer); assert.equal(lg.smart, true); assert.equal(lg.score, r.body.quality.score); assert.equal(lg.newPct, 60); assert.ok(lg.candidates > 10);

    // 1b) 🔺 repetições: sem escolha a pirâmide automática vale; com a escolha do coach (cycleConfig.repScheme) o texto da IA a traz e a revisão a impõe em todo exercício comum
    { const OWN = ['DROPSET', 'RESTPAUSE', '21', 'CLUSTERSET', 'GVT']; const repsOf = (rr: any) => Object.values(rr.body.exercisesByDay).flat().filter((e: any) => e.blocks.length > 1 && !e.blocks.some((b: any) => OWN.includes(b.technique))).map((e: any) => e.blocks.map((b: any) => b.reps).join('-'));
      seed({}, { objetivo: 'Hipertrofia', frequencia: 4 }); prevRoutine(); const rAuto = await gen(mkCfg()); assert.ok(repsOf(rAuto).some((x: string) => new Set(x.split('-')).size > 1), 'automático: há pirâmide');
      seed({}, { objetivo: 'Hipertrofia', frequencia: 4 }); prevRoutine(); const rReta = await gen(mkCfg({ repScheme: { mode: 'RETA', flat: 10 } })); assert.ok(lastPrompt().includes('REPETIÇÕES (escolha do coach') && lastPrompt().includes('MESMA repetição em todas as séries'), 'a escolha vai no texto da IA');
      assert.ok(repsOf(rReta).length > 3 && repsOf(rReta).every((x: string) => new Set(x.split('-')).size === 1 && x.startsWith('10')), 'reta 10 em todo exercício comum: ' + repsOf(rReta).join(' | ')); }
    // 1c) 📉 formato compacto: a IA devolve só { id, reps, t } (e cardio com "blocks"); o servidor monta o treino completo (nome, categoria, descanso do grupo, séries, substituto) e a pirâmide
    { const fullAI = G.__GEMINI;
      const toCompact = (txt: string) => { const j = JSON.parse(txt); for (const d of Object.keys(j.exercisesByDay)) j.exercisesByDay[d] = j.exercisesByDay[d].map((e: any) => (e.category === 'Cardio' ? { id: e.exerciseId, blocks: e.blocks } : { id: e.exerciseId, reps: e.blocks.map((b: any) => b.reps) })); return JSON.stringify(j); };
      seed({}, { objetivo: 'Hipertrofia', frequencia: 4 }); prevRoutine(); const fullAI2 = G.__GEMINI; G.__GEMINI = async (a: any) => { const r = await fullAI2(a); return { ...r, text: toCompact(r.text) }; };   // (seed reinstala a IA simulada: o embrulho vem depois)
      const rc: any = await gen(mkCfg({ subsOnlyTagged: false })); const pc = lastPrompt();
      assert.ok(pc.includes('FORMATO JSON COMPACTO') && pc.includes('{ "id": "E001", "reps": [15, 12, 10, 8] }') && !pc.includes('"title": "nome-exato"'), 'o texto pede o formato compacto'); assert.ok(pc.includes('TAMANHO DA LISTA "reps"'), 'regra de séries = tamanho da lista');
      const dayA = rc.body.exercisesByDay.A; assert.equal(dayA.length, 5); for (const e of dayA) { assert.ok(e.title && e.category && e.videoUrl !== undefined, 'nome e categoria vêm do servidor: ' + JSON.stringify(e).slice(0, 120)); assert.equal(e.blocks.length, 3, 'séries do grupo (3)'); assert.ok(new Set(e.blocks.map((b: any) => b.reps)).size > 1, 'pirâmide: ' + e.blocks.map((b: any) => b.reps)); assert.ok(e.substitute, 'substituto escolhido pelo servidor'); }
      assert.ok(dayA.slice(0, 3).every((e: any) => e.blocks.every((b: any) => b.restTime === '60')) && dayA.slice(3).every((e: any) => e.blocks.every((b: any) => b.restTime === '30')), 'descanso vem do GRUPO (PEITO 60s, BÍCEPS 30s): ' + dayA.map((e: any) => e.title + ':' + e.blocks[0].restTime + ':' + e.subCategory));
      assert.equal(rc.body.exercisesByDay.A.length, rc.body.workoutTabs.length ? rc.body.exercisesByDay.A.length : 0);
      // grupos sem descanso/séries na configuração: vale o padrão do grupo (Peito 60s, Bíceps 30s); e a IA que esqueceu as repetições recebe as séries que o grupo pede
      seed({}, { objetivo: 'Hipertrofia', frequencia: 4 }); prevRoutine(); G.__GEMINI = async (a: any) => { const r = await fullAI2(a); const j = JSON.parse(toCompact(r.text)); delete j.exercisesByDay.A[0].reps; return { ...r, text: JSON.stringify(j) }; };
      const bare = mkCfg(); bare.days[0].groups = [{ id: 'PEITO', qty: 3, sets: 5 }, { id: 'BICEPS', qty: 2 }]; const rd: any = await gen(bare); const dA = rd.body.exercisesByDay.A;
      assert.equal(dA[0].blocks.length, 5, 'reps esquecidas = séries do grupo (5): ' + dA[0].blocks.length); assert.ok(dA.slice(0, 3).every((e: any) => e.blocks.every((b: any) => b.restTime === '60')) && dA.slice(3).every((e: any) => e.blocks.every((b: any) => b.restTime === '30')), 'descanso padrão do grupo: ' + dA.map((e: any) => e.blocks[0].restTime));
      G.__GEMINI = fullAI2; }
    // 1d) 📊 geração que FALHA fica no registro (com os tokens gastos); o registro nunca derruba a geração
    { const fullAI = G.__GEMINI; const logs = () => db.aiLog.filter((l: any) => l.question === 'gerar-treino:GEMINI:falhou'); const before = logs().length;
      seed({}, { objetivo: 'Hipertrofia', frequencia: 4 }); G.__GEMINI = async () => ({ text: 'desculpe, não consegui montar o treino', usageMetadata: { promptTokenCount: 5000, candidatesTokenCount: 700 } });
      const bad: any = await quiet(() => generateWorkoutPlan({ userId: 'q1', adminId: PAULO_ID, cycleConfig: mkCfg() })); assert.equal(bad.status, 500); assert.equal(logs().length, before + 1); const l1 = JSON.parse(logs().at(-1).answer); assert.equal(l1.stage, 'json'); assert.match(l1.error, /formato inválido/); assert.equal(l1.inputTokens, 5000); assert.equal(l1.outputTokens, 700, 'os tokens gastos aparecem'); assert.equal(l1.studentId, 'q1'); assert.equal(logs().at(-1).userId, PAULO_ID);
      G.__GEMINI = async () => { throw Object.assign(new Error('503 UNAVAILABLE: modelo sobrecarregado'), { status: 503 }); }; await assert.rejects(() => quiet(() => generateWorkoutPlan({ userId: 'q1', adminId: PAULO_ID, cycleConfig: mkCfg() })), /UNAVAILABLE/, 'o erro continua subindo como antes'); assert.equal(logs().length, before + 2); const l2 = JSON.parse(logs().at(-1).answer); assert.equal(l2.stage, 'ia'); assert.match(l2.error, /503 UNAVAILABLE/);
      const realCreate = (prisma as any).aiLog.create; (prisma as any).aiLog.create = async () => { throw new Error('banco fora'); }; try { await assert.rejects(() => quiet(() => generateWorkoutPlan({ userId: 'q1', adminId: PAULO_ID, cycleConfig: mkCfg() })), /UNAVAILABLE/, 'registro que falha não troca o erro'); } finally { (prisma as any).aiLog.create = realCreate; }
      G.__GEMINI = async () => ({ text: JSON.stringify({ workoutName: 'x', exercisesByDay: { A: [{ id: 'E998', reps: [12, 10] }, { id: 'E999', reps: [12, 10] }] } }), usageMetadata: { promptTokenCount: 4000, candidatesTokenCount: 90 } });
      const none: any = await quiet(() => generateWorkoutPlan({ userId: 'q1', adminId: PAULO_ID, cycleConfig: mkCfg() })); assert.equal(none.status, 500); assert.equal(logs().length, before + 3, 'zero exercícios válidos também fica no registro'); const l3 = JSON.parse(logs().at(-1).answer); assert.equal(l3.stage, 'validacao'); assert.equal(l3.outputTokens, 90);
      G.__GEMINI = fullAI; assert.equal(logs().length, before + 3, 'o que deu certo não entra como falha'); }
    // 2) a IA desobedece e repete um TROCAR + inventa um código: a revisão troca e completa
    seed({}, { objetivo: 'Hipertrofia', frequencia: 4 }); prevRoutine(); cfg.workout = (byDay: any) => { byDay.A[2].exerciseId = exId('PEITO', 3); byDay.A[0].exerciseId = 'E999'; byDay.B[4].exerciseId = exId('TRICEPS', 1); return byDay; };
    r = await gen(mkCfg()); let q = r.body.quality; assert.ok(!idsOf(r, 'A').includes(exId('PEITO', 3)) && !idsOf(r, 'A').includes('E999'), idsOf(r, 'A').join()); assert.equal(r.body.exercisesByDay.A.filter((e: any) => /PEITO/.test(e.title)).length, 3, 'o código inventado foi tirado e a vaga completada');
    assert.ok(q.fixes.some((f: string) => f.includes('Dia A: a IA deixou PEITO incompleto')) && q.fixes.some((f: string) => f.includes('"PEITO F" →') && f.includes('repetido da rotina anterior')) && q.fixes.some((f: string) => f.includes('"TRICEPS B" →')), q.fixes.join(' | '));
    assert.equal(q.stats.filled, 1); assert.equal(q.stats.swapped, 2); assert.ok(r.body.exercisesByDay.A.every((e: any) => e.blocks.length === 3 && e.blocks.every((b: any) => b.load === '')), 'sem histórico de carga: tudo em branco');

    // 3) iniciante: técnica avançada sai do ciclo e da resposta; a IA pode teimar, a revisão tira; modo antigo e modo "sem regras de nível" voltam ao de antes
    seed({}, { objetivo: 'Hipertrofia', frequencia: 4, nivel: 'Iniciante' }); cfg.workout = (byDay: any) => { byDay.A[0].blocks = byDay.A[0].blocks.map((b: any) => ({ ...b, technique: 'DROPSET' })); return byDay; };
    r = await gen(mkCfg({ techniques: ['DROPSET', 'BISET'] })); p = lastPrompt(); assert.equal(r.body.levelInfo.level, 'INICIANTE');
    assert.equal((p.match(/TÉCNICAS: (.*)\n/) || [])[1], 'BISET', 'DROPSET nem chega à IA'); assert.ok(p.includes('Técnicas PROIBIDAS para este nível: DROPSET') && p.includes('NADA de exercício técnico'));
    assert.equal(r.body.quality.fixes[0], 'Técnicas tiradas do ciclo pelo nível Iniciante: DROPSET'); assert.ok(r.body.exercisesByDay.A.every((e: any) => e.blocks.every((b: any) => b.technique === '')), 'a revisão tirou o DROPSET que a IA mandou mesmo assim');
    r = await gen(mkCfg({ techniques: ['DROPSET', 'BISET'], levelRules: false })); p = lastPrompt(); assert.equal((p.match(/TÉCNICAS: (.*)\n/) || [])[1], 'DROPSET, BISET', 'regras de nível desligadas'); assert.ok(!p.includes('PROIBIDAS')); assert.ok(r.body.exercisesByDay.A[0].blocks.every((b: any) => b.technique === 'DROPSET'));
    r = await gen(mkCfg({ techniques: ['DROPSET'] })); assert.equal((lastPrompt().match(/TÉCNICAS: (.*)\n/) || [])[1], 'Nenhuma técnica avançada (nível do aluno): deixe technique="" (BISET só se combinar)');
    cfg.workout = null; r = await gen(mkCfg({ smart: false })); p = lastPrompt(); assert.ok(p.includes('BANCO (ambiente ACADEMIA_PADRAO)') && p.includes('GUIA DE VARIAÇÕES') && !p.includes('BANCO DE CANDIDATOS') && !p.includes('NÍVEL DO ALUNO') && !('quality' in r.body) && !('levelInfo' in r.body), 'smart:false = modo antigo, corpo igual ao de sempre');

    // 4) cargas: exercício que o aluno já treinou mantém a carga-alvo (ficou fácil → sobe); o novo fica em branco
    seed({}, { objetivo: 'Hipertrofia', frequencia: 4 }); prevRoutine();
    db.workoutHistory.push({ id: 'hh1', userId: 'q1', date: new Date(Date.now() - 2 * 86400000), details: [1, 2, 3].map((s) => ({ exerciseId: exId('PEITO', 1), exerciseName: 'PEITO B', setNumber: s, weight: 40, perSide: false, effort: 'FACIL' })) });
    cfg.workout = (byDay: any) => { byDay.A[0].blocks = byDay.A[0].blocks.map((b: any) => ({ ...b, load: '5kg' })); return byDay; };
    r = await gen(mkCfg()); p = lastPrompt(); assert.ok(/PEITO B · \[âncora, 1 rotina seguidas\] · ficou fácil; última carga 40\/40\/40 kg · → MANTER · alvo 42\.5\/42\.5\/42\.5 kg \(subir\)|PEITO B .*alvo \d/.test(p), p.slice(p.indexOf('ROTINA ANTERIOR'), p.indexOf('ROTINA ANTERIOR') + 600));
    const peito1 = r.body.exercisesByDay.A.find((e: any) => e.exerciseId === exId('PEITO', 1)); assert.ok(peito1.blocks.every((b: any) => /^4\d(\.5)?kg$/.test(b.load)), 'IA pôs 5kg, o alvo manda: ' + JSON.stringify(peito1.blocks.map((b: any) => b.load)));
    assert.ok(r.body.exercisesByDay.A.filter((e: any) => e.exerciseId !== exId('PEITO', 1)).every((e: any) => e.blocks.every((b: any) => b.load === '')), 'o resto nunca foi treinado');
    // 5) substituto: o servidor escolhe um do mesmo músculo quando a biblioteca não tem
    seed({}, { objetivo: 'Hipertrofia', frequencia: 4 }); db.exercise.forEach((e: any) => { e.defaultSubstitutes = []; }); r = await gen(mkCfg({ subsOnlyTagged: false }));
    assert.ok(r.body.exercisesByDay.A.filter((e: any) => e.category !== 'Cardio').every((e: any) => e.substitute && e.substitute.id !== e.exerciseId && String(e.substitute.id).startsWith('ex-' + String(e.subCategory).toLowerCase())), 'substituto do mesmo músculo, escolhido pelo servidor: ' + JSON.stringify(r.body.exercisesByDay.A.map((e: any) => e.substitute?.id)));
    { const solo: any = await gen(mkCfg()); assert.ok(solo.body.exercisesByDay.A.every((e: any) => !e.substitute), 'padrão: sem marcação na biblioteca = sem substituto (a IA e o servidor não escolhem)'); }
    cfg.workout = null;
  }
  console.log('OK  montagem inteligente: prompt com códigos curtos e rotina anterior (MANTER/TROCAR), nível tira técnica, revisão troca repetido e completa, carga-alvo, modo antigo preservado');

  // IA ruim: treino
  seed({}, { objetivo: 'Hipertrofia', frequencia: 4 }); cfg.workout = (byDay: any, n: number) => (n === 1 ? { ...byDay, A: byDay.A.slice(0, 1) } : byDay);
  rs = await quiet(() => start()); assert.equal(rs.status, 'DONE', 'a revisão automática completou o dia que a IA deixou incompleto'); assert.equal(cfg.wCalls, 2, 'sem precisar refazer na IA: 1 chamada por fase (antes eram 3 com a refeita)'); assert.ok(savedRows().length >= 20, 'dia A completo'); assert.ok(rs.summary.quality.workout.some((n: string) => n.includes('Dia A: a IA deixou') && n.includes('incompleto')), JSON.stringify(rs.summary.quality.workout));
  seed({}, { objetivo: 'Hipertrofia', frequencia: 4 }); cfg.workout = (byDay: any) => ({ ...byDay, A: [] });   // dia inteiro vazio: a revisão não inventa o dia todo, quem decide é o coach
  rs = await quiet(() => start()); assert.equal(rs.status, 'FAILED'); assert.equal(rs.attempts, 1); assert.ok(rs.error.includes('Treino fora do padrão') && rs.error.includes('Dia A veio sem exercícios'), rs.error); assert.equal(cfg.wCalls, 2, '2 tentativas dentro da corrida'); assert.equal(savedRows().length, 0, 'treino ruim nunca é salvo'); assert.ok(rs.dietId, 'a dieta boa fica');
  await quiet(async () => { await AP.executeRun(rs.id); await AP.executeRun(rs.id); }); rs = (await AP.runStore.get(rs.id)) as any; assert.equal(rs.attempts, 3); assert.equal(rs.status, 'FAILED'); assert.equal(savedRows().length, 0);
  const pf = G.__pushes.filter((p: any) => p.to === PAULO_ID); assert.equal(pf.length, 1, 'só avisa o coach na última tentativa'); assert.equal(pf[0].data.type, 'auto_plan_failed'); assert.equal(G.__pushes.filter((p: any) => p.to === 'q1').length, 0, 'aluno não recebe plano ruim nem "pronto"');
  // sem cardio no desafio
  seed({ plan: 'CHALLENGE_21', gender: 'Masculino' }, { frequencia: 3 }); cfg.workout = (byDay: any) => Object.fromEntries(Object.entries(byDay).map(([d, l]: any) => [d, l.filter((e: any) => e.category !== 'Cardio')]));
  rs = await quiet(() => start()); assert.equal(rs.status, 'FAILED'); assert.ok(rs.error.includes('veio sem cardio'), 'desafio sem cardio é recusado: ' + rs.error);
  // consertos silenciosos
  seed({}, { objetivo: 'Hipertrofia', frequencia: 4 }); cfg.workout = (byDay: any) => { const out: any = {}; for (const [d, l] of Object.entries<any[]>(byDay)) out[d] = [...l]; out.A = [{ ...out.A[0], blocks: [...out.A[0].blocks, ...out.A[0].blocks, ...out.A[0].blocks] }, ...out.A.slice(1)]; out.B = [...out.B, out.B[0]]; out.Z = [out.A[0]]; return out; };
  rs = await start(); assert.equal(rs.status, 'DONE'); const callA = wCalls()[0].match(/Dia A:\n\s+- ([A-Z_]+): (\d+) exercício\(s\), (\d+) séries/)!; const firstA = db.workoutExercise.find((e: any) => e.workoutId === rs.workoutIds[0] && e.day === 'A' && e.order === 0); assert.equal(JSON.parse(firstA.technique).b.length, Number(callA[3]), 'séries ajustadas ao que o grupo pede');
  assert.ok(!savedRows().some((e: any) => e.day === 'Z'), 'dia inventado não é salvo'); const dayB = db.workoutExercise.filter((e: any) => e.workoutId === rs.workoutIds[0] && e.day === 'B'); assert.ok(dayB.length >= 3); assert.equal(new Set(dayB.map((e: any) => e.exerciseId)).size, dayB.length, 'sem exercício repetido no dia');
  assert.ok(rs.summary.quality.repairs >= 3 && rs.summary.quality.workout.some((n: string) => n.includes('repetido')) && rs.summary.quality.workout.some((n: string) => n.includes('séries')), JSON.stringify(rs.summary.quality));
  // cargas: sem histórico em branco; com histórico mantém
  seed({}, { objetivo: 'Hipertrofia', frequencia: 4 }); rs = await start(); const loadsOf = () => savedRows().filter((e: any) => JSON.parse(e.technique).t !== 'Moderada' && e.sets !== 30).flatMap((e: any) => JSON.parse(e.technique).b.map((b: any) => b.load));
  assert.ok(loadsOf().length > 20 && loadsOf().every((l: string) => l === ''), 'aluno sem nenhum treino: cargas em branco');
  seed({}, { objetivo: 'Hipertrofia', frequencia: 4 }); db.workoutHistory.push({ id: 'h1', userId: 'q1', date: new Date(), details: [{ exerciseId: exId('PEITO', 1), exerciseName: 'PEITO B', setNumber: 1, weight: 20, perSide: false }] }); rs = await start(); assert.ok(loadsOf().some((l: string) => l === '20kg'), 'exercício que o aluno já treinou com carga mantém a sugestão da IA'); assert.ok(loadsOf().some((l: string) => l === ''), 'exercício que ele nunca fez fica com a carga em branco (a IA não chuta carga)');
  seed({}, { objetivo: 'Hipertrofia', frequencia: 4 }); db.workoutHistory.push({ id: 'hx', userId: 'outro-aluno', date: new Date(), details: [] }); rs = await start(); assert.ok(loadsOf().length > 20 && loadsOf().every((l: string) => l === ''), 'o histórico de OUTRO aluno não conta');
  console.log('OK  conferência do treino no pipeline: refaz dia incompleto/sem cardio, conserta séries/repetido/dia inventado, cargas em branco sem histórico, aluno nunca recebe plano ruim');

  // IA ruim: dieta
  seed({}, { allergies: 'Intolerância à Lactose', objetivo: 'Emagrecimento' }); cfg.diet = (meals: any[]) => { meals[0].items.push(dairy('c4ef1a39', 'Queijo Minas Frescal Light', 'gq')); return meals; };
  rs = await start(); assert.equal(rs.status, 'DONE'); assert.equal(cfg.dCalls, 2, 'só removeu o item, sem refazer'); const items = db.foodItem.map((i: any) => i.name); assert.ok(!items.some((n: string) => n.includes('Queijo')), 'alimento com lactose não vai pra dieta de quem tem intolerância'); assert.ok(rs.summary.quality.diet.some((n: string) => n.includes('Queijo Minas') && n.includes('removido')));
  seed({}, { allergies: 'Intolerância à Lactose' }); cfg.diet = (meals: any[], n: number) => { if (n <= 2) { meals[0].items.push(dairy('c4ef1a39', 'Queijo Minas', 'gq1'), dairy('007db8e3', 'Cottage', 'gq2')); meals[2].items.push(dairy('5b756560', 'Ricota', 'gq3')); } return meals; };
  rs = await quiet(() => start()); assert.equal(rs.status, 'DONE'); assert.equal(cfg.dCalls, 4, 'muito alimento proibido: refez as duas abas'); assert.ok(!db.foodItem.some((i: any) => /Queijo|Cottage|Ricota/.test(i.name)));
  seed({}, { objetivo: 'Emagrecimento' }); cfg.diet = (meals: any[], n: number) => (n <= 2 ? meals.slice(0, 2) : meals); rs = await quiet(() => start()); assert.equal(rs.status, 'DONE'); assert.equal(cfg.dCalls, 4, 'só 2 refeições: refaz');
  seed({}, { objetivo: 'Emagrecimento' }); cfg.diet = (meals: any[]) => meals.slice(0, 2); rs = await quiet(() => start()); assert.equal(rs.status, 'FAILED'); assert.ok(/Dieta \((TREINO|DESCANSO)\) fora do padrão: Só 2 refeições/.test(rs.error), rs.error); assert.equal(db.diet.length, 0, 'dieta ruim nunca é salva'); assert.equal(rs.workoutIds.length, 2, 'o treino bom (2 fases) fica'); assert.equal(db.user.find((u: any) => u.id === 'q1').dietModule, false);
  // dieta que explode as calorias: o motor de macros reescala, mas se mesmo assim ficar longe da meta, refaz
  seed({}, { objetivo: 'Emagrecimento' }); cfg.diet = (meals: any[], n: number) => (n <= 2 ? meals.map((m) => ({ ...m, items: m.items.map((i: any) => ({ ...i, amount: '5' })) })) : meals); rs = await quiet(() => start()); assert.equal(rs.status, 'DONE'); assert.equal(cfg.dCalls, 4, 'porções minúsculas: o ajuste de macros não alcança a meta, refaz'); const savedKcal = db.diet[0].totalKcal; assert.ok(savedKcal > 1000, 'dieta final tem calorias de verdade: ' + savedKcal);
  console.log('OK  conferência da dieta no pipeline: tira alimento proibido, refaz quando a IA abusa ou entrega poucas refeições, dieta ruim nunca é salva');

  // ═════ 6) Treinos prontos do coach ═════
  const colOf = (name: string, coachId = PAULO_ID, id = 'col-' + name) => { db.templateCollection.push({ id, coachId, name }); return id; };
  const mkEd = (tg: string, n: number) => ({ exerciseId: exId(tg, n), title: `${tg} ${'BDFGHJ'[n - 1]}`, category: tg === 'CARDIO' ? 'Cardio' : 'Musculação', observation: '', substitutes: [{ id: exId(tg, n === 6 ? 1 : n + 1), name: `${tg} sub` }], blocks: Array.from({ length: tg === 'CARDIO' ? 1 : 3 }, () => ({ sets: tg === 'CARDIO' ? '30' : '1', reps: tg === 'CARDIO' ? '300' : '12', load: tg === 'CARDIO' ? '' : '30kg', restTime: '60', technique: '' })) });
  const tplData = (tabs: Record<string, Array<[string, number]>>) => JSON.stringify(Object.fromEntries(Object.entries(tabs).map(([tab, list]) => [tab, list.map(([tg, n]) => mkEd(tg, n))])));
  const CH_TABS = { A: [['PEITO', 1], ['TRICEPS', 1], ['CARDIO', 1]], B: [['COSTAS_PUXADA', 1], ['BICEPS', 1], ['CARDIO', 1]], C: [['QUADRICEPS', 1], ['GLUTEOS', 1], ['CARDIO', 1]], D: [['OMBRO_LATERAL', 1], ['ABDOMEN', 1], ['CARDIO', 1]], E: [['CARDIO', 1], ['CARDIO', 2]], F: [['CARDIO', 3], ['CARDIO', 4]] } as Record<string, Array<[string, number]>>;
  const putTpl = (id: string, col: string, name: string, data: string, level: string | null = 'Intermediário') => db.workoutTemplate.push({ id, collectionId: col, name, level, goal: 'Hipertrofia', data });
  const ch = { plan: 'CHALLENGE_21', gender: 'Feminino' };

  // desafio: o modelo que combina entra, a IA não é chamada (nem para o treino nem para a dieta)
  seed(ch, { nivel: 'Iniciante', frequencia: 2 }); { const col = colOf('DESAFIO 21 DIAS'); putTpl('t-fem', col, 'Feminino academia', tplData(CH_TABS), 'Iniciante'); putTpl('t-masc', col, 'Masculino academia', tplData({ A: [['PEITO', 2]] }), 'Iniciante'); putTpl('t-avanc', col, 'Feminino avançado', tplData({ A: [['PEITO', 3]] }), 'Avançado'); }
  rs = await start(); assert.equal(rs.status, 'DONE'); assert.equal(cfg.wCalls + cfg.dCalls, 0, 'nenhuma chamada de IA: o treino vem do modelo e o desafio não tem dieta da IA');
  { const w: any = db.workout.find((x: any) => x.id === rs.workoutIds[0]); assert.equal(w.name, 'DESAFIO 21 DIAS'); const rows = db.workoutExercise.filter((e: any) => e.workoutId === w.id); assert.deepEqual([...new Set(rows.map((e: any) => e.day))], ['A', 'B', 'C', 'D', 'E', 'F']); assert.equal(rows.length, 16); assert.equal(rows[0].exerciseId, exId('PEITO', 1), 'na ordem do modelo');
    assert.deepEqual(rows.map((e: any) => e.order), rows.map((_: any, i: number) => i)); const b0 = JSON.parse(rows[0].technique); assert.equal(b0.b.length, 3, 'séries do modelo'); assert.ok(b0.b.every((x: any) => x.load === ''), 'sem histórico: cargas em branco'); assert.deepEqual(rows[0].substitutes, [exId('PEITO', 2)], 'substitutos do editor vão junto');
    assert.deepEqual(rs.summary.quality.templates, [{ phase: 'D21', id: 't-fem', name: 'Feminino academia' }], 'o coach vê qual modelo entrou'); }
  // quem tem histórico mantém as cargas do modelo
  seed(ch, { nivel: 'Iniciante' }); { const col = colOf('DESAFIO 21 DIAS'); putTpl('t1', col, 'Fem', tplData(CH_TABS), 'Iniciante'); } db.workoutHistory.push({ id: 'h', userId: 'q1', date: new Date(), details: [] });
  rs = await start(); assert.ok(db.workoutExercise.filter((e: any) => e.workoutId === rs.workoutIds[0]).some((e: any) => JSON.parse(e.technique).b.some((x: any) => x.load === '30kg')), 'quem já treinou mantém as cargas');
  // sem modelo compatível: cai na IA (com a estrutura 4 + 2) e avisa
  seed({ plan: 'CHALLENGE_21', gender: 'Masculino' }, { nivel: 'Iniciante' }); { const col = colOf('DESAFIO 21 DIAS'); putTpl('so-fem', col, 'Só feminino', tplData(CH_TABS), 'Iniciante'); }
  rs = await start(); assert.equal(rs.status, 'DONE'); assert.equal(cfg.wCalls, 1, 'IA monta o treino'); assert.equal(cfg.dCalls, 0, 'e o desafio continua sem dieta da IA'); assert.deepEqual(rs.summary.quality.templates, []); assert.ok(rs.summary.quality.workout.some((n: string) => n.includes('nenhum modelo do coach serviu')), JSON.stringify(rs.summary.quality.workout));
  assert.equal(wCalls()[0].match(/Dia [A-Z]:/g)!.length, 6, 'a IA recebe os 6 dias (4 treinos + 2 de cardio)');
  // sem pasta nenhuma: IA, sem ruído nas notas
  seed(ch, { nivel: 'Iniciante' }); rs = await start(); assert.equal(rs.status, 'DONE'); assert.equal(cfg.wCalls, 1); assert.ok(!rs.summary.quality.workout.some((n: string) => n.includes('modelo')), 'sem pasta de modelos não há o que avisar');
  // pasta de outro plano não vale
  seed(ch, { nivel: 'Iniciante' }); { const col = colOf('FICHA 8 SEMANAS'); putTpl('x', col, 'Fem', tplData(CH_TABS), 'Iniciante'); colOf('Outros'); } rs = await start(); assert.equal(cfg.wCalls, 1, 'modelo da pasta da ficha não entra no desafio'); assert.deepEqual(rs.summary.quality.templates, []);
  // falha ao ler os modelos: segue com a IA
  seed(ch, { nivel: 'Iniciante' }); { const orig = (prisma as any).templateCollection.findMany; (prisma as any).templateCollection.findMany = async () => { throw new Error('tabela fora do ar'); }; try { rs = await quiet(() => start()); } finally { (prisma as any).templateCollection.findMany = orig; } } assert.equal(rs.status, 'DONE'); assert.equal(cfg.wCalls, 1, 'sem conseguir ler os modelos, a IA monta');
  // modelo com exercício que não existe mais: descarta o exercício e usa o resto; se faltar muito, cai fora
  seed(ch, { nivel: 'Iniciante' }); { const col = colOf('DESAFIO 21 DIAS'); const t = JSON.parse(tplData(CH_TABS)); t.A.push({ ...t.A[0], exerciseId: 'sumiu-1' }); putTpl('t-gone', col, 'Fem', JSON.stringify(t), 'Iniciante'); }
  rs = await start(); assert.equal(cfg.wCalls, 0); assert.ok(rs.summary.quality.workout.some((n: string) => n.includes('1 exercício(s) do modelo não existem mais')), JSON.stringify(rs.summary.quality.workout)); assert.ok(!db.workoutExercise.some((e: any) => e.exerciseId === 'sumiu-1'));
  seed(ch, { nivel: 'Iniciante' }); { const col = colOf('DESAFIO 21 DIAS'); putTpl('t-bad', col, 'Fem', tplData({ A: [['PEITO', 1], ['TRICEPS', 1]] }).replace(/ex-peito-1/g, 'x1').replace(/ex-triceps-1/g, 'x2'), 'Iniciante'); }
  rs = await start(); assert.equal(cfg.wCalls, 1, 'modelo quebrado: IA monta'); assert.ok(rs.summary.quality.workout.some((n: string) => n.includes('descartado') && n.includes('existe mais na biblioteca')), JSON.stringify(rs.summary.quality.workout));
  // dor no joelho: modelo com exercício de risco para joelho é descartado e a IA (com a biblioteca filtrada) monta
  seed(ch, { nivel: 'Iniciante', limitacoes: ['Joelho'] }); db.exercise.find((e: any) => e.id === exId('QUADRICEPS', 1)).tags.jointRisk = ['JOELHO']; { const col = colOf('DESAFIO 21 DIAS'); putTpl('t-knee', col, 'Fem', tplData(CH_TABS), 'Iniciante'); }
  rs = await start(); assert.equal(cfg.wCalls, 1, 'IA monta'); assert.ok(rs.summary.quality.workout.some((n: string) => n.includes('descartado') && n.includes('JOELHO')), JSON.stringify(rs.summary.quality.workout)); assert.ok(!db.workoutExercise.some((e: any) => e.exerciseId === exId('QUADRICEPS', 1)), 'o exercício de risco não entra de jeito nenhum');
  // um segundo modelo sem o exercício de risco é aproveitado (o primeiro, melhor, é descartado)
  seed(ch, { nivel: 'Iniciante', limitacoes: ['Joelho'] }); db.exercise.find((e: any) => e.id === exId('QUADRICEPS', 1)).tags.jointRisk = ['JOELHO']; { const col = colOf('DESAFIO 21 DIAS'); putTpl('t-a', col, 'Feminino academia', tplData(CH_TABS), 'Iniciante'); const safe = { ...CH_TABS, C: [['QUADRICEPS', 2], ['GLUTEOS', 1], ['CARDIO', 1]] } as any; putTpl('t-b', col, 'Zeta', tplData(safe), 'Iniciante'); }
  rs = await start(); assert.equal(cfg.wCalls, 0); assert.deepEqual(rs.summary.quality.templates.map((x: any) => x.id), ['t-b'], 'o seguinte da fila entra');
  // modo seguro (hipertensão): dropset vira série normal; GVT derruba o modelo
  seed(ch, { nivel: 'Iniciante', healthConditions: ['Hipertensão'] }); { const col = colOf('DESAFIO 21 DIAS'); const t = JSON.parse(tplData(CH_TABS)); t.A[0].blocks.forEach((b: any) => { b.technique = 'DROPSET'; }); putTpl('t-drop', col, 'Fem', JSON.stringify(t), 'Iniciante'); }
  rs = await start(); assert.equal(cfg.wCalls, 0); assert.ok(db.workoutExercise.every((e: any) => JSON.parse(e.technique).b.every((b: any) => b.technique !== 'DROPSET')), 'sem dropset no modo seguro');
  seed(ch, { nivel: 'Iniciante', healthConditions: ['Hipertensão'] }); { const col = colOf('DESAFIO 21 DIAS'); const t = JSON.parse(tplData(CH_TABS)); t.A[0].blocks[0].technique = 'GVT'; putTpl('t-gvt', col, 'Fem', JSON.stringify(t), 'Iniciante'); }
  rs = await start(); assert.equal(cfg.wCalls, 1); assert.ok(rs.summary.quality.workout.some((n: string) => n.includes('GVT')));
  // aluno de Adri sem modelos próprios usa os do Paulo
  seed({ ...ch, coachId: ADRI_ID }, { nivel: 'Iniciante' }); { const col = colOf('DESAFIO 21 DIAS', PAULO_ID); putTpl('t-paulo', col, 'Fem', tplData(CH_TABS), 'Iniciante'); }
  rs = await start(); assert.equal(cfg.wCalls, 0); assert.deepEqual(rs.summary.quality.templates.map((x: any) => x.id), ['t-paulo']);
  seed({ ...ch, coachId: ADRI_ID }, { nivel: 'Iniciante' }); { const colP = colOf('DESAFIO 21 DIAS', PAULO_ID, 'cp'); putTpl('t-paulo', colP, 'Fem', tplData(CH_TABS), 'Iniciante'); const colA = colOf('DESAFIO 21 DIAS', ADRI_ID, 'ca'); putTpl('t-adri', colA, 'Fem', tplData(CH_TABS), 'Iniciante'); }
  rs = await start(); assert.deepEqual(rs.summary.quality.templates.map((x: any) => x.id), ['t-adri'], 'os modelos do próprio coach têm preferência');
  console.log('OK  treinos prontos no pipeline: o modelo certo entra sem IA, cargas em branco sem histórico, sem modelo cai na IA, modelo quebrado/de risco/pesado no modo seguro é descartado, coach tem preferência');

  // ficha de 8 semanas: um modelo por fase e a dieta continua sendo da IA
  const FI_TABS = { A: [['PEITO', 1], ['COSTAS_PUXADA', 1]], B: [['QUADRICEPS', 1], ['GLUTEOS', 1]], C: [['OMBRO_LATERAL', 1], ['BICEPS', 1]] } as Record<string, Array<[string, number]>>;
  const fi = { plan: 'FICHA_8S' };
  seed(fi, { objetivo: 'Hipertrofia', focoPrincipal: 'Glúteos', nivel: 'Intermediário', frequencia: 3 }); { const col = colOf('FICHA 8 SEMANAS'); putTpl('f1', col, 'Glúteos fem fase 1', tplData(FI_TABS)); putTpl('f2', col, 'Glúteos fem fase 2', tplData({ ...FI_TABS, B: [['GLUTEOS', 2], ['GLUTEOS', 3]] } as any)); putTpl('f1c', col, 'Costas fase 1', tplData(FI_TABS)); putTpl('fm', col, 'Glúteos masc fase 1', tplData(FI_TABS)); }
  rs = await start(); assert.equal(rs.status, 'DONE'); assert.equal(cfg.wCalls, 0, 'treinos dos modelos'); assert.equal(cfg.dCalls, 2, 'a dieta da ficha continua sendo da IA (treino e descanso)'); assert.deepEqual(rs.summary.quality.templates.map((x: any) => [x.phase, x.id]), [['F1', 'f1'], ['F2', 'f2']], 'um modelo para cada fase, o do foco certo'); assert.equal(db.workout.filter((w: any) => rs.workoutIds.includes(w.id)).length, 2); assert.ok(rs.dietId);
  seed(fi, { objetivo: 'Emagrecimento', nivel: 'Intermediário', frequencia: 3 }); { const col = colOf('FICHA 8 SEMANAS'); putTpl('foco', col, 'Glúteos fase 1', tplData(FI_TABS)); putTpl('emag', col, 'Emagrecer fase 1', tplData(FI_TABS)); }
  rs = await start(); assert.deepEqual(rs.summary.quality.templates.map((x: any) => x.id), ['emag'], 'perder peso: modelo de emagrecer na fase 1 (a fase 2 não tem modelo e vai para a IA)'); assert.equal(cfg.wCalls, 1, 'fase 2 pela IA'); assert.ok(rs.summary.quality.workout.some((n: string) => n.startsWith('F2 ·') && n.includes('nenhum modelo')));
  console.log('OK  ficha de 8 semanas com modelos: um por fase, o do foco/objetivo certo, o que falta vem da IA, dieta segue da IA');

  // ═════ 7) bordas do desafio e da ficha no pipeline ═════
  // plano: ficha sem dias de cardio/descanso e com dieta; desafio 4 + 2 + 1 sem dieta; abas com números e letras em ordem
  { for (const [f, want] of [[1, 2], [2, 2], [4, 4], [6, 6], [7, 6]] as const) { const sp = AP.planSpec('FICHA_8S', { objetivo: 'Hipertrofia', nivel: 'Intermediário', frequencia: f }); assert.equal(sp.freq, want, `ficha com ${f} treinos vira ${want}`); assert.deepEqual([sp.cardioDays, sp.restDays, sp.diet], [0, 0, true]); }
    const sc = AP.planSpec('CHALLENGE_21', { nivel: 'Iniciante', frequencia: 2 }); assert.deepEqual([sc.freq, sc.cardioDays, sc.restDays, sc.diet], [4, 2, 1, false], 'desafio: semana fixa, sem dieta da IA');
    const days = AP.buildSplit(sc, 'Feminino'); assert.deepEqual(days.map((d: any) => d.id), ['1', '2', '3', '4', '5', '6']); assert.deepEqual(days.map((d: any) => d.name), ['A', 'B', 'C', 'D', 'E', 'F']); assert.deepEqual(days.slice(4).map((d: any) => d.groups), [[{ id: 'CARDIO', qty: 2 }], [{ id: 'CARDIO', qty: 2 }]]);
    assert.equal(AP.buildSplit({ ...sc, cardioDays: 0 }, 'Feminino').length, 4); assert.equal(AP.buildSplit({ ...sc, cardioDays: undefined } as any, 'Masculino').length, 4); }
  // mensagem do aluno: sem plano informado conta como plano com dieta
  assert.ok(AP.studentMessage('DONE', null, undefined).includes('dieta') && AP.studentMessage('DONE', null, null).includes('dieta') && AP.studentMessage('DONE').includes('dieta') && AP.studentMessage('DONE', null, 'FICHA_8S').includes('dieta') && !AP.studentMessage('DONE', null, 'CHALLENGE_21').includes('dieta') && AP.studentMessage('DONE', null, 'CHALLENGE_21').includes('cardápios'));
  assert.ok(AP.studentMessage('RUNNING', 'WORKOUT', undefined).includes('sua dieta') && AP.studentMessage('RUNNING', 'WORKOUT', null).includes('sua dieta') && AP.studentMessage('RUNNING', 'WORKOUT', 'FICHA_8S').includes('sua dieta') && !AP.studentMessage('RUNNING', 'WORKOUT', 'CHALLENGE_21').includes('dieta') && AP.studentMessage('RUNNING', 'SAVING', 'FICHA_8S') === 'Salvando seu plano...');
  // modelo com substitutos repetidos, vazios e no formato antigo: lista limpa e sem repetição
  seed(ch, { nivel: 'Iniciante' }); { const col = colOf('DESAFIO 21 DIAS'); const t = JSON.parse(tplData(CH_TABS)); const X = exId('PEITO', 4), Y = exId('PEITO', 5); t.A[0].substitutes = [{ id: X }, { id: X }, { exerciseId: Y }, {}, { id: '' }, null, { id: Y }]; t.A[0].substitute = { id: X }; t.A[1].substitutes = []; t.A[1].substitute = { id: Y }; putTpl('t-subs', col, 'Fem', JSON.stringify(t), 'Iniciante'); }
  rs = await start(); { const rows = db.workoutExercise.filter((e: any) => e.workoutId === rs.workoutIds[0]); assert.deepEqual(rows[0].substitutes, [exId('PEITO', 4), exId('PEITO', 5)], 'sem repetição, sem vazio'); assert.deepEqual(rows[1].substitutes, [exId('PEITO', 5)], 'substituto único do formato antigo entra'); }
  // consulta à biblioteca para conferir o modelo pede tudo que a conferência usa; sem restrição nenhuma, técnica forte do modelo fica como está
  seed(ch, { nivel: 'Iniciante' }); { const col = colOf('DESAFIO 21 DIAS'); const t = JSON.parse(tplData(CH_TABS)); t.A[0].blocks[0].technique = 'GVT'; t.A[0].blocks[1].technique = 'DROPSET'; putTpl('t-forte', col, 'Fem', JSON.stringify(t), 'Iniciante'); }
  { const P: any = prisma, orig = P.exercise.findMany, seen: any[] = []; P.exercise.findMany = async (a: any) => { seen.push(a); return orig(a); }; try { rs = await start(); } finally { P.exercise.findMany = orig; }
    assert.equal(cfg.wCalls, 0, 'sem restrição o modelo com GVT serve'); const techs = db.workoutExercise.filter((e: any) => e.workoutId === rs.workoutIds[0]).flatMap((e: any) => JSON.parse(e.technique).b.map((b: any) => b.technique)); assert.ok(techs.includes('GVT') && techs.includes('DROPSET'), 'técnicas do coach preservadas fora do modo seguro: ' + techs.join(','));
    const q = seen.find((a) => a.where?.id?.in && a.select?.environments !== undefined); assert.deepEqual(q.select, { id: true, category: true, tags: true, environments: true }); assert.ok(q.where.id.in.includes(exId('PEITO', 1))); }
  // corrida limpa: nenhum conserto, nenhuma nota
  seed(ch, { nivel: 'Iniciante' }); { const col = colOf('DESAFIO 21 DIAS'); putTpl('t-ok', col, 'Fem', tplData(CH_TABS), 'Iniciante'); } rs = await start(); assert.equal(rs.summary.quality.repairs, 0); assert.deepEqual(rs.summary.quality.workout, []); assert.deepEqual(rs.summary.quality.diet, []);
  // aviso ao coach com aluno sem nome
  seed({ name: null }, { objetivo: 'Hipertrofia', frequencia: 3 }); rs = await start(); assert.equal(rs.status, 'DONE'); assert.ok(G.__pushes.find((p: any) => p.to === PAULO_ID && p.data.type === 'auto_plan_done').body.startsWith('Aluno (FICHA 8 SEMANAS) já tem treino e dieta.'), G.__pushes.map((p: any) => p.body).join(' | '));
  seed({ name: null, plan: 'CHALLENGE_21' }, { nivel: 'Iniciante' }); rs = await start(); assert.ok(G.__pushes.find((p: any) => p.to === PAULO_ID && p.data.type === 'auto_plan_done').body.startsWith('Aluno (DESAFIO 21 DIAS) já tem treino.'));
  // desafio: cardápio de ~1.500 kcal que seria déficit grande para o gasto do aluno vira aviso para o coach (não trava)
  { const userOf = () => db.user.find((u: any) => u.id === 'q1'); const kc = (a: any, fat = true) => Q.kcalPlan(a, userOf(), { fatLoss: fat, freq: 4, objective: 'Emagrecimento' });
    const flagOf = (r: any) => (r.summary.flags as string[]).find((f) => f.startsWith('Cardápio de cerca de 1.500 kcal'));
    // aluno de 110 kg e 1,80 m (homem): déficit grande, e o arredondamento da porcentagem importa
    let heavy: any = null; for (let peso = 100; peso <= 135 && !heavy; peso++) { seed({ plan: 'CHALLENGE_21', gender: 'Masculino' }, { peso, altura: 180, imc: Math.round(peso / 3.24 * 10) / 10 }); const k = kc(db.anamnese[0]); if (k.deficit > 0.45 && Math.round(k.deficit * 100) !== Math.round(k.deficit * 101)) heavy = { peso, k }; }
    assert.ok(heavy, 'achou um aluno que separa o arredondamento certo do errado');
    seed({ plan: 'CHALLENGE_21', gender: 'Masculino' }, { peso: heavy.peso, altura: 180, imc: Math.round(heavy.peso / 3.24 * 10) / 10 }); rs = await start(); assert.equal(rs.status, 'DONE', 'só avisa, não trava'); assert.equal(flagOf(rs), `Cardápio de cerca de 1.500 kcal para um gasto estimado de ${heavy.k.tdee} kcal (déficit de ${Math.round(heavy.k.deficit * 100)}%)`);
    assert.ok(G.__pushes.find((p: any) => p.to === PAULO_ID && p.data.type === 'auto_plan_done').body.includes('Cardápio de cerca de 1.500 kcal'), 'o coach vê o aviso na notificação');
    // exatamente 40%: não avisa; e aluna comum: não avisa
    let edge: any = null; for (let peso = 45; peso <= 160 && !edge; peso++) for (let altura = 150; altura <= 205 && !edge; altura++) { seed({ plan: 'CHALLENGE_21' }, { peso, altura, imc: 22 }); if (kc(db.anamnese[0]).deficit === Q.LIMITS.maxDeficit) edge = { peso, altura }; }
    assert.ok(edge, 'achou uma aluna com déficit exatamente no limite'); seed({ plan: 'CHALLENGE_21' }, { peso: edge.peso, altura: edge.altura, imc: 22 }); rs = await start(); assert.equal(rs.status, 'DONE'); assert.equal(flagOf(rs), undefined, '40% exatos não chega a avisar');
    seed({ plan: 'CHALLENGE_21' }, { peso: 70, altura: 165, imc: 25.7 }); rs = await start(); assert.equal(flagOf(rs), undefined, 'aluna comum: sem aviso');
    // o aviso usa o cálculo do emagrecimento (limitado a 1.500), não o do objetivo gravado na anamnese
    seed({ plan: 'CHALLENGE_21', gender: 'Masculino' }, { peso: heavy.peso, altura: 180, imc: 33, objetivo: 'Hipertrofia' }); rs = await start(); assert.ok(flagOf(rs), 'desafio é sempre emagrecimento, qualquer que seja o objetivo na anamnese');
    // ficha de hipertrofia não entra nessa conta (a dieta dela não é limitada a 1.500)
    seed({ plan: 'FICHA_8S', gender: 'Masculino' }, { peso: heavy.peso, altura: 180, imc: 33, objetivo: 'Hipertrofia', focoPrincipal: 'Peito', frequencia: 5 }); rs = await quiet(() => start()); assert.ok(Array.isArray(rs.summary.flags), 'a corrida registrou os avisos (a dieta simulada não alcança meta de ganho tão alta: o que importa aqui é o aviso)'); assert.equal(flagOf(rs), undefined, 'ficha com dieta da IA não tem esse aviso'); }
  console.log('OK  bordas: plano da ficha e do desafio, mensagem sem plano, substitutos limpos, consulta à biblioteca, corrida limpa, aluno sem nome e aviso de cardápio com déficit grande');
})().catch((e) => { console.log('FALHOU', e && e.stack ? e.stack.split('\n').slice(0, 6).join('\n') : e); process.exit(1); });
