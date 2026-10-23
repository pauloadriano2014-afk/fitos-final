import assert from 'assert';
import jwt from 'jsonwebtoken';
import prisma from '@/lib/prisma';
import { PAULO_ID, ADRI_ID } from '/home/user/fitos-final/lib/masterIds';
import { POST as newTreino } from '/home/user/fitos-final/app/api/ai/gerar-treino/route';
import { POST as newDieta } from '/home/user/fitos-final/app/api/admin/generate-diet/route';
import { POST as oldTreino } from '/tmp/gerar-treino.orig';
import { POST as oldDieta } from '/tmp/generate-diet.orig';

const db: any = (prisma as any).__db; const G: any = globalThis;
const quiet = async <T,>(fn: () => Promise<T>) => { const w = console.warn, e = console.error, l = console.log; console.warn = console.error = console.log = () => {}; try { return await fn(); } finally { console.warn = w; console.error = e; console.log = l; } };
const tok = (id: string, role = 'ADMIN') => jwt.sign({ id, role, coachId: null }, 'dev-only-troque-isso-configurando-JWT_SECRET-no-env');
const post = async (fn: any, as: string | null, body: any) => {
  const headers: any = { 'content-type': 'application/json' }; if (as) headers.authorization = 'Bearer ' + tok(as, as === 'parceiro' ? 'COACH' : 'ADMIN');
  const r = await fn(new Request('http://x/api', { method: 'POST', headers, body: JSON.stringify(body) })); let j: any = null; try { j = await r.json(); } catch {} return { status: r.status, json: j };
};
// uuids aleatórios (id da refeição e uniqueId do item) não entram na comparação. `reps` também não: desde 19 out 2026 o treino novo transforma séries de repetição igual em pirâmide (lib/ai/repSchemes.ts, testada em t_rep_schemes), o que a rota antiga não fazia
// (23 out 2026) 'substitute' fora da comparação com a rota antiga: agora o substituto da IA só vale se for do mesmo músculo (testado em t_gen_rules)
const strip = (o: any): any => Array.isArray(o) ? o.map(strip) : o && typeof o === 'object' ? Object.fromEntries(Object.entries(o).filter(([k]) => !['uniqueId', 'reps', 'substitute', 'genSnapshotId'].includes(k) && !(k === 'id' && typeof o[k] === 'string' && /^[0-9a-f-]{36}$/.test(o[k]))).map(([k, v]) => [k, strip(v)])) : o;

