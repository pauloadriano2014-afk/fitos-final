import assert from 'assert';
import jwt from 'jsonwebtoken';
import prisma from '@/lib/prisma';
import * as LS from '/home/user/fitos-final/lib/loadSuggest';
import { GET as workoutGET } from '/home/user/fitos-final/app/api/workout/route';
import { GET as userGET, PATCH as userPATCH } from '/home/user/fitos-final/app/api/admin/user/[id]/route';
import { GET as historyGET } from '/home/user/fitos-final/app/api/admin/user/[id]/history/route';
const P = prisma as any; const S = P.__state;
const SECRET = 'dev-only-troque-isso-configurando-JWT_SECRET-no-env';
const tok = (id: string, role = 'USER') => jwt.sign({ id, role, coachId: null }, SECRET);
const NOW = new Date('2026-10-07T12:00:00Z');
const DAY = 86400000;
const day = (n: number) => new Date(NOW.getTime() - n * DAY);
const sess = (daysAgo: number, loads: number[], effort: any = null, perSide = false): any => ({ date: day(daysAgo), sets: loads.map((w, i) => ({ setNumber: i + 1, weight: w, perSide })), effort });
const sug = (sessions: any[], o: any = {}) => LS.suggestLoad(sessions, { now: NOW, ...o });
const row = (exerciseId: string, setNumber: number, weight: number, o: any = {}) => ({ exerciseId, setNumber, weight, perSide: false, effort: null, cardioSeconds: null, cardioKcal: null, ...o });
const hist = (daysAgo: number, details: any[], id = 'h' + Math.random()) => ({ id, userId: 's1', date: day(daysAgo), details });

let fails = 0, passed = 0;
const block = async (name: string, fn: () => Promise<void> | void) => { try { P.__reset(); await fn(); passed++; console.log('  ok  ' + name); } catch (e: any) { fails++; console.log('  FALHOU  ' + name + '\n        ' + String((e && e.message) || e).split('\n').slice(0, 8).join('\n        ')); } };

