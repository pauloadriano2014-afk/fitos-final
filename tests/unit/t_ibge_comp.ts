import assert from 'assert';
import * as fs from 'fs';
import jwt from 'jsonwebtoken';
import prisma from '@/lib/prisma';
import { main, foodRow, subcategoryOf } from '/home/user/fitos-final/scripts/ibge-composicao/importar';
import { GET as searchGET } from '/home/user/fitos-final/app/api/food/search/route';
import { PATCH as foodPATCH } from '/home/user/fitos-final/app/api/food/[id]/route';
const db = (prisma as any).__db;
const JSON_PATH = '/home/user/fitos-final/prisma/data/ibge/ibge-composicao.json';
const data = JSON.parse(fs.readFileSync(JSON_PATH, 'utf8'));
const E: any[] = data.entradas;
const COACH = 'coach-a';
const tok = (id: string) => jwt.sign({ id, role: 'ADMIN', coachId: null }, 'dev-only-troque-isso-configurando-JWT_SECRET-no-env');
const R = (url: string) => new Request('http://x' + url, { headers: { authorization: 'Bearer ' + tok(COACH) } });
const logs: string[] = []; const origLog = console.log; const quiet = async <T,>(fn: () => Promise<T>) => { logs.length = 0; console.log = (...a: any[]) => { logs.push(a.join(' ')); }; try { return await fn(); } finally { console.log = origLog; } };
const OPT = { apply: false, remove: false, jsonPath: JSON_PATH };

