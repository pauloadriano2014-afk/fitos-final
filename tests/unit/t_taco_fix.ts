import assert from 'assert';
import * as fs from 'fs';
import prisma from '@/lib/prisma';
import { main } from '/home/user/fitos-final/scripts/taco-correcoes/aplicar';
const db = (prisma as any).__db;
const JSON_PATH = '/home/user/fitos-final/scripts/taco-correcoes/correcoes.json';
const C = JSON.parse(fs.readFileSync(JSON_PATH, 'utf8'));
const logs: string[] = []; const origLog = console.log;
const quiet = async <T,>(fn: () => Promise<T>) => { logs.length = 0; console.log = (...a: any[]) => { logs.push(a.join(' ')); }; try { return await fn(); } finally { console.log = origLog; } };
const food = (id: string, name: string, source = 'TACO', extra: any = {}) => ({ id, source, externalId: id, teamId: source === 'CUSTOM' ? 'MASTER_TEAM' : null, name, category: 'x', subcategory: null, baseUnit: 'g', kcal: 100, protein: 1, carbs: 1, fat: 1, fiber: 1, isActive: true, ...extra });
const OPT = { apply: false, dietas: false, jsonPath: JSON_PATH };
(async () => {
  // arquivo de correções
  assert.equal(C.nomes.length, 3); assert.equal(C.valores.length, 16); assert.equal(C.valores.filter((v: any) => v.tipo === 'valor diferente').length, 1);
  assert.deepEqual(C.nomes.map((n: any) => [n.de, n.para]), [['L', 'Feijoada'], ['Cana, aguardente 1', 'Cana, aguardente'], ['Cerveja, pilsen 2', 'Cerveja, pilsen']]);
  for (const v of C.valores) for (const x of Object.values(v.campos) as any[]) assert.ok(typeof x.de === 'number' && typeof x.para === 'number' && x.de !== x.para);
  const feij = food('taco-535', 'L', 'TACO', { kcal: 116.9, protein: 8.7, carbs: 11.6, fat: 6.5, fiber: 5.1 });
  db.foods.push(feij, food('taco-469', 'Cana, aguardente 1'), food('taco-471', 'Cerveja, pilsen 2'),
    food('taco-48', 'Pão, aveia, forma', 'TACO', { protein: 12.3 }), food('taco-541', 'Salada, de legumes, cozida no vapor', 'TACO', { fiber: 0 }),
    food('taco-106', 'Catalonha, refogada', 'TACO', { protein: 1.95, fiber: 3.6 }),                 // alguém já mexeu na proteína: não pode ser sobrescrita
    food('taco-144', 'Pimentão, verde, cru', 'TACO', { fat: 0.2 }),                                   // já corrigido
    food('custom-L', 'L', 'CUSTOM'));                                                                  // alimento do time com o mesmo nome: nunca é tocado
  db.items = [{ id: 'i1', name: 'L' }, { id: 'i2', name: 'L' }, { id: 'i3', name: 'Arroz' }, { id: 'i4', name: 'Cerveja, pilsen 2' }];
  const snap = JSON.stringify([db.foods, db.items]);

  // simulação
  await quiet(() => main({ ...OPT }));
  assert.equal(JSON.stringify([db.foods, db.items]), snap, 'simulação não grava'); const out = logs.join('\n');
  assert.ok(/Nada foi gravado/.test(out) && /"L" → "Feijoada": 1 alimento/.test(out) && /2 itens de dietas salvas com o nome "L"/.test(out) && /use --corrigir-dietas/.test(out), out);
  assert.ok(/Salada, de legumes, cozida no vapor" \[valor diferente\]: fiber 0 → 2.5/.test(out) && /Catalonha, refogada" \[arredondamento\]: .*protein está 1.95 \(esperava 1.9; não mexi\)/.test(out), out);

  // aplicar (sem dietas)
  await quiet(() => main({ ...OPT, apply: true }));
  const by = (id: string) => db.foods.find((f: any) => f.id === id);
  assert.equal(by('taco-535').name, 'Feijoada'); assert.equal(by('taco-535').kcal, 116.9); assert.equal(by('taco-469').name, 'Cana, aguardente'); assert.equal(by('taco-471').name, 'Cerveja, pilsen');
  assert.equal(by('taco-48').protein, 12.4); assert.equal(by('taco-541').fiber, 2.5); assert.equal(by('taco-106').protein, 1.95, 'valor editado por alguém é preservado'); assert.equal(by('taco-106').fiber, 3.7, 'o outro campo, ainda no valor antigo, é corrigido'); assert.equal(by('taco-144').fat, 0.2);
  assert.equal(by('custom-L').name, 'L', 'alimento CUSTOM com o mesmo nome não é tocado'); assert.deepEqual(db.items.map((i: any) => i.name), ['L', 'L', 'Arroz', 'Cerveja, pilsen 2'], 'dietas salvas intactas sem a opção');
  // reexecutar: idempotente
  const after = JSON.stringify(db.foods); await quiet(() => main({ ...OPT, apply: true })); assert.equal(JSON.stringify(db.foods), after); assert.ok(/Corrigiria|Corrigido: 0 nome\(s\) e 0 valor\(es\)/.test(logs.join('\n')), logs.join('\n'));
  // dietas salvas: só os nomes
  await quiet(() => main({ ...OPT, apply: true, dietas: true }));
  assert.deepEqual(db.items.map((i: any) => i.name), ['Feijoada', 'Feijoada', 'Arroz', 'Cerveja, pilsen'], 'itens das dietas salvas renomeados (mesmo com o catálogo já corrigido antes); "Arroz" intacto');
  assert.ok(/2 itens de dietas salvas renomeados/.test(logs.join('\n')), logs.join('\n'));
  await quiet(() => main({ ...OPT, apply: true, dietas: true })); assert.ok(!/itens de dietas salvas/.test(logs.join('\n')), 'segunda vez: nada mais a renomear');
  console.log('OK  correções da TACO: simulação não grava; renomeia L→Feijoada e tira as notas de rodapé; corrige 16 valores só se ainda estiverem no valor antigo; CUSTOM e dietas intactos; idempotente');
})().catch((e) => { console.log = origLog; console.error('FALHOU:', e.stack || e.message); process.exit(1); }).then(() => process.exit(process.exitCode || 0));