(async () => {
  await block('texto puro: "como foi?" e salto do coach só aceitam valores válidos', () => {
    assert.deepStrictEqual(['facil', ' OK ', 'pesado', 'FACIL', 'xx', '', null, 5, undefined].map(LS.cleanEffort), ['FACIL', 'OK', 'PESADO', 'FACIL', null, null, null, null, null]);
    assert.deepStrictEqual(['2,5', 2.5, '1', 5, '3', 0, '', null, 'abc', '5', undefined, 2].map(LS.cleanStep), [2.5, 2.5, 1, 5, null, null, null, null, null, 5, null, 2]);
    assert.deepStrictEqual(LS.ALLOWED_STEPS, [1, 2, 2.5, 5]);
  });

  await block('salto automático: 5% da carga em passos de 0,5 kg, entre 1 e 5 (cada lado: número inteiro)', () => {
    const a = (l: number, s = false) => LS.autoStep(l, s);
    assert.deepStrictEqual([a(0), a(10), a(20), a(22.5), a(30), a(40), a(45), a(60), a(80), a(100), a(150), a(500)], [1, 1, 1, 1, 1.5, 2, 2.5, 3, 4, 5, 5, 5]);
    assert.deepStrictEqual([a(20, true), a(45, true), a(30, true), a(100, true), a(0, true)], [1, 3, 2, 5, 1], 'cada lado: inteiro (assim cada lado muda de 0,5 em 0,5)');
    assert.deepStrictEqual([LS.snapLoad(42.3, false), LS.snapLoad(42.2, false), LS.snapLoad(42.25, false), LS.snapLoad(41.4, true), LS.snapLoad(41.5, true), LS.snapLoad(0, false)], [42.5, 42, 42.5, 41, 42, 0]);
  });

  await block('treinos do exercício: só carga > 0, não mistura exercícios, cardio fora, "como foi" de qualquer série', () => {
    const h = [
      hist(2, [row('e1', 2, 40), row('e1', 1, 40, { effort: 'FACIL' }), row('e1', 3, 0), row('e2', 1, 60)]),
      hist(5, [row('e1', 1, 0), row('e1', 2, 0)]),               // tudo zero: não conta
      hist(9, [row('e1', 1, 38, { perSide: true, effort: 'xx' })]),
      hist(12, [row('e3', 1, 20)]),
    ];
    const s = LS.sessionsOf(h as any, 'e1');
    assert.strictEqual(s.length, 2, 'treino com tudo zero e treino de outro exercício não entram');
    assert.deepStrictEqual(s[0].sets.map((x) => [x.setNumber, x.weight]), [[1, 40], [2, 40]], 'série com 0 fora; em ordem de série');
    assert.strictEqual(s[0].effort, 'FACIL', 'o "como foi" pode estar em qualquer série');
    assert.deepStrictEqual([s[1].effort, s[1].sets[0].perSide], [null, true], '"como foi" inválido = sem resposta; cada lado vem junto');
    assert.deepStrictEqual(LS.sessionsOf(h as any, 'nenhum'), []);
    assert.deepStrictEqual(LS.sessionsOf([hist(1, [row('c1', 1, 20, { cardioSeconds: 1200 })]), hist(3, [row('c1', 1, 20)])] as any, 'c1'), [], 'cardio (peso = minutos) nunca vira sugestão');
    assert.deepStrictEqual(LS.sessionsOf([hist(1, [row('c1', 1, 20, { cardioKcal: 150 })])] as any, 'c1'), []);
    assert.deepStrictEqual(LS.sessionsOf([{ date: day(1), details: null } as any, { date: day(2) } as any], 'e1'), []);
    assert.deepStrictEqual(LS.sessionsOf(null as any, 'e1'), []);
  });

  await block('sem dado suficiente: nenhuma sugestão (nada de ruído na tela)', () => {
    assert.strictEqual(sug([]), null);
    assert.strictEqual(sug([sess(3, [40, 40, 40])]), null, 'um treino só, sem "como foi"');
    assert.strictEqual(sug([sess(3, [40, 40, 40], 'OK')]), null, '"na medida" sozinho não decide nada');
    assert.strictEqual(sug([sess(3, [42, 42]), sess(10, [40, 40])]), null, 'subiu a carga: espera repetir antes de subir de novo');
    assert.strictEqual(sug([sess(3, [40, 42, 44]), sess(10, [40, 40, 40])]), null, 'cargas diferentes em alguma série');
    assert.strictEqual(sug([{ date: day(3), sets: [], effort: null } as any]), null);
  });

  await block('SOBE: mesma carga nos 2 últimos treinos (salto automático; carga e séries certas)', () => {
    const r = sug([sess(3, [40, 40, 40]), sess(10, [40, 40, 40])])!;
    assert.deepStrictEqual([r.action, r.reason, r.step, r.from, r.to, r.perSide, r.daysSince], ['UP', 'REPEATED', 2, 40, 42, false, 3]);
    assert.deepStrictEqual(r.loads, { 1: 42, 2: 42, 3: 42 });
    assert.strictEqual(sug([sess(3, [40, 40], 'OK'), sess(10, [40, 40], 'OK')])!.action, 'UP');
    assert.strictEqual(sug([sess(3, [40, 40], 'OK'), sess(10, [40, 40], 'FACIL')])!.action, 'UP', 'o treino anterior ter sido fácil não atrapalha');
    assert.strictEqual(sug([sess(3, [40, 40]), sess(10, [40, 40], 'PESADO')]), null, 'o anterior foi pesado: não sobe agora');
    assert.deepStrictEqual(sug([sess(3, [30, 40, 50]), sess(10, [30, 40, 50])])!.loads, { 1: 32.5, 2: 42.5, 3: 52.5 }, 'pirâmide: o mesmo salto em cada série (passo da maior carga)');
    assert.deepStrictEqual(sug([sess(3, [40, 40, 40]), sess(10, [40, 40])])!.loads, { 1: 42, 2: 42, 3: 42 }, 'séries em comum iguais bastam');
    assert.strictEqual(sug([sess(3, [40, 40]), sess(10, [40.004, 40])])!.action, 'UP', 'diferença desprezível é a mesma carga');
    assert.strictEqual(sug([sess(3, [40, 40.5]), sess(10, [40, 40])]), null, 'uma série diferente: não é a mesma carga');
    assert.strictEqual(sug([{ date: day(3), sets: [{ setNumber: 2, weight: 40, perSide: false }], effort: null } as any, sess(10, [40])]), null, 'sem nenhuma série em comum não dá para comparar');
  });

  await block('SOBE com 1 treino só quando o aluno marcou FÁCIL (mesmo que tenha reduzido antes)', () => {
    const r = sug([sess(3, [40, 40], 'FACIL')])!;
    assert.deepStrictEqual([r.action, r.reason, r.to], ['UP', 'EASY', 42]);
    const q = sug([sess(3, [30, 30], 'FACIL'), sess(10, [40, 40])])!;
    assert.deepStrictEqual([q.action, q.reason, q.step, q.to, q.loads], ['UP', 'EASY', 1.5, 31.5, { 1: 31.5, 2: 31.5 }]);
  });

  await block('MANTÉM com PESADO; DESCE um degrau só com PESADO nos 2 últimos na mesma carga', () => {
    const a = sug([sess(3, [40, 40], 'PESADO')])!;
    assert.deepStrictEqual([a.action, a.reason, a.to, a.loads], ['HOLD', 'HEAVY', 40, { 1: 40, 2: 40 }]);
    const b = sug([sess(3, [40, 40], 'PESADO'), sess(10, [40, 40], 'PESADO')])!;
    assert.deepStrictEqual([b.action, b.reason, b.to, b.loads], ['DOWN', 'HEAVY_TWICE', 38, { 1: 38, 2: 38 }]);
    const c = sug([sess(3, [40], 'PESADO'), sess(10, [38], 'PESADO')])!;
    assert.deepStrictEqual([c.action, c.reason], ['HOLD', 'HEAVY'], 'carga diferente: não é "o mesmo peso pesado duas vezes"');
    assert.deepStrictEqual([sug([sess(3, [40], 'PESADO'), sess(10, [40], 'OK')])!.action, sug([sess(3, [40], 'PESADO'), sess(10, [40])])!.action], ['HOLD', 'HOLD']);
    const d = sug([sess(3, [1], 'PESADO'), sess(10, [1], 'PESADO')])!;
    assert.deepStrictEqual([d.action, d.to], ['HOLD', 1], 'nunca sugere 0 kg');
    assert.strictEqual(sug([sess(3, [40], 'PESADO'), sess(10, [40], 'FACIL')])!.action, 'HOLD');
    const p = sug([sess(3, [1, 60], 'PESADO'), sess(10, [1, 60], 'PESADO')])!;
    assert.deepStrictEqual([p.action, p.from, p.to, p.loads], ['DOWN', 60, 57, { 1: 1, 2: 57 }], 'pirâmide: a série de aquecimento leve não é zerada nem some');
    const q = sug([sess(3, [2, 40], 'PESADO'), sess(10, [2, 40], 'PESADO')])!; assert.deepStrictEqual(q.loads, { 1: 2, 2: 38 }, 'se o degrau é igual à carga da série, ela fica como estava');
  });

  await block('MANTÉM para firmar quando o aluno reduziu a carga; volta de pausa longa não sobe', () => {
    const a = sug([sess(3, [38, 38]), sess(10, [40, 40])])!;
    assert.deepStrictEqual([a.action, a.reason, a.to], ['HOLD', 'REDUCED', 38]);
    assert.strictEqual(sug([sess(3, [38, 38], 'OK'), sess(10, [40, 40])])!.reason, 'REDUCED');
    assert.strictEqual(sug([sess(3, [40, 38]), sess(10, [40, 40])]), null, 'só uma série mais leve (a maior carga é a mesma): nada a dizer');
    assert.strictEqual(sug([sess(3, [38, 40]), sess(10, [40, 42])])!.reason, 'REDUCED', 'a maior carga caiu');
    assert.strictEqual(sug([sess(3, [40, 40]), sess(10, [38, 38])]), null, 'subiu (não reduziu): aguarda repetir');
    const b = sug([sess(50, [40, 40], 'FACIL')])!;
    assert.deepStrictEqual([b.action, b.reason, b.daysSince, b.to], ['HOLD', 'BREAK', 50, 40]);
    assert.strictEqual(sug([sess(42, [40, 40], 'FACIL')])!.action, 'UP', '42 dias ainda não é pausa longa');
    assert.strictEqual(sug([sess(43, [40, 40], 'FACIL')])!.reason, 'BREAK');
    assert.strictEqual(sug([sess(60, [40, 40]), sess(70, [40, 40])])!.reason, 'BREAK', 'pausa vence a carga repetida');
    const part = sug([{ ...sess(0, [40, 40], 'FACIL'), date: new Date(NOW.getTime() - 42.6 * DAY) }])!; assert.deepStrictEqual([part.action, part.daysSince], ['UP', 42], 'dias contam inteiros (42,6 dias = 42): ainda não é pausa longa');
    const fut = sug([{ ...sess(0, [40, 40], 'FACIL'), date: new Date(NOW.getTime() + 3 * DAY) }])!; assert.deepStrictEqual([fut.action, fut.daysSince], ['UP', 0], 'data no futuro (relógio errado) = 0 dias');
  });

  await block('salto fixo do coach (1, 2, 2,5, 5); valor inválido volta ao automático', () => {
    const base = [sess(3, [40, 40]), sess(10, [40, 40])];
    assert.deepStrictEqual([1, 2, 2.5, 5].map((st) => sug(base, { step: st })!.to), [41, 42, 42.5, 45]);
    assert.strictEqual(sug(base, { step: 3 })!.to, 42, 'valor fora da lista = automático');
    assert.strictEqual(sug(base, { step: null })!.step, 2);
    assert.strictEqual(sug(base, { step: '2,5' as any })!.step, 2.5);
    assert.deepStrictEqual([sug([sess(3, [40], 'PESADO'), sess(10, [40], 'PESADO')], { step: 5 })!.to, sug([sess(3, [40], 'PESADO'), sess(10, [40], 'PESADO')], { step: 5 })!.action], [35, 'DOWN']);
    assert.strictEqual(sug([sess(3, [4], 'PESADO'), sess(10, [4], 'PESADO')], { step: 5 })!.action, 'HOLD', 'o degrau maior que a carga: mantém');
  });

  await block('cada lado: salto inteiro no total e o app sabe em que modo estava', () => {
    const r = sug([sess(3, [40, 40], null, true), sess(10, [40, 40], null, true)])!;
    assert.deepStrictEqual([r.perSide, r.step, r.to, r.loads], [true, 2, 42, { 1: 42, 2: 42 }]);
    const o = sug([sess(3, [45], null, true), sess(10, [45], null, true)])!;
    assert.deepStrictEqual([o.step, o.to], [3, 48], 'salto inteiro: cada lado muda 1,5 kg');
    assert.strictEqual(sug([{ date: day(3), sets: [{ setNumber: 1, weight: 40, perSide: true }, { setNumber: 2, weight: 40, perSide: false }], effort: null } as any, sess(10, [40, 40])])!.perSide, false, 'modo misto: tratado como total');
    assert.strictEqual(sug([sess(3, [41, 41], 'FACIL', true)])!.to, 43, '41 total (20,5 cada lado) + 2 = 43 (21,5 cada lado)');
    assert.strictEqual(sug([sess(3, [41, 41], 'FACIL', false)])!.to, 43);
    assert.strictEqual(sug([sess(3, [30, 30], 'FACIL', true)])!.to, 32, 'cada lado: 1,5 de salto vira 2 no total');
    assert.strictEqual(sug([sess(3, [30, 30], 'FACIL', false)])!.to, 31.5);
    const odd = sug([sess(3, [40.5], 'FACIL', true)])!; assert.deepStrictEqual([odd.to, odd.loads], [43, { 1: 43 }], 'cada lado: o total sempre cai em número inteiro (meio quilo por lado)');
    const oddT = sug([sess(3, [40.5], 'FACIL', false)])!; assert.deepStrictEqual([oddT.to, oddT.loads], [42.5, { 1: 42.5 }]);
  });

  await block('várias sugestões de uma vez: só exercícios com algo a dizer, ids repetidos ou vazios ignorados', () => {
    const h = [
      hist(2, [row('e1', 1, 40), row('e1', 2, 40), row('e2', 1, 20, { effort: 'FACIL' }), row('e3', 1, 10)]),
      hist(9, [row('e1', 1, 40), row('e1', 2, 40)]),
    ];
    const r = LS.buildLoadSuggestions(h as any, ['e1', 'e2', 'e3', 'e1', '', 'nenhum', undefined as any], { now: NOW });
    assert.deepStrictEqual(Object.keys(r).sort(), ['e1', 'e2']);
    assert.deepStrictEqual([r.e1.to, r.e1.reason, r.e2.to, r.e2.reason], [42, 'REPEATED', 21, 'EASY']);
    assert.deepStrictEqual(LS.buildLoadSuggestions([], ['e1']), {});
    assert.deepStrictEqual(LS.buildLoadSuggestions(h as any, []), {});
    const real = LS.buildLoadSuggestions([hist(1, [row('e1', 1, 40)]), hist(4, [row('e1', 1, 40)])] as any, ['e1']);
    assert.strictEqual(real.e1.action, 'UP', 'sem "now": usa o relógio de verdade');
  });

  // ───────────── rota do treino do aluno ─────────────
  const setupWorkout = () => {
    P.__addUser({ id: 'c1', role: 'COACH' }); P.__addUser({ id: 'c2', role: 'COACH' }); P.__addUser({ id: 's1', coachId: 'c1' }); P.__addUser({ id: 's2', coachId: 'c2' });
    ['e1', 'e2', 'e9'].forEach((id) => S.exercises.push({ id, name: 'Ex ' + id, videoUrl: null }));
    S.workouts.push({ id: 'w1', userId: 's1', name: 'A', exercises: [
      { id: 'we1', exerciseId: 'e1', order: 1, substitutes: ['e9'], exercise: { id: 'e1' }, substitute: null },
      { id: 'we2', exerciseId: 'e2', order: 2, substitutes: [], exercise: { id: 'e2' }, substitute: null },
    ] });
    S.histories.push(hist(2, [row('e1', 1, 40), row('e1', 2, 40), row('e9', 1, 20, { effort: 'FACIL' })], 'h2'), hist(9, [row('e1', 1, 40), row('e1', 2, 40)], 'h1'));
  };
  const get = async (as: string | null, q = 'userId=s1&workoutId=w1') => { const h: any = {}; if (as) h.authorization = 'Bearer ' + tok(as, as.startsWith('c') ? 'COACH' : 'USER'); const r = await workoutGET(new Request('http://x/api/workout?' + q, { headers: h })); return { status: r.status, json: await r.json() }; };

  await block('rota do treino: devolve a sugestão do exercício e de cada opção de troca (o resto da resposta segue igual)', async () => {
    setupWorkout();
    const r = await get('s1');
    assert.strictEqual(r.status, 200);
    assert.deepStrictEqual(Object.keys(r.json.loadSuggestions).sort(), ['e1', 'e9']);
    assert.deepStrictEqual([r.json.loadSuggestions.e1.action, r.json.loadSuggestions.e1.to, r.json.loadSuggestions.e1.loads], ['UP', 42, { 1: 42, 2: 42 }]);
    assert.deepStrictEqual([r.json.loadSuggestions.e9.reason, r.json.loadSuggestions.e9.to], ['EASY', 21], 'a opção de troca tem o histórico dela');
    assert.deepStrictEqual(r.json.lastWeights.e1, { 1: 40, 2: 40 }, 'cargas da vez anterior seguem iguais');
    assert.ok(r.json.lastWeightModes && r.json.exercises.length === 2);
    assert.strictEqual(r.json.loadSuggestEnabled, true, 'ligado por padrão');
  });

  await block('rota do treino: coach desligou = sem sugestões; salto do coach vale; sem histórico = vazio', async () => {
    setupWorkout();
    S.users.get('s1').loadSuggestOff = true;
    const off = await get('s1'); assert.deepStrictEqual(off.json.loadSuggestions, {}); assert.strictEqual(off.json.loadSuggestEnabled, false, 'o app sabe que foi desligado (para de perguntar "como foi?")'); assert.deepStrictEqual(off.json.lastWeights.e1, { 1: 40, 2: 40 }, 'o "Ant:" continua aparecendo');
    S.users.get('s1').loadSuggestOff = false; S.users.get('s1').loadStep = 5;
    const five = await get('s1'); assert.strictEqual(five.json.loadSuggestions.e1.to, 45);
    S.users.get('s1').loadStep = null; S.histories.length = 0;
    const none = await get('s1'); assert.deepStrictEqual(none.json.loadSuggestions, {});
  });

  await block('rota do treino: acesso (aluno, coach dele, outro coach, sem login)', async () => {
    setupWorkout();
    assert.strictEqual((await get('c1')).status, 200); assert.strictEqual((await get('c2')).status, 403); assert.strictEqual((await get('s2')).status, 403); assert.strictEqual((await get(null)).status, 401);
    assert.strictEqual((await get('s1', 'workoutId=w1')).status, 400);
  });

  // ───────────── ajustes do coach no aluno ─────────────
  const patch = async (as: string, id: string, body: any) => { const r = await userPATCH(new Request('http://x/api/admin/user/' + id, { method: 'PATCH', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + tok(as, as.startsWith('c') ? 'COACH' : 'USER') }, body: JSON.stringify(body) }), { params: { id } }); return { status: r.status, json: await r.json() }; };

  await block('ajustes: o coach liga/desliga e escolhe o salto (valor inválido = automático); lê de volta', async () => {
    setupWorkout();
    const a = await patch('c1', 's1', { loadSuggestOff: true, loadStep: '2,5' }); assert.deepStrictEqual([a.status, a.json.loadSuggestOff, a.json.loadStep], [200, true, 2.5]);
    const g = await userGET(new Request('http://x/api/admin/user/s1', { headers: { authorization: 'Bearer ' + tok('c1', 'COACH') } }), { params: { id: 's1' } }); const gj = await g.json();
    assert.deepStrictEqual([g.status, gj.loadSuggestOff, gj.loadStep], [200, true, 2.5], 'a tela do coach lê o estado atual');
    const b = await patch('c1', 's1', { loadStep: 3 }); assert.strictEqual(b.json.loadStep, null); assert.strictEqual(b.json.loadSuggestOff, true, 'o interruptor não muda sozinho');
    const c = await patch('c1', 's1', { loadSuggestOff: 'sim' }); assert.strictEqual(c.json.loadSuggestOff, false, 'só verdadeiro de verdade liga');
    const d = await patch('c1', 's1', { loadStep: 5 }); assert.strictEqual(d.json.loadStep, 5);
    const e = await patch('c1', 's1', { loadStep: null }); assert.strictEqual(e.json.loadStep, null, 'voltar ao automático');
    await patch('c1', 's1', { loadStep: 5 }); const f1 = await patch('c1', 's1', { loadSuggestOff: true }); assert.deepStrictEqual([f1.json.loadStep, f1.json.loadSuggestOff], [5, true], 'ligar/desligar não apaga o salto escolhido');
    const g2 = await patch('c1', 's1', { name: 'Ana Maria' }); assert.deepStrictEqual([g2.json.loadStep, g2.json.loadSuggestOff, g2.json.name], [5, true, 'Ana Maria'], 'editar outro campo não mexe nos ajustes');
  });

  await block('ajustes: o próprio aluno e outro coach não conseguem mexer', async () => {
    setupWorkout();
    const a = await patch('s1', 's1', { loadSuggestOff: true, loadStep: 5, name: 'Novo nome' });
    assert.strictEqual(a.status, 200); assert.strictEqual(a.json.name, 'Novo nome', 'perfil do aluno segue editável'); assert.deepStrictEqual([a.json.loadSuggestOff, a.json.loadStep], [false, null], 'ajuste do coach não passa na edição do próprio aluno');
    assert.strictEqual((await patch('c2', 's1', { loadStep: 5 })).status, 403);
    assert.strictEqual(S.users.get('s1').loadStep, null);
  });

  // ───────────── relatório do mês liberado ao aluno (8 out 2026) ─────────────
  const getUser = async (as: string, id: string) => { const g = await userGET(new Request('http://x/api/admin/user/' + id, { headers: { authorization: 'Bearer ' + tok(as, as.startsWith('c') ? 'COACH' : 'USER') } }), { params: { id } }); return { status: g.status, json: await g.json() }; };

  await block('relatório do mês: o coach liga/desliga por aluno e lê de volta; só verdadeiro de verdade liga; editar outro campo não mexe', async () => {
    setupWorkout();
    assert.strictEqual((await getUser('c1', 's1')).json.monthlyReportOn, false, 'padrão: desligado');
    const a = await patch('c1', 's1', { monthlyReportOn: true }); assert.deepStrictEqual([a.status, a.json.monthlyReportOn], [200, true]);
    assert.deepStrictEqual([(await getUser('c1', 's1')).json.monthlyReportOn, (await getUser('s1', 's1')).json.monthlyReportOn], [true, true], 'o coach e o próprio aluno leem o estado atual (a Início e a Evolução do aluno usam esta rota)');
    const g = await patch('c1', 's1', { name: 'Ana Maria' }); assert.deepStrictEqual([g.json.monthlyReportOn, g.json.name], [true, 'Ana Maria'], 'editar outro campo não desliga');
    const l = await patch('c1', 's1', { loadSuggestOff: true }); assert.strictEqual(l.json.monthlyReportOn, true, 'a sugestão de carga e o relatório são independentes');
    for (const v of ['sim', 'true', 1, null, 'on']) { await patch('c1', 's1', { monthlyReportOn: true }); const r = await patch('c1', 's1', { monthlyReportOn: v }); assert.strictEqual(r.json.monthlyReportOn, false, 'valor ' + JSON.stringify(v) + ' não liga'); }
    const off = await patch('c1', 's1', { monthlyReportOn: false }); assert.strictEqual(off.json.monthlyReportOn, false);
  });

  await block('relatório do mês: o próprio aluno e outro coach NÃO conseguem liberar', async () => {
    setupWorkout();
    const a = await patch('s1', 's1', { monthlyReportOn: true, name: 'Novo nome' });
    assert.strictEqual(a.status, 200); assert.strictEqual(a.json.name, 'Novo nome', 'perfil do aluno segue editável'); assert.strictEqual(a.json.monthlyReportOn, false, 'aluno não se libera sozinho');
    assert.strictEqual((await patch('c2', 's1', { monthlyReportOn: true })).status, 403); assert.strictEqual(S.users.get('s1').monthlyReportOn, false);
    assert.strictEqual((await getUser('c2', 's1')).status, 403, 'outro coach nem lê');
  });

  await block('histórico do coach: traz o "como foi?" de cada exercício (e continua trazendo só o que tem observação, cardio ou resposta)', async () => {
    setupWorkout();
    S.histories.length = 0;
    S.histories.push({ id: 'h1', userId: 's1', name: 'PEITO', date: day(1), duration: 50, rpe: 8, feedback: null, xpEarned: 10, details: [
      row('e1', 1, 40, { id: 'd1', exerciseName: 'Supino', effort: 'FACIL' }), row('e1', 2, 40, { id: 'd2', exerciseName: 'Supino', effort: 'FACIL' }),
      row('e2', 1, 30, { id: 'd3', exerciseName: 'Remada' }),                                              // sem nada a mostrar: fica de fora
      row('e3', 1, 10, { id: 'd4', exerciseName: 'Rosca', note: 'ombro doendo' }),
      row('c1', 1, 20, { id: 'd5', exerciseName: 'Escada', cardioSeconds: 1200, cardioKcal: 150 }),
    ] });
    const r = await historyGET(new Request('http://x/api/admin/user/s1/history', { headers: { authorization: 'Bearer ' + tok('c1', 'COACH') } }), { params: { id: 's1' } }); const j = await r.json();
    assert.strictEqual(r.status, 200);
    const d = j.workoutLogs[0].details;
    assert.deepStrictEqual(d.map((x: any) => x.id).sort(), ['d1', 'd2', 'd4', 'd5'], 'linhas com resposta, observação ou cardio; a de Remada (nada a mostrar) fica de fora');
    assert.deepStrictEqual(d.filter((x: any) => x.effort).map((x: any) => [x.exerciseId, x.effort]), [['e1', 'FACIL'], ['e1', 'FACIL']]);
    assert.ok(d.every((x: any) => 'effort' in x), 'o campo vem em todas as linhas (nulo quando não respondeu)');
    assert.strictEqual((await historyGET(new Request('http://x/h', { headers: { authorization: 'Bearer ' + tok('c2', 'COACH') } }), { params: { id: 's1' } })).status, 403);
  });

  console.log(`\nTOTAL ${passed} ok, ${fails} falhas`);
  process.exit(fails ? 1 : 0);
})();
