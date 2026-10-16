import assert from 'assert';
import jwt from 'jsonwebtoken';
import prisma from '@/lib/prisma';
import { LEGACY_FOOD_PORTIONS } from '/home/user/fitos-final/lib/legacyFoodPortions';
import { normalizeUnitKey, sanitizePortions, resolvePortions, legacyFor, MEASURE_KEYS, MEASURES } from '/home/user/fitos-final/lib/foodMeasures';
import { GET as searchGET } from '/home/user/fitos-final/app/api/food/search/route';
import { GET as pGET, PUT as pPUT, DELETE as pDEL } from '/home/user/fitos-final/app/api/food/[id]/portions/route';
import { POST as dietPOST } from '/home/user/fitos-final/app/api/admin/diet/route';
import { GET as dietGET } from '/home/user/fitos-final/app/api/diet/[userId]/route';

const db = (prisma as any).__db;
const PAULO = '3c82f763-66b4-48da-836e-16817d4f57c0';
const COACH_A = 'coach-a', COACH_B = 'coach-b';
const tok = (id: string, role = 'ADMIN') => jwt.sign({ id, role, coachId: null }, 'dev-only-troque-isso-configurando-JWT_SECRET-no-env');
const R = (url: string, method = 'GET', body?: any, token?: string) => new Request('http://x' + url, { method, headers: { 'content-type': 'application/json', ...(token ? { authorization: 'Bearer ' + token } : {}) }, body: body ? JSON.stringify(body) : undefined });

const ARROZ = Object.entries(LEGACY_FOOD_PORTIONS).find(([, v]) => v.name === 'Arroz Branco')!;   // legado: colher 30, xícara 160, padrão 4 colheres
const ARROZ_ID = ARROZ[0];
const OVOS = Object.entries(LEGACY_FOOD_PORTIONS).find(([, v]) => v.name === 'Ovos Inteiros')!;
const SEM_MEDIDA_ID = 'taco-aveia';

