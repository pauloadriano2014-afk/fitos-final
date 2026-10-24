import assert from 'assert';
import sharp from 'sharp';
import { makeThumbnail } from '/home/user/fitos-final/lib/photoThumb';
let fails = 0, passed = 0;
const block = async (name: string, fn: () => Promise<void> | void) => { try { await fn(); passed++; console.log('  ok  ' + name); } catch (e: any) { fails++; console.log('  FALHOU  ' + name + '\n        ' + String(e && e.stack || e).split('\n').slice(0, 4).join('\n        ')); } };
// Foto de celular em pé: pixels DEITADOS (400 de largura x 300 de altura) + aviso de rotação 6 ("girar 90° para a direita") = em pé na tela (300 x 400).
const deitada = async (orientation?: number) => {
    let img = sharp({ create: { width: 400, height: 300, channels: 3, background: { r: 200, g: 40, b: 40 } } }).jpeg();
    const buf = await img.toBuffer();
    return orientation ? sharp(buf).withMetadata({ orientation }).jpeg().toBuffer() : buf;
};
(async () => {
  await block('foto com aviso de rotação (retrato do celular): a miniatura sai EM PÉ (mais alta que larga)', async () => {
    const orig = await deitada(6); const m0 = await sharp(orig).metadata(); assert.strictEqual(m0.orientation, 6, 'o arquivo de teste tem o aviso de rotação');
    const old = await sharp(orig).resize({ width: 300, withoutEnlargement: true }).jpeg({ quality: 60 }).toBuffer(); const mo = await sharp(old).metadata(); assert.ok(mo.width! > mo.height!, 'o jeito antigo deixava DEITADA (largura > altura)');
    const t = await makeThumbnail(orig); const mt = await sharp(t).metadata(); assert.ok(mt.height! > mt.width!, `miniatura em pé: ${mt.width}x${mt.height}`); assert.ok(!mt.orientation || mt.orientation === 1, 'sem aviso de rotação sobrando');
    assert.deepStrictEqual([mt.width, mt.height], [300, 400], 'o arquivo 400x300 com giro de 90° vira 300x400 em pé');
  });
  await block('foto sem aviso de rotação: continua como estava (nada é girado à toa)', async () => {
    const t = await makeThumbnail(await deitada()); const mt = await sharp(t).metadata(); assert.ok(mt.width! > mt.height!, `${mt.width}x${mt.height}`); assert.strictEqual(mt.width, 300);
  });
  await block('foto pequena não é aumentada', async () => {
    const small = await sharp({ create: { width: 120, height: 200, channels: 3, background: '#fff' } }).jpeg().toBuffer(); const m = await sharp(await makeThumbnail(small)).metadata(); assert.strictEqual(m.width, 120);
  });
  await block('as duas rotas (check-in e avaliação) usam a miniatura certa', () => {
    const fs = require('fs'); for (const p of ['app/api/checkin/route.ts', 'app/api/assessment/route.ts']) { const s = fs.readFileSync('/home/user/fitos-final/' + p, 'utf8'); assert.ok(/makeThumbnail\(buffer\)/.test(s) && !/from 'sharp'/.test(s), p); }
  });
  console.log(fails ? `\n${fails} falhou` : `\ntudo certo (${passed})`); process.exit(fails ? 1 : 0);
})();
