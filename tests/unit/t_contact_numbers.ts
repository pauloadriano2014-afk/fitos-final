import assert from 'assert';
import fs from 'fs';
const R = '/home/user/wt-back/';
const read = (p: string) => fs.readFileSync(R + p, 'utf8');
let ok = 0, bad = 0;
const t = (name: string, fn: () => void) => { try { fn(); ok++; console.log('  ok  ' + name); } catch (e: any) { bad++; console.log('FALHOU ' + name + '\n   ' + (e.stack || e)); } };
t('suporte das compras (e-mail do material), Termos e Privacidade usam o número comercial novo', () => {
  assert.ok(read('app/api/payments/webhook/route.ts').includes("const SUPORTE_WHATSAPP = '5541988692641'"));
  for (const p of ['app/termos/route.ts', 'app/privacidade/route.ts']) { const s = read(p); assert.ok(s.includes('(41) 98869-2641'), p); assert.ok(!s.includes('99799-1346'), p + ' ainda tem o número antigo'); }
});
t('o número do suporte é um celular completo (55 + DDD + 9 dígitos) e bate com o texto das páginas', () => {
  const n = /SUPORTE_WHATSAPP = '(\d+)'/.exec(read('app/api/payments/webhook/route.ts'))![1];
  assert.ok(/^55\d{2}9\d{8}$/.test(n), n); assert.equal(n, '55' + '41' + '988692641');
});
console.log(`\n${ok} ok, ${bad} falhas`); process.exit(bad ? 1 : 0);