function seed() {
  for (const k of Object.keys(db)) db[k].length = 0;
  db.user.push(
    { id: PAULO_ID, role: 'ADMIN', email: 'paulo@x.com', name: 'Paulo' }, { id: ADRI_ID, role: 'ADMIN', email: 'adri.personal@hotmail.com', name: 'Adri' }, { id: 'parceiro', role: 'COACH', email: 'p@x.com' },
    { id: 'al', role: 'USER', name: 'Aluno', coachId: PAULO_ID, goal: 'Hipertrofia', level: 'Intermediário' }, { id: 'out', role: 'USER', name: 'Outro', coachId: 'parceiro' },
  );
  const T = ['PEITO', 'COSTAS_PUXADA', 'QUADRICEPS', 'BICEPS', 'CARDIO'];
  T.forEach((t) => [1, 2, 3].forEach((n) => db.exercise.push({ id: `ex-${t}-${n}`, coachId: PAULO_ID, name: `${t} ${n}`, category: t === 'CARDIO' ? 'Cardio' : 'Musculação', subCategory: t, videoUrl: 'v', tags: { target: t, equipment: n === 1 ? 'MAQUINA' : 'LIVRE', mechanic: 'COMPOSTO', jointRisk: [] }, environments: ['UNIVERSAL'], defaultSubstitutes: n === 3 ? [] : [`ex-${t}-${n + 1}`] })));
  db.exercise.push({ id: 'ex-adri', coachId: ADRI_ID, name: 'Da Adri', category: 'Musculação', subCategory: 'PEITO', videoUrl: '', tags: {}, environments: ['UNIVERSAL'], defaultSubstitutes: [] });
  db.anamnese.push({ id: 'a1', userId: 'al', peso: 80, altura: 180, objetivo: 'Hipertrofia', nivel: 'Intermediário', frequencia: 4, tempoDisponivel: 60, limitacoes: ['Joelho'], cirurgias: [], createdAt: new Date() });
  db.workout.push({ id: 'w1', userId: 'al', name: 'Anterior', workoutModel: 'CARGA', createdAt: new Date() });
  db.workoutExercise.push({ id: 'we1', workoutId: 'w1', exerciseId: 'ex-PEITO-1', day: 'A', sets: 3, reps: '10', restTime: 60, technique: JSON.stringify({ t: 'BISET', b: [{ sets: '1', reps: '10', restTime: '60', technique: 'BISET' }], o: '' }), order: 0 });
}
const DAYS = (names: string[]) => names.map((n) => ({ name: n, groups: [{ id: 'PEITO', qty: 3, sets: 4, rest: 60 }, { id: 'BICEPS', qty: 2, sets: 3, rest: 30 }] }));
// smart:false = modo ANTIGO: esta comparação é a paridade do código extraído da rota com o original; o modo inteligente tem testes próprios (t_workout_planner)
const cfg = (over: any = {}) => ({ smart: false, selectedAI: 'GEMINI', phase: 'HIPERTROFIA', techniques: ['BISET', 'GVT'], techniqueScope: 'CYCLE', gender: 'Feminino', trainingEnvironment: 'ACADEMIA_PADRAO', days: DAYS(['A', 'B']), manualExercisesByDay: {}, limitationRules: [{ rules: [{ group: 'QUADRICEPS', addNote: true, note: 'cuidado' }] }], cardioTarget: null, ...over });
const wk = (id: string, tech = '', n = 4) => ({ exerciseId: id, title: id, blocks: Array.from({ length: n }, () => ({ sets: '1', reps: '12', load: '20kg', restTime: '60', technique: tech })), substitute: { exerciseId: 'ex-BICEPS-2' } });

