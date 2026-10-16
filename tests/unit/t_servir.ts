import assert from 'assert';
import { normalizeUnitKey, sanitizePortions, MEASURE_KEYS, resolvePortions } from '/home/user/fitos-final/lib/foodMeasures';
for (const raw of ['colher_servir', 'colher de servir', 'Colher de arroz/servir', 'colher de arroz', 'col servir']) assert.equal(normalizeUnitKey(raw), 'colher_servir', raw);
assert.equal(normalizeUnitKey('colher de sopa'), 'colher'); assert.equal(normalizeUnitKey('colheres'), 'colher');
assert.ok(MEASURE_KEYS.includes('colher_servir'));
assert.deepEqual(sanitizePortions({ colher_servir: '45', 'colher de arroz/servir': 50, colher: 25 }), { colher_servir: 50, colher: 25 });
const r = resolvePortions([{ foodId: 'a', scope: 'GLOBAL', unit: 'colher_servir', grams: 45, source: 'IBGE' }, { foodId: 'a', scope: 'GLOBAL', unit: 'colher', grams: 25, source: 'IBGE' }], null, { name: 'x', portions: { colher: 30 } });
assert.deepEqual(r.portions, { colher_servir: 45, colher: 30 });         // legado (30) vence o IBGE (25); IBGE preenche o que falta
assert.deepEqual(r.sources, { colher_servir: 'IBGE', colher: 'LEGACY' });
console.log('OK  backend: colher_servir (apelidos, limpeza, precedência legado > IBGE)');
