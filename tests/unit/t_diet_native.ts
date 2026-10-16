import assert from 'assert';
import jwt from 'jsonwebtoken';
import prisma from '@/lib/prisma';
import { POST as interpretar } from '/home/user/fitos-final/app/api/ai/dieta-por-voz/interpretar/route';

process.env.ANTHROPIC_API_KEY = 'x'; process.env.OPENAI_API_KEY = 'x';
const PAULO = '3c82f763-66b4-48da-836e-16817d4f57c0';
const tok = (id: string) => jwt.sign({ id, role: 'ADMIN', coachId: null }, 'dev-only-troque-isso-configurando-JWT_SECRET-no-env');
const req = (body: any) => new Request('http://x/i', { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + tok(PAULO) }, body: JSON.stringify(body) });
const use = (input: any) => { (globalThis as any).__LLM = async () => ({ content: [{ type: 'tool_use', name: 'registrar_dieta', input }] }); };
const run = async (extra: any = {}) => { const r = await interpretar(req({ adminId: PAULO, text: 'dieta de teste com medidas', ...extra })); return { status: r.status, j: await r.json() }; };
const P = prisma as any;

const IA = { refeicoes: [{ nome: 'Almoço', horario: '12:00', alimentos: [
  { nome_falado: 'arroz branco', quantidade: 2, unidade: 'escumadeira' },
  { nome_falado: 'feijão carioca', quantidade: 1, unidade: 'concha' },
  { nome_falado: 'filé mignon', preparo: 'grelhado', quantidade: 1, unidade: 'bife_g' },
  { nome_falado: 'patinho', quantidade: 1, unidade: 'bife' },
  { nome_falado: 'arroz branco', quantidade: 1, unidade: 'colher_servir', ou_anterior: true },
  { nome_falado: 'whey protein concentrado', quantidade: 1, unidade: 'scoop' },
  { nome_falado: 'pasta de amendoim', quantidade: 2, unidade: 'colher_cha' },
  { nome_falado: 'aveia em flocos', quantidade: 1, unidade: 'colher_sobremesa' },
  { nome_falado: 'leite desnatado', quantidade: 2, unidade: 'copo' },
] }] };
const foods = (j: any) => j.meals[0].foods;

(async () => {
  use(IA);
  // 1) app NOVO (measures: true): as unidades passam como faladas
  let { status, j } = await run({ measures: true });
  assert.equal(status, 200, JSON.stringify(j));
  let f = foods(j);
  const got = f.map((x: any) => [x.match?.name, x.amount, x.unit]);
  console.log(got.map((g: any) => g.join(' | ')).join('\n'));
  assert.deepEqual(got.map((g: any) => [g[1], g[2]]), [[2, 'escumadeira'], [1, 'concha'], [1, 'bife_g'], [1, 'bife_m'], [1, 'colher_servir'], [1, 'scoop'], [2, 'colher_cha'], [1, 'colher_sobremesa'], [2, 'copo']]);
  assert.ok(f.every((x: any) => x.unitNote === '' || x.unitNote === 'bife sem tamanho → médio'), 'nenhuma conversão para gramas no modo novo');
  assert.deepEqual(f[3].assumed, ['unit']); assert.equal(f[3].unitNote, 'bife sem tamanho → médio');
  assert.deepEqual(f[2].assumed, []);
  console.log('OK  app novo: escumadeira/concha/bife P-M-G/colher de servir/scoop/colher de chá/sobremesa/copo passam como unidade; "bife" sem tamanho = médio (avisado)');

  // 2) app ANTIGO (sem a marca): tudo em gramas/ml com nota, como sempre
  ({ status, j } = await run()); f = foods(j);
  assert.deepEqual(f.map((x: any) => [x.amount, x.unit]), [[140, 'g'], [100, 'g'], [150, 'g'], [100, 'g'], [50, 'g'], [30, 'g'], [10, 'g'], [10, 'g'], [400, 'ml']]);
  assert.equal(f[0].unitNote, '2 escumadeira ≈ 140 g'); assert.equal(f[1].unitNote, '1 concha ≈ 100 g'); assert.equal(f[2].unitNote, '1 bife grande ≈ 150 g'); assert.equal(f[3].unitNote, '1 bife médio ≈ 100 g');
  assert.ok(f.every((x: any) => x.assumed.includes('unit')));
  console.log('OK  app antigo (sem measures): mesmas conversões em g/ml com a conta na nota — nada quebra durante a atualização');

  // 3) medidas do banco chegam com cada candidato (inclusive o ajuste do time master)
  P.__portions = [
    { foodId: 'custom-arroz-branco', scope: 'GLOBAL', unit: 'escumadeira', grams: 85, source: 'IBGE' },
    { foodId: 'custom-arroz-branco', scope: 'GLOBAL', unit: 'colher_servir', grams: 45, source: 'IBGE' },
    { foodId: 'custom-arroz-branco', scope: 'MASTER_TEAM', unit: 'escumadeira', grams: 90, source: 'COACH' },     // ajuste do próprio time vence
    { foodId: 'custom-arroz-branco', scope: 'OUTRO_COACH', unit: 'escumadeira', grams: 10, source: 'COACH' },     // de outro time: não aparece
    { foodId: 'custom-filé-mignon-grelhado', scope: 'GLOBAL', unit: 'bife_g', grams: 150, source: 'IBGE', isDefault: true, defaultAmount: 1 },
  ];
  ({ status, j } = await run({ measures: true })); f = foods(j);
  assert.deepEqual(P.__portionArgs.where.scope.in.sort(), ['GLOBAL', 'MASTER_TEAM']);
  const arroz = f[0].match; assert.equal(arroz.foodId, 'custom-arroz-branco');
  assert.deepEqual(arroz.portions, { escumadeira: 90, colher_servir: 45, colher: 30, xícara: 160 }, JSON.stringify(arroz.portions));   // + as 2 medidas da tabela antiga do app (colher 30, xícara 160)
  const filet = f[2].match; assert.deepEqual(filet.portions, { bife_g: 150 }); assert.deepEqual(filet.defaultPortion, { amount: 1, unit: 'bife_g' });
  assert.ok((f[0].candidates as any[]).every((c) => typeof c.foodId === 'string' && c.portions && typeof c.portions === 'object'), 'todos os candidatos levam foodId + portions (o coach pode trocar o alimento)');
  console.log('OK  cada candidato leva foodId + medidas do banco (ajuste do time master vence o global; ajuste de outro time não aparece)');

  // 4) tabela nova ainda não existe (antes do prisma db push): funciona igual, sem medidas do banco
  P.__portionsBroken = true; ({ status, j } = await run({ measures: true })); f = foods(j);
  assert.equal(status, 200); assert.deepEqual([f[0].amount, f[0].unit], [2, 'escumadeira']); assert.ok(f[0].match.portions && typeof f[0].match.portions === 'object');
  console.log('OK  sem a tabela FoodPortion (antes do db push): a rota segue funcionando, só sem medidas do banco');
  console.log('\nTODOS OS TESTES DA VOZ COM MEDIDAS NOVAS PASSARAM');
})().catch((e) => { console.error('FALHOU:', e); process.exit(1); });
