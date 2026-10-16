import assert from 'assert';
import fs from 'fs';
import prisma from '@/lib/prisma';
import { GET } from '/home/user/fitos-final/app/api/saas-proposta/route';
const P = prisma as any; const S = P.__state;
const get = async (qs: string, headers: any = {}) => { const r = await GET(new Request('http://x/api/saas-proposta' + qs, { headers })); return { status: r.status, json: await r.json() }; };
const seed = () => {
  P.__reset();
  S.users.set('c1', { id: 'c1', email: 'eduardo@x.com', phone: '11999999999', cpf: '12345678900', password: 'hash', accountStatus: 'ACTIVE', inviteCode: 'EDUARDOH425', brandLogoUrl: 'https://img/logo.png', brandLogoSize: 500 });
  S.users.set('c2', { id: 'c2', accountStatus: 'ACTIVE', inviteCode: 'OUTRO1', brandLogoUrl: null, brandLogoSize: null });
  S.users.set('cu', { id: 'cu', accountStatus: 'ACTIVE' }); S.users.set('cb', { id: 'cb', accountStatus: 'BLOCKED', inviteCode: 'BLOQ1' }); S.users.set('cn', { id: 'cn', accountStatus: null, inviteCode: null });
  S.configs.set('c1', { id: 'cfg1', coachId: 'c1', pageTitle: 'Consultoria Online PRO', aboutText: 'Sou formado há 20 anos', videoUrl: 'https://youtube.com/shorts/x', coachPhotoUrl: 'https://img/p.jpg', themeColor: '#4DE38F', appFeatures: ['treinos'], galleryPhotos: ['a', 'b'], galleryTexts: ['t'], testimonialNames: ['Ana'], testimonialTexts: ['Ótimo'], pixKey: 'eduardo@pix.com', pixName: 'Eduardo H', createdAt: new Date(), updatedAt: new Date() });
  const plan = (id: string, coachId: string, name: string, value: number, extra: any = {}) => ({ id, coachId, name, description: 'interno', value, promotionalValue: 1, durationInMonths: 1, discountPerc: 0, paymentUrl: null, isActive: true, isPromoActive: false, createdAt: new Date(), updatedAt: new Date(), ...extra });
  S.plans.push(plan('p3', 'c1', 'ANUAL', 1897, { durationInMonths: 12 }), plan('p1', 'c1', 'MENSAL', 297), plan('p2', 'c1', 'PROMOCIONAL', 397, { durationInMonths: 3, discountPerc: 20, paymentUrl: 'https://pay/x' }), plan('px', 'c1', 'ANTIGO', 99, { isActive: false }), plan('po', 'c2', 'DE OUTRO', 50));
};

