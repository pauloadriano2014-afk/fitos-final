import assert from 'assert';
import jwt from 'jsonwebtoken';
import prisma from '@/lib/prisma';
import * as K from '/home/user/fitos-final/lib/cupom';
import * as PP from '/home/user/fitos-final/lib/produtoPedido';

process.env.ASAAS_WEBHOOK_TOKEN = 'tok'; process.env.RESEND_API_KEY = 're_test'; process.env.JWT_SECRET = 'segredo-de-teste'; process.env.APP_URL = 'https://app.test'; process.env.ASAAS_API_KEY = 'k';
for (const k of ['MEMBROS_URL', 'MEMBROS_SECRET', 'MEMBROS_FROM', 'RESEND_FROM', 'META_PIXEL_ID', 'META_CAPI_TOKEN', 'META_TEST_EVENT_CODE', 'META_GRAPH_VERSION']) delete process.env[k];
const errs: string[] = [];
console.log = () => {}; console.warn = () => {}; console.error = (...a: any[]) => { errs.push(a.map((x) => (x && x.message) || String(x)).join(' ')); };
const out = (s: string) => process.stdout.write(s + '\n');

const db: any = (prisma as any).__db;
const G: any = globalThis;
const calls: { url: string; method: string; body: any }[] = [];
const graph = () => calls.filter((c) => c.url.startsWith('https://graph.facebook.com'));
const asaasPosts = () => calls.filter((c) => /\/payments$/.test(c.url) && c.method === 'POST');
const A: any = { payments: [] as any[], onLookup: null as null | (() => void), onPayment: null as any };
const ok = (j: any = {}) => ({ ok: true, status: 200, json: async () => j });
G.fetch = async (url: string, init: any = {}) => {
  const u = String(url); const method = init.method || 'GET'; const body = init.body ? JSON.parse(init.body) : undefined;
  calls.push({ url: u, method, body });
  if (u.startsWith('https://api.resend.com')) return ok({});
  if (u.startsWith('https://graph.facebook.com')) return ok({});
  const path = u.replace(/^https:\/\/[^/]+\/v3/, '');
  if (path.startsWith('/customers?cpfCnpj')) { if (A.onLookup) A.onLookup(); return ok({ data: [] }); }
  if (path === '/customers' && method === 'POST') return ok({ id: 'cus_1' });
  if (path === '/payments' && method === 'POST') {
    if (A.onPayment) { const r = A.onPayment(body); if (r) return r; }
    const id = 'pay_' + (A.payments.length + 1); A.payments.push({ ...body, id });
    return ok({ id, invoiceUrl: 'https://asaas.test/i/' + A.payments.length });
  }
  if (/^\/payments\/[^/]+\/pixQrCode$/.test(path)) return ok({ encodedImage: 'QUJD', payload: '00020126pix' });
  const g = /^\/payments\/([^/]+)$/.exec(path);
  if (g && method === 'GET') return ok({ id: g[1], status: 'CONFIRMED' });
  throw new Error('chamada inesperada no teste: ' + method + ' ' + u);
};

// relógio virtual só do limitador de tentativas (lib/rateLimit.ts usa Date.now); new Date() segue o relógio real
const t0 = Date.now(); let skew = 0; Date.now = () => t0 + skew;
const MIN = 60_000, HORA = 3_600_000, DIA = 24 * HORA;
const agora = () => new Date();
const ago = (ms: number) => new Date(new Date().getTime() - ms);
const later = (ms: number) => new Date(new Date().getTime() + ms);
const PAULO = '3c82f763-66b4-48da-836e-16817d4f57c0', ADRI = 'b7c0c181-41fd-4156-b8fe-963a267759a3', COACH = 'coach-x', OUTRO = 'coach-y';
const SECRET = 'segredo-de-teste';
const tok = (id: string, role = 'COACH') => jwt.sign({ id, role, coachId: null }, SECRET);
const mkReq = (path: string, method = 'POST', body?: any, headers: Record<string, string> = {}) => new Request('http://x' + path, { method, headers: { 'Content-Type': 'application/json', ...headers }, body: body === undefined ? undefined : (typeof body === 'string' ? body : JSON.stringify(body)) });
const jr = async (res: Response) => ({ status: res.status, json: await res.json() });
let ipN = 0; const ip = () => ({ 'x-forwarded-for': `10.2.0.${++ipN}`, 'user-agent': 'UA-Teste/1.0' });
const auth = (t?: string) => (t ? { Authorization: 'Bearer ' + t } : {});
const near = (a: number, b: number, m = '') => assert.ok(Math.abs(a - b) < 1e-9, `${m} ${a} != ${b}`);
const reset = () => { for (const k of Object.keys(db)) db[k].length = 0; calls.length = 0; errs.length = 0; A.payments.length = 0; A.onLookup = null; A.onPayment = null; skew += 16 * MIN; for (const k of ['MEMBROS_URL', 'META_PIXEL_ID', 'META_CAPI_TOKEN']) delete process.env[k]; };

const produtos = () => {
  db.produtoDigital.push({ id: 'p1', slug: 'ficha-feminina', nome: 'Ficha Feminina', coachId: PAULO, linkEntrega: 'https://drive/ficha', treinoPrograma: null, cursoPrograma: null, valor: 32.9, ativo: true, orderBumpProdutoIds: JSON.stringify(['p2', 'p3', 'p4']) });
  db.produtoDigital.push({ id: 'p2', slug: 'checklist', nome: 'Checklist', coachId: PAULO, linkEntrega: 'https://drive/c', treinoPrograma: null, cursoPrograma: null, valor: 9.9, ativo: true, orderBumpProdutoIds: null });
  db.produtoDigital.push({ id: 'p3', slug: 'receitas', nome: 'Receitas', coachId: ADRI, linkEntrega: null, treinoPrograma: null, cursoPrograma: null, valor: 14.9, ativo: true, orderBumpProdutoIds: null });
  db.produtoDigital.push({ id: 'p4', slug: 'velho', nome: 'Desativado', coachId: PAULO, linkEntrega: null, treinoPrograma: null, cursoPrograma: null, valor: 5, ativo: false, orderBumpProdutoIds: null });
  db.produtoDigital.push({ id: 'p5', slug: 'barato', nome: 'Baratinho', coachId: PAULO, linkEntrega: null, treinoPrograma: null, cursoPrograma: null, valor: 1, ativo: true, orderBumpProdutoIds: null });
  db.produtoDigital.push({ id: 'p6', slug: 'do-coach', nome: 'Do Coach X', coachId: COACH, linkEntrega: null, treinoPrograma: null, cursoPrograma: null, valor: 50, ativo: true, orderBumpProdutoIds: null });
};
let cn = 0;
const cup = (o: any = {}) => { const c = { id: 'cup' + ++cn, codigo: 'VERAO10', descricao: null, tipo: 'PERCENTUAL', valor: 10, coachId: PAULO, produtoIds: null, validoDe: null, validoAte: null, usoMaximo: null, umaVezPorCliente: true, ativo: true, createdAt: new Date(), ...o }; db.cupomDesconto.push(c); return c; };
const vendaDe = (cupomId: string, o: any = {}) => { const v = { id: 'v' + ++cn, produtoId: 'p1', nomeCliente: 'Fulana', emailCliente: 'fulana@x.com', telefoneCliente: '41999990000', cpfCliente: '11111111111', status: 'PAGO', valorTotal: 29.61, cupomId, createdAt: new Date(), ...o }; db.produtoVenda.push(v); return v; };

let fails = 0, passed = 0;
const block = async (name: string, fn: () => Promise<void> | void) => { try { reset(); cn = 0; await fn(); passed++; out('  ok  ' + name); } catch (e: any) { fails++; out('  FALHOU  ' + name + '\n        ' + String((e && e.stack) || e).split('\n').slice(0, 7).join('\n        ')); } };

