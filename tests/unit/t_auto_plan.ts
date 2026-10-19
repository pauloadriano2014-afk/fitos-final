import assert from 'assert';
import jwt from 'jsonwebtoken';
import prisma from '@/lib/prisma';
import * as AP from '/home/user/fitos-final/lib/autoPlan';
import { PAULO_ID, ADRI_ID } from '/home/user/fitos-final/lib/masterIds';
import { GET as statusGET } from '/home/user/fitos-final/app/api/auto-plan/status/route';
import { POST as runPOST } from '/home/user/fitos-final/app/api/auto-plan/run/route';
import { POST as anamnesePOST } from '/home/user/fitos-final/app/api/anamnese/route';

const db: any = (prisma as any).__db;
const G: any = globalThis;
AP.tuning.retryDelayMs = 5;
const quiet = async <T,>(fn: () => Promise<T>) => { const w = console.warn, e = console.error; console.warn = console.error = () => {}; try { return await fn(); } finally { console.warn = w; console.error = e; } };
const tok = (id: string, role = 'USER') => jwt.sign({ id, role, coachId: null }, 'dev-only-troque-isso-configurando-JWT_SECRET-no-env');
const call = async (fn: any, as: string | null, role: string, { url = 'http://x/api', method = 'POST', body }: any = {}) => {
  const headers: any = { 'content-type': 'application/json' }; if (as) headers.authorization = 'Bearer ' + tok(as, role);
  const r = await fn(new Request(url, { method, headers, body: body ? JSON.stringify(body) : undefined })); let j: any = null; try { j = await r.json(); } catch {} return { status: r.status, json: j };
};
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const waitFor = async (cond: () => any, ms = 4000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await cond()) return true; await sleep(10); } return false; };
const dayMs = 24 * 60 * 60 * 1000;

// ═══════ fixtures ═══════
const TARGETS = ['QUADRICEPS', 'POSTERIORES', 'GLUTEOS', 'PANTURRILHA', 'ADUTOR', 'ABDUTOR', 'COSTAS_PUXADA', 'COSTAS_REMADA', 'OMBRO_MULTI', 'OMBRO_FRONTAL', 'OMBRO_LATERAL', 'OMBRO_POST', 'TRAPEZIO', 'PEITO', 'BICEPS', 'TRICEPS', 'ABDOMEN', 'CARDIO'];
const exId = (t: string, n: number) => `ex-${t.toLowerCase()}-${n}`;
function seed() {
  for (const k of Object.keys(db)) db[k].length = 0;
  G.__pushes = []; G.__AI_CALLS = [];
  db.user.push(
    { id: PAULO_ID, role: 'ADMIN', email: 'paulo@x.com', name: 'Paulo', accountStatus: 'ACTIVE', active: true },
    { id: ADRI_ID, role: 'ADMIN', email: 'adri.personal@hotmail.com', name: 'Adri', accountStatus: 'ACTIVE', active: true },
    { id: 'parceiro', role: 'COACH', email: 'p@x.com', name: 'Parceiro', accountStatus: 'ACTIVE', active: true },
    { id: 's8', role: 'USER', email: 's8@x.com', name: 'Ana 8S', plan: 'FICHA_8S', coachId: PAULO_ID, gender: 'Feminino', birthDate: '1995-05-10', dietModule: false },
    { id: 's21', role: 'USER', email: 's21@x.com', name: 'Bruno 21', plan: 'CHALLENGE_21', coachId: PAULO_ID, gender: 'Masculino', birthDate: '1990-01-20', dietModule: false },
    { id: 'sp', role: 'USER', email: 'sp@x.com', name: 'Aluno do parceiro', plan: 'FICHA_8S', coachId: 'parceiro', gender: 'Masculino', birthDate: '1990-01-20' },
    { id: 'sx', role: 'USER', email: 'sx@x.com', name: 'Elite', plan: 'ELITE', coachId: PAULO_ID, gender: 'Masculino', birthDate: '1990-01-20' },
    { id: 'snoa', role: 'USER', email: 'sn@x.com', name: 'Sem anamnese', plan: 'CHALLENGE_21', coachId: PAULO_ID, gender: 'Feminino', birthDate: '1998-02-02' },
  );
  for (const t of TARGETS) for (let n = 1; n <= 6; n++) {
    db.exercise.push({ id: exId(t, n), coachId: PAULO_ID, name: `${t} ${n}`, category: t === 'CARDIO' ? 'Cardio' : 'Musculação', subCategory: t, videoUrl: '', tags: { target: t, equipment: 'MAQUINA', mechanic: 'COMPOSTO' }, environments: ['UNIVERSAL'], defaultSubstitutes: [exId(t, n === 6 ? 1 : n + 1)] });
  }
  const base = { peso: 70, altura: 170, imc: 24.2, objetivo: 'Hipertrofia', nivel: 'Intermediário', frequencia: 4, tempoDisponivel: 60, limitacoes: ['Joelho'], cirurgias: [], equipamentos: ['Academia Completa'], healthConditions: ['Hipertensão'], medications: [], digestiveIssues: ['Nenhum'], wakeUpTime: '07:00', sleepTime: '23:00', trainTime: '18:00', freeDays: [], budget: 'moderado', favoriteFoodIds: [], createdAt: new Date() };
  db.anamnese.push(
    { id: 'a8', userId: 's8', ...base, focoPrincipal: 'Glúteos' },
    { id: 'a21', userId: 's21', ...base, objetivo: 'Hipertrofia', nivel: 'Iniciante', frequencia: 2, limitacoes: [], healthConditions: [] },   // marcou o objetivo errado: o desafio ignora e trata como emagrecimento
    { id: 'ap', userId: 'sp', ...base },
  );
  db.workout.push({ id: 'ph', userId: 's8', name: 'FICHA EM CONSTRUÇÃO 🚧', archived: false, createdAt: new Date(Date.now() - 1000) });
  AP.__resetAutoPlanMemory();
}

