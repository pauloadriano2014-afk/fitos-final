import assert from 'assert';
import jwt from 'jsonwebtoken';
import prisma from '@/lib/prisma';
import { sanitizeLabel, sanitizeDayScheme, allowedKeys, isExtended, SLOT_KEYS } from '/home/user/fitos-final/lib/dayScheme';
import { POST as dietPOST } from '/home/user/fitos-final/app/api/admin/diet/route';
import { GET as dietGET } from '/home/user/fitos-final/app/api/diet/[userId]/route';
import { sanitizeDayScheme as appSanitize } from '/home/user/FIT-OS-FRONTEND/src/utils/dayScheme.js';
const db = (prisma as any).__db;
const PAULO = '3c82f763-66b4-48da-836e-16817d4f57c0';
const tok = (id: string, role = 'ADMIN') => jwt.sign({ id, role, coachId: null }, 'dev-only-troque-isso-configurando-JWT_SECRET-no-env');
const R = (url: string, method = 'GET', body?: any, token?: string) => new Request('http://x' + url, { method, headers: { 'content-type': 'application/json', ...(token ? { authorization: 'Bearer ' + token } : {}) }, body: body ? JSON.stringify(body) : undefined });
const meal = (dayType: string) => ({ name: 'Almoço', time: '12:00', dayType, items: [{ name: 'Arroz Branco', amount: 100, unit: 'g', calories_per_100: 130, p: 2, c: 28, f: 0, groupId: 'g1' }] });
const meals = [meal('TREINO')];
const save = async (extra: any = {}) => { const r = await dietPOST(R('/api/admin/diet', 'POST', { userId: 'aluno1', name: 'Plano', meals, ...extra }, tok(PAULO))); return { status: r.status, j: await r.json() }; };
const read = async () => { const r = await dietGET(R('/api/diet/aluno1', 'GET', undefined, tok('aluno1', 'USER')), { params: { userId: 'aluno1' } }); return r.json(); };
const publish = (d: any) => { db.diets = [{ ...d, isActive: true, isStrategy: false, strategyActive: false, meals: d.meals.map((m: any) => ({ ...m, isMainVersion: true, alternativeGroupId: null, items: m.items.map((i: any) => ({ ...i, calories: 1, protein: 1, carbs: 1, fats: 1 })) })) }]; };
const week = { preset: 'week', tabs: ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'].map((label, i) => ({ label, base: i < 5 ? 'TREINO' : i === 5 ? 'CARDIO' : 'DESCANSO' })) };

(async () => {
  // ── limpeza de nomes ──
  assert.equal(sanitizeLabel('🔥 Carbo Alto 🔥'), 'Carbo Alto'); assert.equal(sanitizeLabel('<b>Sábado</b>'), 'Sábado'); assert.equal(sanitizeLabel('  Opção   1  '), 'Opção 1');
  assert.equal(sanitizeLabel('Segunda a Sexta-feira longa demais'), 'Segunda a Sext'); assert.equal(sanitizeLabel('Seg/Qua/Sex'), 'Seg/Qua/Sex'); assert.equal(sanitizeLabel('😀🔥'), null); assert.equal(sanitizeLabel('   '), null); assert.equal(sanitizeLabel(7), null);
  assert.equal(sanitizeLabel('x'.repeat(50))!.length, 14);

  // ── esquema v2 ──
  assert.equal(sanitizeDayScheme(null), null); assert.equal(sanitizeDayScheme({ tabs: [] }), null); assert.equal(sanitizeDayScheme({ labels: {} }), null); assert.equal(sanitizeDayScheme([]), null);
  assert.equal(sanitizeDayScheme({ tabs: ['TREINO', 'TREINO_CARDIO', 'CARDIO', 'DESCANSO'].map((b) => ({ base: b })) }), null, '4 abas de sempre = padrão = null');
  assert.deepEqual(sanitizeDayScheme({ preset: 'menus', tabs: [{ label: 'Cardápio 1', base: 'TREINO' }, { label: '🔥 Cardápio 2', base: 'TREINO' }] }), { v: 2, preset: 'menus', tabs: [{ key: 'TREINO', label: 'Cardápio 1', base: 'TREINO' }, { key: 'TREINO_CARDIO', label: 'Cardápio 2', base: 'TREINO' }] });
  const w = sanitizeDayScheme(week)!; assert.equal(w.tabs.length, 7); assert.deepEqual(w.tabs.map((t) => t.key), [...SLOT_KEYS]); assert.equal(w.tabs[5].base, 'CARDIO'); assert.ok(isExtended(w)); assert.deepEqual(allowedKeys(w), [...SLOT_KEYS]);
  assert.equal(sanitizeDayScheme({ tabs: Array.from({ length: 12 }, () => ({ label: 'A', base: 'TREINO' })) })!.tabs.length, 7, 'no máximo 7 abas');
  assert.equal(sanitizeDayScheme({ tabs: [{ label: 'A', base: 'XYZ' }, { label: 'B', base: 7 }] })!.tabs.map((t) => t.base).join(), 'TREINO,TREINO_CARDIO', 'tipo inválido cai no tipo da posição');
  assert.equal(sanitizeDayScheme({ preset: 'lixo', tabs: [{ label: 'A' }, { label: 'B' }] })!.preset, 'custom');
  assert.deepEqual(allowedKeys(null), ['TREINO', 'TREINO_CARDIO', 'CARDIO', 'DESCANSO']); assert.ok(!isExtended(null));
  assert.ok(!isExtended(sanitizeDayScheme({ tabs: [{ label: 'A' }, { label: 'B' }, { label: 'C' }, { label: 'D' }] })));
  // v1 (primeira versão: só nomes por chave) continua sendo lido
  assert.deepEqual(sanitizeDayScheme({ preset: 'options', labels: { TREINO: 'Opção 1', SEG: 'Segunda', DESCANSO: 'Opção 4', CARDIO: '<i></i>' } }), { v: 2, preset: 'options', tabs: [{ key: 'TREINO', label: 'Opção 1', base: 'TREINO' }, { key: 'TREINO_CARDIO', base: 'TREINO_CARDIO' }, { key: 'CARDIO', base: 'CARDIO' }, { key: 'DESCANSO', label: 'Opção 4', base: 'DESCANSO' }] });
  // servidor e app validam igual (600 entradas aleatórias, formatos v1 e v2)
  let seed = 7; const rnd = () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296; const pick = (a: any[]) => a[Math.floor(rnd() * a.length)];
  const junk = () => pick(['', '  ', 'Opção 1', '🔥 Alto', '<b>x</b>', 'Segunda a Sexta-feira', 'Sáb & Dom', 7, null, undefined, 'a'.repeat(30), "O'Neil", 'Dia 1 (A)', '💤', 'Ação/Ré', 'x́']);
  const tab = () => pick([null, 'x', {}, { label: junk(), base: pick(['TREINO', 'TREINO_CARDIO', 'CARDIO', 'DESCANSO', 'ZZ', 3, null]) }, { label: junk() }, { base: 'DESCANSO' }]);
  for (let i = 0; i < 600; i++) {
    const c: any = rnd() < 0.5
      ? { preset: pick(['default', 'week', 'custom', 'zz', junk()]), tabs: Array.from({ length: Math.floor(rnd() * 10) }, tab) }
      : { preset: pick(['default', 'options', 'custom', 'zz', junk()]), labels: { TREINO: junk(), TREINO_CARDIO: junk(), CARDIO: junk(), DESCANSO: junk(), OUTRO: junk() } };
    if (rnd() < 0.05) delete c.tabs;
    assert.deepStrictEqual(JSON.parse(JSON.stringify(sanitizeDayScheme(c))), JSON.parse(JSON.stringify(appSanitize(c))), JSON.stringify(c));
  }
  console.log('OK  abas: emoji/HTML saem, 7 no máximo, chave por posição, tipo inválido cai no da posição, padrão = null, v1 convertido; servidor e app validam igual (600 casos)');

  // ── salvar / ler ──
  let { status, j } = await save({ daysV2: true, dayScheme: { preset: 'options', tabs: [{ label: 'Opção 1', base: 'TREINO' }, { label: '🔥 Opção 2', base: 'TREINO' }, { label: 'Opção 3', base: 'TREINO' }, { label: 'Opção 4', base: 'TREINO' }] } });
  assert.equal(status, 200); const id1 = j.id; assert.equal(db.schemes[id1].v, 2); assert.equal(db.schemes[id1].tabs[1].label, 'Opção 2');
  publish(j); let d = await read(); assert.equal(d.dayScheme.tabs.length, 4); assert.ok(Array.isArray(d.meals) && d.meals[0].dayType === 'TREINO', 'resto da resposta igual');
  console.log('OK  salvar com abas: grava (limpas) para a nova dieta; o aluno lê dayScheme junto com a dieta');

  // app que NÃO manda dayScheme (undefined): herda da versão anterior; mandar null limpa
  ({ j } = await save({ daysV2: true })); const id2 = j.id; assert.notEqual(id2, id1); assert.deepEqual(db.schemes[id2], db.schemes[id1]);
  db.diets = [{ ...j, id: id2 }]; ({ j } = await save({ daysV2: true, dayScheme: null })); assert.equal(db.schemes[j.id], undefined); publish(j); d = await read(); assert.equal(d.dayScheme, null);
  console.log('OK  salvar sem dayScheme herda as abas da versão anterior; dayScheme:null volta às abas padrão (leitura devolve null)');

  // ── abas extras (Semana, 7 abas) ──
  const weekMeals = SLOT_KEYS.map((k) => meal(k));
  ({ status, j } = await save({ daysV2: true, meals: weekMeals, dayScheme: week })); assert.equal(status, 200); const idW = j.id;
  assert.deepEqual(j.meals.map((m: any) => m.dayType), [...SLOT_KEYS], 'as 7 abas gravadas com as chaves posicionais'); assert.equal(db.schemes[idW].tabs.length, 7);
  publish(j); d = await read(); assert.equal(d.dayScheme.tabs.length, 7); assert.equal(d.meals.length, 7);
  // app novo sem dayScheme (herda) continua salvando as extras
  ({ status, j } = await save({ daysV2: true, meals: weekMeals })); assert.equal(status, 200); assert.equal(db.schemes[j.id].tabs.length, 7); db.diets = [{ ...j, id: j.id }];
  // editor ANTIGO (sem daysV2) não pode sobrescrever dieta com mais de 4 abas
  const before = db.dietSeq; ({ status, j } = await save({ meals: [meal('TREINO')] })); assert.equal(status, 409); assert.ok(/mais de 4 abas/i.test(j.error)); assert.equal(db.dietSeq, before, 'nada foi criado');
  // e o de sempre (4 abas) continua salvando normalmente sem daysV2
  db.schemes = {}; ({ status } = await save({ meals: [meal('TREINO'), meal('DESCANSO')] })); assert.equal(status, 200);
  console.log('OK  Semana (7 abas): grava as 7 chaves, herda ao salvar sem dayScheme; editor antigo é barrado (409) só em dieta com mais de 4 abas');

  // refeição numa aba que o esquema não tem -> 400
  ({ status, j } = await save({ daysV2: true, meals: [meal('EXTRA_7')], dayScheme: { preset: 'menus', tabs: Array.from({ length: 5 }, (_, i) => ({ label: 'C' + i, base: 'TREINO' })) } })); assert.equal(status, 400);
  ({ status } = await save({ daysV2: true, meals: [meal('EXTRA_5')] })); assert.equal(status, 400, 'sem esquema também não existe aba 5');
  ({ status } = await save({ daysV2: true, meals: [meal('EXTRA_5')], dayScheme: { tabs: Array.from({ length: 5 }, (_, i) => ({ label: 'C' + i })) } })); assert.equal(status, 200);
  console.log('OK  refeição numa aba que o esquema não tem é recusada (400)');

  // sem a tabela nova (antes do db push): dieta normal salva e lê; abas extras são recusadas (503) em vez de ficarem órfãs
  db.missingSchemeTable = true; db.schemes = {};
  ({ status, j } = await save({ dayScheme: { tabs: [{ label: 'A' }, { label: 'B' }] } })); assert.equal(status, 200); publish(j); d = await read(); assert.equal(d.dayScheme, null); assert.ok(d.meals.length === 1);
  ({ status, j } = await save({ daysV2: true, meals: weekMeals, dayScheme: week })); assert.equal(status, 503); assert.ok(/prisma db push/.test(j.error));
  db.missingSchemeTable = false;
  console.log('OK  antes do db push: a dieta salva e lê normalmente; abas extras dão 503 (não ficam órfãs)\n\nTODOS OS TESTES DAS ABAS DA DIETA (SERVIDOR) PASSARAM');
})().catch((e) => { console.error('FALHOU:', e.stack || e.message); process.exit(1); }).then(() => process.exit(process.exitCode || 0));