(async () => {
  const comprarRoute = await import('@/app/api/produtos/comprar/route');
  const cupomRoute = await import('@/app/api/produtos/cupom/route');
  const admin = await import('@/app/api/admin/cupons/route');
  const adminId = await import('@/app/api/admin/cupons/[id]/route');
  const { POST: webhook } = await import('@/app/api/payments/webhook/route');

  const dadosOk = (o: any = {}) => ({ produtoId: 'p1', nome: 'Ana Souza', email: ' Ana@Gmail.com ', telefone: '(41) 99999-0000', cpf: '123.456.789-09', itensBumpIds: [], ...o });
  const comprar = (o: any = {}, headers: Record<string, string> = ip()) => comprarRoute.POST(mkReq('/api/produtos/comprar', 'POST', dadosOk(o), headers) as any);
  const validar = (o: any = {}, headers: Record<string, string> = ip()) => cupomRoute.POST(mkReq('/api/produtos/cupom', 'POST', { produtoId: 'p1', codigo: 'VERAO10', ...o }, headers) as any);
  const aList = (t?: string) => admin.GET(mkReq('/api/admin/cupons', 'GET', undefined, auth(t)) as any);
  const aNew = (body: any, t?: string) => admin.POST(mkReq('/api/admin/cupons', 'POST', body, auth(t)) as any);
  const aPatch = (id: string, body: any, t?: string) => adminId.PATCH(mkReq('/api/admin/cupons/' + id, 'PATCH', body, auth(t)) as any, { params: { id } });
  const aDel = (id: string, t?: string) => adminId.DELETE(mkReq('/api/admin/cupons/' + id, 'DELETE', undefined, auth(t)) as any, { params: { id } });

  // ═════════════ lib/cupom.ts: contas e regras puras ═════════════
  await block('código: maiúsculas, sem acento nem espaço, só letras/números/-/_ e no máximo 30; formato válido de 3 a 30', () => {
    assert.deepStrictEqual(['verão 10', ' Black-Friday_26 ', 'ÇÃO', 'a b!c@d#', null, undefined, 123, 'x'.repeat(40)].map(K.normalizarCodigo), ['VERAO10', 'BLACK-FRIDAY_26', 'CAO', 'ABCD', '', '', '123', 'X'.repeat(30)]);
    assert.deepStrictEqual(['ABC', 'A1B', 'VERAO10', 'A_B-C', 'X'.repeat(30), 'AB', '', 'X'.repeat(31), '-ABC', '_ABC', 'AB C', 'abc'].map(K.codigoValido), [true, true, true, true, true, false, false, false, false, false, false, false]);
    assert.strictEqual(K.CODIGO_RE.test('A--'), true);
  });

  await block('a conta do desconto: porcentagem e valor fixo, arredondamento em centavos, nunca abaixo de R$ 5,00 e nunca negativo', () => {
    assert.deepStrictEqual(K.descontoDe('PERCENTUAL', 10, 32.9), { desconto: 3.29, final: 29.61, limitado: false });
    assert.deepStrictEqual(K.descontoDe('PERCENTUAL', 10, 57.7), { desconto: 5.77, final: 51.93, limitado: false });
    assert.deepStrictEqual(K.descontoDe('PERCENTUAL', 33.33, 100), { desconto: 33.33, final: 66.67, limitado: false });
    assert.deepStrictEqual(K.descontoDe('PERCENTUAL', 15, 19.9), { desconto: 2.99, final: 16.91, limitado: false }, '2,985 arredonda para 2,99');
    assert.deepStrictEqual(K.descontoDe('VALOR', 10, 32.9), { desconto: 10, final: 22.9, limitado: false });
    assert.deepStrictEqual(K.descontoDe('VALOR', 30, 32.9), { desconto: 27.9, final: 5, limitado: true }, 'sobraria R$ 2,90: o desconto é cortado para cobrar R$ 5,00');
    assert.deepStrictEqual(K.descontoDe('PERCENTUAL', 90, 32.9), { desconto: 27.9, final: 5, limitado: true }, '90% deixaria R$ 3,29');
    assert.deepStrictEqual(K.descontoDe('VALOR', 27.9, 32.9), { desconto: 27.9, final: 5, limitado: false }, 'exatamente no limite não é "cortado"');
    assert.deepStrictEqual(K.descontoDe('VALOR', 10, 5), { desconto: 0, final: 5, limitado: true }, 'pedido de R$ 5,00 não tem desconto possível');
    assert.deepStrictEqual(K.descontoDe('VALOR', 10, 1), { desconto: 0, final: 1, limitado: true }, 'pedido abaixo do mínimo: nada a descontar (e não vira negativo)');
    assert.deepStrictEqual(K.descontoDe('VALOR', -5, 40), { desconto: 0, final: 40, limitado: false }, 'desconto negativo vira zero');
    assert.deepStrictEqual(K.descontoDe('VALOR', 1, 10.245), { desconto: 1, final: 9.25, limitado: false }, 'o total é arredondado em centavos antes da conta');
    assert.deepStrictEqual(K.descontoDe('VALOR', NaN, 40), { desconto: 0, final: 40, limitado: false }); assert.deepStrictEqual(K.descontoDe('PERCENTUAL', Infinity, 40), { desconto: 0, final: 40, limitado: false });
    assert.strictEqual(K.VALOR_MINIMO_COBRANCA, 5); assert.strictEqual(K.PERCENTUAL_MAXIMO, 90); assert.strictEqual(K.round2(0.1 + 0.2), 0.3); assert.strictEqual(K.round2(1.005), 1.01);
  });

  await block('texto do desconto e situação na lista do coach', () => {
    assert.strictEqual(K.descreverCupom({ tipo: 'PERCENTUAL', valor: 10 }), '10% de desconto'); assert.strictEqual(K.descreverCupom({ tipo: 'PERCENTUAL', valor: 12.5 }), '12,5% de desconto'); assert.strictEqual(K.descreverCupom({ tipo: 'VALOR', valor: 15 }), 'R$ 15,00 de desconto'); assert.strictEqual(K.descreverCupom({ tipo: 'VALOR', valor: 1234.5 }), 'R$ 1.234,50 de desconto');
    const now = new Date('2026-10-07T15:00:00Z'); const S = (o: any, usos = 0) => K.situacaoDoCupom({ ativo: true, validoDe: null, validoAte: null, usoMaximo: null, ...o }, usos, now);
    assert.deepStrictEqual([S({}), S({ ativo: false }), S({ validoDe: new Date('2026-10-08T00:00:00Z') }), S({ validoAte: new Date('2026-10-07T14:59:59Z') }), S({ usoMaximo: 5 }, 5), S({ usoMaximo: 5 }, 4), S({ validoAte: new Date('2026-10-07T15:00:00Z') }), S({ validoDe: new Date('2026-10-07T15:00:00Z') })], ['ATIVO', 'PAUSADO', 'AGENDADO', 'EXPIRADO', 'ESGOTADO', 'ATIVO', 'ATIVO', 'ATIVO']);
    assert.strictEqual(S({ ativo: false, validoAte: new Date('2020-01-01') }), 'PAUSADO', 'pausado vence expirado'); assert.strictEqual(S({ ativo: false, validoDe: new Date('2030-01-01') }), 'PAUSADO', 'pausado vence agendado'); assert.strictEqual(S({ validoDe: new Date('2030-01-01'), usoMaximo: 1 }, 9), 'AGENDADO'); assert.strictEqual(S({ validoAte: new Date('2020-01-01'), usoMaximo: 1 }, 9), 'EXPIRADO');
  });

  await block('o cupom vale para o produto? lista escolhida manda; sem lista vale para os produtos do mesmo dono (o time master divide entre si)', () => {
    const p = (id: string, coachId: string) => ({ id, coachId });
    assert.strictEqual(K.cupomServeProduto({ coachId: PAULO, produtoIds: JSON.stringify(['a', 'b']) }, p('a', COACH)), true, 'lista explícita vale mesmo de outro dono');
    assert.strictEqual(K.cupomServeProduto({ coachId: PAULO, produtoIds: JSON.stringify(['a']) }, p('z', PAULO)), false, 'fora da lista');
    assert.strictEqual(K.cupomServeProduto({ coachId: PAULO, produtoIds: null }, p('z', PAULO)), true); assert.strictEqual(K.cupomServeProduto({ coachId: PAULO, produtoIds: '' }, p('z', ADRI)), true, 'Paulo e Adri compartilham');
    assert.strictEqual(K.cupomServeProduto({ coachId: PAULO, produtoIds: '[]' }, p('z', COACH)), false); assert.strictEqual(K.cupomServeProduto({ coachId: COACH, produtoIds: null }, p('z', COACH)), true);
    assert.strictEqual(K.cupomServeProduto({ coachId: COACH, produtoIds: null }, p('z', PAULO)), false, 'cupom de coach comum não vale em produto do master'); assert.strictEqual(K.cupomServeProduto({ coachId: COACH, produtoIds: null }, p('z', OUTRO)), false);
    assert.strictEqual(K.cupomServeProduto({ coachId: PAULO, produtoIds: 'lixo{' }, p('z', PAULO)), true, 'lista ilegível = sem lista');
    assert.deepStrictEqual(K.parseProdutoIds('["a","b","a"," c ",1,"",null]'), ['a', 'b', 'c']); assert.deepStrictEqual(K.parseProdutoIds(['x', 'x']), ['x']); assert.deepStrictEqual(K.parseProdutoIds(null), []); assert.deepStrictEqual(K.parseProdutoIds('{"a":1}'), []); assert.deepStrictEqual(K.parseProdutoIds('lixo'), []);
  });

  await block('avaliação do cupom: cada motivo, na ordem certa, e os limites exatos', () => {
    const now = new Date('2026-10-07T15:00:00Z'); const prod = { id: 'p1', coachId: PAULO };
    const C = (o: any = {}) => ({ id: 'c', codigo: 'X', tipo: 'PERCENTUAL', valor: 10, coachId: PAULO, produtoIds: null, validoDe: null, validoAte: null, usoMaximo: null, umaVezPorCliente: true, ativo: true, ...o });
    const E = (o: any = {}, ctx: any = {}) => K.avaliarCupom(C(o), { now, produto: prod, total: 32.9, usosTotal: 0, usosCliente: 0, ...ctx });
    assert.deepStrictEqual(E(), { ok: true, desconto: 3.29, final: 29.61, original: 32.9, limitado: false });
    assert.strictEqual((E({}, { total: 32.905 }) as any).original, 32.91, 'o valor original também sai em centavos');
    { const { ativo, ...semAtivo } = C(); assert.strictEqual(K.avaliarCupom(semAtivo as any, { now, produto: prod, total: 32.9, usosTotal: 0, usosCliente: 0 }).ok, true, 'linha sem o campo ativo = ativa (só `false` pausa)'); }
    const no = (r: any, motivo: string, msg?: string) => { assert.strictEqual(r.ok, false); assert.strictEqual(r.motivo, motivo); if (msg) assert.strictEqual(r.mensagem, msg); assert.ok(r.mensagem.length > 8); };
    no(K.avaliarCupom(null, { now, produto: prod, total: 10, usosTotal: 0, usosCliente: 0 }), 'NAO_ENCONTRADO', 'Cupom inválido. Confira o código.'); no(K.avaliarCupom(undefined, { now, produto: prod, total: 10, usosTotal: 0, usosCliente: 0 }), 'NAO_ENCONTRADO');
    no(E({ ativo: false }), 'INATIVO', 'Cupom inválido. Confira o código.');
    no(E({ validoDe: new Date('2026-10-07T15:00:00.001Z') }), 'AINDA_NAO', 'Este cupom ainda não está valendo.'); assert.strictEqual(E({ validoDe: new Date('2026-10-07T15:00:00Z') }).ok, true, 'começa a valer no instante exato');
    no(E({ validoAte: new Date('2026-10-07T14:59:59.999Z') }), 'EXPIRADO', 'Este cupom expirou.'); assert.strictEqual(E({ validoAte: new Date('2026-10-07T15:00:00Z') }).ok, true, 'vale até o instante exato');
    no(E({ produtoIds: JSON.stringify(['outro']) }), 'OUTRO_PRODUTO', 'Este cupom não vale para este produto.'); no(E({ coachId: COACH }), 'OUTRO_PRODUTO');
    no(E({ usoMaximo: 3 }, { usosTotal: 3 }), 'ESGOTADO', 'Este cupom já atingiu o limite de usos.'); assert.strictEqual(E({ usoMaximo: 3 }, { usosTotal: 2 }).ok, true, 'ainda sobra 1 uso'); assert.strictEqual(E({ usoMaximo: null }, { usosTotal: 9999 }).ok, true, 'sem limite'); no(E({ usoMaximo: 0 }, { usosTotal: 0 }), 'ESGOTADO');
    no(E({}, { usosCliente: 1 }), 'JA_USOU', 'Você já usou este cupom.'); assert.strictEqual(E({ umaVezPorCliente: false }, { usosCliente: 5 }).ok, true, 'liberado para repetir'); assert.strictEqual(E({ umaVezPorCliente: undefined }, { usosCliente: 1 }).ok, false, 'o padrão é uma vez por cliente');
    no(E({ tipo: 'VALOR', valor: 10 }, { total: 5 }), 'SEM_EFEITO', 'Este cupom não reduz o valor deste pedido.');
    // ordem: o primeiro problema da lista é o que a pessoa vê
    no(E({ ativo: false, validoAte: new Date('2020-01-01'), usoMaximo: 1 }, { usosTotal: 5, usosCliente: 1 }), 'INATIVO'); no(E({ validoDe: new Date('2030-01-01'), validoAte: new Date('2020-01-01') }), 'AINDA_NAO'); no(E({ validoAte: new Date('2020-01-01'), produtoIds: JSON.stringify(['z']) }), 'EXPIRADO');
    no(E({ produtoIds: JSON.stringify(['z']), usoMaximo: 1 }, { usosTotal: 5 }), 'OUTRO_PRODUTO'); no(E({ usoMaximo: 1 }, { usosTotal: 5, usosCliente: 1 }), 'ESGOTADO');
    assert.deepStrictEqual(E({ tipo: 'VALOR', valor: 30 }), { ok: true, desconto: 27.9, final: 5, original: 32.9, limitado: true }); assert.strictEqual(K.mensagemDoMotivo('JA_USOU'), 'Você já usou este cupom.');
    assert.strictEqual(E({ validoDe: String('2026-10-07T14:00:00Z') as any }).ok, true, 'datas como texto também valem');
  });

  await block('datas do cupom: só a data vale do começo ao fim do dia em Brasília; data completa vale como veio', () => {
    assert.strictEqual(K.lerData('2026-10-31', false)!.toISOString(), '2026-10-31T03:00:00.000Z'); assert.strictEqual(K.lerData('2026-10-31', true)!.toISOString(), '2026-11-01T02:59:59.999Z');
    assert.strictEqual(K.lerData('2026-10-31T12:00:00Z', true)!.toISOString(), '2026-10-31T12:00:00.000Z'); assert.strictEqual(K.lerData(null, true), null); assert.strictEqual(K.lerData('', false), null); assert.strictEqual(K.lerData(undefined, true), undefined);
    assert.strictEqual(K.lerData('31/10/2026', true), undefined, 'formato ruim'); assert.strictEqual(K.lerData('lixo', true), undefined); assert.strictEqual(K.lerData('2026-13-45', true), undefined);
  });

  await block('o que o coach manda ao criar/editar: confere, limpa e recusa com mensagem clara', () => {
    const L = (b: any, parcial = false) => K.limparEntradaCupom(b, { parcial });
    const bom = { codigo: ' verão 10 ', tipo: 'PERCENTUAL', valor: '10', descricao: '  Black   Friday ', produtoIds: ['p1', 'p1', 'p2'], validoDe: '2026-10-01', validoAte: '2026-10-31', usoMaximo: '50', umaVezPorCliente: true, ativo: true };
    const r: any = L(bom); assert.strictEqual(r.ok, true);
    assert.deepStrictEqual(r.data, { codigo: 'VERAO10', tipo: 'PERCENTUAL', valor: 10, descricao: 'Black Friday', produtoIds: '["p1","p2"]', validoDe: new Date('2026-10-01T00:00:00-03:00'), validoAte: new Date('2026-10-31T23:59:59.999-03:00'), usoMaximo: 50, umaVezPorCliente: true, ativo: true });
    const e = (b: any, trecho: string, parcial = false) => { const x: any = L(b, parcial); assert.strictEqual(x.ok, false, JSON.stringify(b)); assert.ok(x.error.includes(trecho), x.error + ' ⊅ ' + trecho); };
    e({ ...bom, codigo: 'ab' }, 'Código inválido'); e({ ...bom, codigo: '' }, 'Código inválido'); e({ ...bom, codigo: undefined }, 'Código inválido'); e({ ...bom, tipo: 'XX' }, 'Escolha o tipo'); e({ ...bom, tipo: undefined }, 'Escolha o tipo');
    e({ ...bom, valor: 'abc' }, 'Informe o valor'); e({ ...bom, valor: undefined }, 'Informe o valor'); e({ ...bom, valor: '' }, 'Informe o valor'); e({ ...bom, valor: 0 }, 'entre 1% e 90%'); e({ ...bom, valor: 0.5 }, 'entre 1% e 90%'); e({ ...bom, valor: 91 }, 'entre 1% e 90%'); e({ ...bom, valor: 100 }, 'entre 1% e 90%');
    assert.strictEqual((L({ ...bom, valor: 1 }) as any).ok, true); assert.strictEqual((L({ ...bom, valor: 90 }) as any).ok, true); assert.strictEqual((L({ ...bom, valor: '12,5' }) as any).data.valor, 12.5, 'vírgula decimal');
    e({ ...bom, tipo: 'VALOR', valor: 0 }, 'entre R$ 0,01'); e({ ...bom, tipo: 'VALOR', valor: 5001 }, 'R$ 5.000,00'); assert.strictEqual((L({ ...bom, tipo: 'VALOR', valor: 0.01 }) as any).ok, true); assert.strictEqual((L({ ...bom, tipo: 'VALOR', valor: 5000 }) as any).ok, true); assert.strictEqual((L({ ...bom, tipo: 'VALOR', valor: 49.999 }) as any).data.valor, 50);
    e({ ...bom, descricao: 'x'.repeat(81) }, 'até 80'); assert.strictEqual((L({ ...bom, descricao: 'x'.repeat(80) }) as any).ok, true); assert.strictEqual((L({ ...bom, descricao: '   ' }) as any).data.descricao, null); assert.strictEqual((L({ ...bom, descricao: null }) as any).data.descricao, null);
    assert.strictEqual((L({ ...bom, produtoIds: [] }) as any).data.produtoIds, null, 'lista vazia = todos'); assert.strictEqual((L({ ...bom, produtoIds: null }) as any).data.produtoIds, null); e({ ...bom, produtoIds: Array.from({ length: 51 }, (_, i) => 'p' + i) }, 'no máximo 50'); assert.strictEqual((L({ ...bom, produtoIds: Array.from({ length: 50 }, (_, i) => 'p' + i) }) as any).ok, true);
    e({ ...bom, validoDe: 'lixo' }, 'início inválida'); e({ ...bom, validoAte: '31/10' }, 'término inválida'); e({ ...bom, validoDe: '2026-10-31', validoAte: '2026-10-01' }, 'depois do início');     assert.strictEqual((L({ ...bom, validoDe: '2026-10-05', validoAte: '2026-10-05' }) as any).ok, true, 'um dia só é permitido');
    e({ ...bom, validoDe: '2026-10-05T12:00:00Z', validoAte: '2026-10-05T12:00:00Z' }, 'término precisa'); assert.strictEqual((L({ ...bom, validoDe: null, validoAte: null }) as any).data.validoAte, null);
    e({ ...bom, usoMaximo: 0 }, 'número inteiro'); e({ ...bom, usoMaximo: 1.5 }, 'número inteiro'); e({ ...bom, usoMaximo: 'x' }, 'número inteiro'); e({ ...bom, usoMaximo: 1000001 }, 'número inteiro'); assert.strictEqual((L({ ...bom, usoMaximo: null }) as any).data.usoMaximo, null); assert.strictEqual((L({ ...bom, usoMaximo: '' }) as any).data.usoMaximo, null); assert.strictEqual((L({ ...bom, usoMaximo: 1 }) as any).data.usoMaximo, 1); assert.strictEqual((L({ ...bom, usoMaximo: 1000000 }) as any).data.usoMaximo, 1000000);
    assert.strictEqual((L({ ...bom, umaVezPorCliente: 'sim' }) as any).data.umaVezPorCliente, false, 'só true de verdade vale'); assert.strictEqual((L({ ...bom, ativo: 1 }) as any).data.ativo, false);
    assert.deepStrictEqual((L({}, true) as any).data, {}, 'editar sem nada: nada'); assert.deepStrictEqual((L({ ativo: false }, true) as any).data, { ativo: false }); assert.deepStrictEqual((L({ coachId: 'x', id: 'y', vendas: [], tipo: 'VALOR', valor: 5, lixo: 1 }, true) as any).data, { tipo: 'VALOR', valor: 5 }, 'campos desconhecidos nunca passam');
    e({ tipo: 'VALOR' }, 'tipo e o valor juntos', true); e({ valor: 5 }, 'tipo e o valor juntos', true); e({ tipo: 'PERCENTUAL', valor: 95 }, 'entre 1% e 90%', true); e({ codigo: 'a' }, 'Código inválido', true); e({ validoAte: 'x' }, 'término inválida', true); e({ usoMaximo: -1 }, 'número inteiro', true);
    assert.strictEqual((L(null as any) as any).ok, false); assert.strictEqual((L('texto' as any) as any).ok, false); assert.strictEqual((L([] as any, true) as any).ok, true);
  });

  await block('pedido: extras só os configurados para o produto e ativos; valor vem do banco e soma em centavos', async () => {
    produtos();
    const p1 = db.produtoDigital[0];
    let r = await PP.montarPedido(prisma, p1, []); assert.deepStrictEqual([r.bumpProdutos, r.valorBumps, r.valorTotal], [[], 0, 32.9]);
    r = await PP.montarPedido(prisma, p1, ['p2', 'p3']); assert.deepStrictEqual([r.bumpProdutos.map((b) => b.id).sort(), r.valorTotal], [['p2', 'p3'], 57.7]);
    r = await PP.montarPedido(prisma, p1, ['p2', 'p4', 'p5', 'lixo', 5, null, 'p3', 'p2']); assert.deepStrictEqual(r.bumpProdutos.map((b) => b.id).sort(), ['p2', 'p3'], 'desativado, de fora da lista e lixo saem');
    assert.deepStrictEqual((await PP.montarPedido(prisma, p1, 'p2' as any)).bumpProdutos, [], 'não-lista'); assert.deepStrictEqual((await PP.montarPedido(prisma, p1, undefined)).bumpProdutos, []);
    assert.strictEqual((await PP.montarPedido(prisma, { valor: 32.9, orderBumpProdutoIds: 'lixo{' }, ['p2'])).valorTotal, 32.9, 'lista de extras ilegível = sem extras'); assert.strictEqual((await PP.montarPedido(prisma, { valor: 32.9, orderBumpProdutoIds: '{"a":1}' }, ['p2'])).valorTotal, 32.9); assert.strictEqual((await PP.montarPedido(prisma, { valor: 10, orderBumpProdutoIds: null }, ['p2'])).valorTotal, 10);
    assert.strictEqual((await PP.montarPedido(prisma, { valor: 0.1, orderBumpProdutoIds: JSON.stringify(['p2']) }, ['p2'])).valorTotal, 10, '0,10 + 9,90 = 10,00 sem sobra de ponto flutuante');
    assert.strictEqual((await PP.montarPedido(prisma, { valor: 0.3, orderBumpProdutoIds: JSON.stringify(['p2']) }, ['p2'])).valorTotal, 10.2, '0,30 + 9,90 = 10,20 (e não 10,200000000000001)');
    db.produtoDigital.push({ id: 'x', slug: 'x', nome: 'X', coachId: PAULO, valor: 5, ativo: true, orderBumpProdutoIds: null });
    assert.deepStrictEqual((await PP.montarPedido(prisma, { valor: 10, orderBumpProdutoIds: 'lixo{' }, ['x'])).bumpProdutos, [], 'lista de extras ilegível não deixa passar nenhum id');
    { const orig = (prisma as any).produtoDigital.findMany; let n = 0; (prisma as any).produtoDigital.findMany = async (...a: any[]) => { n++; return orig(...a); };
      try { await PP.montarPedido(prisma, p1, []); assert.strictEqual(n, 0, 'sem extras escolhidos não consulta o banco'); await PP.montarPedido(prisma, p1, ['p2']); assert.strictEqual(n, 1); } finally { (prisma as any).produtoDigital.findMany = orig; } }
  });

  // ═════════════ banco: carregar o cupom e contar os usos ═════════════
  await block('carregar pelo código digitado (qualquer capitalização) e contar usos: pago, pendente recente, estornado e cliente', async () => {
    const c = cup({ codigo: 'VERAO10' });
    assert.strictEqual((await K.carregarCupom(prisma, ' verão10 '))!.id, c.id); assert.strictEqual(await K.carregarCupom(prisma, 'naoexiste'), null); assert.strictEqual(await K.carregarCupom(prisma, ''), null); assert.strictEqual(await K.carregarCupom(prisma, 'ab'), null); assert.strictEqual(await K.carregarCupom(prisma, null), null);
    { const orig = (prisma as any).cupomDesconto.findUnique; let n = 0; (prisma as any).cupomDesconto.findUnique = async (...a: any[]) => { n++; return orig(...a); };
      try { await K.carregarCupom(prisma, 'ab'); await K.carregarCupom(prisma, ''); await K.carregarCupom(prisma, '!!'); assert.strictEqual(n, 0, 'código com formato inválido nem chega ao banco'); await K.carregarCupom(prisma, 'abc'); assert.strictEqual(n, 1); } finally { (prisma as any).cupomDesconto.findUnique = orig; } }
    vendaDe(c.id, { status: 'PAGO' }); vendaDe(c.id, { status: 'PAGO' });
    vendaDe(c.id, { status: 'PENDENTE', createdAt: ago(119 * MIN) }); vendaDe(c.id, { status: 'PENDENTE', createdAt: ago(121 * MIN) });
    vendaDe(c.id, { status: 'ESTORNADO' }); vendaDe('outro-cupom', { status: 'PAGO' }); vendaDe(null as any, { status: 'PAGO' });
    assert.deepStrictEqual(await K.contarUsos(prisma, c.id), { total: 3, cliente: 0 }, '2 pagos + 1 pendente de menos de 2 h; estornado e pendente velho não seguram; sem CPF/e-mail não conta cliente');
    db.produtoVenda.length = 0;
    vendaDe(c.id, { cpfCliente: '12345678909', emailCliente: 'a@x.com', status: 'PAGO' }); vendaDe(c.id, { cpfCliente: '22222222222', emailCliente: 'b@x.com', status: 'ESTORNADO' }); vendaDe(c.id, { cpfCliente: '33333333333', emailCliente: 'c@x.com', status: 'PENDENTE', createdAt: ago(10 * MIN) }); vendaDe(c.id, { cpfCliente: '44444444444', emailCliente: 'd@x.com', status: 'PENDENTE', createdAt: ago(3 * HORA) });
    vendaDe('outro-cupom', { cpfCliente: '12345678909', emailCliente: 'a@x.com', status: 'PAGO' });   // o mesmo cliente usou OUTRO cupom: não conta aqui
    const q = async (cpf: any, email: any) => (await K.contarUsos(prisma, c.id, { cpf, email })).cliente;
    assert.deepStrictEqual([await q('12345678909', null), await q('22222222222', null), await q('33333333333', null), await q('44444444444', null), await q('99999999999', null)], [1, 1, 1, 0, 0], 'pago, ESTORNADO e pendente recente contam para o cliente; pendente velho e outro cliente não');
    assert.deepStrictEqual([await q(null, 'A@X.COM'), await q(null, ' b@x.com '), await q(null, 'novo@x.com')], [1, 1, 0], 'e-mail sem diferenciar maiúsculas nem espaços');
    assert.strictEqual(await q('99999999999', 'a@x.com'), 1, 'CPF novo mas e-mail já usado: conta'); assert.strictEqual(await q('12345678909', 'novo@x.com'), 1, 'e-mail novo mas CPF já usado: conta');
    assert.strictEqual((await K.contarUsos(prisma, c.id, { cpf: '12345678909', email: 'a@x.com' })).cliente, 1, 'a mesma venda por CPF e por e-mail conta uma vez só');
    { const orig = (prisma as any).produtoVenda.count; let n = 0; (prisma as any).produtoVenda.count = async (...a: any[]) => { n++; return orig(...a); };
      try { await K.contarUsos(prisma, c.id); assert.strictEqual(n, 1, 'sem CPF nem e-mail: só a contagem geral'); await K.contarUsos(prisma, c.id, { cpf: '12345678909' }); assert.strictEqual(n, 3, 'com CPF: geral + cliente'); } finally { (prisma as any).produtoVenda.count = orig; } }
    assert.deepStrictEqual(await K.contarUsos(prisma, c.id, { cpf: '', email: '' }), { total: 2, cliente: 0 }); assert.strictEqual((await K.contarUsos(prisma, c.id, { now: new Date(Date.now() + 3 * HORA), cpf: '33333333333' })).cliente, 0, 'o relógio de quem pergunta vale');
  });

  // ═════════════ POST /api/produtos/cupom (conferir antes de comprar) ═════════════
  await block('conferir: devolve a conta; extras entram no total; capitalização e acento não importam', async () => {
    produtos(); cup();
    let r = await jr(await validar()); assert.strictEqual(r.status, 200); assert.deepStrictEqual(r.json, { valido: true, codigo: 'VERAO10', descricao: '10% de desconto', valorOriginal: 32.9, desconto: 3.29, valorFinal: 29.61, limitado: false });
    r = await jr(await validar({ itensBumpIds: ['p2', 'p4', 'lixo'] })); assert.deepStrictEqual([r.json.valorOriginal, r.json.desconto, r.json.valorFinal], [42.8, 4.28, 38.52], 'só o extra válido entra');
    r = await jr(await validar({ codigo: '  verão10 ' })); assert.deepStrictEqual([r.status, r.json.valido, r.json.codigo], [200, true, 'VERAO10']);
    cup({ codigo: 'DEZREAIS', tipo: 'VALOR', valor: 10 }); r = await jr(await validar({ codigo: 'dezreais' })); assert.deepStrictEqual([r.json.descricao, r.json.desconto, r.json.valorFinal], ['R$ 10,00 de desconto', 10, 22.9]);
    cup({ codigo: 'GRANDE', tipo: 'VALOR', valor: 40 }); r = await jr(await validar({ codigo: 'GRANDE' })); assert.deepStrictEqual([r.json.desconto, r.json.valorFinal, r.json.limitado], [27.9, 5, true], 'cortado no mínimo');
    assert.strictEqual(db.produtoVenda.length, 0, 'conferir não cria venda nenhuma'); assert.strictEqual(asaasPosts().length, 0);
  });

  await block('conferir: cada motivo volta com a mensagem certa; produto e código ausentes; limite por IP', async () => {
    produtos(); const c = cup();
    const m = async (o: any) => { const r = await jr(await validar(o)); return [r.status, r.json.valido, r.json.motivo]; };
    assert.deepStrictEqual(await m({ codigo: 'NAOEXISTE' }), [400, false, 'NAO_ENCONTRADO']); assert.deepStrictEqual(await m({ codigo: '' }), [400, false, 'NAO_ENCONTRADO']); assert.deepStrictEqual(await m({ codigo: null }), [400, false, 'NAO_ENCONTRADO']); assert.deepStrictEqual(await m({ codigo: '!!!' }), [400, false, 'NAO_ENCONTRADO']);
    c.ativo = false; assert.deepStrictEqual(await m({}), [400, false, 'INATIVO']); const rIn = await jr(await validar({})); const rNo = await jr(await validar({ codigo: 'NAOEXISTE' })); assert.strictEqual(rIn.json.error, rNo.json.error, 'cupom desativado e inexistente dizem a mesma coisa'); c.ativo = true;
    c.validoAte = ago(DIA); assert.deepStrictEqual(await m({}), [400, false, 'EXPIRADO']); c.validoAte = null; c.validoDe = later(DIA); assert.deepStrictEqual(await m({}), [400, false, 'AINDA_NAO']); c.validoDe = null;
    assert.deepStrictEqual(await m({ produtoId: 'p6' }), [400, false, 'OUTRO_PRODUTO'], 'produto de outro coach'); assert.deepStrictEqual(await m({ produtoId: 'p5' }), [400, false, 'SEM_EFEITO'], 'produto de R$ 1,00');
    c.usoMaximo = 1; vendaDe(c.id); assert.deepStrictEqual(await m({}), [400, false, 'ESGOTADO']); c.usoMaximo = null;
    assert.deepStrictEqual(await m({ cpf: '11111111111' }), [400, false, 'JA_USOU']); assert.deepStrictEqual(await m({ cpf: '123' }), [200, true, undefined], 'CPF incompleto não conta como cliente'); assert.deepStrictEqual(await m({ email: 'FULANA@x.com' }), [400, false, 'JA_USOU']); assert.deepStrictEqual(await m({ email: 'sem-arroba' }), [200, true, undefined]); assert.deepStrictEqual(await m({ cpf: '99999999999' }), [200, true, undefined]);
    assert.strictEqual((await jr(await validar({ codigo: '' }))).json.error, 'Digite o código do cupom.', 'código vazio: pede o código'); assert.strictEqual((await jr(await validar({ codigo: '!!!' }))).json.error, 'Digite o código do cupom.');
    { const orig = (prisma as any).produtoVenda.count; const wheres: string[] = []; (prisma as any).produtoVenda.count = async (a: any) => { wheres.push(JSON.stringify(a.where)); return orig(a); };
      try { await validar({ cpf: '12345', email: 'sem-arroba' }); assert.ok(wheres.length > 0); assert.ok(!wheres.join(' ').includes('cpfCliente') && !wheres.join(' ').includes('emailCliente'), 'CPF/e-mail incompletos não entram na busca'); wheres.length = 0;
        await validar({ cpf: '123.456.789-09', email: 'ana@x.com' }); assert.ok(wheres.join(' ').includes('12345678909') && wheres.join(' ').includes('ana@x.com'), 'completos entram'); wheres.length = 0;
        await validar({ cpf: 12345678909 as any, email: { a: 'b@c' } as any }); assert.ok(!wheres.join(' ').includes('emailCliente'), 'e-mail que não é texto é ignorado'); } finally { (prisma as any).produtoVenda.count = orig; } }
    { const orig = (prisma as any).produtoDigital.findUnique; (prisma as any).produtoDigital.findUnique = async () => { throw new Error('banco fora do ar'); };
      try { const rr = await jr(await validar({})); assert.strictEqual(rr.status, 500); assert.strictEqual(rr.json.valido, false); assert.ok(rr.json.error.includes('Tente de novo')); assert.ok(!JSON.stringify(rr.json).includes('banco fora do ar'), 'o erro técnico não vaza'); } finally { (prisma as any).produtoDigital.findUnique = orig; } }
    assert.deepStrictEqual(await m({ produtoId: undefined }), [400, false, 'NAO_ENCONTRADO']); assert.strictEqual((await jr(await validar({ produtoId: 'naoexiste' }))).status, 404); assert.strictEqual((await jr(await validar({ produtoId: 'p4' }))).status, 404, 'produto desativado'); assert.strictEqual((await jr(await validar({ produtoId: 5 }))).status, 400);
    assert.strictEqual((await jr(await cupomRoute.POST(mkReq('/api/produtos/cupom', 'POST', 'texto{', ip()) as any))).status, 400, 'corpo ilegível');
    const mesmo = { 'x-forwarded-for': '10.99.0.1' }; let ultimo = 0; for (let i = 0; i < 31; i++) ultimo = (await validar({}, mesmo)).status; assert.strictEqual(ultimo, 429, 'a 31ª tentativa em 10 minutos é barrada'); const b = await jr(await validar({}, mesmo)); assert.strictEqual(b.json.valido, false); skew += 10 * MIN + 1; assert.strictEqual((await validar({}, mesmo)).status, 200, 'passada a janela volta');
  });

  // ═════════════ POST /api/produtos/comprar com cupom ═════════════
  await block('compra com cupom: cobra o valor com desconto na Asaas, guarda o cupom na venda e devolve a conta', async () => {
    produtos(); const c = cup();
    const r = await jr(await comprar({ cupom: 'verão10 ' })); assert.strictEqual(r.status, 201);
    assert.strictEqual(r.json.valorTotal, 29.61); assert.strictEqual(r.json.valorOriginal, 32.9); assert.strictEqual(r.json.desconto, 3.29); assert.strictEqual(r.json.cupomCodigo, 'VERAO10');
    assert.strictEqual(asaasPosts().length, 1); assert.strictEqual(A.payments[0].value, 29.61); assert.strictEqual(A.payments[0].description, 'Ficha Feminina (cupom VERAO10)');
    const v = db.produtoVenda[0]; assert.deepStrictEqual([v.valorTotal, v.valorOriginal, v.descontoValor, v.cupomId, v.cupomCodigo, v.status], [29.61, 32.9, 3.29, c.id, 'VERAO10', 'PENDENTE']);
    assert.strictEqual(v.emailCliente, 'Ana@Gmail.com', 'o e-mail continua sendo guardado como foi digitado (sem espaços)');
  });

  await block('compra com cupom e extras: o desconto vale para o pedido inteiro; valores do navegador nunca mandam', async () => {
    produtos(); cup();
    let r = await jr(await comprar({ cupom: 'VERAO10', itensBumpIds: ['p2', 'p3'], valor: 1, valorTotal: 1, desconto: 99 })); assert.strictEqual(r.status, 201); assert.deepStrictEqual([r.json.valorOriginal, r.json.desconto, r.json.valorTotal], [57.7, 5.77, 51.93]); assert.strictEqual(A.payments[0].value, 51.93); assert.strictEqual(db.produtoVenda[0].itensBumpIds, JSON.stringify(['p2', 'p3']));
    reset(); produtos(); cup({ codigo: 'DEZ', tipo: 'VALOR', valor: 10 }); r = await jr(await comprar({ cupom: 'dez' })); assert.deepStrictEqual([r.json.valorTotal, r.json.desconto], [22.9, 10]);
    reset(); produtos(); cup({ codigo: 'TUDO', tipo: 'VALOR', valor: 100 }); r = await jr(await comprar({ cupom: 'tudo' })); assert.deepStrictEqual([r.status, r.json.valorTotal, r.json.desconto], [201, 5, 27.9], 'a cobrança nunca fica abaixo de R$ 5,00'); assert.strictEqual(A.payments[0].value, 5);
  });

  await block('compra sem cupom continua igual: sem campos de cupom na venda nem na resposta', async () => {
    produtos(); cup();
    let r = await jr(await comprar()); assert.strictEqual(r.status, 201); assert.strictEqual(r.json.valorTotal, 32.9); assert.deepStrictEqual(Object.keys(r.json).sort(), ['invoiceUrl', 'pixCopyPaste', 'pixQrCode', 'retirada', 'valorTotal', 'vendaId']);
    const v = db.produtoVenda[0]; assert.strictEqual(v.cupomId, undefined); assert.strictEqual(v.cupomCodigo, undefined); assert.strictEqual(v.valorOriginal, undefined); assert.strictEqual(A.payments[0].description, 'Ficha Feminina');
    for (const lixo of ['', '   ', null, undefined, 5, true, ['VERAO10'], { codigo: 'VERAO10' }]) { reset(); produtos(); cup(); r = await jr(await comprar({ cupom: lixo })); assert.strictEqual(r.status, 201, 'cupom ' + JSON.stringify(lixo)); assert.strictEqual(r.json.valorTotal, 32.9); assert.strictEqual(db.produtoVenda[0].cupomId, undefined); }
  });

  await block('compra com cupom que não vale: recusa ANTES de criar cliente/venda/cobrança e diz o motivo', async () => {
    produtos(); const c = cup();
    const tenta = async (o: any) => { calls.length = 0; db.produtoVenda.length = 0; const r = await jr(await comprar(o)); assert.strictEqual(r.status, 400, JSON.stringify(r.json)); assert.strictEqual(r.json.cupomInvalido, true); assert.strictEqual(db.produtoVenda.length, 0, 'nenhuma venda criada'); assert.strictEqual(calls.length, 0, 'nem falou com a Asaas'); return r.json; };
    assert.strictEqual((await tenta({ cupom: 'NAOEXISTE' })).motivo, 'NAO_ENCONTRADO'); c.ativo = false; assert.strictEqual((await tenta({ cupom: 'VERAO10' })).motivo, 'INATIVO'); c.ativo = true;
    c.validoAte = ago(MIN); const j = await tenta({ cupom: 'VERAO10' }); assert.strictEqual(j.motivo, 'EXPIRADO'); assert.strictEqual(j.error, 'Este cupom expirou.'); c.validoAte = null; c.validoDe = later(HORA); assert.strictEqual((await tenta({ cupom: 'VERAO10' })).motivo, 'AINDA_NAO'); c.validoDe = null;
    assert.strictEqual((await tenta({ produtoId: 'p6', cupom: 'VERAO10' })).motivo, 'OUTRO_PRODUTO'); c.produtoIds = JSON.stringify(['p2']); assert.strictEqual((await tenta({ cupom: 'VERAO10' })).motivo, 'OUTRO_PRODUTO'); c.produtoIds = null;
    assert.strictEqual((await tenta({ produtoId: 'p5', cupom: 'VERAO10' })).motivo, 'SEM_EFEITO');
    const tentaCom = async (o: any, antes: () => void) => { calls.length = 0; db.produtoVenda.length = 0; antes(); const n = db.produtoVenda.length; const r = await jr(await comprar(o)); assert.strictEqual(r.status, 400, JSON.stringify(r.json)); assert.strictEqual(r.json.cupomInvalido, true); assert.strictEqual(db.produtoVenda.length, n, 'nenhuma venda nova'); assert.strictEqual(calls.length, 0, 'nem falou com a Asaas'); return r.json; };
    c.usoMaximo = 1; const e1 = await tentaCom({ cupom: 'VERAO10' }, () => { vendaDe(c.id, { cpfCliente: '55555555555', emailCliente: 'outra@x.com' }); }); assert.strictEqual(e1.motivo, 'ESGOTADO'); assert.strictEqual(e1.error, 'Este cupom já atingiu o limite de usos.'); c.usoMaximo = null;
    const e2 = await tentaCom({ cupom: 'VERAO10' }, () => { vendaDe(c.id, { cpfCliente: '12345678909', emailCliente: 'outra@x.com' }); }); assert.strictEqual(e2.motivo, 'JA_USOU'); assert.strictEqual(e2.error, 'Você já usou este cupom.');
    const e3 = await tentaCom({ cupom: 'VERAO10', email: 'OUTRA@x.com' }, () => { vendaDe(c.id, { cpfCliente: '55555555555', emailCliente: 'outra@x.com' }); }); assert.strictEqual(e3.motivo, 'JA_USOU', 'mesmo e-mail com outra capitalização e espaços');
  });

  await block('limite de usos: pago e pendente de menos de 2 h seguram; pendente velho e estornado liberam', async () => {
    produtos(); const c = cup({ usoMaximo: 2 });
    vendaDe(c.id, { cpfCliente: '10000000001', emailCliente: 'a@x.com', status: 'PAGO' }); vendaDe(c.id, { cpfCliente: '10000000002', emailCliente: 'b@x.com', status: 'PENDENTE', createdAt: ago(30 * MIN) });
    let r = await jr(await comprar({ cupom: 'VERAO10' })); assert.strictEqual(r.status, 400); assert.strictEqual(r.json.motivo, 'ESGOTADO'); assert.strictEqual(r.json.error, 'Este cupom já atingiu o limite de usos.');
    db.produtoVenda[1].createdAt = ago(3 * HORA); r = await jr(await comprar({ cupom: 'VERAO10' })); assert.strictEqual(r.status, 201, 'o pedido que ninguém pagou em 2 horas devolve o uso');
    reset(); produtos(); const c2 = cup({ usoMaximo: 1 }); const v = vendaDe(c2.id, { cpfCliente: '10000000001', emailCliente: 'a@x.com', status: 'ESTORNADO' }); r = await jr(await comprar({ cupom: 'VERAO10' })); assert.strictEqual(r.status, 201, 'compra estornada devolve o uso para o limite geral'); assert.ok(v);
  });

  await block('uma vez por cliente: mesmo CPF ou e-mail (qualquer capitalização) não usa de novo; estorno não libera; liberado quando o coach permite', async () => {
    produtos(); const c = cup(); const dono = vendaDe(c.id, { cpfCliente: '12345678909', emailCliente: 'ana@gmail.com', status: 'PAGO' });
    let r = await jr(await comprar({ cupom: 'VERAO10' })); assert.deepStrictEqual([r.status, r.json.motivo], [400, 'JA_USOU']);
    r = await jr(await comprar({ cupom: 'VERAO10', cpf: '987.654.321-00', email: 'ANA@gmail.com' })); assert.deepStrictEqual([r.status, r.json.motivo], [400, 'JA_USOU'], 'outro CPF mas o mesmo e-mail');
    r = await jr(await comprar({ cupom: 'VERAO10', cpf: '987.654.321-00', email: 'outra@gmail.com' })); assert.strictEqual(r.status, 201, 'pessoa nova usa normalmente');
    dono.status = 'ESTORNADO'; r = await jr(await comprar({ cupom: 'VERAO10' })); assert.deepStrictEqual([r.status, r.json.motivo], [400, 'JA_USOU'], 'reembolsou: não ganha de novo');
    c.umaVezPorCliente = false; r = await jr(await comprar({ cupom: 'VERAO10' })); assert.strictEqual(r.status, 201, 'coach liberou repetir'); r = await jr(await comprar({ cupom: 'VERAO10' })); assert.strictEqual(r.status, 201);
  });

  await block('corrida: se alguém ocupou o último uso no meio do caminho, ESTA venda é desfeita e a pessoa é avisada (nunca passa do limite)', async () => {
    produtos(); const c = cup({ usoMaximo: 1, umaVezPorCliente: false });
    A.onLookup = () => { A.onLookup = null; vendaDe(c.id, { cpfCliente: '55555555555', emailCliente: 'rapido@x.com', status: 'PENDENTE' }); };
    const r = await jr(await comprar({ cupom: 'VERAO10' })); assert.deepStrictEqual([r.status, r.json.motivo, r.json.cupomInvalido], [400, 'ESGOTADO', true]); assert.strictEqual(db.produtoVenda.length, 1, 'só a venda do outro ficou'); assert.strictEqual(db.produtoVenda[0].cpfCliente, '55555555555'); assert.strictEqual(asaasPosts().length, 0, 'sem cobrança para quem perdeu');
    reset(); produtos(); const c2 = cup({ usoMaximo: 3, umaVezPorCliente: true });
    A.onLookup = () => { A.onLookup = null; vendaDe(c2.id, { cpfCliente: '12345678909', emailCliente: 'ana@gmail.com', status: 'PENDENTE' }); };
    const r2 = await jr(await comprar({ cupom: 'VERAO10' })); assert.deepStrictEqual([r2.status, r2.json.motivo], [400, 'JA_USOU'], 'o mesmo cliente mandou dois pedidos ao mesmo tempo'); assert.strictEqual(db.produtoVenda.length, 1);
    for (const [quem, outro] of [['só o CPF igual', { cpfCliente: '12345678909', emailCliente: 'outro@x.com' }], ['só o e-mail igual', { cpfCliente: '55555555555', emailCliente: 'ANA@gmail.com' }]] as const) {
      reset(); produtos(); const cq = cup({ usoMaximo: 3, umaVezPorCliente: true });
      A.onLookup = () => { A.onLookup = null; vendaDe(cq.id, { ...outro, status: 'PENDENTE' }); };
      const rq = await jr(await comprar({ cupom: 'VERAO10' })); assert.deepStrictEqual([rq.status, rq.json.motivo], [400, 'JA_USOU'], quem); assert.strictEqual(db.produtoVenda.length, 1, quem);
    }
    reset(); produtos(); const c3 = cup({ usoMaximo: 2, umaVezPorCliente: false }); vendaDe(c3.id, { cpfCliente: '10000000001', emailCliente: 'a@x.com', status: 'PAGO' });
    const r3 = await jr(await comprar({ cupom: 'VERAO10' })); assert.strictEqual(r3.status, 201, 'sobrava 1 uso: passa'); assert.strictEqual(db.produtoVenda.length, 2);
  });

  await block('falha da Asaas depois do cupom: a venda órfã some e o uso volta', async () => {
    produtos(); const c = cup({ usoMaximo: 1 }); A.onPayment = () => ({ ok: false, status: 500, json: async () => ({}) });
    let r = await jr(await comprar({ cupom: 'VERAO10' })); assert.strictEqual(r.status, 500); assert.strictEqual(db.produtoVenda.length, 0); A.onPayment = null;
    r = await jr(await comprar({ cupom: 'VERAO10' })); assert.strictEqual(r.status, 201, 'o uso não ficou preso'); assert.ok(c);
  });

  await block('pagamento confirmado: a venda vira PAGO com o valor final e o aviso de compra ao Meta leva o valor com desconto', async () => {
    produtos(); cup(); process.env.META_PIXEL_ID = '123'; process.env.META_CAPI_TOKEN = 'TOK';
    const r = await jr(await comprar({ cupom: 'VERAO10' })); assert.strictEqual(r.status, 201); const id = r.json.vendaId;
    const res = await webhook(new Request('http://x/api/payments/webhook', { method: 'POST', headers: { 'asaas-access-token': 'tok', 'Content-Type': 'application/json' }, body: JSON.stringify({ event: 'PAYMENT_CONFIRMED', payment: { id: 'pay_1', externalReference: 'produto:' + id, status: 'CONFIRMED' } }) }) as any);
    assert.strictEqual(res.status, 200); const v = db.produtoVenda[0]; assert.strictEqual(v.status, 'PAGO'); assert.strictEqual(v.valorTotal, 29.61); assert.strictEqual(v.cupomCodigo, 'VERAO10');
    assert.strictEqual(graph().length, 1); assert.strictEqual(graph()[0].body.data[0].custom_data.value, 29.61, 'o anúncio mede o que foi pago de verdade');
    const c = db.cupomDesconto[0]; assert.deepStrictEqual(await K.contarUsos(prisma, c.id), { total: 1, cliente: 0 });
  });

  // ═════════════ admin: /api/admin/cupons ═════════════
  await block('admin: sem login 401; coach vê só os dele, master vê todos; lista com situação e desempenho', async () => {
    produtos(); const a = cup({ codigo: 'A1', coachId: COACH, createdAt: ago(3 * HORA) }); const b = cup({ codigo: 'B1', coachId: PAULO, usoMaximo: 1, createdAt: ago(2 * HORA) }); cup({ codigo: 'C1', coachId: OUTRO, ativo: false, createdAt: ago(HORA) }); const d = cup({ codigo: 'D1', coachId: OUTRO, createdAt: ago(30 * MIN) });
    vendaDe(d.id, { status: 'PAGO', valorTotal: 0.1, descontoValor: 0.1 }); vendaDe(d.id, { status: 'PAGO', valorTotal: 0.2, descontoValor: 0.2 }); vendaDe(a.id, { status: 'PENDENTE', createdAt: ago(5 * MIN) }); vendaDe(b.id, { status: 'PENDENTE', createdAt: ago(20 * MIN) });
    vendaDe(b.id, { status: 'PAGO', valorTotal: 29.61, descontoValor: 3.29 }); vendaDe(b.id, { status: 'PAGO', valorTotal: 22.9, descontoValor: 10 }); vendaDe(b.id, { status: 'PENDENTE', createdAt: ago(10 * MIN) }); vendaDe(b.id, { status: 'PENDENTE', createdAt: ago(5 * HORA) }); vendaDe(b.id, { status: 'ESTORNADO', valorTotal: 99, descontoValor: 99 }); vendaDe(a.id, { status: 'PAGO', valorTotal: 40, descontoValor: 10 });
    assert.strictEqual((await aList()).status, 401); assert.strictEqual((await aList('lixo')).status, 401);
    let r = await jr(await aList(tok(COACH))); assert.deepStrictEqual(r.json.cupons.map((c: any) => c.codigo), ['A1']); assert.deepStrictEqual([r.json.cupons[0].usosPagos, r.json.cupons[0].receita, r.json.cupons[0].descontoTotal, r.json.cupons[0].situacao], [1, 40, 10, 'ATIVO']);
    r = await jr(await aList(tok(PAULO, 'ADMIN'))); assert.deepStrictEqual(r.json.cupons.map((c: any) => c.codigo), ['D1', 'C1', 'B1', 'A1'], 'o mais novo primeiro'); const Dd = r.json.cupons.find((c: any) => c.codigo === 'D1'); assert.deepStrictEqual([Dd.receita, Dd.descontoTotal, Dd.usosPagos, Dd.pendentes], [0.3, 0.3, 2, 0], 'soma em centavos (0,1 + 0,2 = 0,3)'); assert.strictEqual(r.json.cupons.find((c: any) => c.codigo === 'A1').pendentes, 1, 'cada cupom conta só os pendentes dele');
    const B = r.json.cupons.find((c: any) => c.codigo === 'B1'); assert.deepStrictEqual([B.usosPagos, B.pendentes, B.receita, B.descontoTotal, B.situacao, B.resumo, B.produtoIds, B.usoMaximo], [2, 2, 52.51, 13.29, 'ESGOTADO', '10% de desconto', [], 1], 'estornado e pendente velho ficam de fora');
    assert.strictEqual(r.json.cupons.find((c: any) => c.codigo === 'C1').situacao, 'PAUSADO'); assert.deepStrictEqual((await jr(await aList(tok(ADRI, 'ADMIN')))).json.cupons.length, 4, 'os dois masters veem tudo');
    reset(); assert.deepStrictEqual((await jr(await aList(tok(COACH)))).json, { cupons: [] });
  });

  await block('admin: criar — dono, defaults, produtos do dono, código repetido e todas as recusas', async () => {
    produtos();
    const bom = { codigo: 'Black 26', tipo: 'PERCENTUAL', valor: 15 };
    assert.strictEqual((await aNew(bom)).status, 401);
    let r = await jr(await aNew(bom, tok(COACH))); assert.strictEqual(r.status, 201); let c = db.cupomDesconto[0];
    assert.deepStrictEqual([c.codigo, c.tipo, c.valor, c.coachId, c.produtoIds, c.validoDe, c.validoAte, c.usoMaximo, c.umaVezPorCliente, c.ativo, c.descricao], ['BLACK26', 'PERCENTUAL', 15, COACH, null, null, null, null, true, true, null], 'defaults: ativo, uma vez por cliente, sem prazo e sem limite');
    r = await jr(await aNew({ ...bom, codigo: 'NUMERO1', coachId: 123 }, tok(COACH))); assert.strictEqual(r.status, 201, 'coachId que não é texto é ignorado'); assert.strictEqual(r.json.cupom.coachId, COACH);
    r = await jr(await aNew(bom, tok(COACH))); assert.deepStrictEqual([r.status, r.json.error], [409, 'Já existe um cupom com esse código. Escolha outro.']); r = await jr(await aNew({ ...bom, codigo: 'black-26' }, tok(COACH))); assert.strictEqual(r.status, 201, 'hífen torna outro código');
    r = await jr(await aNew({ ...bom, codigo: 'XTIPO', tipo: 'XX' }, tok(COACH))); assert.strictEqual(r.status, 400); assert.ok(r.json.error.includes('tipo'));
    r = await jr(await aNew({ ...bom, codigo: 'YCOA', coachId: PAULO }, tok(COACH))); assert.strictEqual(r.status, 403, 'coach não cria em nome de outro');
    r = await jr(await aNew({ ...bom, codigo: 'YMAS', coachId: COACH }, tok(PAULO, 'ADMIN'))); assert.strictEqual(r.status, 201); assert.strictEqual(db.cupomDesconto.at(-1).coachId, COACH, 'master cria em nome do coach');
    r = await jr(await aNew({ ...bom, codigo: 'YMAS2' }, tok(PAULO, 'ADMIN'))); assert.strictEqual(db.cupomDesconto.at(-1).coachId, PAULO, 'sem coachId: o próprio master');
    r = await jr(await aNew({ ...bom, codigo: 'PROD1', produtoIds: ['p6'] }, tok(COACH))); assert.strictEqual(r.status, 201); assert.strictEqual(db.cupomDesconto.at(-1).produtoIds, '["p6"]');
    r = await jr(await aNew({ ...bom, codigo: 'PROD2', produtoIds: ['p1'] }, tok(COACH))); assert.strictEqual(r.status, 403, 'produto de outro dono'); r = await jr(await aNew({ ...bom, codigo: 'PROD3', produtoIds: ['p6', 'nao-existe'] }, tok(COACH))); assert.deepStrictEqual([r.status, r.json.error], [400, 'Algum produto escolhido não existe mais.']);
    r = await jr(await aNew({ ...bom, codigo: 'PROD4', produtoIds: ['p1', 'p3', 'p6'] }, tok(PAULO, 'ADMIN'))); assert.strictEqual(r.status, 201, 'master escolhe produtos de qualquer dono');
    r = await jr(await aNew({ ...bom, codigo: 'DADOS1', validoDe: '2026-10-01', validoAte: '2026-10-31', usoMaximo: 20, umaVezPorCliente: false, ativo: false, descricao: 'Parceria' }, tok(COACH))); c = db.cupomDesconto.at(-1); assert.deepStrictEqual([c.validoDe.toISOString(), c.validoAte.toISOString(), c.usoMaximo, c.umaVezPorCliente, c.ativo, c.descricao], ['2026-10-01T03:00:00.000Z', '2026-11-01T02:59:59.999Z', 20, false, false, 'Parceria']);
    r = await jr(await aNew({ ...bom, codigo: 'MASS1', id: 'meu-id', vendas: [1], createdAt: '2000-01-01' }, tok(COACH))); c = db.cupomDesconto.at(-1); assert.ok(c.id !== 'meu-id' && !('vendas' in c), 'campos que o coach não pode mexer são ignorados');
    assert.strictEqual((await admin.POST(mkReq('/api/admin/cupons', 'POST', 'lixo{', auth(tok(COACH))) as any)).status, 400);
  });

  await block('admin: editar — pausar/ativar, prazo, limite, desconto, produtos; código não muda; só o dono ou o master', async () => {
    produtos(); const c = cup({ codigo: 'EDIT1', coachId: COACH });
    let r = await jr(await aPatch(c.id, { ativo: false })); assert.strictEqual(r.status, 401);
    r = await jr(await aPatch('naoexiste', { ativo: false }, tok(COACH))); assert.deepStrictEqual([r.status, r.json.error], [404, 'Cupom não encontrado.']);
    r = await jr(await aPatch(c.id, { ativo: false }, tok(OUTRO))); assert.strictEqual(r.status, 403); assert.strictEqual(c.ativo, true);
    r = await jr(await aPatch(c.id, { ativo: false }, tok(COACH))); assert.strictEqual(r.status, 200); assert.strictEqual(c.ativo, false); r = await jr(await aPatch(c.id, { ativo: true }, tok(PAULO, 'ADMIN'))); assert.strictEqual(c.ativo, true, 'master também edita');
    r = await jr(await aPatch(c.id, { codigo: 'OUTRO' }, tok(COACH))); assert.deepStrictEqual([r.status, c.codigo], [400, 'EDIT1']); assert.ok(r.json.error.includes('não pode ser alterado'));
    r = await jr(await aPatch(c.id, {}, tok(COACH))); assert.deepStrictEqual([r.status, r.json.error], [400, 'Nada para alterar.']); r = await jr(await aPatch(c.id, { lixo: 1, id: 'x', coachId: 'x' }, tok(COACH))); assert.strictEqual(r.status, 400, 'campos que não existem não alteram nada'); assert.strictEqual(c.coachId, COACH);
    r = await jr(await aPatch(c.id, { tipo: 'VALOR', valor: 25 }, tok(COACH))); assert.deepStrictEqual([r.status, c.tipo, c.valor], [200, 'VALOR', 25]); r = await jr(await aPatch(c.id, { valor: 30 }, tok(COACH))); assert.strictEqual(r.status, 400); assert.strictEqual(c.valor, 25);
    r = await jr(await aPatch(c.id, { usoMaximo: 10, validoAte: '2026-12-31', descricao: 'Natal', umaVezPorCliente: false }, tok(COACH))); assert.deepStrictEqual([c.usoMaximo, c.validoAte.toISOString(), c.descricao, c.umaVezPorCliente], [10, '2027-01-01T02:59:59.999Z', 'Natal', false]);
    r = await jr(await aPatch(c.id, { usoMaximo: null, validoAte: null }, tok(COACH))); assert.deepStrictEqual([c.usoMaximo, c.validoAte], [null, null], 'vazio tira o limite e o prazo');
    r = await jr(await aPatch(c.id, { produtoIds: ['p6'] }, tok(COACH))); assert.strictEqual(c.produtoIds, '["p6"]'); r = await jr(await aPatch(c.id, { produtoIds: ['p1'] }, tok(COACH))); assert.strictEqual(r.status, 403); assert.strictEqual(c.produtoIds, '["p6"]'); r = await jr(await aPatch(c.id, { produtoIds: ['nao'] }, tok(COACH))); assert.strictEqual(r.status, 400); r = await jr(await aPatch(c.id, { produtoIds: [] }, tok(COACH))); assert.strictEqual(c.produtoIds, null, 'lista vazia volta a valer em todos');
    r = await jr(await aPatch(c.id, { valor: 5, tipo: 'PERCENTUAL' }, tok(COACH))); assert.strictEqual(r.status, 200); r = await jr(await aPatch(c.id, { tipo: 'PERCENTUAL', valor: 99 }, tok(COACH))); assert.strictEqual(r.status, 400); assert.strictEqual(c.valor, 5);
    assert.strictEqual((await adminId.PATCH(mkReq('/api/admin/cupons/' + c.id, 'PATCH', 'lixo{', auth(tok(COACH))) as any, { params: { id: c.id } })).status, 400);
  });

  await block('admin: apagar — só o dono ou o master; as vendas continuam com o código e o desconto gravados', async () => {
    produtos(); const c = cup({ codigo: 'APAGA', coachId: COACH }); const v = vendaDe(c.id, { cupomCodigo: 'APAGA', valorOriginal: 32.9, descontoValor: 3.29 });
    assert.strictEqual((await aDel(c.id)).status, 401); assert.strictEqual((await aDel(c.id, tok(OUTRO))).status, 403); assert.strictEqual(db.cupomDesconto.length, 1);
    assert.deepStrictEqual([(await aDel('naoexiste', tok(COACH))).status], [404]);
    const r = await jr(await aDel(c.id, tok(COACH))); assert.deepStrictEqual([r.status, r.json], [200, { success: true }]); assert.strictEqual(db.cupomDesconto.length, 0);
    assert.deepStrictEqual([v.cupomId, v.cupomCodigo, v.valorOriginal, v.descontoValor], [null, 'APAGA', 32.9, 3.29], 'o histórico da venda não se perde');
    produtos(); cup({ codigo: 'DELM', coachId: COACH }); assert.strictEqual((await aDel(db.cupomDesconto[0].id, tok(PAULO, 'ADMIN'))).status, 200, 'master apaga o de qualquer coach');
    const r2 = await jr(await validar({ codigo: 'APAGA' })); assert.deepStrictEqual([r2.status, r2.json.motivo], [400, 'NAO_ENCONTRADO'], 'depois de apagado o código deixa de valer');
  });

  out(`\n${passed} ok, ${fails} falhas`); process.exit(fails ? 1 : 0);
})();