// IA simulada: o treino devolve 3 exercícios por dia pedido; a dieta devolve refeições com alimentos do catálogo.
function installAI(opts: { failDiet?: () => boolean; failWorkout?: () => boolean } = {}) {
  G.__GEMINI = async ({ contents }: any) => {
    const text = String(contents);
    if (text.includes('Nutricionista Especialista')) {
      if (opts.failDiet?.()) throw new Error('IA da dieta fora do ar');
      const meals = [
        ['Café da Manhã', '07:00', [['67b01945', 'Ovos Inteiros', '100', 'g1'], ['4b6eb78f', 'Pão de Forma Tradicional', '60', 'g2']]],
        ['Almoço', '12:30', [['7fa55081', 'Frango Grelhado', '150', 'g3'], ['928041e8', 'Tilápia Grelhada', '190', 'g3'], ['fa4ba3b8', 'Arroz Branco', '150', 'g4'], ['7ff6a7f4', 'Batata Doce Cozida', '200', 'g4']]],
        ['Jantar', '20:00', [['d965922a', 'Peito de Peru Grelhado', '150', 'g5'], ['7ff6a7f4', 'Batata Doce Cozida', '200', 'g6']]],
      ].map(([name, time, items]: any) => ({ name, time, notes: 'dica', items: items.map(([food_id, food_name, amount, groupId]: any) => ({ food_id, food_name, amount, unit: 'g', groupId })) }));
      return { text: JSON.stringify({ reasoning: 'ok', meals }), usageMetadata: { promptTokenCount: 3000, candidatesTokenCount: 1500 } };
    }
    if (opts.failWorkout?.()) throw new Error('IA do treino fora do ar');
    // IA decente: devolve exatamente o que a estrutura do ciclo pediu (grupo, quantidade de exercícios e de séries por dia)
    const exercisesByDay: any = {};
    for (const [, d, body] of text.matchAll(/Dia ([A-Z]):\n((?:    - .*\n?)*)/g)) {
      const list: any[] = [];
      for (const [, g, qty, sets] of body.matchAll(/- ([A-Z_]+): (\d+) exercício\(s\)(?:, (\d+) séries)?/g)) {
        for (let n = 1; n <= Number(qty); n++) {
          const cardio = g === 'CARDIO';
          list.push({
            exerciseId: exId(g, n), title: `${g} ${n}`, category: cardio ? 'Cardio' : 'Musculação', subCategory: g, observation: '',
            substitute: { exerciseId: exId(g, n === 6 ? 1 : n + 1), title: `${g} ${n + 1}` },
            blocks: cardio ? [{ sets: '30', reps: '300', load: '', restTime: '0', technique: 'Moderada' }] : Array.from({ length: Number(sets || 4) }, () => ({ sets: '1', reps: '12', load: '20kg', restTime: '60', technique: '' })),
          });
        }
      }
      exercisesByDay[d] = list;
    }
    return { text: JSON.stringify({ workoutName: 'Rotina IA', workoutModel: 'CARGA', reasoning: 'x', exercisesByDay }) };
  };
}