(async () => {
  // ═════ treino ═════
  const treinoCases: Array<[string, any, () => void]> = [
    ['ok', { userId: 'al', adminId: PAULO_ID, cycleConfig: cfg() }, () => { G.__GEMINI = async () => ({ text: JSON.stringify({ workoutName: 'X', exercisesByDay: { A: [wk('ex-PEITO-1'), wk('ex-BICEPS-1', 'BISET'), wk('ex-BICEPS-2', 'BISET'), wk('ex-nao-existe')], B: [wk('ex-COSTAS_PUXADA-1', 'GVT', 1), wk('ex-QUADRICEPS-1', 'BISET'), wk('ex-QUADRICEPS-2', 'TRISET'), wk('ex-QUADRICEPS-3', 'TRISET'), wk('ex-PEITO-3', 'TRISET')] } }) }); }],
    ['sem cycleConfig', { userId: 'al', adminId: PAULO_ID }, () => { G.__GEMINI = async () => ({ text: JSON.stringify({ exercisesByDay: { A: [wk('ex-PEITO-1')] } }) }); }],
    ['mobilidade manual pura', { userId: 'al', adminId: PAULO_ID, cycleConfig: { manualExercisesByDay: { A: [{ exerciseId: 'ex-PEITO-1' }] } } }, () => { G.__GEMINI = async () => { throw new Error('não deveria chamar a IA'); }; }],
    ['sem userId', { adminId: PAULO_ID }, () => {}],
    ['aluno inexistente', { userId: 'fantasma', adminId: PAULO_ID, cycleConfig: cfg() }, () => { G.__GEMINI = async () => ({ text: '{}' }); }],
    ['admin sem exercícios', { userId: 'al', adminId: 'parceiro', cycleConfig: cfg() }, () => {}],
    ['ambiente sem exercícios', { userId: 'al', adminId: PAULO_ID, cycleConfig: cfg({ trainingEnvironment: 'EM_CASA' }) }, () => {}],
    ['IA devolve lixo', { userId: 'al', adminId: PAULO_ID, cycleConfig: cfg() }, () => { G.__GEMINI = async () => ({ text: 'sem json nenhum' }); }],
    ['IA só com fantasmas', { userId: 'al', adminId: PAULO_ID, cycleConfig: cfg() }, () => { G.__GEMINI = async () => ({ text: JSON.stringify({ exercisesByDay: { A: [wk('fantasma')] } }) }); }],
    ['chave própria inválida', { userId: 'al', adminId: PAULO_ID, cycleConfig: cfg({ selectedAI: 'OWN_KEY', customKey: 'abc' }) }, () => {}],
    ['adri vê os da master', { userId: 'al', adminId: ADRI_ID, cycleConfig: cfg() }, () => { G.__GEMINI = async () => ({ text: JSON.stringify({ exercisesByDay: { A: [wk('ex-adri'), wk('ex-PEITO-1')] } }) }); }],
  ];
  // 🔺 escolha de repetições do coach (cycleConfig.repScheme) no modo antigo: vai para o texto da IA e vale na resposta
  { const prompts: string[] = []; const run = async (scheme: any) => { seed(); prompts.length = 0; G.__GEMINI = async (a: any) => { prompts.push(String(a.contents)); return { text: JSON.stringify({ workoutName: 'X', exercisesByDay: { A: [wk('ex-PEITO-1'), wk('ex-BICEPS-1')] } }) }; }; const r = await quiet(() => post(newTreino, PAULO_ID, { userId: 'al', adminId: PAULO_ID, cycleConfig: cfg(scheme ? { repScheme: scheme } : {}) })); assert.equal(r.status, 200, JSON.stringify(r.json)); return r.json.exercisesByDay.A.map((e: any) => e.blocks.map((x: any) => x.reps).join('-')); };
    assert.deepEqual(await run({ mode: 'RETA', flat: 10 }), ['10-10-10-10', '10-10-10-10']); assert.ok(prompts[0].includes('REPETIÇÕES (escolha do coach') && prompts[0].includes('MESMA repetição em todas as séries'), 'a escolha vai para o texto da IA');
    assert.deepEqual(await run({ mode: 'FAIXA', from: 15, to: 8 }), ['15-12-10-8', '15-12-10-8']); assert.ok(prompts[0].includes('de 15 até 8'));
    assert.deepEqual(await run({ mode: 'banana' }), ['12-10-8-8', '12-10-8-8'], 'escolha quebrada = automático (os dois são compostos na biblioteca de teste)'); assert.ok(!prompts[0].includes('REPETIÇÕES (escolha do coach'), 'automático: nada extra no texto'); assert.deepEqual(await run(null), ['12-10-8-8', '12-10-8-8']); }
  for (const [name, body, ai] of treinoCases) {
    seed(); ai(); const a = await quiet(() => post(oldTreino, PAULO_ID, body)); seed(); ai(); const b = await quiet(() => post(newTreino, PAULO_ID, body));
    assert.equal(b.status, a.status, `treino "${name}": status ${a.status} x ${b.status}`); assert.deepEqual(strip(b.json), strip(a.json), `treino "${name}": corpo diferente`);
    if (name === 'ok') { // 🔺 o treino novo (modo antigo) põe pirâmide onde a IA mandou tudo igual; a rota antiga deixava 12-12-12-12
      const reps = (j: any) => j.exercisesByDay.A.find((e: any) => e.exerciseId === 'ex-PEITO-1').blocks.map((x: any) => x.reps).join('-');
      assert.equal(reps(a.json), '12-12-12-12'); assert.equal(reps(b.json), '12-10-8-8', 'composto (PEITO 1 é o 1º do dia): o esquema mais pesado'); assert.ok(b.json.exercisesByDay.A.filter((e: any) => !e.blocks[0].technique && e.blocks.length > 1).every((e: any) => new Set(e.blocks.map((x: any) => x.reps)).size > 1), 'nenhuma série comum fica com repetição toda igual');
    }
  }
  // sanidade: o caso "ok" de fato gerou algo (senão a comparação seria vazia)
  seed(); G.__GEMINI = treinoCases[0][2] && (async () => ({ text: JSON.stringify({ exercisesByDay: { A: [wk('ex-PEITO-1')] } }) })); const sane = await quiet(() => post(newTreino, PAULO_ID, treinoCases[0][1])); assert.equal(sane.status, 200); assert.equal(sane.json.exercisesByDay.A.length, 1);
  // travas da rota (auth/acesso) iguais
  for (const [who, tk] of [['sem login', null], ['parceiro', 'parceiro']] as const) { seed(); G.__GEMINI = async () => ({ text: '{}' }); const a = await quiet(() => post(oldTreino, tk, treinoCases[0][1])); const b = await quiet(() => post(newTreino, tk, treinoCases[0][1])); assert.equal(b.status, a.status, 'treino ' + who); if (who === 'sem login') assert.deepEqual(b.json, a.json, 'treino ' + who); else assert.equal(b.status, 403, 'treino ' + who + ' (sem a chave do master continua trancado; o texto e o código mudaram)'); }
  // aluno de outro coach: master passa (canAccessStudent), mas a guarda continua valendo para não-master liberado
  const A: any = await import('/home/user/fitos-final/lib/aiAccess'); A.AI_BUILDER_EXTRA_IDS.push('parceiro');
  seed(); db.exercise.push({ id: 'ex-par', coachId: 'parceiro', name: 'Do parceiro', category: 'Musculação', subCategory: 'PEITO', videoUrl: '', tags: {}, environments: ['UNIVERSAL'], defaultSubstitutes: [] }); G.__GEMINI = async () => ({ text: JSON.stringify({ exercisesByDay: { A: [wk('ex-PEITO-1')] } }) });
  const ca = await quiet(() => post(oldTreino, 'parceiro', { userId: 'al', adminId: 'parceiro', cycleConfig: cfg() })); const cb = await quiet(() => post(newTreino, 'parceiro', { userId: 'al', adminId: 'parceiro', cycleConfig: cfg() }));
  assert.equal(ca.status, 403); assert.equal(cb.status, ca.status, 'aluno de outro coach: 403 nas duas'); assert.deepEqual(cb.json, ca.json);
  const da = await quiet(() => post(oldTreino, 'parceiro', { userId: 'al', adminId: PAULO_ID, cycleConfig: cfg() })); const db2 = await quiet(() => post(newTreino, 'parceiro', { userId: 'al', adminId: PAULO_ID, cycleConfig: cfg() })); assert.equal(da.status, 403); assert.equal(db2.status, 403, 'não age como outro coach'); A.AI_BUILDER_EXTRA_IDS.length = 0;

  // ═════ dieta ═════
  const an = (o: any = {}) => ({ objetivo: 'Emagrecimento', peso: 80, altura: 180, frequencia: 4, gender: 'Masculino', age: 30, trainTime: '18:00', wakeUpTime: '07:00', sleepTime: '23:00', allergies: 'lactose', foodAversions: 'sardinha', healthConditions: ['Hipertensão'], digestiveIssues: ['Gastrite'], budget: 'econômico', favoriteFoodIds: [], ...o });
  const meals = (extra: any[] = []) => ({ reasoning: 'r', meals: [{ name: 'Café da Manhã', time: '07:00', notes: 'n', items: [{ food_id: '67b01945', food_name: 'Ovos Inteiros', amount: '200', unit: 'g', groupId: 'g1' }, { food_id: 'fffd8a66', food_name: 'Clara', amount: '150', unit: 'g', groupId: 'g1' }, { food_id: 'bdb59103', food_name: 'Aveia', amount: '100', unit: 'g', groupId: 'g2' }, ...extra] }, { name: 'Almoço', time: '12:30', items: [{ food_id: '7fa55081', food_name: 'Frango', amount: '300', unit: 'g', groupId: 'g3' }, { food_id: 'fa4ba3b8', food_name: 'Arroz', amount: '400', unit: 'g', groupId: 'g4' }, { food_id: '745c31e4', food_name: 'Azeite', amount: '30', unit: 'g', groupId: 'g5' }] }] });
  const dietCases: Array<[string, any]> = [
    ['google com macros', { anamnese: an(), dayType: 'TREINO', provider: 'google', macrosOverride: { kcal: 2000, prot: 160, carb: 200, fat: 60 } }],
    ['google sem macros (cálculo padrão)', { anamnese: an(), dayType: 'DESCANSO', provider: 'google' }],
    ['mulher hipertrofia', { anamnese: an({ gender: 'Feminino', objetivo: 'Hipertrofia', peso: 60, altura: 165, age: 28 }), dayType: 'TREINO_CARDIO', provider: 'google', gender: 'Feminino' }],
    ['gênero só no body', { anamnese: an({ gender: undefined, objetivo: 'Manutenção' }), dayType: 'CARDIO', provider: 'google', gender: 'Masculino' }],
    ['instrução do coach', { anamnese: an(), dayType: 'TREINO', provider: 'google', customInstruction: 'arroz no café' }],
    ['dia livre', { anamnese: an({ freeDays: ['Sábado'], freeTrainTime: '10:00', freeWakeUpTime: '09:00', freeSleepTime: '01:00' }), dayType: 'DESCANSO', provider: 'google' }],
    ['treino ao acordar', { anamnese: an({ trainTime: '07:00', trainFasted: true, preworkoutStrategy: 'ceia_pretreino' }), dayType: 'TREINO', provider: 'google' }],
    ['sem anamnese', { dayType: 'TREINO' }],
    ['haiku (master)', { anamnese: an(), provider: 'anthropic-haiku' }],
    ['openai', { anamnese: an(), provider: 'openai-mini' }],
  ];
  for (const [name, body] of dietCases) {
    for (const mode of ['ok', 'lixo'] as const) {
      G.__GEMINI = async () => (mode === 'ok' ? { text: JSON.stringify(meals()), usageMetadata: { promptTokenCount: 5000, candidatesTokenCount: 2500 } } : { text: 'isso não é json' });
      G.__LLM = async () => ({ content: [{ type: 'text', text: JSON.stringify(meals()) }] });
      const a = await quiet(() => post(oldDieta, PAULO_ID, body)); const b = await quiet(() => post(newDieta, PAULO_ID, body));
      assert.equal(b.status, a.status, `dieta "${name}" (${mode}): status`); assert.deepEqual(strip(b.json), strip(a.json), `dieta "${name}" (${mode}): corpo diferente`);
    }
  }
  G.__GEMINI = async () => ({ text: JSON.stringify(meals()), usageMetadata: { promptTokenCount: 5000, candidatesTokenCount: 2500 } });
  const sd = await quiet(() => post(newDieta, PAULO_ID, dietCases[0][1])); assert.equal(sd.status, 200); assert.ok(sd.json.meals.length === 2 && sd.json.meta.macroCorrection && sd.json.usageAndCost.costBrl > 0, 'resposta da dieta tem o formato de sempre');
  for (const [who, tk] of [['sem login', null], ['parceiro', 'parceiro']] as const) { const a = await quiet(() => post(oldDieta, tk, dietCases[0][1])); const b = await quiet(() => post(newDieta, tk, dietCases[0][1])); assert.equal(b.status, a.status, 'dieta ' + who); if (who === 'sem login') assert.deepEqual(b.json, a.json); else assert.equal(b.status, 403); }
  A.AI_BUILDER_EXTRA_IDS.push('parceiro'); const ha = await quiet(() => post(oldDieta, 'parceiro', { anamnese: an(), provider: 'anthropic-haiku' })); const hb = await quiet(() => post(newDieta, 'parceiro', { anamnese: an(), provider: 'anthropic-haiku' })); assert.equal(ha.status, 403); assert.equal(hb.status, 403, 'haiku só master'); assert.deepEqual(hb.json, ha.json); A.AI_BUILDER_EXTRA_IDS.length = 0;

  console.log('OK rotas de IA do coach: respostas idênticas às originais (treino e dieta)');
})().catch((e) => { console.log('FALHOU', e && e.stack || e); process.exit(1); });