(async () => {
  // ── 1. sem login: devolve a página, ordenada, só planos ativos, do coach certo ──
  seed(); let r = await get('?coachId=c1');
  assert.equal(r.status, 200, 'o lead não tem login: não pode pedir token');
  assert.deepEqual(r.json.plans.map((p: any) => p.name), ['MENSAL', 'PROMOCIONAL', 'ANUAL'], 'planos ativos por valor; o inativo e o de outro coach ficam de fora');
  assert.equal(r.json.config.pageTitle, 'Consultoria Online PRO'); assert.equal(r.json.config.pixKey, 'eduardo@pix.com'); assert.equal(r.json.config.pixName, 'Eduardo H');
  assert.equal(r.json.brandLogoUrl, 'https://img/logo.png'); assert.equal(r.json.brandLogoSize, 500); assert.equal(r.json.inviteCode, 'EDUARDOH425', 'o cadastro do aluno é por código de convite');
  assert.equal(r.json.plans.find((p: any) => p.name === 'PROMOCIONAL').paymentUrl, 'https://pay/x'); assert.equal(r.json.plans[0].paymentUrl, null);
  console.log('OK  sem login: config, planos ativos (ordenados), logo e código de convite do coach certo');

  // ── 2. lista fechada de campos: nada interno vaza ──
  assert.deepEqual(Object.keys(r.json).sort(), ['brandLogoSize', 'brandLogoUrl', 'config', 'inviteCode', 'plans'], 'só estas chaves');
  assert.deepEqual(Object.keys(r.json.config).sort(), ['aboutText', 'appFeatures', 'coachPhotoUrl', 'galleryPhotos', 'galleryTexts', 'pageTitle', 'pixKey', 'pixName', 'testimonialNames', 'testimonialTexts', 'themeColor', 'videoUrl'], 'sem id, coachId, datas');
  for (const p of r.json.plans) assert.deepEqual(Object.keys(p).sort(), ['discountPerc', 'durationInMonths', 'id', 'name', 'paymentUrl', 'value'], 'plano: sem descrição interna, valor promocional, coachId, datas');
  const blob = JSON.stringify(r.json); for (const secret of ['eduardo@x.com', '11999999999', '12345678900', 'hash', 'cfg1', 'interno']) assert.ok(!blob.includes(secret), 'não pode vazar: ' + secret);
  console.log('OK  lista fechada de campos: nada de e-mail, telefone, CPF, senha, ids internos, datas ou plano inativo');

  // ── 3. coach sem página nem planos: 200 vazio (a tela mostra "ainda não configurou") ──
  r = await get('?coachId=c2'); assert.equal(r.status, 200); assert.equal(r.json.config, null); assert.deepEqual(r.json.plans.map((p: any) => p.name), ['DE OUTRO']); assert.equal(r.json.brandLogoUrl, null); assert.equal(r.json.inviteCode, 'OUTRO1');
  r = await get('?coachId=cn'); assert.equal(r.status, 200, 'status vazio conta como ativo (como o cadastro)'); assert.deepEqual(r.json.plans, []); assert.equal(r.json.config, null); assert.equal(r.json.inviteCode, null); assert.ok('brandLogoUrl' in r.json && r.json.brandLogoUrl === null && 'brandLogoSize' in r.json && r.json.brandLogoSize === null, 'sem logo: null explícito, a chave não some');
  r = await get('?coachId=cu'); assert.equal(r.status, 200); assert.ok('inviteCode' in r.json && r.json.inviteCode === null, 'sem código de convite: null explícito (a chave não some)');
  console.log('OK  coach sem página/planos: resposta vazia (sem erro); sem código de convite vem null');

  // ── 4. entradas ruins e coach inexistente/inativo ──
  for (const qs of ['', '?coachId=', '?coachId=%20%20', '?coachId=' + 'a'.repeat(65)]) { r = await get(qs); assert.equal(r.status, 400, qs.slice(0, 20)); }
  r = await get('?coachId=nao-existe'); assert.equal(r.status, 404); r = await get('?coachId=cb'); assert.equal(r.status, 404, 'conta bloqueada não vende');
  r = await get('?coachId=' + 'a'.repeat(64)); assert.equal(r.status, 404, '64 caracteres ainda é aceito (só não existe)');
  console.log('OK  sem coachId ou longo demais = 400; coach que não existe ou bloqueado = 404');

  // ── 5. fiação: a rota pública não exige login e a de gestão continua exigindo ──
  const src = (p: string) => fs.readFileSync('/home/user/fitos-final/' + p, 'utf8');
  const pub = src('app/api/saas-proposta/route.ts'); assert.ok(!/requireAuth|getAuthUser/.test(pub.replace(/\/\/.*$/gm, '')), 'pública de propósito'); assert.ok(/export const dynamic = 'force-dynamic'/.test(pub));
  const adm = src('app/api/admin/saas-meta/route.ts'); assert.ok(/requireAuth\(req\)/.test(adm) && /canActAsCoach\(auth\.user, coachId\)/.test(adm), 'a rota do painel (com chave PIX completa) continua só para o dono');
  assert.ok(/export const dynamic = 'force-dynamic'/.test(adm), 'sem o erro falso de build');
  console.log('OK  rota pública sem login; rota do painel continua protegida');
})().catch((e) => { console.log('FALHOU:', e && e.stack ? e.stack.split('\n').slice(0, 5).join('\n') : e); process.exit(1); });