(async () => {
  // ═════ 1) Planejamento (puro) ═════
  const aMuscle = { objetivo: 'Hipertrofia', nivel: 'Intermediário', frequencia: 4, focoPrincipal: 'Glúteos' };
  const s8 = AP.planSpec('FICHA_8S', aMuscle);
  assert.equal(s8.totalDays, 56); assert.equal(s8.phases.length, 2); assert.equal(s8.phases[0].days + s8.phases[1].days, 56, 'duas fases de 4 semanas');
  assert.equal(s8.phases[0].cyclePhase, 'HIPERTROFIA'); assert.equal(s8.phases[1].cyclePhase, 'CHOQUE'); assert.equal(s8.focus, 'Glúteos'); assert.equal(s8.fatLoss, false);
  const s8beg = AP.planSpec('FICHA_8S', { ...aMuscle, nivel: 'Iniciante' });
  assert.equal(s8beg.phases[1].cyclePhase, 'HIPERTROFIA', 'iniciante não vai pra fase de choque'); assert.deepEqual(s8beg.phases[0].techniques, ['BISET']);
  const s8fat = AP.planSpec('FICHA_8S', { objetivo: 'Emagrecimento', nivel: 'Intermediário', frequencia: 3, focoPrincipal: 'Glúteos' });
  assert.equal(s8fat.fatLoss, true); assert.equal(s8fat.focus, null, 'perda de peso ignora foco de área'); assert.deepEqual(s8fat.phases.map((p) => p.cyclePhase), ['EMAGRECIMENTO', 'DEFINICAO']);
  const s21 = AP.planSpec('CHALLENGE_21', { objetivo: 'Hipertrofia', nivel: 'Iniciante', frequencia: 2 });
  assert.equal(s21.totalDays, 21); assert.equal(s21.phases.length, 1); assert.equal(s21.objective, 'Emagrecimento', 'em 21 dias o objetivo é sempre emagrecimento'); assert.equal(s21.freq, 4, 'desafio: 4 treinos de musculação por semana'); assert.equal(s21.cardioDays, 2, '2 dias só de cardio'); assert.equal(s21.restDays, 1, '1 dia de descanso'); assert.equal(s21.diet, false, 'desafio usa os cardápios prontos, não a IA'); assert.equal(AP.planSpec('FICHA_8S', { frequencia: 3 }).diet, true, 'ficha tem dieta da IA'); assert.equal(AP.planSpec('FICHA_8S', { frequencia: 3 }).cardioDays, 0);
  assert.equal(AP.planSpec('CHALLENGE_21', { frequencia: 7 }).freq, 4, 'a semana do desafio é fixa'); assert.equal(AP.planSpec('CHALLENGE_21', { frequencia: 1 }).freq, 4); assert.equal(AP.planSpec('CHALLENGE_21', {}).freq, 4); assert.equal(AP.planSpec('FICHA_8S', { frequencia: 9 }).freq, 6); assert.equal(AP.planSpec('FICHA_8S', { frequencia: 0 }).freq, 3, 'sem frequência = 3');
  assert.equal(AP.planSpec('FICHA_8S', { focoPrincipal: 'Cabeça' }).focus, null, 'foco desconhecido é ignorado');
  assert.equal(AP.levelOf('Iniciante'), 'INICIANTE'); assert.equal(AP.levelOf('Intermediário'), 'INTERMEDIARIO'); assert.equal(AP.levelOf('Avançado'), 'AVANCADO'); assert.equal(AP.levelOf(null), 'AVANCADO');

  // divisão + foco
  const plain = AP.buildSplit({ ...s8, focus: null }, 'Feminino');
  const focused = AP.buildSplit(s8, 'Feminino');
  const qty = (days: any[], id: string) => days.flatMap((d) => d.groups).filter((g: any) => g.id === id).reduce((s: number, g: any) => s + g.qty, 0);
  assert.equal(plain.length, 4); assert.ok(qty(focused, 'GLUTEOS') > qty(plain, 'GLUTEOS'), 'foco em glúteos aumenta o volume de glúteos');
  plain.forEach((d, i) => { const q0 = d.groups.find((g: any) => g.id === 'GLUTEOS')?.qty; if (q0) assert.equal(focused[i].groups.find((g: any) => g.id === 'GLUTEOS').qty, q0 + 1, 'dia que já treina glúteos ganha +1 exercício'); });
  assert.ok(plain.some((d) => d.groups.some((g: any) => g.id === 'GLUTEOS')), 'a divisão feminina de 4 dias já tinha glúteos');
  assert.ok(focused.filter((d) => d.groups.some((g: any) => g.id === 'GLUTEOS')).length >= 3, 'área em foco aparece 3x/semana com 4 treinos');
  assert.equal(AP.applyFocus(plain, 'Cabeça', 4), plain, 'foco desconhecido não muda nada');
  const orig = JSON.stringify(plain); AP.applyFocus(plain, 'Glúteos', 4); assert.equal(JSON.stringify(plain), orig, 'applyFocus não altera o original');
  const fat3 = AP.buildSplit(s21, 'Masculino'); assert.equal(fat3.length, 6, 'desafio: 4 treinos + 2 dias só de cardio'); assert.deepEqual(fat3.map((d) => d.name), ['A', 'B', 'C', 'D', 'E', 'F']);
  assert.ok(fat3.slice(0, 4).every((d) => d.groups.some((g: any) => g.id !== 'CARDIO')), 'A-D são de musculação'); assert.ok(fat3.slice(4).every((d) => d.groups.length === 1 && d.groups[0].id === 'CARDIO' && d.groups[0].qty === 2), 'E e F: só 2 exercícios de cardio');
  for (const g of ['Feminino', 'Masculino']) { const sp6 = AP.buildSplit(s21, g); assert.equal(sp6.length, 6, g); for (const grp of ['PEITO', 'OMBRO_LATERAL', 'BICEPS', 'TRICEPS', 'QUADRICEPS']) assert.ok(sp6.slice(0, 4).some((d) => d.groups.some((x: any) => x.id === grp)), `${g}: ${grp} nos 4 treinos`); }
  assert.equal(AP.buildSplit({ ...s21, cardioDays: 0 }, 'Feminino').length, 4, 'sem dias de cardio: só os 4 treinos'); assert.equal(AP.buildSplit({ ...s21, cardioDays: 1 }, 'Feminino').length, 5);
  assert.equal(AP.buildSplit({ ...s8fat, freq: 5 }, 'Feminino').length, 5, 'ficha de emagrecer: sem dia de cardio'); assert.ok(AP.buildSplit({ ...s8fat, freq: 5 }, 'Feminino')[4].groups.some((g: any) => g.id === 'GLUTEOS'), 'ficha, mulher: 5º dia é glúteos'); assert.ok(AP.buildSplit({ ...s8fat, freq: 5 }, 'Masculino')[4].groups.some((g: any) => g.id === 'QUADRICEPS'), 'ficha, homem: 5º dia é quadríceps');
  assert.ok(fat3.every((d) => d.groups.length > 0), 'nenhum dia vazio');

  // configuração do ciclo
  const anam = { limitacoes: ['Joelho', 'Dor lombar'], cirurgias: [], equipamentos: ['Em Casa'] };
  const cfg1 = AP.buildCycleConfig(s8, s8.phases[0], anam, 'Feminino');
  const cfg2 = AP.buildCycleConfig(s8, s8.phases[1], anam, 'Feminino');
  assert.equal(cfg1.phase, 'HIPERTROFIA'); assert.equal(cfg2.phase, 'CHOQUE'); assert.equal(cfg1.trainingEnvironment, 'EM_CASA'); assert.equal(cfg1.selectedAI, 'GEMINI'); assert.equal(cfg1.cardioTarget, null);
  assert.ok(cfg1.limitationRules.some((r: any) => r.trigger === 'Joelho'), 'regra de joelho entra'); assert.ok(cfg1.limitationRules.some((r: any) => r.trigger === 'Lombar'), 'regra de lombar entra (a limitação "Dor lombar" contém "lombar")'.replace('a limitação "Dor lombar" contém "lombar"', 'contém lombar'));
  const gluteSets = (c: any) => c.days.flatMap((d: any) => d.groups).filter((g: any) => g.id === 'GLUTEOS').map((g: any) => g.sets);
  assert.ok(Math.max(...gluteSets(cfg2)) > Math.max(...gluteSets(cfg1)), 'fase 2 soma 1 série nos grupos do foco');
  const cfg21 = AP.buildCycleConfig(s21, s21.phases[0], { limitacoes: [], cirurgias: [], equipamentos: ['Academia Completa'] }, 'Masculino');
  assert.equal(cfg21.phase, 'EMAGRECIMENTO'); assert.equal(cfg21.cardioTarget, 300); assert.ok(cfg21.days.every((d: any) => d.groups.some((g: any) => g.id === 'CARDIO')), 'todo dia do desafio tem cardio'); assert.equal(cfg21.days.length, 6); assert.ok(cfg21.days.slice(0, 4).every((d: any) => d.groups[d.groups.length - 1].id === 'CARDIO' && d.groups[d.groups.length - 1].qty === 1 && d.groups.length > 1), 'cardio depois do treino de musculação'); assert.ok(cfg21.days.slice(4).every((d: any) => d.groups.length === 1 && d.groups[0].qty === 2), 'dias E e F só de cardio');
  assert.equal(cfg21.days[0].name, 'A'); assert.ok(cfg21.days.every((d: any) => d.groups.every((g: any) => g.sets !== undefined && g.rest !== undefined)));

  // pontos de atenção
  const fl = AP.reviewFlags({ healthConditions: ['Hipertensão', 'Nenhuma'], medications: ['Losartana'], bariatric: true, limitacoes: ['Joelho'], cirurgias: ['Nenhum'], imc: 36 }, { birthDate: '1990-01-01' });
  assert.ok(fl.some((f) => f.includes('Hipertensão')) && !fl.some((f) => f.includes('Nenhuma')), 'ignora "Nenhuma"'); assert.ok(fl.some((f) => f.includes('bariátrica'))); assert.ok(fl.some((f) => f.includes('IMC 36.0')));
  assert.ok(fl.some((f) => f.includes('Losartana')) && fl.some((f) => f.includes('Joelho')));
  assert.deepEqual(AP.reviewFlags({ healthConditions: ['Nenhuma'], limitacoes: [], cirurgias: [] }, { birthDate: '1990-01-01' }), [], 'sem pontos de atenção');
  assert.ok(AP.reviewFlags({}, { birthDate: '2015-01-01' }).some((f) => f.includes('Menor de idade')));

  // empacotamento do treino (mesmo formato do Montar treino do app)
  const rows = AP.packWorkoutRows('w1', { A: [{ exerciseId: 'e1', category: 'Musculação', substitute: { id: 'e2' }, blocks: [{ sets: '1', reps: '12', restTime: '45', technique: 'BISET' }, { sets: '1', reps: '10', restTime: '45', technique: 'BISET' }], observation: '' }, { exerciseId: 'e3', category: 'Cardio', blocks: [{ sets: '', reps: '300', restTime: '0', technique: 'Zona 2' }] }], ' B ': [{ exerciseId: 'e4', blocks: [] }] }, ['A', ' B ']);
  assert.equal(rows.length, 3); assert.deepEqual(rows.map((r) => r.order), [0, 1, 2]); assert.deepEqual(rows.map((r) => r.day), ['A', 'A', 'B']);
  assert.equal(rows[0].sets, 1); assert.equal(rows[0].reps, '12'); assert.equal(rows[0].restTime, 45); assert.deepEqual(rows[0].substitutes, ['e2']);
  const packed = JSON.parse(rows[0].technique); assert.equal(packed.t, 'BISET'); assert.equal(packed.b.length, 2); assert.equal(packed.o, '');
  assert.equal(rows[1].sets, 20, 'cardio sem minutos = 20'); assert.equal(rows[2].sets, 3, 'sem blocos = 3x10'); assert.equal(JSON.parse(rows[2].technique).b[0].reps, '10');

  // empacotamento da dieta
  const mc = AP.buildMealsCreate([{ name: 'Almoço', time: '12:00', dayType: 'TREINO', notes: 'n', items: [{ id: '7fa55081', name: 'Frango Grelhado', amount: '150', unit: 'g', calories_per_100: 165, p: 31, c: 0, f: 3, groupId: 'grp1' }, { id: '928041e8', name: 'Tilápia', amount: '190', unit: 'g', calories_per_100: 128, p: 26, c: 0, f: 2, groupId: 'grp1' }] }, { name: 'Ceia', dayType: 'DESCANSO', items: [] }]);
  assert.equal(mc.create.length, 2); assert.equal(mc.create[0].dayType, 'TREINO'); assert.equal(mc.create[1].dayType, 'DESCANSO'); assert.equal(mc.create[1].time, '00:00');
  const its = mc.create[0].items.create; assert.equal(its[0].substitutionGroupId, 'grp1'); assert.equal(its[1].substitutionGroupId, 'grp1'); assert.equal(its[0].amount, 150); assert.equal(its[0].calories, 165); assert.equal(its[0].protein, 31);
  assert.equal(mc.metaQueue.length, 2); assert.equal(mc.metaQueue[0].foodId, '7fa55081'); assert.equal(mc.metaQueue[0].foodItemId, its[0].id);

  // macros: mesma conta do app (déficit no desafio)
  const user = { gender: 'Masculino', birthDate: '1990-01-20' };
  const mDef = AP.macrosFor({ peso: 80, altura: 180, frequencia: 4 }, user, s21);
  const mBulk = AP.macrosFor({ peso: 80, altura: 180, frequencia: 4 }, user, { ...s8, objective: 'Hipertrofia' } as any);
  assert.ok(mDef.TREINO.kcal < mBulk.TREINO.kcal, 'emagrecer tem menos kcal que hipertrofia'); assert.ok(mDef.DESCANSO.kcal <= mDef.TREINO.kcal, 'descanso nunca passa o treino');
  assert.ok(mDef.TREINO.kcal >= 1000 && mDef.TREINO.kcal <= 1505 && mDef.DESCANSO.kcal >= 1000 && mDef.DESCANSO.kcal <= 1505, 'emagrecer: de 1.000 a 1.500 kcal: ' + JSON.stringify(mDef)); assert.ok(mBulk.TREINO.kcal > 1500, 'hipertrofia não é limitada a 1.500 kcal: ' + mBulk.TREINO.kcal);
  assert.ok(mDef.TREINO.prot >= 100 && mDef.TREINO.carb >= 100 && mDef.TREINO.fat >= 40, 'macros proporcionais (35/35/30)'); assert.ok(Math.abs(mDef.TREINO.prot * 4 + mDef.TREINO.carb * 4 + mDef.TREINO.fat * 9 - mDef.TREINO.kcal) <= 2, 'os macros fecham com as calorias');
  assert.ok(AP.dietInstruction(s21).includes('21 dias') && AP.dietInstruction(s8fat).includes('perder peso') && AP.dietInstruction(s8).includes('glúteos'));
  assert.equal(AP.studentMessage('DONE').includes('pronto'), true); assert.ok(AP.studentMessage('DONE', null, 'FICHA_8S').includes('dieta') && !AP.studentMessage('DONE', null, 'CHALLENGE_21').includes('dieta') && AP.studentMessage('DONE', null, 'CHALLENGE_21').includes('cardápios')); assert.ok(AP.studentMessage('RUNNING', null, 'CHALLENGE_21').includes('treino') && !AP.studentMessage('RUNNING', null, 'CHALLENGE_21').includes('dieta') && AP.studentMessage('RUNNING', null, 'FICHA_8S').includes('dieta')); assert.ok(AP.studentMessage('MANUAL').includes('coach'));

  // ═════ 2) Pipeline: ficha de 8 semanas ═════
  seed(); installAI();
  const t0 = Date.now();
  const st = await AP.startAutoPlan('s8'); assert.equal(st.started, true); assert.ok(st.runId);
  assert.ok(await waitFor(async () => (await AP.runStore.get(st.runId!))?.status === 'DONE'), 'ficha de 8 semanas termina');
  const run8: any = await AP.runStore.get(st.runId!);
  assert.equal(run8.attempts, 1); assert.equal(run8.step, 'DONE'); assert.equal(run8.error, null); assert.equal(run8.workoutIds.length, 2); assert.ok(run8.dietId); assert.equal(run8.summary.workoutDone, true); assert.equal(run8.summary.dietDone, true);
  assert.deepEqual(run8.summary.flags.some((f: string) => f.includes('Hipertensão')), true, 'pontos de atenção gravados'); assert.equal(run8.summary.focus, 'Glúteos');
  const ws = db.workout.filter((w: any) => run8.workoutIds.includes(w.id)).sort((a: any, b: any) => a.startDate - b.startDate);
  assert.equal(ws.length, 2); assert.ok(ws[0].name.includes('FICHA 8 SEMANAS') && ws[0].name.includes('Fase 1') && ws[1].name.includes('Fase 2'));
  const base = new Date(run8.summary.baseDate).getTime();
  assert.equal(ws[0].startDate.getTime(), base); assert.equal(ws[1].startDate.getTime(), base + 28 * dayMs, 'fase 2 começa no dia 29');
  assert.equal(ws[0].endDate.getTime(), base + 27 * dayMs, 'fase 1 termina no dia 28'); assert.equal(ws[1].endDate.getTime(), base + 55 * dayMs, 'a ficha termina no dia 56');
  // o app compara por DIA: nenhum dia pode ter as duas fases juntas nem ficar sem nenhuma
  const dayOf = (d: Date) => Math.floor((d.getTime() - base) / dayMs);
  for (let day = 0; day < 56; day++) { const live = ws.filter((w: any) => dayOf(w.startDate) <= day && day <= dayOf(w.endDate)); assert.equal(live.length, 1, `dia ${day + 1} da ficha tem exatamente 1 fase ativa`); }
  assert.ok(ws.every((w: any) => w.archived === false && w.isVisible === true && w.userId === 's8'));
  assert.equal(db.workout.find((w: any) => w.id === 'ph').archived, true, 'o "EM CONSTRUÇÃO" do cadastro antigo é arquivado');
  for (const w of ws) { const ex = db.workoutExercise.filter((e: any) => e.workoutId === w.id); assert.ok(ex.length >= 8, 'treino com exercícios'); const first = JSON.parse(ex[0].technique); assert.ok(Array.isArray(first.b) && first.b.length === 4); assert.ok(ex.every((e: any, i: number) => e.order === i)); assert.ok(ex.every((e: any) => ['A', 'B', 'C', 'D'].includes(e.day))); }
  assert.equal(new Set(db.workoutExercise.filter((e: any) => e.workoutId === ws[0].id).map((e: any) => e.day)).size, 4, '4 dias de treino');
  // dieta
  const diets = db.diet.filter((d: any) => d.userId === 's8'); assert.equal(diets.length, 1); const diet = diets[0];
  assert.equal(diet.isActive, true); assert.equal(diet.isStrategy, false); assert.ok(diet.totalKcal > 1200); assert.ok(diet.name.includes('Ficha 8 Semanas')); assert.ok(/Litros$/.test(diet.waterIntake), diet.waterIntake);
  const meals = db.meal.filter((m: any) => m.dietId === diet.id); assert.equal(new Set(meals.map((m: any) => m.dayType)).size, 2); assert.deepEqual([...new Set(meals.map((m: any) => m.dayType))].sort(), ['DESCANSO', 'TREINO']);
  assert.ok(meals.every((m: any) => m.name && m.time)); const items = db.foodItem.filter((i: any) => meals.some((m: any) => m.id === i.mealId)); assert.ok(items.length >= 12);
  assert.ok(items.some((i: any) => i.substitutionGroupId), 'substitutos agrupados'); assert.ok(items.every((i: any) => i.amount > 0 && i.calories >= 0));
  assert.ok(db.foodItemMeta.length >= 1 && db.foodItemMeta.every((m: any) => m.foodId), 'foodId guardado nos itens');
  assert.equal(db.user.find((u: any) => u.id === 's8').dietModule, true, 'aba Dieta liberada pro aluno');
  // IA: 2 chamadas de treino (uma por fase) + 2 de dieta (treino e descanso)
  const calls = G.__AI_CALLS.map((c: any) => String(c.contents)); assert.equal(calls.filter((c: string) => c.includes('Nutricionista Especialista')).length, 2); assert.equal(calls.filter((c: string) => c.includes('CONFIGURAÇÃO DO CICLO')).length, 2);
  const wCalls = calls.filter((c: string) => c.includes('CONFIGURAÇÃO DO CICLO')); assert.ok(wCalls[0].includes('Hipertrofia — volume moderado') && wCalls[1].includes('Choque — volume alto'), 'fase 1 hipertrofia, fase 2 choque');
  assert.ok(wCalls[1].includes('ROTINA ANTERIOR "'), 'a fase 2 enxerga a fase 1 e troca exercícios');
  assert.ok(wCalls[0].includes('Joelho') || wCalls[0].includes('joelho'), 'limitação do aluno chega na IA');
  assert.ok(calls.some((c: string) => c.includes('Ficha de 8 semanas com foco em glúteos')), 'instrução da dieta chega na IA');
  // avisos
  const pS = G.__pushes.filter((p: any) => p.to === 's8'); assert.equal(pS.length, 1); assert.equal(pS[0].data.type, 'auto_plan_ready'); assert.ok(pS[0].title.includes('pronto'));
  const pC = G.__pushes.filter((p: any) => p.to === PAULO_ID); assert.equal(pC.length, 1); assert.equal(pC[0].data.type, 'auto_plan_done'); assert.ok(pC[0].body.includes('Hipertensão'), 'push do coach traz o ponto de atenção');
  assert.ok(Date.now() - t0 < 3000, 'pipeline simulado é rápido');

  // ═════ 3) Idempotência / remontagem forçada ═════
  const again = await AP.startAutoPlan('s8'); assert.equal(again.started, false); assert.equal(again.reason, 'JA_DONE'); assert.equal(db.autoPlanRun.length, 1, 'segunda anamnese não cria outra corrida');
  const oldWorkoutIds = [...run8.workoutIds]; const oldDietId = run8.dietId;
  const forced = await AP.startAutoPlan('s8', { force: true }); assert.equal(forced.started, true); assert.notEqual(forced.runId, st.runId);
  assert.ok(await waitFor(async () => (await AP.runStore.get(forced.runId!))?.status === 'DONE'), 'remontagem termina');
  assert.ok(db.workout.filter((w: any) => oldWorkoutIds.includes(w.id)).every((w: any) => w.archived === true), 'treinos antigos arquivados');
  const activeNow = db.workout.filter((w: any) => w.userId === 's8' && !w.archived); assert.equal(activeNow.length, 2, 'só as 2 fases novas ativas');
  assert.equal(db.diet.find((d: any) => d.id === oldDietId).isActive, false, 'dieta antiga inativa'); assert.equal(db.diet.filter((d: any) => d.userId === 's8' && d.isActive).length, 1);

  // ═════ 4) Pipeline: desafio de 21 dias ═════
  G.__AI_CALLS = []; G.__pushes = [];
  const r21 = await AP.startAutoPlan('s21'); assert.ok(await waitFor(async () => (await AP.runStore.get(r21.runId!))?.status === 'DONE'));
  const run21: any = await AP.runStore.get(r21.runId!); assert.equal(run21.workoutIds.length, 1);
  const w21: any = db.workout.find((w: any) => w.id === run21.workoutIds[0]); assert.equal(w21.name, 'DESAFIO 21 DIAS'); assert.equal(w21.endDate.getTime() - w21.startDate.getTime(), 20 * dayMs, '21 dias: do dia 1 ao dia 21');
  const c21 = G.__AI_CALLS.map((c: any) => String(c.contents)); const wc21 = c21.filter((c: string) => c.includes('CONFIGURAÇÃO DO CICLO'));
  assert.equal(wc21.length, 1); assert.ok(wc21[0].includes('Emagrecimento — circuito'), 'desafio é sempre emagrecimento'); assert.ok(wc21[0].includes('CARDIO'), 'tem cardio'); assert.equal(wc21[0].match(/Dia [A-Z]:/g)!.length, 6, '4 treinos + 2 dias de cardio, não importa a frequência marcada');
  assert.equal(c21.filter((c: string) => c.includes('Nutricionista Especialista')).length, 0, 'desafio: nenhuma chamada de IA da dieta (usa os cardápios prontos)'); assert.equal(db.diet.filter((d: any) => d.userId === 's21').length, 0);
  assert.equal(db.user.find((u: any) => u.id === 's21').dietModule, false, 'a aba Dieta não é ligada: o desafio usa os cardápios');
  assert.equal(run21.dietId, null); assert.equal(run21.summary.dietDone, undefined);
  const rows21 = db.workoutExercise.filter((e: any) => e.workoutId === w21.id); const byDay21 = (d: string) => rows21.filter((e: any) => e.day === d);
  assert.deepEqual([...new Set(rows21.map((e: any) => e.day))].sort(), ['A', 'B', 'C', 'D', 'E', 'F'], 'seis abas'); for (const d of ['A', 'B', 'C', 'D']) { const r = byDay21(d); assert.ok(r.length >= 8, d); assert.ok(String(r[r.length - 1].exerciseId).includes('cardio'), `${d}: o cardio vem depois da musculação`); assert.ok(r.slice(0, -1).every((e: any) => !String(e.exerciseId).includes('cardio'))); }
  for (const d of ['E', 'F']) { const r = byDay21(d); assert.equal(r.length, 2, d); assert.ok(r.every((e: any) => String(e.exerciseId).includes('cardio')), `${d}: só cardio`); }
  const st21 = await AP.getAutoPlanStatus('s21'); assert.equal(st21.status, 'DONE'); assert.equal(st21.dietReady, true, 'sem dieta da IA: nada a esperar'); assert.equal(st21.workoutReady, true); assert.ok(st21.message.includes('cardápios'));
  const p21 = G.__pushes.filter((p: any) => p.to === 's21'); assert.equal(p21.length, 1); assert.ok(p21[0].body.includes('cardápios') && !p21[0].body.includes('dieta'));
  const c21p = G.__pushes.find((p: any) => p.to === PAULO_ID && p.data.type === 'auto_plan_done'); assert.ok(c21p.body.includes('já tem treino.') && !c21p.body.includes('dieta'), c21p.body);

  // ═════ 5) Execução simultânea: só uma vence ═════
  seed(); installAI(); G.__AI_CALLS = [];
  const runRow = await AP.runStore.create('s8', 'FICHA_8S');
  await Promise.all([AP.executeRun(runRow.id), AP.executeRun(runRow.id), AP.executeRun(runRow.id)]);
  assert.equal(G.__AI_CALLS.filter((c: any) => String(c.contents).includes('Nutricionista Especialista')).length, 2, 'dieta gerada uma única vez mesmo com 3 execuções ao mesmo tempo');
  assert.equal(db.workout.filter((w: any) => w.userId === 's8' && !w.archived).length, 2); assert.equal(db.diet.filter((d: any) => d.userId === 's8').length, 1);
  assert.equal(((await AP.runStore.get(runRow.id)) as any).attempts, 1);

  // ═════ 6) Aluno de coach parceiro: manual, sem gastar IA ═════
  seed(); installAI();
  const sp = await AP.startAutoPlan('sp'); assert.ok(await waitFor(async () => (await AP.runStore.get(sp.runId!))?.status === 'MANUAL'));
  assert.equal(G.__AI_CALLS.length, 0, 'nenhuma chamada de IA para aluno de parceiro'); assert.equal(db.diet.length, 0); assert.equal(db.workout.filter((w: any) => w.userId === 'sp').length, 0);
  assert.equal(((await AP.runStore.get(sp.runId!)) as any).error, 'COACH_PARCEIRO'); const pp = G.__pushes.filter((p: any) => p.to === 'parceiro'); assert.equal(pp.length, 1); assert.equal(pp[0].data.type, 'auto_plan_manual');
  const stSp = await AP.getAutoPlanStatus('sp'); assert.equal(stSp.status, 'MANUAL'); assert.ok(stSp.message.includes('coach'));
  // plano que não é automático
  seed(); const nx = await AP.startAutoPlan('sx'); assert.equal(nx.started, false); assert.equal(nx.reason, 'PLANO_SEM_MONTAGEM_AUTOMATICA'); assert.equal(db.autoPlanRun.length, 0);
  assert.equal((await AP.startAutoPlan('fantasma')).reason, 'ALUNO_NAO_ENCONTRADO');

  // ═════ 7) Falha da IA da dieta: o treino fica salvo e a retomada não refaz o que já está pronto ═════
  seed(); let dietFails = 99; installAI({ failDiet: () => dietFails-- > 0 });
  const f1 = await quiet(() => AP.startAutoPlan('s8')); assert.ok(await waitFor(async () => (await AP.runStore.get(f1.runId!))?.status === 'FAILED'));
  let fr: any = await AP.runStore.get(f1.runId!); assert.equal(fr.attempts, 1); assert.ok(fr.error.includes('dieta fora do ar')); assert.equal(fr.workoutIds.length, 2, 'treino salvo apesar da falha da dieta'); assert.equal(fr.dietId, null); assert.equal(fr.summary.workoutDone, true);
  assert.equal(db.diet.length, 0); assert.equal(G.__pushes.filter((p: any) => p.data?.type === 'auto_plan_ready').length, 0, 'não avisa "pronto" com plano pela metade');
  assert.equal(G.__pushes.filter((p: any) => p.data?.type === 'auto_plan_failed').length, 0, 'primeira falha não incomoda o coach');
  // consulta imediata (dentro do intervalo mínimo) não recomeça
  const stFailed = await AP.getAutoPlanStatus('s8'); assert.equal(stFailed.status, 'FAILED'); assert.equal(stFailed.workoutReady, true); assert.equal(stFailed.dietReady, false); assert.ok(stFailed.message.includes('finalizando'));
  await sleep(40); assert.equal(((await AP.runStore.get(f1.runId!)) as any).attempts, 1, 'dentro de 1 minuto não tenta de novo');
  // passado o intervalo, a consulta retoma; a IA já voltou
  dietFails = 0; const wBefore = db.workout.filter((w: any) => w.userId === 's8').length; fr.finishedAt = new Date(Date.now() - 120000); await AP.runStore.update(fr.id, { finishedAt: fr.finishedAt });
  G.__AI_CALLS = []; await AP.getAutoPlanStatus('s8');
  assert.ok(await waitFor(async () => (await AP.runStore.get(f1.runId!))?.status === 'DONE'), 'retomada conclui');
  fr = await AP.runStore.get(f1.runId!); assert.equal(fr.attempts, 2); assert.equal(db.workout.filter((w: any) => w.userId === 's8').length, wBefore, 'treino NÃO foi recriado na retomada');
  assert.equal(G.__AI_CALLS.filter((c: any) => String(c.contents).includes('CONFIGURAÇÃO DO CICLO')).length, 0, 'IA de treino não é chamada de novo'); assert.ok(fr.dietId);
  assert.equal(G.__pushes.filter((p: any) => p.data?.type === 'auto_plan_ready').length, 1);
  // treino apagado pelo coach no meio: a fase é refeita
  seed(); installAI(); let gone = await AP.startAutoPlan('s8'); await waitFor(async () => (await AP.runStore.get(gone.runId!))?.status === 'DONE');
  const doneRun: any = await AP.runStore.get(gone.runId!); db.workout.splice(db.workout.findIndex((w: any) => w.id === doneRun.workoutIds[1]), 1);
  await AP.runStore.update(doneRun.id, { status: 'FAILED', finishedAt: new Date(Date.now() - 120000), summary: { ...doneRun.summary, workoutDone: false } }); G.__AI_CALLS = [];
  await AP.getAutoPlanStatus('s8'); assert.ok(await waitFor(async () => (await AP.runStore.get(doneRun.id))?.status === 'DONE'));
  assert.equal(G.__AI_CALLS.filter((c: any) => String(c.contents).includes('CONFIGURAÇÃO DO CICLO')).length, 1, 'só a fase apagada é gerada de novo');
  assert.equal(((await AP.runStore.get(doneRun.id)) as any).workoutIds.length, 2);

  // 3 falhas seguidas: avisa o coach e para de tentar sozinho
  seed(); installAI({ failWorkout: () => true });
  const g1 = await quiet(() => AP.startAutoPlan('s21'));
  for (let i = 1; i <= 3; i++) {
    assert.ok(await waitFor(async () => { const r: any = await AP.runStore.get(g1.runId!); return r.status === 'FAILED' && r.attempts === i; }), 'tentativa ' + i);
    if (i < 3) { await AP.runStore.update(g1.runId!, { finishedAt: new Date(Date.now() - 120000) }); await quiet(() => AP.getAutoPlanStatus('s21')); }
  }
  assert.equal(G.__pushes.filter((p: any) => p.data?.type === 'auto_plan_failed').length, 1, 'coach avisado na 3ª falha'); assert.equal(G.__pushes.find((p: any) => p.data?.type === 'auto_plan_failed').to, PAULO_ID);
  await AP.runStore.update(g1.runId!, { finishedAt: new Date(Date.now() - 120000) }); await AP.getAutoPlanStatus('s21'); await sleep(40);
  assert.equal(((await AP.runStore.get(g1.runId!)) as any).attempts, 3, 'depois da 3ª falha não tenta mais sozinho');
  // o coach manda tentar de novo (force) e funciona
  installAI(); const forced2 = await AP.startAutoPlan('s21', { force: true }); assert.ok(await waitFor(async () => (await AP.runStore.get(forced2.runId!))?.status === 'DONE'), 'coach refaz depois da falha');

  // 7b) uma falha passageira da IA é absorvida pela segunda tentativa da própria chamada (não conta como tentativa da corrida)
  seed(); let blips = 1; installAI({ failDiet: () => blips-- > 0 });
  const tb = await quiet(() => AP.startAutoPlan('s8')); assert.ok(await waitFor(async () => (await AP.runStore.get(tb.runId!))?.status === 'DONE'), 'falha única da IA é absorvida');
  assert.equal(((await AP.runStore.get(tb.runId!)) as any).attempts, 1);
  // 7c) a IA do TREINO falha na 2ª fase: o treino fica pela metade (workoutReady=false) e a dieta pronta é reaproveitada na retomada
  seed(); let wcalls = 0; installAI({ failWorkout: () => ++wcalls >= 2 });
  const tc = await quiet(() => AP.startAutoPlan('s8')); assert.ok(await waitFor(async () => (await AP.runStore.get(tc.runId!))?.status === 'FAILED'));
  let cr: any = await AP.runStore.get(tc.runId!); assert.equal(cr.workoutIds.length, 1, 'só a fase 1 foi salva'); assert.ok(cr.dietId, 'a dieta ficou pronta'); assert.ok(!cr.summary.workoutDone, 'treino ainda não concluído');
  const stHalf = await AP.getAutoPlanStatus('s8'); assert.equal(stHalf.workoutReady, false, 'treino pela metade não conta como pronto'); assert.equal(stHalf.dietReady, true);
  wcalls = -99; const dietIdBefore = cr.dietId; G.__AI_CALLS = []; await AP.runStore.update(cr.id, { finishedAt: new Date(Date.now() - 120000) }); await AP.getAutoPlanStatus('s8');
  assert.ok(await waitFor(async () => (await AP.runStore.get(tc.runId!))?.status === 'DONE'), 'retomada fecha a fase 2');
  cr = await AP.runStore.get(tc.runId!); assert.equal(cr.dietId, dietIdBefore, 'dieta reaproveitada'); assert.equal(G.__AI_CALLS.filter((c: any) => String(c.contents).includes('Nutricionista Especialista')).length, 0, 'IA da dieta não é chamada de novo');
  assert.equal(G.__AI_CALLS.filter((c: any) => String(c.contents).includes('CONFIGURAÇÃO DO CICLO')).length, 1, 'só a fase 2 é gerada'); assert.equal(cr.workoutIds.length, 2); assert.equal(db.diet.filter((d: any) => d.userId === 's8').length, 1);
  assert.equal(cr.summary.workoutDone, true); assert.equal((await AP.getAutoPlanStatus('s8')).workoutReady, true);
  // 7d) quem reenvia a anamnese com a corrida PENDENTE ou com FALHA retoma essa mesma corrida (não cria outra)
  seed(); installAI(); const pend = await AP.runStore.create('s8', 'FICHA_8S');
  const resumed = await AP.startAutoPlan('s8'); assert.equal(resumed.started, true); assert.equal(resumed.reason, 'RETOMADA'); assert.equal(resumed.runId, pend.id); assert.ok(await waitFor(async () => (await AP.runStore.get(pend.id))?.status === 'DONE')); assert.equal(db.autoPlanRun.length, 1);
  seed(); installAI(); const fl2 = await AP.runStore.create('s21', 'CHALLENGE_21'); await AP.runStore.update(fl2.id, { status: 'FAILED', attempts: 1, finishedAt: new Date() });
  const resumed2 = await AP.startAutoPlan('s21'); assert.equal(resumed2.reason, 'RETOMADA'); assert.ok(await waitFor(async () => (await AP.runStore.get(fl2.id))?.status === 'DONE'));

  // ═════ 8) RUNNING esquecida x recente ═════
  seed(); installAI(); G.__AI_CALLS = [];
  const rr = await AP.runStore.create('s8', 'FICHA_8S'); await AP.runStore.update(rr.id, { status: 'RUNNING', startedAt: new Date(Date.now() - 60000), attempts: 1 });
  assert.equal((await AP.startAutoPlan('s8', { force: true })).reason, 'JA_RUNNING', 'nem force dispara por cima de uma montagem em andamento');
  await AP.getAutoPlanStatus('s8'); await sleep(40); assert.equal(G.__AI_CALLS.length, 0, 'RUNNING de 1 minuto atrás não é retomada'); assert.equal(((await AP.runStore.get(rr.id)) as any).status, 'RUNNING');
  await AP.runStore.update(rr.id, { startedAt: new Date(Date.now() - 20 * 60000) }); await AP.getAutoPlanStatus('s8');
  assert.ok(await waitFor(async () => (await AP.runStore.get(rr.id))?.status === 'DONE'), 'RUNNING de 20 minutos atrás (servidor caiu) é retomada'); assert.equal(((await AP.runStore.get(rr.id)) as any).attempts, 2);

  // ═════ 9) Sem anamnese ═════
  seed(); installAI();
  const sn = await AP.startAutoPlan('snoa'); assert.ok(await waitFor(async () => (await AP.runStore.get(sn.runId!))?.status === 'FAILED'));
  let snr: any = await AP.runStore.get(sn.runId!); assert.equal(snr.error, 'SEM_ANAMNESE'); assert.equal(snr.attempts, 0, 'falta de anamnese não gasta tentativa'); assert.equal(G.__AI_CALLS.length, 0);
  const firstStatus = await AP.getAutoPlanStatus('s8'); assert.ok(['PENDING', 'RUNNING', 'DONE'].includes(firstStatus.status), 'a consulta de um aluno com anamnese e sem corrida já cria a corrida');
  assert.ok(await waitFor(async () => (await AP.runStore.latest('s8'))?.status === 'DONE'), 'consulta de status de aluno com anamnese e sem corrida inicia a montagem');
  assert.equal((await AP.getAutoPlanStatus('sx')).status, 'NONE'); assert.equal((await AP.getAutoPlanStatus('sx')).message.includes('anamnese'), true);

  // ═════ 10) Tabela AutoPlanRun ainda não existe (deploy antes do db push): segue em memória ═════
  seed(); installAI(); const origCreate = (prisma as any).autoPlanRun.create; const origFind = (prisma as any).autoPlanRun.findFirst;
  (prisma as any).autoPlanRun.create = async () => { throw Object.assign(new Error('The table `public.AutoPlanRun` does not exist'), { code: 'P2021' }); };
  (prisma as any).autoPlanRun.findFirst = async () => { throw Object.assign(new Error('The table `public.AutoPlanRun` does not exist'), { code: 'P2021' }); };
  const mem = await quiet(() => AP.startAutoPlan('s21')); assert.equal(mem.started, true);
  assert.ok(await waitFor(async () => (await AP.getAutoPlanStatus('s21')).status === 'DONE'), 'sem a tabela, o plano ainda é montado'); assert.equal(db.diet.filter((d: any) => d.userId === 's21').length, 0);
  assert.equal((await AP.startAutoPlan('s21')).reason, 'JA_DONE', 'idempotente também em memória');
  (prisma as any).autoPlanRun.create = origCreate; (prisma as any).autoPlanRun.findFirst = origFind; AP.__resetAutoPlanMemory();

  // ═════ 11) Rotas ═════
  seed(); installAI();
  const S = (id: string, q = '') => ({ url: 'http://x/api/auto-plan/status' + q, method: 'GET' });
  assert.equal((await call(statusGET, null, 'USER', S('s8'))).status, 401);
  assert.equal((await call(statusGET, 'sx', 'USER', S('sx', '?userId=s8'))).status, 403, 'aluno não vê o plano de outro aluno');
  assert.equal((await call(statusGET, 'parceiro', 'COACH', S('x', '?userId=s8'))).status, 403, 'coach de outro time');
  assert.equal((await call(statusGET, 's8', 'USER', S('s8', '?userId=fantasma'))).status, 404);
  const own = await call(statusGET, 's8', 'USER', S('s8')); assert.equal(own.status, 200); assert.ok(['PENDING', 'RUNNING', 'DONE'].includes(own.json.status), 'aluno com anamnese e sem corrida: a consulta inicia'); assert.equal(own.json.summary, undefined, 'aluno não recebe o resumo interno'); assert.equal(own.json.error, undefined);
  assert.ok(await waitFor(async () => (await AP.runStore.latest('s8'))?.status === 'DONE'));
  const asCoach = await call(statusGET, PAULO_ID, 'ADMIN', S('x', '?userId=s8')); assert.equal(asCoach.status, 200); assert.equal(asCoach.json.status, 'DONE'); assert.ok(asCoach.json.summary.flags.length >= 1, 'coach vê os pontos de atenção'); assert.ok(asCoach.json.summary.dietCostBrl >= 0);
  assert.equal(asCoach.json.workoutReady, true); assert.equal(asCoach.json.dietReady, true);
  // disparo manual
  assert.equal((await call(runPOST, null, 'ADMIN', { body: { userId: 's8' } })).status, 401);
  const lock = await call(runPOST, 'parceiro', 'COACH', { body: { userId: 's8' } }); assert.equal(lock.status, 403); assert.equal(lock.json.code, 'AI_BUILDER_LOCKED');
  assert.equal((await call(runPOST, 's8', 'USER', { body: { userId: 's8' } })).status, 403, 'aluno não dispara'); assert.equal((await call(runPOST, PAULO_ID, 'ADMIN', { body: {} })).status, 400); assert.equal((await call(runPOST, PAULO_ID, 'ADMIN', { body: { userId: 'fantasma' } })).status, 404);
  const A: any = await import('/home/user/fitos-final/lib/aiAccess'); A.AI_BUILDER_EXTRA_IDS.push('parceiro');
  assert.equal((await call(runPOST, 'parceiro', 'COACH', { body: { userId: 's8' } })).status, 403, 'parceiro liberado na IA ainda não mexe em aluno dos outros');
  assert.equal((await call(runPOST, 'parceiro', 'COACH', { body: { userId: 'sp' } })).status, 200, 'mas mexe no próprio aluno'); A.AI_BUILDER_EXTRA_IDS.length = 0;
  const rj = await call(runPOST, PAULO_ID, 'ADMIN', { body: { userId: 's8' } }); assert.equal(rj.status, 200); assert.equal(rj.json.started, false); assert.equal(rj.json.reason, 'JA_DONE');
  const rf = await call(runPOST, ADRI_ID, 'ADMIN', { body: { userId: 's8', force: true } }); assert.equal(rf.status, 200); assert.equal(rf.json.started, true);
  assert.ok(await waitFor(async () => (await AP.runStore.get(rf.json.runId))?.status === 'DONE'));

  // ═════ 12) POST /api/anamnese dispara o plano ═════
  seed(); installAI(); db.anamnese.length = 0;
  const payload = { userId: 's8', peso: 68, altura: 168, objetivo: 'Hipertrofia', nivel: 'Iniciante', frequencia: 3, tempoDisponivel: 60, limitacoes: ['Nenhuma'], cirurgias: ['Nenhuma'], equipamentos: ['Academia Completa'], preworkoutStrategy: 'ceia_pretreino', focoPrincipal: 'Glúteos', trainFasted: true };
  const a1 = await call(anamnesePOST, 's8', 'USER', { body: payload }); assert.equal(a1.status, 200, JSON.stringify(a1.json));
  assert.equal(db.anamnese.length, 1); assert.equal(db.anamnese[0].focoPrincipal, 'Glúteos', 'foco gravado'); assert.equal(db.anamnese[0].preworkoutStrategy, 'ceia_pretreino', 'preworkoutStrategy agora é gravado'); assert.equal(db.user.find((u: any) => u.id === 's8').anamnesePendente, false);
  assert.ok(await waitFor(async () => (await AP.runStore.latest('s8'))?.status === 'DONE'), 'anamnese do aluno de ficha dispara o plano');
  assert.equal(db.workout.filter((w: any) => w.userId === 's8' && !w.archived).length, 2);
  const a2 = await call(anamnesePOST, 's8', 'USER', { body: { ...payload, peso: 67 } }); assert.equal(a2.status, 200); await sleep(50); assert.equal(db.autoPlanRun.length, 1, 'refazer a anamnese não remonta o plano');
  assert.equal(db.workout.filter((w: any) => w.userId === 's8' && !w.archived).length, 2);
  const ax = await call(anamnesePOST, 'sx', 'USER', { body: { ...payload, userId: 'sx' } }); assert.equal(ax.status, 200); await sleep(50); assert.equal(db.autoPlanRun.filter((r: any) => r.userId === 'sx').length, 0, 'plano ELITE não dispara montagem automática');
  assert.equal((await call(anamnesePOST, 's8', 'USER', { body: { userId: 's21', peso: 70, altura: 170 } })).status, 403, 'não grava anamnese de outro aluno');
  // falha ao iniciar o plano NÃO derruba o salvamento da anamnese
  seed(); installAI(); db.anamnese.length = 0; const origC = (prisma as any).autoPlanRun.create; (prisma as any).autoPlanRun.create = async () => { throw new Error('banco caiu'); };
  const a3 = await quiet(() => call(anamnesePOST, 's21', 'USER', { body: { ...payload, userId: 's21' } })); assert.equal(a3.status, 200, 'anamnese salva mesmo se o plano automático não pôde ser registrado'); assert.equal(db.anamnese.length, 1);
  (prisma as any).autoPlanRun.create = origC;
  // coluna focoPrincipal ainda não existe no banco: grava sem ela
  seed(); installAI(); db.anamnese.length = 0; const origA = (prisma as any).anamnese.create; let tries = 0;
  (prisma as any).anamnese.create = async (args: any) => { tries++; if ('focoPrincipal' in args.data) throw new Error('Unknown argument `focoPrincipal`'); return origA(args); };
  const a4 = await call(anamnesePOST, 's8', 'USER', { body: payload }); assert.equal(a4.status, 200); assert.equal(tries, 2); assert.equal(db.anamnese.length, 1); assert.equal(db.anamnese[0].focoPrincipal, undefined); (prisma as any).anamnese.create = origA;

  console.log('OK plano automático: planejamento, pipeline, retomada, rotas e gatilho');
})().catch((e) => { console.log('FALHOU', e && e.stack || e); process.exit(1); });