(async () => {
  // ── dados do arquivo ──
  assert.ok(E.length > 1400); assert.equal(new Set(E.map((e) => e.id)).size, E.length, 'ids únicos');
  for (const e of E) { assert.ok(typeof e.kcal === 'number' && e.kcal >= 0 && e.kcal < 1000, e.label + ' kcal ' + e.kcal); assert.ok(e.label.length > 1 && e.category); for (const k of ['protein', 'carbs', 'fat']) assert.ok(e[k] === null || (e[k] >= 0 && e[k] <= 100.5), e.label + ' ' + k + ' ' + e[k]); }
  // conferência de pontos conhecidos do PDF
  const get = (id: string) => E.find((e) => e.id === id);
  const arroz = get('ibge-6300101-99'); assert.equal(arroz.kcal, 135.62); assert.equal(arroz.protein, 2.5); assert.equal(arroz.fat, 1.2); assert.equal(arroz.carbs, 27.78); assert.equal(arroz.fiber, 1.55); assert.equal(arroz.category, 'Cereais e leguminosas'); assert.equal(arroz.src.code, 8);
  const integral = get('ibge-6300201-99'); assert.equal(integral.kcal, 130.95);
  const amendoim = get('ibge-6301001-99'); assert.equal(amendoim.kcal, 567); assert.equal(amendoim.protein, 25.8);
  assert.equal(arroz.portions.colher_servir, 45); assert.equal(arroz.portions.concha, 100); assert.ok(!('porcao' in arroz.portions));
  const batataFrita = E.find((e) => e.label.startsWith('Batata-inglesa — frito')); assert.equal(batataFrita.kcal, 263.5);
  const file = E.find((e) => e.code === '7100101' && e.carbs === null); assert.ok(file && file.protein > 25, 'carne sem dado de carboidrato fica null'); assert.ok(/sem dado: C/.test(subcategoryOf(file)));
  assert.ok(!E.some((e) => /— cru/.test(e.label) && E.some((o) => o.code === e.code && /cozido/.test(o.label) && o.kcal === e.kcal && JSON.stringify(o.n) === JSON.stringify(e.n))), 'cru com valores iguais aos do cozido não aparece como "cru"');
  assert.deepEqual(foodRow(arroz), { id: 'ibge-6300101-99', source: 'IBGE', externalId: 'ibge-6300101-99', teamId: null, name: arroz.label, category: 'Cereais e leguminosas', subcategory: 'Mista (receita)', baseUnit: 'g', kcal: 135.62, protein: 2.5, carbs: 27.78, fat: 1.2, fiber: 1.55, isActive: true });
  assert.equal(foodRow(file).carbs, 0, 'sem dado entra como 0 (e o seletor avisa na linha)');
  console.log('OK  arquivo: valores conferem com o PDF (arroz, arroz integral, amendoim, batata frita), ids únicos, macros sem dado ficam null, cru=cozido não aparece como cru');

  // ── alimentos que já existem no catálogo não são tocados ──
  db.foods.push({ id: 'taco-1', source: 'TACO', externalId: '1', teamId: null, name: 'Arroz, integral, cozido', category: 'Carboidratos', subcategory: 'Cereais', baseUnit: 'g', kcal: 124, protein: 2.6, carbs: 25.8, fat: 1, fiber: 2.7, isActive: true });
  db.foods.push({ id: 'custom-1', source: 'CUSTOM', externalId: 'c1', teamId: 'MASTER_TEAM', name: 'Whey', category: 'Suplementos', subcategory: null, baseUnit: 'g', kcal: 400, protein: 75, carbs: 10, fat: 5, fiber: null, isActive: true });
  const before = JSON.stringify(db.foods);

  // ── simulação não grava nada ──
  await quiet(() => main({ ...OPT, apply: false }));
  assert.equal(db.foods.length, 2); assert.equal(db.portions.length, 0); assert.ok(logs.some((l) => /Nada foi gravado/.test(l))); assert.ok(logs.some((l) => new RegExp('criaria ' + E.length).test(l)), logs.join('\n'));
  // ── gravar ──
  await quiet(() => main({ ...OPT, apply: true }));
  const ibge = db.foods.filter((f: any) => f.source === 'IBGE'); assert.equal(ibge.length, E.length); assert.equal(db.foods.length, E.length + 2);
  assert.equal(JSON.stringify(db.foods.filter((f: any) => f.source !== 'IBGE')), before, 'TACO e alimentos do time intactos');
  const nPortions = E.reduce((n, e) => n + Object.keys(e.portions || {}).length, 0); assert.equal(db.portions.length, nPortions);
  assert.ok(db.portions.every((p: any) => p.scope === 'GLOBAL' && p.source === 'IBGE' && p.grams > 0 && p.foodId.startsWith('ibge-')));
  const sr = db.foods.find((f: any) => f.id === 'ibge-6300101-99'); assert.equal(sr.kcal, 135.62); assert.equal(sr.teamId, null); assert.equal(sr.isActive, true);
  console.log(`OK  importar: simulação não grava; gravar cria ${ibge.length} alimentos + ${nPortions} medidas caseiras (GLOBAL/IBGE); TACO e alimentos do time intactos`);

  // ── reexecutar é idempotente; atualiza o que mudou; preserva medida manual ──
  await quiet(() => main({ ...OPT, apply: true })); assert.ok(logs.some((l) => /criados 0, atualizados 0/.test(l)), logs.join('\n')); assert.equal(db.foods.length, E.length + 2); assert.equal(db.portions.length, nPortions);
  db.foods.find((f: any) => f.id === 'ibge-6300101-99').kcal = 1; // alguém mexeu
  const p = db.portions.find((x: any) => x.foodId === 'ibge-6300101-99' && x.unit === 'concha'); p.source = 'MANUAL'; p.grams = 77;   // medida manual
  const p2 = db.portions.find((x: any) => x.foodId === 'ibge-6300101-99' && x.unit === 'escumadeira'); p2.grams = 1;                   // valor do IBGE alterado
  await quiet(() => main({ ...OPT, apply: true }));
  assert.equal(db.foods.find((f: any) => f.id === 'ibge-6300101-99').kcal, 135.62, 'atualiza o alimento'); assert.equal(p.grams, 77, 'medida manual preservada'); assert.equal(p.source, 'MANUAL'); assert.equal(p2.grams, 85, 'medida do IBGE atualizada'); assert.ok(logs.some((l) => /1 preservadas/.test(l)), logs.join('\n'));
  console.log('OK  reexecutar: idempotente; corrige o que mudou; nunca sobrescreve medida manual/de coach');

  // ── sem a tabela de medidas (antes do db push): alimentos entram, avisa ──
  db.foods = db.foods.filter((f: any) => f.source !== 'IBGE'); db.portions = []; db.noPortionTable = true;
  await quiet(() => main({ ...OPT, apply: true })); assert.equal(db.foods.filter((f: any) => f.source === 'IBGE').length, E.length); assert.ok(logs.some((l) => /FoodPortion ainda não existe/.test(l))); db.noPortionTable = false;
  console.log('OK  sem a tabela FoodPortion: os alimentos entram e o script avisa como completar');

  // ── busca: só aparece com source=IBGE; TACO/CUSTOM e a busca de sempre não mudam ──
  await quiet(() => main({ ...OPT, apply: true }));
  const search = async (qs: string) => (await (await searchGET(R('/api/food/search?coachId=' + COACH + '&' + qs))).json());
  let j = await search('limit=500'); assert.ok(j.foods.every((f: any) => f.source !== 'IBGE'), 'busca de sempre não traz IBGE'); assert.equal(j.total, 1, 'só o TACO (o CUSTOM é de outro time)');
  j = await search('source=IBGE&limit=50'); assert.equal(j.total, E.length); assert.equal(j.foods.length, 50); assert.ok(j.foods.every((f: any) => f.source === 'IBGE')); assert.equal(j.pages, Math.ceil(E.length / 50));
  j = await search('source=IBGE&category=' + encodeURIComponent('Cereais e leguminosas') + '&limit=500'); assert.equal(j.total, E.filter((e) => e.category === 'Cereais e leguminosas').length); assert.ok(j.foods.every((f: any) => f.category === 'Cereais e leguminosas'));
  j = await search('source=IBGE&q=arroz&limit=500'); assert.ok(j.total >= 3 && j.foods.every((f: any) => /arroz/i.test(f.name)));
  const row = j.foods.find((f: any) => f.id === 'ibge-6300101-99'); assert.ok(row); assert.equal(row.calories_per_100, 135.62); assert.equal(row.p, 2.5); assert.equal(row.c, 27.78); assert.equal(row.f, 1.2); assert.equal(row.portions.concha, 100, 'medidas caseiras do IBGE vêm junto'); assert.equal(row.portions.colher_servir, 45); assert.equal(row.subcategory, 'Mista (receita)');
  // ⭐ favoritos: o IBGE só entra em "Favoritos" depois de receber a estrela; o favorito é só o campo isFavorite
  j = await search('favorites=true&limit=50'); assert.equal(j.total, 0, 'nada favoritado ainda'); j = await search('source=IBGE&favorites=true&limit=50'); assert.equal(j.total, 0, 'aba IBGE + favoritos: vazio enquanto ninguém favoritou');
  const star = async (id: string, isFavorite: boolean, extra: any = {}) => foodPATCH(new Request('http://x/api/food/' + id, { method: 'PATCH', headers: { authorization: 'Bearer ' + tok(COACH), 'content-type': 'application/json' }, body: JSON.stringify({ coachId: COACH, isFavorite, ...extra }) }), { params: { id } });
  const beforeFood = JSON.stringify(db.foods.find((f: any) => f.id === 'ibge-6300101-99'));
  let pr = await star('ibge-6300101-99', true, { name: 'HACK', kcal: 1, category: 'X' }); assert.equal(pr.status, 200); assert.equal((await pr.json()).isFavorite, true);
  const after = db.foods.find((f: any) => f.id === 'ibge-6300101-99'); assert.equal(after.isFavorite, true); assert.equal(after.name, JSON.parse(beforeFood).name, 'estrela só mexe no favorito'); assert.equal(after.kcal, 135.62); assert.equal(after.category, 'Cereais e leguminosas');
  j = await search('favorites=true&limit=50'); assert.equal(j.total, 1); assert.equal(j.foods[0].id, 'ibge-6300101-99'); assert.equal(j.foods[0].source, 'IBGE'); assert.equal(j.foods[0].isFavorite, true); assert.equal(j.foods[0].portions.concha, 100, 'medidas vêm junto');
  j = await search('source=IBGE&favorites=true&limit=50'); assert.equal(j.total, 1); assert.equal(j.foods[0].id, 'ibge-6300101-99');
  j = await search('source=IBGE&limit=50'); assert.equal(j.total, E.length, 'aba IBGE sem favoritos continua mostrando tudo'); j = await search('source=IBGE&q=arroz&limit=500'); assert.equal(j.foods.find((f: any) => f.id === 'ibge-6300101-99').isFavorite, true); assert.equal(j.foods.filter((f: any) => f.isFavorite).length, 1, 'só o arroz tem estrela');
  j = await search('limit=500'); assert.ok(j.foods.every((f: any) => f.source !== 'IBGE') && j.total === 1, 'busca de sempre (sem favoritos) continua sem IBGE');
  j = await search('source=TACO&favorites=true&limit=50'); assert.equal(j.total, 0, 'filtro TACO não traz IBGE');
  pr = await star('taco-1', true); assert.equal(pr.status, 200); j = await search('favorites=true&limit=50'); assert.equal(j.total, 2); assert.deepEqual(j.foods.map((f: any) => f.source).sort(), ['IBGE', 'TACO']);
  // reimportar não tira a estrela (e ainda corrige o que mudou)
  db.foods.find((f: any) => f.id === 'ibge-6300101-99').kcal = 5; await quiet(() => main({ ...OPT, apply: true }));
  const re = db.foods.find((f: any) => f.id === 'ibge-6300101-99'); assert.equal(re.kcal, 135.62); assert.equal(re.isFavorite, true, 'reimportar preserva a estrela');
  pr = await star('ibge-6300101-99', false); assert.equal(pr.status, 200); pr = await star('taco-1', false);
  j = await search('favorites=true&limit=50'); assert.equal(j.total, 0, 'tirar a estrela tira do Favoritos');
  j = await search('source=TACO&limit=50'); assert.equal(j.total, 1);
  console.log('OK  busca: IBGE só com source=IBGE (filtra por grupo e nome, traz as medidas caseiras); a busca de sempre e a TACO não mudam; estrela em alimento do IBGE: entra em Favoritos, só muda o favorito, sobrevive à reimportação');

  // ── remover ──
  await quiet(() => main({ ...OPT, remove: true })); assert.equal(db.foods.filter((f: any) => f.source === 'IBGE').length, E.length, 'simulação de remoção não apaga');
  await quiet(() => main({ ...OPT, remove: true, apply: true })); assert.equal(db.foods.filter((f: any) => f.source === 'IBGE').length, 0); assert.equal(db.foods.length, 2); assert.equal(db.portions.length, 0);
  console.log('OK  remover: simulação não apaga; --remover --aplicar tira só o que é do IBGE (alimentos e medidas)\n\nTODOS OS TESTES DO IBGE (COMPOSIÇÃO) PASSARAM');
})().catch((e) => { console.log = origLog; console.error('FALHOU:', e.stack || e.message); process.exit(1); }).then(() => process.exit(process.exitCode || 0));
