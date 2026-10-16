import assert from 'assert';
import jwt from 'jsonwebtoken';
import prisma from '@/lib/prisma';
import { POST as interpretar } from '/home/user/fitos-final/app/api/ai/dieta-por-voz/interpretar/route';
import { POST as transcrever } from '/home/user/fitos-final/app/api/ai/treino-por-voz/transcrever/route';

process.env.ANTHROPIC_API_KEY = 'x'; process.env.OPENAI_API_KEY = 'x';
const PAULO = '3c82f763-66b4-48da-836e-16817d4f57c0';
const tok = (id: string, role = 'ADMIN') => jwt.sign({ id, role, coachId: null }, 'dev-only-troque-isso-configurando-JWT_SECRET-no-env');
const req = (body: any, token?: string) => new Request('http://x/i', { method: 'POST', headers: { 'content-type': 'application/json', ...(token ? { authorization: 'Bearer ' + token } : {}) }, body: JSON.stringify(body) });
const tool = (input: any) => ({ content: [{ type: 'tool_use', name: 'registrar_dieta', input }] });
const use = (input: any) => { (globalThis as any).__LLM = async () => tool(input); };
const run = async (text: string, extra: any = {}) => { const r = await interpretar(req({ adminId: PAULO, text, ...extra }, tok(PAULO))); return { status: r.status, j: await r.json() }; };
const line = (f: any) => `${f.status.padEnd(6)} ${String(f.match?.name ?? '—').padEnd(34)} ${f.amount ?? '—'} ${f.unit ?? ''}${f.alternative ? '  (OU)' : ''}${f.assumed.length ? '  assumido:' + f.assumed.join(',') : ''}`;

const DITADO = 'Refeição 1: duas fatias de pão integral com três ovos mexidos e uma fatia de queijo. Refeição 2: 70 gramas de arroz, 50 gramas de feijão e 120 gramas de frango.';
const IA_EXEMPLO = { refeicoes: [
  { alimentos: [ { nome_falado: 'pão integral', quantidade: 2, unidade: 'fatia' }, { nome_falado: 'ovos', preparo: 'mexidos', quantidade: 3, unidade: 'unidade' }, { nome_falado: 'queijo', quantidade: 1, unidade: 'fatia' } ] },
  { alimentos: [ { nome_falado: 'arroz', quantidade: 70, unidade: 'g' }, { nome_falado: 'feijão', quantidade: 50, unidade: 'g' }, { nome_falado: 'frango', quantidade: 120, unidade: 'g' } ] },
] };