(async () => {
  // ---------- funções puras ----------
  assert.equal(normalizeUnitKey('colher de sopa'), 'colher'); assert.equal(normalizeUnitKey('Colher de Chá'), 'colher_cha'); assert.equal(normalizeUnitKey('colher_cha'), 'colher_cha');
  assert.equal(normalizeUnitKey('xicara'), 'xícara'); assert.equal(normalizeUnitKey('xícara'), 'xícara'); assert.equal(normalizeUnitKey('un'), 'unid'); assert.equal(normalizeUnitKey('Unidades'), 'unid');
  assert.equal(normalizeUnitKey('bife médio'), 'bife_m'); assert.equal(normalizeUnitKey('Escumadeira'), 'escumadeira'); assert.equal(normalizeUnitKey('concha'), 'concha'); assert.equal(normalizeUnitKey('lixo'), null); assert.equal(normalizeUnitKey(null), null);
  for (const k of MEASURE_KEYS) assert.equal(normalizeUnitKey(k), k, 'chave canônica se reconhece: ' + k);
  for (const k of ['colher', 'fatia', 'unid', 'xícara', 'g', 'ml']) assert.ok(k in MEASURES, 'as 6 chaves antigas continuam');
  assert.deepEqual(sanitizePortions({ colher: '25', colher_cha: 5, g: 10, ml: 3, lixo: 4, escumadeira: -1, concha: 99999, bife_m: '120,5', xicara: 0 }), { colher: 25, colher_cha: 5, bife_m: 120.5 });
  assert.deepEqual(sanitizePortions(null), {}); assert.deepEqual(sanitizePortions([1, 2]), {});
  // precedência: COACH do time > MANUAL global > legado > IBGE; outro time é ignorado
  const legacy = { name: 'x', portions: { colher: 30, 'xícara': 160 }, default: { amount: 4, unit: 'colher' } };
  const rows = [
    { foodId: 'f', scope: 'GLOBAL', unit: 'colher', grams: 25, source: 'IBGE' }, { foodId: 'f', scope: 'GLOBAL', unit: 'escumadeira', grams: 90, source: 'IBGE' },
    { foodId: 'f', scope: 'GLOBAL', unit: 'xícara', grams: 150, source: 'MANUAL' },
    { foodId: 'f', scope: 'coach-a', unit: 'colher', grams: 20, source: 'COACH', isDefault: true, defaultAmount: 3 },
    { foodId: 'f', scope: 'coach-b', unit: 'colher', grams: 99, source: 'COACH' },
  ];
  let r = resolvePortions(rows, 'coach-a', legacy);
  assert.deepEqual(r.portions, { colher: 20, escumadeira: 90, 'xícara': 150 }); assert.deepEqual(r.sources, { colher: 'COACH', escumadeira: 'IBGE', 'xícara': 'MANUAL' }); assert.deepEqual(r.defaultPortion, { amount: 3, unit: 'colher' });
  r = resolvePortions(rows, 'coach-b', legacy); assert.equal(r.portions.colher, 99); r = resolvePortions(rows, null, legacy); assert.equal(r.portions.colher, 30, 'sem time: o legado (manual) vence o IBGE'); assert.equal(r.sources.colher, 'LEGACY');
  assert.deepEqual(r.defaultPortion, { amount: 4, unit: 'colher' });
  assert.deepEqual(resolvePortions([], 'coach-a', null), { portions: {}, sources: {}, defaultPortion: null });
  assert.equal(legacyFor({ id: 'id-que-mudou', name: 'arroz  BRANCO' })?.portions.colher, 30, 'casa por nome se o id não bater');
  console.log('OK  medidas: chaves, apelidos, limpeza e precedência (time > manual > legado > IBGE; outro time ignorado)');

  // ---------- busca de alimentos ----------
  db.foods = [
    { id: ARROZ_ID, source: 'TACO', name: 'Arroz Branco', category: 'Carboidratos', subcategory: 'x', baseUnit: 'g', kcal: 130, protein: 2, carbs: 28, fat: 0, fiber: null, isLactoseFree: false, conversionFactor: 1, isFavorite: true },
    { id: SEM_MEDIDA_ID, source: 'TACO', name: 'Aveia, flocos, crua', category: 'Carboidratos', subcategory: 'x', baseUnit: 'g', kcal: 394, protein: 13, carbs: 66, fat: 8, fiber: 9, isLactoseFree: false, conversionFactor: 1, isFavorite: true },
  ];
  db.users = [{ id: 'aluno1', coachId: COACH_A }];
  let res = await searchGET(R('/api/food/search?coachId=' + COACH_A, 'GET', undefined, tok(COACH_A)));
  let j = await res.json(); assert.equal(res.status, 200);
  const arroz = j.foods.find((f: any) => f.id === ARROZ_ID), aveia = j.foods.find((f: any) => f.id === SEM_MEDIDA_ID);
  assert.deepEqual(arroz.portions, { colher: 30, 'xícara': 160 }); assert.deepEqual(arroz.defaultPortion, { amount: 4, unit: 'colher' });
  assert.deepEqual(aveia.portions, {}); assert.equal(aveia.defaultPortion, null);
  console.log('OK  busca: devolve as medidas antigas (arquivo do app) sem precisar de nada no banco; alimento sem medida = {}');

  db.portions.push({ foodId: ARROZ_ID, scope: COACH_A, unit: 'escumadeira', grams: 90, source: 'COACH', isDefault: false });
  db.portions.push({ foodId: SEM_MEDIDA_ID, scope: 'GLOBAL', unit: 'colher', grams: 12, source: 'IBGE', isDefault: false });
  j = await (await searchGET(R('/api/food/search?coachId=' + COACH_A, 'GET', undefined, tok(COACH_A)))).json();
  assert.deepEqual(j.foods.find((f: any) => f.id === ARROZ_ID).portions, { colher: 30, 'xícara': 160, escumadeira: 90 }, 'ajuste do time A aparece pro time A');
  assert.deepEqual(j.foods.find((f: any) => f.id === SEM_MEDIDA_ID).portions, { colher: 12 }, 'IBGE entra onde não havia nada');
  j = await (await searchGET(R('/api/food/search?coachId=' + COACH_B, 'GET', undefined, tok(COACH_B)))).json();
  assert.ok(!('escumadeira' in j.foods.find((f: any) => f.id === ARROZ_ID).portions), 'o ajuste do time A NÃO vaza pro time B');
  console.log('OK  busca: ajuste do coach A só aparece pro A; IBGE preenche onde não havia medida');

  db.missingPortionTable = true;
  res = await searchGET(R('/api/food/search?coachId=' + COACH_A, 'GET', undefined, tok(COACH_A))); j = await res.json();
  assert.equal(res.status, 200); assert.deepEqual(j.foods.find((f: any) => f.id === ARROZ_ID).portions, { colher: 30, 'xícara': 160 }, 'tabela nova ausente: cai nas medidas antigas');
  db.missingPortionTable = false;
  console.log('OK  busca: se a tabela nova ainda não existe no banco, NÃO falha (usa as medidas antigas)');

  // ---------- rota de medidas por alimento ----------
  res = await pGET(R(`/api/food/${ARROZ_ID}/portions?coachId=${COACH_A}`, 'GET', undefined, tok(COACH_A)), { params: { id: ARROZ_ID } }); j = await res.json();
  assert.equal(res.status, 200); assert.equal(j.portions.escumadeira, 90); assert.equal(j.sources.escumadeira, 'COACH'); assert.equal(j.sources.colher, 'LEGACY');
  res = await pPUT(R(`/api/food/${ARROZ_ID}/portions`, 'PUT', { coachId: COACH_A, portions: { escumadeira: 100, concha: '130', lixo: 5, g: 1 } }, tok(COACH_A)), { params: { id: ARROZ_ID } }); j = await res.json();
  assert.equal(res.status, 200, JSON.stringify(j)); assert.equal(j.portions.escumadeira, 100); assert.equal(j.portions.concha, 130); assert.ok(!('lixo' in j.portions) && !('g' in j.portions));
  const mine = db.portions.filter((p: any) => p.foodId === ARROZ_ID && p.scope === COACH_A); assert.ok(mine.every((p: any) => p.source === 'COACH'));
  assert.equal(db.portions.filter((p: any) => p.foodId === ARROZ_ID && p.scope === 'GLOBAL').length, 0, 'ajuste de time não cria linha global');
  // coach A não altera o coach B
  j = await (await pGET(R(`/api/food/${ARROZ_ID}/portions?coachId=${COACH_B}`, 'GET', undefined, tok(COACH_B)), { params: { id: ARROZ_ID } })).json();
  assert.ok(!('concha' in j.portions), 'coach B não vê o ajuste do A');
  // global: só master
  res = await pPUT(R(`/api/food/${ARROZ_ID}/portions`, 'PUT', { coachId: COACH_A, scope: 'global', portions: { fatia: 10 } }, tok(COACH_A)), { params: { id: ARROZ_ID } }); assert.equal(res.status, 403);
  res = await pPUT(R(`/api/food/${ARROZ_ID}/portions`, 'PUT', { coachId: PAULO, scope: 'global', portions: { colher_cha: 5 } }, tok(PAULO)), { params: { id: ARROZ_ID } }); j = await res.json();
  assert.equal(res.status, 200, JSON.stringify(j)); assert.equal(j.sources.colher_cha, 'MANUAL'); assert.ok(db.portions.some((p: any) => p.foodId === ARROZ_ID && p.scope === 'GLOBAL' && p.unit === 'colher_cha'));
  // padrão: precisa ser medida existente
  res = await pPUT(R(`/api/food/${ARROZ_ID}/portions`, 'PUT', { coachId: COACH_A, default: { unit: 'bife_g', amount: 1 } }, tok(COACH_A)), { params: { id: ARROZ_ID } }); assert.equal(res.status, 400);
  res = await pPUT(R(`/api/food/${ARROZ_ID}/portions`, 'PUT', { coachId: COACH_A, default: { unit: 'escumadeira', amount: 1 } }, tok(COACH_A)), { params: { id: ARROZ_ID } }); j = await res.json();
  assert.equal(res.status, 200, JSON.stringify(j)); assert.deepEqual(j.defaultPortion, { amount: 1, unit: 'escumadeira' });
  res = await pPUT(R(`/api/food/${ARROZ_ID}/portions`, 'PUT', { coachId: COACH_A }, tok(COACH_A)), { params: { id: ARROZ_ID } }); assert.equal(res.status, 400, 'nada pra salvar');
  res = await pPUT(R(`/api/food/${ARROZ_ID}/portions`, 'PUT', { coachId: COACH_A, remove: ['concha'] }, tok(COACH_A)), { params: { id: ARROZ_ID } }); j = await res.json(); assert.ok(!('concha' in j.portions));
  res = await pDEL(R(`/api/food/${ARROZ_ID}/portions?coachId=${COACH_A}`, 'DELETE', undefined, tok(COACH_A)), { params: { id: ARROZ_ID } }); j = await res.json();
  assert.deepEqual(j.portions, { colher: 30, 'xícara': 160, colher_cha: 5 }, 'sem unit: volta ao padrão (legado + global)');
  res = await pPUT(R(`/api/food/${ARROZ_ID}/portions`, 'PUT', { coachId: COACH_A, portions: { colher: 1 } }), { params: { id: ARROZ_ID } }); assert.equal(res.status, 401);
  res = await pGET(R(`/api/food/nao-existe/portions?coachId=${COACH_A}`, 'GET', undefined, tok(COACH_A)), { params: { id: 'nao-existe' } }); assert.equal(res.status, 404);
  db.foods.push({ id: 'custom-de-b', source: 'CUSTOM', teamId: COACH_B, name: 'Coisa do B', category: 'x' });
  res = await pGET(R(`/api/food/custom-de-b/portions?coachId=${COACH_A}`, 'GET', undefined, tok(COACH_A)), { params: { id: 'custom-de-b' } }); assert.equal(res.status, 403, 'alimento CUSTOM de outro time');
  db.missingPortionTable = true;
  res = await pPUT(R(`/api/food/${ARROZ_ID}/portions`, 'PUT', { coachId: COACH_A, portions: { colher: 12 } }, tok(COACH_A)), { params: { id: ARROZ_ID } }); assert.equal(res.status, 503);
  res = await pGET(R(`/api/food/${ARROZ_ID}/portions?coachId=${COACH_A}`, 'GET', undefined, tok(COACH_A)), { params: { id: ARROZ_ID } }); j = await res.json(); assert.equal(res.status, 200); assert.equal(j.readOnly, true);
  db.missingPortionTable = false;
  console.log('OK  rota de medidas: time isolado, global só master, padrão validado, remover/voltar ao padrão, 401/403/404, tabela ausente = 503/somente leitura');

  // ---------- salvar dieta grava foodId + medidas; ler devolve ----------
  db.metas = [];
  const dietBody = { userId: 'aluno1', name: 'Plano', meals: [
    { name: 'Almoço', time: '12:00', dayType: 'TREINO', items: [
      { name: 'Arroz Branco', amount: 4, unit: 'colher', calories_per_100: 130, p: 2, c: 28, f: 0, groupId: 'g1', foodId: ARROZ_ID, portions: { colher: 30, escumadeira: 90, lixo: 3 } },
      { name: 'Batata', amount: 100, unit: 'g', calories_per_100: 86, p: 1, c: 20, f: 0, groupId: 'g1' },
    ] },
  ] };
  res = await dietPOST(R('/api/admin/diet', 'POST', dietBody, tok(PAULO))); j = await res.json();
  assert.equal(res.status, 200, JSON.stringify(j));
  const saved = j.meals[0].items; assert.ok(saved.every((i: any) => typeof i.id === 'string' && i.id.length > 10), 'itens nascem com id');
  assert.equal(db.metas.length, 1, 'só o item com foodId/medidas gera metadado');
  assert.deepEqual(db.metas[0].portions, { colher: 30, escumadeira: 90 }); assert.equal(db.metas[0].foodId, ARROZ_ID); assert.equal(db.metas[0].foodItemId, saved[0].id);
  db.missingMetaTable = true;
  res = await dietPOST(R('/api/admin/diet', 'POST', dietBody, tok(PAULO))); assert.equal(res.status, 200, 'sem a tabela de metadados a dieta SALVA do mesmo jeito');
  db.missingMetaTable = false;
  console.log('OK  salvar dieta: grava foodId + medidas (limpas) de cada item; se a tabela nova não existe, a dieta salva normalmente');

  // ler (aluno): o item volta com foodId e portions
  db.metas = []; res = await dietPOST(R('/api/admin/diet', 'POST', dietBody, tok(PAULO))); const savedDiet = (await res.json());
  db.diets = [{ ...savedDiet, isActive: true, isStrategy: false, strategyActive: false, meals: savedDiet.meals.map((m: any) => ({ ...m, isMainVersion: true, alternativeGroupId: null, items: m.items.map((i: any) => ({ ...i, calories: i.calories, protein: i.protein, carbs: i.carbs, fats: i.fats })) })) }];
  res = await dietGET(R('/api/diet/aluno1', 'GET', undefined, tok('aluno1', 'USER')), { params: { userId: 'aluno1' } }); j = await res.json();
  assert.equal(res.status, 200, JSON.stringify(j)); const it = j.meals[0].items;
  assert.equal(it[0].foodId, ARROZ_ID); assert.deepEqual(it[0].portions, { colher: 30, escumadeira: 90 }); assert.equal(it[1].foodId, null); assert.equal(it[1].portions, null);
  db.missingMetaTable = true;
  res = await dietGET(R('/api/diet/aluno1', 'GET', undefined, tok('aluno1', 'USER')), { params: { userId: 'aluno1' } }); j = await res.json();
  assert.equal(res.status, 200); assert.equal(j.meals[0].items[0].portions, null, 'sem a tabela: dieta lida normal, sem medidas');
  db.missingMetaTable = false;
  console.log('OK  ler dieta: item volta com foodId + medidas; sem a tabela nova a leitura continua funcionando');

  console.log('\nTODOS OS TESTES DE MEDIDAS (BACKEND) PASSARAM');
})().catch((e) => { console.error('\nFALHOU:', e.stack || e.message); process.exit(1); }).then(() => process.exit(process.exitCode || 0));