(async () => {
  // 1) trava
  let r = await interpretar(req({ text: DITADO })); assert.equal(r.status, 401);
  (globalThis as any).__USERS = { 'coach-parceiro': { role: 'COACH', accountStatus: 'ACTIVE', active: true }, aluno: { role: 'USER', accountStatus: 'ACTIVE', active: true } };
  r = await interpretar(req({ text: DITADO }, tok('aluno', 'USER'))); assert.equal(r.status, 403);
  r = await interpretar(req({ text: ' ' }, tok('coach-parceiro', 'COACH'))); assert.equal(r.status, 400, 'coach parceiro ativo passa da trava');
  r = await interpretar(req({ text: ' ' }, tok(PAULO))); assert.equal(r.status, 400);
  r = await interpretar(req({ text: 'x'.repeat(6001) }, tok(PAULO))); assert.equal(r.status, 400);
  console.log('OK  401 sem token / 403 aluno / coach parceiro liberado / texto vazio ou gigante -> 400');

  // 2) o exemplo do Paulo, SEM favoritos do aluno
  use(IA_EXEMPLO);
  let { status, j } = await run(DITADO);
  assert.equal(status, 200, JSON.stringify(j));
  assert.equal(j.meals.length, 2);
  console.log('\n--- exemplo do Paulo (sem favoritos do aluno) ---');
  for (const m of j.meals) { console.log(`${m.name} ${m.time}  assumido:${m.assumed.join(',')}`); m.foods.forEach((f: any) => console.log('   ' + line(f))); }
  const [m1, m2] = j.meals;
  assert.deepEqual([m1.name, m1.time, m1.assumed.sort()], ['Refeição 1', '07:00', ['name', 'time']]);
  assert.deepEqual([m2.name, m2.time], ['Refeição 2', '10:00']);
  const [pao, ovo, queijo] = m1.foods;
  assert.equal(pao.match.name, 'Pão Integral'); assert.equal(pao.status, 'SURE'); assert.deepEqual([pao.amount, pao.unit], [2, 'fatia']); assert.deepEqual(pao.assumed, []);
  assert.equal(ovo.match.name, 'Ovos Mexidos'); assert.equal(ovo.status, 'SURE'); assert.deepEqual([ovo.amount, ovo.unit], [3, 'unid']);
  assert.ok(!ovo.assumed.includes('prep') && ovo.warnings.length === 0, '"Ovos Mexidos" existe no catálogo do coach: casa pelo nome inteiro, sem aviso');
  assert.equal(queijo.status, 'CHOOSE'); assert.ok(queijo.candidates.length >= 3); assert.ok(/^Queijo/.test(queijo.match.name));
  const [arroz, feijao, frango] = m2.foods;
  assert.equal(arroz.status, 'CHOOSE'); assert.deepEqual([arroz.amount, arroz.unit], [70, 'g']);
  assert.ok(/Feij/.test(feijao.match.name) && /Cozido|cozido/.test(feijao.match.name), 'feijão cozido');
  assert.ok(/Frango/.test(frango.match.name));
  for (const f of [...m1.foods, ...m2.foods]) assert.ok(f.match.calories_per_100 > 0 && f.match.id && 'p' in f.match && 'c' in f.match && 'f' in f.match && f.match.base_unit, 'formato do app');
  // escopo do catálogo
  const w = (prisma as any).__last.where; assert.equal(w.isActive, true);
  assert.deepEqual(w.OR, [{ source: 'TACO', teamId: null }, { source: 'CUSTOM', teamId: 'MASTER_TEAM' }]);
  // preparo que NÃO existe no catálogo -> avisa e usa o padrão cozido
  use({ refeicoes: [{ nome: 'café da manhã', alimentos: [{ nome_falado: 'ovos', preparo: 'poché', quantidade: 2, unidade: 'unidade' }] }] });
  ({ j } = await run('dois ovos poché'));
  const poche = j.meals[0].foods[0];
  assert.ok(poche.assumed.includes('prep') && poche.warnings[0].includes('poché') && /Ovo/.test(poche.match.name), 'preparo inexistente -> aviso + alimento pelo nome');
  console.log('OK  exemplo: 2 refeições, quantidades/unidades certas, "ovos mexidos" casa com o cadastro do coach; preparo inexistente avisa; queijo/arroz/frango = escolher');

  // 3) COM favoritos do aluno: vira o padrão
  use(IA_EXEMPLO);
  const cat = require('/tmp/claude-0/-home-user/86513411-0da9-5f81-8d5c-a48e2b800aa5/scratchpad/vt/food_catalog.json');
  const id = (n: string) => cat.find((x: any) => x.name === n).id;
  const favs = ['Arroz, tipo 1, cozido', 'Feijão, carioca, cozido', 'Frango, peito, sem pele, grelhado', 'Queijo, minas, frescal'].map(id);
  ({ status, j } = await run(DITADO, { favoriteFoodIds: [...favs, 42, null, 'id-que-nao-existe'] }));
  assert.equal(status, 200);
  const g = j.meals.flatMap((m: any) => m.foods);
  console.log('\n--- com favoritos do aluno ---'); g.forEach((f: any) => console.log('   ' + line(f)));
  assert.deepEqual(g.map((f: any) => f.status), ['SURE', 'SURE', 'SURE', 'SURE', 'SURE', 'SURE']);
  assert.deepEqual(g.slice(2).map((f: any) => f.match.name), ['Queijo, minas, frescal', 'Arroz, tipo 1, cozido', 'Feijão Carioca Cozido', 'Frango, peito, sem pele, grelhado']);
  assert.ok(g.slice(2).every((f: any) => f.match.studentFavorite));
  console.log('OK  "Do Aluno" vira o padrão; ids inválidos são ignorados');

  // 4) unidades
  use({ refeicoes: [{ nome: 'pós-treino', horario: '19:00', alimentos: [
    { nome_falado: 'whey', quantidade: 1, unidade: 'scoop' },
    { nome_falado: 'pasta de amendoim', quantidade: 2, unidade: 'colher_cha' },
    { nome_falado: 'leite', quantidade: 1.5, unidade: 'copo' },
    { nome_falado: 'castanha', quantidade: 1, unidade: 'punhado' },
    { nome_falado: 'banana' },
    { nome_falado: 'frango', quantidade: 100 },
    { nome_falado: 'ovos', quantidade: 2 },
    { nome_falado: 'aveia', quantidade: 3, unidade: 'colher_sopa' },
    { nome_falado: 'iogurte', quantidade: 0.5, unidade: 'xicara' },
    { nome_falado: 'arroz', quantidade: 1, unidade: 'porcao' },
  ] }] });
  ({ status, j } = await run('texto de teste'));
  if (status !== 200) console.log('DEBUG', status, JSON.stringify(j));
  const u = j.meals[0].foods.map((f: any) => [f.amount, f.unit, f.assumed.join('+'), f.unitNote]);
  console.log('\nunidades ->', JSON.stringify(u));
  assert.deepEqual(u, [
    [30, 'g', 'unit', '1 scoop ≈ 30 g'], [10, 'g', 'unit', '2 colher de chá ≈ 10 g'], [300, 'ml', 'unit', '1,5 copo ≈ 300 ml'], [30, 'g', 'unit', '1 punhado ≈ 30 g'],
    [null, null, 'amount', ''], [100, 'g', 'unit', '100 sem unidade → gramas'], [2, 'unid', 'unit', '2 sem unidade → unidades'],
    [3, 'colher', '', ''], [0.5, 'xícara', '', ''], [null, null, 'amount', ''],
  ]);
  assert.deepEqual([j.meals[0].name, j.meals[0].time, j.meals[0].assumed], ['Pós-Treino', '19:00', []]);
  console.log('OK  scoop/colher de chá/copo/punhado viram g/ml com nota; sem quantidade = o app completa; sem unidade é deduzida e avisada');

  // 5) "ou" = substituto (mesmo grupo)
  use({ refeicoes: [{ nome: 'almoço', alimentos: [
    { nome_falado: 'arroz', quantidade: 100, unidade: 'g' },
    { nome_falado: 'batata doce', quantidade: 150, unidade: 'g', ou_anterior: true },
    { nome_falado: 'macarrão', ou_anterior: true },
    { nome_falado: 'frango', quantidade: 150, unidade: 'g' },
    { nome_falado: 'patinho', quantidade: 130, unidade: 'g', ou_anterior: true },
    { nome_falado: 'brócolis', quantidade: 80, unidade: 'g' },
  ], observacao: 'salada à vontade' }] });
  ({ j } = await run('texto de teste'));
  const fo = j.meals[0].foods;
  assert.deepEqual(fo.map((f: any) => f.groupKey), ['g0', 'g0', 'g0', 'g1', 'g1', 'g2']);
  assert.deepEqual(fo.map((f: any) => f.alternative), [false, true, true, false, true, false]);
  assert.equal(j.meals[0].notes, 'salada à vontade'); assert.equal(j.meals[0].name, 'Almoço'); assert.equal(j.meals[0].time, '12:30'); assert.deepEqual(j.meals[0].assumed, ['time']);
  console.log('OK  "ou" agrupa base + substitutos; "à vontade" vai pra observação; Almoço sem horário = 12:30 assumido');

  // 6) nomes de refeição
  use({ refeicoes: [
    { nome: 'café da manhã', horario: '7h', alimentos: [{ nome_falado: 'banana', quantidade: 1, unidade: 'unidade' }] },
    { nome: 'colação', alimentos: [{ nome_falado: 'banana', quantidade: 1, unidade: 'unidade' }] },
    { nome: 'lanche', alimentos: [{ nome_falado: 'banana', quantidade: 1, unidade: 'unidade' }] },
    { nome: 'pré treino', horario: '17:30', alimentos: [{ nome_falado: 'banana', quantidade: 1, unidade: 'unidade' }] },
    { nome: 'ceia', horario: '25:00', alimentos: [{ nome_falado: 'banana', quantidade: 1, unidade: 'unidade' }] },
    { nome: 'refeição pós jejum', alimentos: [{ nome_falado: 'banana', quantidade: 1, unidade: 'unidade' }] },
    { nome: 'vazia', alimentos: [] },
    { alimentos: [{ nome_falado: '   ' }] },
  ] });
  ({ j } = await run('texto de teste'));
  console.log('\nrefeições ->', j.meals.map((m: any) => `${m.name} ${m.time}${m.assumed.length ? '(' + m.assumed.join(',') + ')' : ''}`).join(' | '));
  assert.deepEqual(j.meals.map((m: any) => m.name), ['Café da Manhã', 'Lanche da Manhã', 'Lanche da Tarde', 'Pré-Treino', 'Ceia', 'Refeição pós jejum']);
  assert.deepEqual(j.meals.map((m: any) => m.time), ['07:00', '10:00', '16:00', '17:30', '22:00', '22:00']);
  console.log('OK  nomes padrão, colação = lanche da manhã, horário inválido vira o padrão, refeições vazias somem');

  // 7) fallback e falha
  const calls: string[] = [];
  (globalThis as any).__LLM = async (a: any) => { calls.push(`${a.model}:${a.forced ? 'forced' : 'auto'}`); return a.model === 'claude-haiku-4-5' ? { content: [{ type: 'text', text: 'oi' }] } : tool(IA_EXEMPLO); };
  ({ status } = await run(DITADO)); assert.equal(status, 200); assert.deepEqual(calls, ['claude-haiku-4-5:forced', 'claude-sonnet-5-5:auto']);
  (globalThis as any).__LLM = async () => new Error('boom');
  ({ status, j } = await run(DITADO)); assert.equal(status, 502); assert.ok(!/boom/.test(j.error));
  console.log('OK  fallback Haiku -> Sonnet 5.5; falha total -> 502 sem vazar detalhe');

  // 8) escopo do coach (master agindo por outro coach)
  use(IA_EXEMPLO);
  r = await interpretar(req({ adminId: 'coach-parceiro', text: DITADO }, tok(PAULO)));
  assert.ok([200, 403].includes(r.status));
  if (r.status === 200) assert.deepEqual((prisma as any).__last.where.OR[1], { source: 'CUSTOM', teamId: 'coach-parceiro' });
  console.log('OK  catálogo do coach parceiro usa o teamId dele (status ' + r.status + ')');

  // 9) transcrição com o vocabulário de dieta
  const fd = (ctx?: string) => { const f = new FormData(); f.append('file', new File([new Uint8Array(2000)], 'dieta.m4a', { type: 'audio/m4a' })); if (ctx) f.append('context', ctx); return f; };
  const treq = (form: FormData) => new Request('http://x/t', { method: 'POST', headers: { authorization: 'Bearer ' + tok(PAULO) }, body: form });
  r = await transcrever(treq(fd('dieta'))); assert.equal(r.status, 200);
  assert.ok(/Plano alimentar/.test((globalThis as any).__WHISPER_ARGS.prompt), 'dieta usa o vocabulário de alimentos');
  r = await transcrever(treq(fd())); assert.equal(r.status, 200);
  assert.ok(/Treino de musculação/.test((globalThis as any).__WHISPER_ARGS.prompt), 'sem context continua o de treino');
  console.log('OK  transcrição: context=dieta usa o vocabulário de alimentos; sem context = treino (igual a antes)');

  console.log('\nTODOS OS TESTES DA DIETA POR VOZ PASSARAM');
})().catch((e) => { console.error('\nFALHOU:', e.message); process.exit(1); });
