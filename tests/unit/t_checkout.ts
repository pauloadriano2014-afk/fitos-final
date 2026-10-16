import assert from 'assert';
import crypto from 'crypto';
import prisma from '@/lib/prisma';
import * as M from '/home/user/fitos-final/lib/membros';
import * as C from '/home/user/fitos-final/lib/checkoutTracking';

process.env.ASAAS_WEBHOOK_TOKEN = 'tok'; process.env.RESEND_API_KEY = 're_test'; process.env.JWT_SECRET = 'segredo-de-teste'; process.env.APP_URL = 'https://app.test'; process.env.ASAAS_API_KEY = 'k';
for (const k of ['MEMBROS_URL', 'MEMBROS_SECRET', 'MEMBROS_FROM', 'RESEND_FROM', 'META_PIXEL_ID', 'META_CAPI_TOKEN', 'META_TEST_EVENT_CODE', 'META_GRAPH_VERSION']) delete process.env[k];

const realLog = console.log.bind(console);
const errs: string[] = [];
console.log = () => {}; console.warn = () => {}; console.error = (...a: any[]) => { errs.push(a.map((x) => (x && x.message) || String(x)).join(' ')); };

const db: any = (prisma as any).__db;
const G: any = globalThis;
const calls: { url: string; method: string; body: any }[] = [];
const emails = () => calls.filter((c) => c.url.startsWith('https://api.resend.com'));
const graph = () => calls.filter((c) => c.url.startsWith('https://graph.facebook.com'));
const asaasPosts = () => calls.filter((c) => /\/payments$/.test(c.url) && c.method === 'POST');
const asaasCalls = () => calls.filter((c) => !c.url.startsWith('https://api.resend.com') && !c.url.startsWith('https://graph.facebook.com'));
const A: any = { onPayment: null, live: {} as Record<string, string>, liveFails: false, payments: [] as any[] };
const META: any = { status: 200, throws: false };
const ok = (j: any = {}) => ({ ok: true, status: 200, json: async () => j });
G.fetch = async (url: string, init: any = {}) => {
  const u = String(url); const method = init.method || 'GET'; const body = init.body ? JSON.parse(init.body) : undefined;
  calls.push({ url: u, method, body });
  if (u.startsWith('https://api.resend.com')) return ok({});
  if (u.startsWith('https://graph.facebook.com')) { if (META.throws) throw new TypeError('sem rede'); return { ok: META.status < 400, status: META.status, json: async () => ({ error: { message: 'token inválido' } }) }; }
  const path = u.replace(/^https:\/\/[^/]+\/v3/, '');
  if (path.startsWith('/customers?cpfCnpj')) return ok({ data: [] });
  if (path === '/customers' && method === 'POST') return ok({ id: 'cus_1' });
  if (path === '/payments' && method === 'POST') {
    if (A.onPayment) { const r = A.onPayment(body); if (r) return r; }
    const id = 'pay_' + (A.payments.length + 1); A.payments.push({ ...body, id });
    return ok({ id, invoiceUrl: 'https://asaas.test/i/' + A.payments.length });
  }
  if (/^\/payments\/[^/]+\/pixQrCode$/.test(path)) return ok({ encodedImage: 'QUJD', payload: '00020126pix' });
  const g = /^\/payments\/([^/]+)$/.exec(path);
  if (g && method === 'GET') { if (A.liveFails) throw new TypeError('sem rede'); return ok({ id: g[1], status: A.live[g[1]] ?? 'PENDING' }); }
  throw new Error('chamada inesperada no teste: ' + method + ' ' + u);
};
const err400 = { ok: false, status: 400, json: async () => ({ errors: [{ description: 'A URL de retorno não pertence ao domínio da conta' }] }) };
const err500 = { ok: false, status: 500, json: async () => ({}) };

// relógio virtual: o limitador de tentativas (lib/rateLimit.ts) vive na memória; cada cenário anda 16 minutos para começar zerado
const t0 = Date.now(); let skew = 0; Date.now = () => t0 + skew;
const ENVS = ['MEMBROS_URL', 'META_PIXEL_ID', 'META_CAPI_TOKEN', 'META_TEST_EVENT_CODE', 'META_GRAPH_VERSION'];
const reset = () => { for (const k of Object.keys(db)) db[k].length = 0; calls.length = 0; errs.length = 0; A.onPayment = null; A.live = {}; A.liveFails = false; A.payments.length = 0; META.status = 200; META.throws = false; skew += 16 * 60_000; for (const k of ENVS) delete process.env[k]; };
const mkReq = (path: string, method = 'POST', body?: any, headers: Record<string, string> = {}) => new Request('http://x' + path, { method, headers: { 'Content-Type': 'application/json', ...headers }, body: body === undefined ? undefined : (typeof body === 'string' ? body : JSON.stringify(body)) });
const jr = async (res: Response) => ({ status: res.status, json: await res.json() });
let ipN = 0; const ip = () => ({ 'x-forwarded-for': `10.1.0.${++ipN}`, 'user-agent': 'UA-Teste/1.0' });
const T0 = new Date('2026-10-05T12:00:00Z'); const plus = (ms: number) => new Date(T0.getTime() + ms);
const MIN = 60_000, HORA = 3_600_000;
const sha = (s: string) => crypto.createHash('sha256').update(s).digest('hex');
const HEX64 = /^[0-9a-f]{64}$/;
const near = (a: number, b: number) => assert.ok(Math.abs(a - b) < 1e-9, `${a} != ${b}`);

const produtos = () => {
  db.produtoDigital.push({ id: 'p1', slug: 'ficha-feminina', nome: 'Ficha Feminina PA Elite Team', descricao: 'Protocolo', capaUrl: null, linkEntrega: 'https://drive/ficha', treinoPrograma: '{"treinos":[]}', cursoPrograma: null, valor: 32.9, ativo: true, orderBumpProdutoIds: JSON.stringify(['p2', 'p3', 'p4']) });
  db.produtoDigital.push({ id: 'p2', slug: 'checklist', nome: 'Checklist de Hábitos', linkEntrega: 'https://drive/check', treinoPrograma: null, cursoPrograma: JSON.stringify({ modulos: [{ nome: 'Módulo 1', liberacaoDias: 0, aulas: [{ nome: 'Aula 1' }] }] }), valor: 9.9, ativo: true, orderBumpProdutoIds: null });
  db.produtoDigital.push({ id: 'p3', slug: 'receitas', nome: '30 Receitas', linkEntrega: 'https://drive/rec', treinoPrograma: null, cursoPrograma: null, valor: 14.9, ativo: true, orderBumpProdutoIds: null });
  db.produtoDigital.push({ id: 'p4', slug: 'velho', nome: 'Produto Desativado', linkEntrega: null, treinoPrograma: null, cursoPrograma: null, valor: 5, ativo: false, orderBumpProdutoIds: null });
  db.produtoDigital.push({ id: 'p5', slug: 'avulso', nome: 'Outro Produto', linkEntrega: null, treinoPrograma: null, cursoPrograma: null, valor: 1, ativo: true, orderBumpProdutoIds: null });
};
const vendaPronta = (o: any = {}) => db.produtoVenda.push({ id: 'v1', produtoId: 'p1', nomeCliente: 'Ana Souza', emailCliente: 'Ana@Gmail.com', telefoneCliente: '41999990000', cpfCliente: '1', status: 'PENDENTE', valorTotal: 97, itensBumpIds: JSON.stringify(['p2']), createdAt: new Date(), paymentDate: null, asaasPaymentId: null, tracking: null, ...o });

(async () => {
  try {
    // ═════ 1) o que a venda guarda do navegador ═════
    const { tracking: t, retirada: r1 } = C.montarTracking({ fbp: 'fb.1.1700000000000.1234567890', fbc: 'fb.1.1700000000000.AbC-dEf_123', url: 'https://membros.test/comprar/?p=ficha', utm: { utm_source: 'fb', utm_campaign: 'c1', fbclid: 'abc', outro: 'x', utm_term: '   ' } }, { ip: '1.2.3.4', ua: 'Mozilla/5.0' });
    assert.equal(t.fbp, 'fb.1.1700000000000.1234567890'); assert.equal(t.fbc, 'fb.1.1700000000000.AbC-dEf_123'); assert.equal(t.url, 'https://membros.test/comprar/?p=ficha');
    assert.deepEqual(t.utm, { utm_source: 'fb', utm_campaign: 'c1', fbclid: 'abc' }, 'só os parâmetros de campanha conhecidos e não vazios'); assert.equal(t.ip, '1.2.3.4'); assert.equal(t.ua, 'Mozilla/5.0');
    assert.ok(HEX64.test(r1)); assert.equal(t.retiradaHash, M.hashRetirada(r1)); assert.notEqual(t.retiradaHash, r1, 'guarda só o hash'); assert.equal(t.retiradaUsada, undefined);
    assert.notEqual(C.montarTracking({}, {}).retirada, C.montarTracking({}, {}).retirada, 'cada pedido tem a sua retirada'); assert.notEqual(M.hashRetirada('x'), M.hashLink('x')); assert.notEqual(M.hashRetirada('x'), M.hashSessao('x')); assert.notEqual(M.hashRetirada('x'), M.hashRetirada('y'));
    for (const lixo of ['lixo', 'fb.1.123.456', 'fb.1.1700000000000.12"><script>', 'fb.1.1700000000000.1234567890 x', '']) assert.equal(C.montarTracking({ fbp: lixo }, {}).tracking.fbp, undefined, 'fbp fora do formato: ' + lixo);
    for (const lixo of ['lixo', 'fb.1.1700000000000.com espaço', 'fb.1.1700000000000.', 'fb.1.1700000000000.' + 'a'.repeat(401)]) assert.equal(C.montarTracking({ fbc: lixo }, {}).tracking.fbc, undefined, 'fbc fora do formato: ' + lixo);
    assert.equal(C.montarTracking({ fbc: 'fb.1.1700000000000.' + 'a'.repeat(300) }, {}).tracking.fbc?.length, 19 + 300, 'fbc longo mas dentro do limite vale');
    for (const lixo of ['javascript:alert(1)', 'ftp://x.com', '//x.com', 'membros.test', '']) assert.equal(C.montarTracking({ url: lixo }, {}).tracking.url, undefined, 'url: ' + lixo);
    { const fbp = (idx: string, ts: string, rnd: string) => C.montarTracking({ fbp: `fb.${idx}.${ts}.${rnd}` }, {}).tracking.fbp !== undefined;
      assert.equal(fbp('1', '1700000000000', '1234'), true); assert.equal(fbp('12', '1700000000', '12345678901234567890'), true, 'limites de cima (índice 2 dígitos, 10 de data, 20 de número)'); assert.equal(fbp('123', '1700000000000', '1234'), false, 'índice com 3 dígitos'); assert.equal(fbp('1', '170000000', '1234'), false, 'data com 9 dígitos'); assert.equal(fbp('1', '17000000000000', '1234'), false, 'data com 14 dígitos'); assert.equal(fbp('1', '1700000000000', '123'), false, 'número com 3 dígitos'); assert.equal(fbp('1', '1700000000000', '123456789012345678901'), false, 'número com 21 dígitos'); assert.equal(fbp('', '1700000000000', '1234'), false, 'sem índice');
      const fbc = (idx: string, ts: string, rest: string) => C.montarTracking({ fbc: `fb.${idx}.${ts}.${rest}` }, {}).tracking.fbc !== undefined;
      assert.equal(fbc('1', '1700000000000', 'a'), true, 'fbc de 1 caractere'); assert.equal(fbc('12', '1700000000', 'a'.repeat(300)), true); assert.equal(fbc('123', '1700000000000', 'a'), false); assert.equal(fbc('1', '170000000', 'a'), false); assert.equal(fbc('1', '17000000000000', 'a'), false); assert.equal(fbc('1', '1700000000000', 'a'.repeat(301)), false, 'fbc com 301 caracteres'); assert.equal(fbc('', '1700000000000', 'a'), false); }
    assert.equal(C.montarTracking({ utm: null }, {}).tracking.utm, undefined, 'utm nulo não derruba'); assert.equal(C.montarTracking({ utm: ['utm_source'] }, {}).tracking.utm, undefined); assert.equal(C.montarTracking({}, { ip: 'i'.repeat(70) }).tracking.ip?.length, 64, 'IP cortado em 64');
    assert.equal(C.montarTracking({ url: 'http://x.com/a' }, {}).tracking.url, 'http://x.com/a'); assert.equal(C.montarTracking({ url: 'https://x.com/' + 'a'.repeat(600) }, {}).tracking.url?.length, 500, 'url comprida é cortada em 500');
    assert.equal(C.montarTracking({ utm: { utm_source: 'a\nb\u0000c' } }, {}).tracking.utm?.utm_source, 'abc', 'caracteres de controle saem'); assert.equal(C.montarTracking({ utm: { utm_source: 'x'.repeat(300) } }, {}).tracking.utm?.utm_source.length, 200, 'valor cortado em 200');
    assert.equal(C.montarTracking({ utm: { utm_source: 'a' } }, {}).tracking.utm?.utm_source, 'a'); for (const k of ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'utm_id', 'fbclid', 'gclid', 'ttclid']) assert.equal(C.montarTracking({ utm: { [k]: 'v' } }, {}).tracking.utm?.[k], 'v', k);
    assert.equal(C.montarTracking({ utm: { __proto__x: 'v', constructor: 'v', utm_sourcex: 'v' } }, {}).tracking.utm, undefined, 'nomes fora da lista nunca entram'); assert.equal(C.montarTracking({ utm: 'texto' }, {}).tracking.utm, undefined);
    assert.equal(C.montarTracking({}, { ip: 'unknown' }).tracking.ip, undefined, 'IP desconhecido não é guardado'); assert.equal(C.montarTracking({}, { ip: '' }).tracking.ip, undefined); assert.equal(C.montarTracking({}, { ip: null, ua: null }).tracking.ua, undefined); assert.equal(C.montarTracking({}, { ua: 'u'.repeat(400) }).tracking.ua?.length, 300, 'user agent cortado em 300');
    for (const lixo of [null, undefined, 'texto', 5, [], true]) assert.deepEqual(Object.keys(C.montarTracking(lixo, {}).tracking), ['retiradaHash'], 'corpo estranho: ' + JSON.stringify(lixo));
    assert.deepEqual(C.lerTracking('{"fbp":"x"}'), { fbp: 'x' }); for (const lixo of ['lixo', '[1]', 'null', '', null, undefined, 5, '"texto"']) assert.deepEqual(C.lerTracking(lixo as any), {}, 'tracking ilegível: ' + String(lixo));

    // ═════ 2) retirada: pagar -> entrar sem digitar nada ═════
    const nova = (o: any = {}) => { const m = C.montarTracking({}, {}); return { retirada: m.retirada, venda: { status: 'PAGO', paymentDate: T0, tracking: JSON.stringify(m.tracking), ...o } as any }; };
    { const { retirada, venda } = nova(); const c = C.conferirRetirada(venda, retirada, plus(MIN)); assert.equal(c.ok, true); const marcado = JSON.parse((c as any).marcado); assert.equal(marcado.retiradaUsada, plus(MIN).toISOString()); assert.equal(marcado.retiradaHash, M.hashRetirada(retirada), 'o resto do tracking continua');
      venda.tracking = (c as any).marcado; assert.equal(C.conferirRetirada(venda, retirada, plus(2 * MIN)).ok, false, 'depois de usada não vale de novo'); }
    { const { retirada, venda } = nova(); assert.equal(C.conferirRetirada(venda, ' ' + retirada + ' ', plus(MIN)).ok, true, 'espaços nas pontas não atrapalham');
      for (const ruim of [undefined, null, '', 'abc', 'g'.repeat(64), 'a'.repeat(64), retirada.slice(1), retirada + 'a', retirada.toUpperCase().replace(/[0-9]/g, 'A'), 5]) assert.equal(C.conferirRetirada(venda, ruim as any, plus(MIN)).ok, false, 'token: ' + String(ruim));
      assert.equal(C.conferirRetirada({ ...venda, status: 'PENDENTE' }, retirada, plus(MIN)).ok, false, 'venda ainda não paga'); assert.equal(C.conferirRetirada({ ...venda, status: 'ESTORNADO' }, retirada, plus(MIN)).ok, false, 'venda estornada'); assert.equal(C.conferirRetirada({ ...venda, status: undefined }, retirada, plus(MIN)).ok, false);
      assert.equal(C.conferirRetirada({ ...venda, paymentDate: null }, retirada, plus(MIN)).ok, false, 'sem data de pagamento'); assert.equal(C.conferirRetirada({ ...venda, paymentDate: 'x' }, retirada, plus(MIN)).ok, false);
      assert.equal(C.conferirRetirada({ ...venda, paymentDate: T0.toISOString() }, retirada, plus(MIN)).ok, true, 'data como texto ISO também vale');
      assert.equal(C.conferirRetirada(venda, retirada, plus(48 * HORA)).ok, true, 'até 48 h exatas'); assert.equal(C.conferirRetirada(venda, retirada, plus(48 * HORA + 1)).ok, false, 'passou de 48 h'); assert.equal(C.RETIRADA_TTL_MS, 48 * HORA); assert.equal(C.conferirRetirada(venda, retirada, plus(-HORA)).ok, true, 'relógio um pouco atrasado não derruba');
      for (const sem of [null, '', 'lixo', '[]', '{}', JSON.stringify({ fbp: 'x' })]) assert.equal(C.conferirRetirada({ ...venda, tracking: sem }, retirada, plus(MIN)).ok, false, 'sem hash guardado: ' + String(sem));
      const outra = C.montarTracking({}, {}); assert.equal(C.conferirRetirada({ ...venda, tracking: JSON.stringify(outra.tracking) }, retirada, plus(MIN)).ok, false, 'a retirada de outra compra não serve'); }

    // ═════ 3) aviso de compra ao Meta ═════
    const trk = JSON.stringify({ fbp: 'fb.1.1.1', fbc: 'fb.1.2.3', ip: '9.9.9.9', ua: 'UA', url: 'https://membros.test/comprar/', retiradaHash: 'x' });
    const base = { id: 'v1', nomeCliente: '  Ana Maria SOUZA ', emailCliente: ' Ana@Gmail.com ', telefoneCliente: '(41) 99999-0000', valorTotal: 32.9, tracking: trk };
    let ev: any = C.montarEventoCompra(base, 'Ficha', ['p1', 'p2'], new Date('2026-10-05T12:00:00.999Z'));
    assert.equal(ev.event_name, 'Purchase'); assert.equal(ev.event_id, 'v1'); assert.equal(ev.action_source, 'website'); assert.equal(ev.event_time, Math.floor(new Date('2026-10-05T12:00:00Z').getTime() / 1000), 'segundos, não milissegundos'); assert.equal(ev.event_source_url, 'https://membros.test/comprar/');
    assert.deepEqual(ev.user_data, { country: [sha('br')], em: [sha('ana@gmail.com')], ph: [sha('5541999990000')], fn: [sha('ana')], ln: [sha('souza')], fbp: 'fb.1.1.1', fbc: 'fb.1.2.3', client_ip_address: '9.9.9.9', client_user_agent: 'UA' }, 'dados da pessoa em hash (e-mail e nome minúsculos, telefone com 55); IP, navegador e cookies sem hash');
    assert.deepEqual(ev.custom_data, { currency: 'BRL', value: 32.9, content_name: 'Ficha', content_type: 'product', content_ids: ['p1', 'p2'], num_items: 2 });
    assert.ok(!JSON.stringify(ev).includes('Ana') && !JSON.stringify(ev).includes('gmail') && !JSON.stringify(ev).includes('99999'), 'nada de dado pessoal em texto puro'); assert.ok(!JSON.stringify(ev).includes('retiradaHash') && !JSON.stringify(ev).includes('"x"'), 'o segredo da retirada nunca vai ao Meta');
    near(C.montarEventoCompra({ ...base, valorTotal: 0.1 + 0.2 }, 'F', ['p1']).custom_data.value, 0.3); near(C.montarEventoCompra({ ...base, valorTotal: 52.800000000000004 }, 'F', ['p1']).custom_data.value, 52.8);
    for (const [fone, esperado] of [['5541999990000', '5541999990000'], ['41999990000', '5541999990000'], ['4133334444', '554133334444'], ['+55 (41) 99999-0000', '5541999990000']] as const) assert.deepEqual(C.montarEventoCompra({ ...base, telefoneCliente: fone }, 'F', []).user_data.ph, [sha(esperado)], 'telefone ' + fone);
    for (const fone of ['123', '', '99999']) assert.equal(C.montarEventoCompra({ ...base, telefoneCliente: fone }, 'F', []).user_data.ph, undefined, 'telefone curto demais não vai: ' + fone);
    ev = C.montarEventoCompra({ ...base, nomeCliente: 'Ana', tracking: null }, 'F', ['p1']); assert.equal(ev.user_data.fn[0], sha('ana')); assert.equal(ev.user_data.ln, undefined, 'só um nome: sem sobrenome'); for (const k of ['fbp', 'fbc', 'client_ip_address', 'client_user_agent']) assert.equal(ev.user_data[k], undefined, k + ' só vai quando existe'); assert.equal(ev.event_source_url, undefined);
    assert.equal(C.montarEventoCompra({ ...base, nomeCliente: '   ' }, 'F', []).user_data.fn, undefined); assert.equal(C.montarEventoCompra({ ...base, emailCliente: '' }, 'F', []).user_data.em, undefined); assert.equal(C.montarEventoCompra({ ...base, tracking: 'lixo' }, 'F', []).user_data.fbp, undefined, 'tracking quebrado não derruba');
    assert.equal(C.montarEventoCompra(base, 'F', []).event_time > 1.7e9, true);
    ev = C.montarEventoCompra({ ...base, nomeCliente: 'Ana Souza' }, 'F', []); assert.deepEqual([ev.user_data.fn, ev.user_data.ln], [[sha('ana')], [sha('souza')]], 'nome e sobrenome com só duas palavras'); near(C.montarEventoCompra({ ...base, valorTotal: 12.3456 }, 'F', []).custom_data.value, 12.35); near(C.montarEventoCompra({ ...base, valorTotal: 12.344 }, 'F', []).custom_data.value, 12.34);

    reset(); assert.equal(C.metaConfigurado(), false); assert.equal(await C.enviarCompraMeta(base, 'F', ['p1']), false); assert.equal(graph().length, 0, 'sem configuração nada é enviado');
    process.env.META_PIXEL_ID = '123'; assert.equal(C.metaConfigurado(), false, 'só o pixel não basta'); assert.equal(await C.enviarCompraMeta(base, 'F', ['p1']), false); assert.equal(graph().length, 0);
    delete process.env.META_PIXEL_ID; process.env.META_CAPI_TOKEN = 'TOK_SECRETO'; assert.equal(C.metaConfigurado(), false, 'só o token não basta'); assert.equal(await C.enviarCompraMeta(base, 'F', ['p1']), false);
    process.env.META_PIXEL_ID = '123'; assert.equal(C.metaConfigurado(), true);
    assert.equal(await C.enviarCompraMeta(base, 'Ficha', ['p1', 'p2']), true); assert.equal(graph().length, 1); let g = graph()[0];
    assert.equal(g.url, 'https://graph.facebook.com/v23.0/123/events'); assert.equal(g.method, 'POST'); assert.equal(g.body.access_token, 'TOK_SECRETO'); assert.ok(!g.url.includes('TOK_SECRETO'), 'token no corpo, nunca na URL'); assert.equal(g.body.test_event_code, undefined); assert.equal(g.body.data.length, 1); assert.equal(g.body.data[0].event_id, 'v1'); assert.equal(g.body.data[0].custom_data.content_name, 'Ficha');
    process.env.META_TEST_EVENT_CODE = 'TEST123'; await C.enviarCompraMeta(base, 'F', []); assert.equal(graph()[1].body.test_event_code, 'TEST123', 'código do modo de teste do Meta');
    process.env.META_GRAPH_VERSION = 'v24.0'; await C.enviarCompraMeta(base, 'F', []); assert.ok(graph()[2].url.includes('/v24.0/'), 'versão configurável'); process.env.META_GRAPH_VERSION = 'v9.0'; await C.enviarCompraMeta(base, 'F', []); assert.ok(graph().at(-1)!.url.includes('/v9.0/'), 'versão de 1 dígito também');
    { const orig = (AbortSignal as any).timeout; const pedidos: number[] = []; (AbortSignal as any).timeout = (ms: number) => { pedidos.push(ms); return orig.call(AbortSignal, ms); }; try { await C.enviarCompraMeta(base, 'F', []); } finally { (AbortSignal as any).timeout = orig; } assert.deepEqual(pedidos, [6000], 'o Meta tem 6 segundos para responder'); }
    for (const ruim of ['24', 'v24', '../x', 'v24.0/../../x', 'v100.0', 'V24.0']) { process.env.META_GRAPH_VERSION = ruim; await C.enviarCompraMeta(base, 'F', []); assert.ok(graph().at(-1)!.url.startsWith('https://graph.facebook.com/v23.0/123/'), 'versão inválida volta ao padrão: ' + ruim); }
    delete process.env.META_GRAPH_VERSION; process.env.META_PIXEL_ID = '1/../2'; await C.enviarCompraMeta(base, 'F', []); assert.ok(graph().at(-1)!.url.includes('/1%2F..%2F2/events'), 'id do pixel escapado na URL'); process.env.META_PIXEL_ID = '123';
    errs.length = 0; META.status = 400; assert.equal(await C.enviarCompraMeta(base, 'F', []), false); assert.ok(errs.some((e) => e.includes('token inválido')), 'registra o motivo do Meta'); assert.ok(!errs.join(' ').includes('TOK_SECRETO'), 'e nunca o token');
    META.status = 200; META.throws = true; errs.length = 0; assert.equal(await C.enviarCompraMeta(base, 'F', []), false); assert.ok(errs.length === 1 && !errs.join(' ').includes('TOK_SECRETO'), 'falha de rede: registra sem token e não lança');
    META.throws = false;

    // ═════ 4) criar o pedido (POST /api/produtos/comprar) ═════
    const comprarRoute = await import('@/app/api/produtos/comprar/route');
    const dadosOk = (o: any = {}) => ({ produtoId: 'p1', nome: 'Ana Souza', email: ' Ana@Gmail.com ', telefone: '(41) 99999-0000', cpf: '123.456.789-09', itensBumpIds: [], tracking: { fbp: 'fb.1.1700000000000.1234567890', url: 'https://membros.test/comprar/', utm: { utm_source: 'fb' } }, ...o });
    const comprar = (o: any = {}, headers: Record<string, string> = ip()) => comprarRoute.POST(mkReq('/api/produtos/comprar', 'POST', dadosOk(o), headers) as any);

    reset(); produtos();
    let r = await jr(await comprar({}, { 'x-forwarded-for': '10.9.9.9, 1.1.1.1', 'user-agent': 'UA-Teste/1.0' })); assert.equal(r.status, 201); assert.deepEqual(Object.keys(r.json).sort(), ['invoiceUrl', 'pixCopyPaste', 'pixQrCode', 'retirada', 'valorTotal', 'vendaId']); near(r.json.valorTotal, 32.9);
    assert.equal(r.json.pixQrCode, 'QUJD'); assert.equal(r.json.pixCopyPaste, '00020126pix'); assert.equal(r.json.invoiceUrl, 'https://asaas.test/i/1'); assert.ok(HEX64.test(r.json.retirada));
    assert.equal(db.produtoVenda.length, 1); let v = db.produtoVenda[0]; assert.equal(v.id, r.json.vendaId); assert.equal(v.status, 'PENDENTE'); near(v.valorTotal, 32.9); assert.equal(v.emailCliente, 'Ana@Gmail.com', 'e-mail sem espaços nas pontas'); assert.equal(v.cpfCliente, '12345678909'); assert.equal(v.asaasPaymentId, 'pay_1'); assert.equal(v.itensBumpIds, null); assert.equal(v.invoiceUrl, 'https://asaas.test/i/1');
    let tk = JSON.parse(v.tracking); assert.equal(tk.retiradaHash, M.hashRetirada(r.json.retirada), 'a venda guarda o hash da retirada que só o navegador recebeu'); assert.ok(!v.tracking.includes(r.json.retirada), 'e nunca a retirada em si'); assert.equal(tk.fbp, 'fb.1.1700000000000.1234567890'); assert.deepEqual(tk.utm, { utm_source: 'fb' }); assert.equal(tk.ip, '10.9.9.9', 'IP real do cliente (primeiro do x-forwarded-for)'); assert.equal(tk.ua, 'UA-Teste/1.0'); assert.equal(tk.url, 'https://membros.test/comprar/');
    assert.equal(A.payments.length, 1); let pg = A.payments[0]; assert.equal(pg.billingType, 'UNDEFINED'); near(pg.value, 32.9); assert.equal(pg.externalReference, 'produto:' + v.id); assert.equal(pg.customer, 'cus_1'); assert.equal(pg.callback, undefined, 'sem MEMBROS_URL: cobrança como sempre foi'); assert.equal(pg.description, 'Ficha Feminina PA Elite Team');
    // order bump: só vale o que está na lista do produto e ativo; o valor vem do banco
    reset(); produtos(); r = await jr(await comprar({ itensBumpIds: ['p2', 'p4', 'p5', 'p-lixo', 'p3', 'p2'], valor: 1, valorTotal: 1 })); assert.equal(r.status, 201); v = db.produtoVenda[0];
    near(v.valorTotal, 32.9 + 9.9 + 14.9); near(r.json.valorTotal, v.valorTotal); assert.deepEqual(JSON.parse(v.itensBumpIds).sort(), ['p2', 'p3'], 'p4 (desativado), p5 (fora da lista) e p-lixo ficam de fora'); near(A.payments[0].value, v.valorTotal); assert.equal(A.payments[0].description, 'Ficha Feminina PA Elite Team + 2 item(ns) extra(s)');
    // retorno automático da Asaas
    reset(); produtos(); process.env.MEMBROS_URL = 'https://membros.test/'; r = await jr(await comprar()); assert.equal(r.status, 201); assert.deepEqual(A.payments[0].callback, { successUrl: `https://membros.test/comprar/?v=${r.json.vendaId}`, autoRedirect: true }, 'volta para o checkout, na venda certa');
    reset(); produtos(); process.env.MEMBROS_URL = 'https://membros.test'; A.onPayment = (b: any) => (b.callback ? err400 : null); r = await jr(await comprar()); assert.equal(r.status, 201, 'a Asaas recusou o retorno automático: a cobrança sai sem ele'); assert.equal(asaasPosts().length, 2); assert.ok(asaasPosts()[0].body.callback && !asaasPosts()[1].body.callback); assert.equal(A.payments.length, 1); assert.equal(db.produtoVenda.length, 1); assert.equal(db.produtoVenda[0].asaasPaymentId, 'pay_1');
    reset(); produtos(); process.env.MEMBROS_URL = 'https://membros.test'; A.onPayment = () => err500; r = await jr(await comprar()); assert.equal(r.status, 500); assert.equal(asaasPosts().length, 1, 'erro 500 da Asaas não repete (poderia cobrar em dobro)'); assert.equal(db.produtoVenda.length, 0, 'venda órfã apagada');
    reset(); produtos(); process.env.MEMBROS_URL = 'https://membros.test'; A.onPayment = () => { throw new TypeError('sem rede'); }; r = await jr(await comprar()); assert.equal(r.status, 500); assert.equal(asaasPosts().length, 1, 'falha de rede também não repete'); assert.equal(db.produtoVenda.length, 0);
    reset(); produtos(); process.env.MEMBROS_URL = 'https://membros.test'; A.onPayment = () => err400; r = await jr(await comprar()); assert.equal(r.status, 500, 'recusou também sem o retorno: erro de verdade'); assert.equal(asaasPosts().length, 2); assert.equal(db.produtoVenda.length, 0); assert.ok(/URL de retorno/.test(r.json.error));
    // dados inválidos: nada é criado, nada é enviado à Asaas
    reset(); produtos();
    for (const [o, msg] of [[{ nome: '' }, /Preencha/], [{ email: '' }, /Preencha/], [{ telefone: '' }, /Preencha/], [{ cpf: '' }, /Preencha/], [{ produtoId: '' }, /Preencha/], [{ cpf: '123' }, /CPF inválido/], [{ cpf: '1234567890123' }, /CPF inválido/], [{ email: 'a@b' }, /E-mail inválido/], [{ email: 'sem-arroba' }, /E-mail inválido/], [{ email: 'a b@c.com' }, /E-mail inválido/], [{ telefone: '4199' }, /Telefone inválido/], [{ telefone: '1234567890123456' }, /Telefone inválido/], [{ telefone: '12345678901234' }, /Telefone inválido/], [{ telefone: '123456789' }, /Telefone inválido/]] as const) { r = await jr(await comprar(o as any)); assert.equal(r.status, 400, JSON.stringify(o)); assert.ok((msg as RegExp).test(r.json.error), JSON.stringify(o) + ' -> ' + r.json.error); }
    for (const fone of ['4133334444', '41999990000', '5541999990000', '(41) 3333-4444']) { r = await jr(await comprar({ telefone: fone })); assert.equal(r.status, 201, 'telefone ' + fone); }
    assert.equal(db.produtoVenda.length, 4, 'só os pedidos válidos criaram venda');
    reset(); produtos(); r = await jr(await comprar({ produtoId: 'nao-existe' })); assert.equal(r.status, 404); r = await jr(await comprar({ produtoId: 'p4' })); assert.equal(r.status, 404, 'produto desativado'); assert.equal(db.produtoVenda.length, 0); assert.equal(asaasCalls().length, 0, 'e a Asaas nem é chamada');
    r = await jr(await comprarRoute.POST(mkReq('/api/produtos/comprar', 'POST', 'isto não é json', ip()) as any)); assert.equal(r.status, 500); assert.equal(asaasCalls().length, 0);
    // limite por IP: 20 pedidos em 10 minutos
    reset(); produtos(); const mesmo = { 'x-forwarded-for': '10.7.7.7', 'user-agent': 'UA' }; for (let i = 1; i <= 20; i++) { r = await jr(await comprar({}, mesmo)); assert.equal(r.status, 201, 'pedido ' + i); }
    r = await jr(await comprar({}, mesmo)); assert.equal(r.status, 429, '21º pedido do mesmo IP'); assert.ok(/Muitas tentativas/.test(r.json.error)); assert.equal(db.produtoVenda.length, 20); r = await jr(await comprar({}, { 'x-forwarded-for': '10.7.7.8', 'user-agent': 'UA' })); assert.equal(r.status, 201, 'outro IP segue normal');
    skew += 10 * MIN - 1000; r = await jr(await comprar({}, mesmo)); assert.equal(r.status, 429, 'ainda dentro dos 10 minutos'); skew += 1001; r = await jr(await comprar({}, mesmo)); assert.equal(r.status, 201, 'passada a janela de 10 minutos o IP volta a comprar');

    // ═════ 5) webhook: pago, reembolso e chargeback ═════
    const { POST: webhook } = await import('@/app/api/payments/webhook/route');
    const hook = async (event: string, vendaId: string, paymentId?: string) => jr(await webhook(new Request('http://x/api/payments/webhook', { method: 'POST', headers: { 'asaas-access-token': 'tok', 'Content-Type': 'application/json' }, body: JSON.stringify({ event, payment: { id: paymentId || 'pay_' + vendaId, externalReference: 'produto:' + vendaId, status: 'X' } }) })));
    const treinoR = await import('@/app/api/produtos/treino/[token]/route'); const treinoP = await import('@/app/api/produtos/treino/[token]/progresso/route');
    const cursoR = await import('@/app/api/produtos/curso/[token]/route'); const cursoP = await import('@/app/api/produtos/curso/[token]/progresso/route');
    const statusR = await import('@/app/api/produtos/vendas/[id]/status/route'); const meR = await import('@/app/api/membros/me/route');
    const treinoGet = (tok: string) => treinoR.GET(mkReq('/x', 'GET') as any, { params: { token: tok } });
    const treinoPost = (tok: string) => treinoP.POST(mkReq('/x', 'POST', { treinoIndex: 0, cargas: {} }) as any, { params: { token: tok } });
    const cursoGet = (tok: string) => cursoR.GET(mkReq('/x', 'GET') as any, { params: { token: tok } });
    const cursoPost = (tok: string) => cursoP.POST(mkReq('/x', 'POST', { moduloIdx: 0, aulaIdx: 0 }) as any, { params: { token: tok } });
    const statusGet = (id: string) => statusR.GET(mkReq('/x', 'GET') as any, { params: { id } });
    const meGet = (token: string) => meR.GET(mkReq('/api/membros/me', 'GET', undefined, { Authorization: 'Bearer ' + token }));
    const REVOGADO = 'Link inválido ou expirado';
    const vivos = async () => { const tt = db.produtoTreinoAcesso[0].token, ct = db.produtoCursoAcesso[0].token; return { treino: (await jr(await treinoGet(tt))).status, treinoSalva: (await jr(await treinoPost(tt))).status, curso: (await jr(await cursoGet(ct))).status, cursoSalva: (await jr(await cursoPost(ct))).status }; };
    const seed = (o: any = {}) => { reset(); produtos(); vendaPronta(o); };
    const produtosDe = async () => (await M.produtosDoMembro(prisma, 'ana@gmail.com', 'https://app.test')).map((x) => x.produtoId);

    // ciclo completo: pagou -> tudo liberado -> reembolso -> tudo revogado
    seed({ asaasPaymentId: 'pay_x' }); process.env.MEMBROS_URL = 'https://membros.test';
    r = await hook('PAYMENT_CONFIRMED', 'v1'); assert.equal(r.status, 200); assert.equal(db.produtoVenda[0].status, 'PAGO'); assert.ok(db.produtoVenda[0].paymentDate); assert.equal(emails().length, 1);
    let vv = await vivos(); assert.deepEqual(vv, { treino: 200, treinoSalva: 200, curso: 200, cursoSalva: 200 }, 'pago: treino e curso abrem e gravam');
    { const gt = await jr(await treinoGet(db.produtoTreinoAcesso[0].token)); assert.deepEqual(gt.json, { nomeCliente: 'Ana Souza', produtoNome: 'Ficha Feminina PA Elite Team', treinoPrograma: { treinos: [] }, progresso: gt.json.progresso }, 'o treino devolve o programa do produto'); assert.ok(Array.isArray(gt.json.progresso.sessoes));
      const gc = await jr(await cursoGet(db.produtoCursoAcesso[0].token)); assert.equal(gc.json.produtoNome, 'Checklist de Hábitos'); assert.equal(gc.json.nomeCliente, 'Ana Souza'); assert.equal(gc.json.modulos[0].aulas[0].nome, 'Aula 1', 'o curso devolve o programa do produto'); assert.equal(gc.json.modulos[0].aulas[0].concluida, true, 'a aula marcada pelo teste acima aparece concluída'); }
    assert.deepEqual(await produtosDe(), ['p1', 'p2']); let st = await jr(await statusGet('v1')); assert.equal(st.json.status, 'PAGO'); assert.equal(st.json.itens.length, 2);
    const sessao = await M.criarSessao(prisma, await M.garantirMembro(prisma, { email: 'ana@gmail.com' }));
    for (const evento of ['PAYMENT_OVERDUE', 'PAYMENT_UPDATED', 'PAYMENT_DELETED', 'PAYMENT_REFUND_IN_PROGRESS', 'PAYMENT_CREATED', 'PAYMENT_AWAITING_CHARGEBACK_REVERSAL', 'PAYMENT_CREDIT_CARD_CAPTURE_REFUSED']) { r = await hook(evento, 'v1'); assert.equal(r.status, 200, evento); assert.equal(db.produtoVenda[0].status, 'PAGO', evento + ' não tira o acesso (só reembolso e chargeback)'); }
    r = await hook('PAYMENT_REFUNDED', 'v1'); assert.deepEqual(r, { status: 200, json: { received: true } }); assert.equal(db.produtoVenda[0].status, 'ESTORNADO'); assert.equal(emails().length, 1, 'reembolso não manda e-mail'); assert.ok(db.produtoVenda[0].paymentDate, 'a data do pagamento fica no histórico');
    const tt = db.produtoTreinoAcesso[0].token, ct = db.produtoCursoAcesso[0].token;
    for (const resp of [await treinoGet(tt), await treinoPost(tt), await cursoGet(ct), await cursoPost(ct)]) { const j = await jr(resp); assert.equal(j.status, 404); assert.equal(j.json.error, REVOGADO); }
    const sessoesAntes = JSON.parse(db.produtoTreinoAcesso[0].progresso).sessoes.length; await treinoPost(tt); assert.equal(JSON.parse(db.produtoTreinoAcesso[0].progresso).sessoes.length, sessoesAntes, 'sem acesso não grava progresso');
    assert.deepEqual(await produtosDe(), [], 'a área de membros não lista mais'); st = await jr(await statusGet('v1')); assert.deepEqual(st.json, { status: 'ESTORNADO', itens: null }, 'a página de status não devolve mais os links');
    const lista = await jr(await meGet(sessao.token)); assert.equal(lista.status, 200, 'a sessão segue valendo (a conta existe)'); assert.deepEqual(lista.json.produtos, [], 'mas sem produtos');
    r = await hook('PAYMENT_REFUNDED', 'v1'); assert.equal(r.status, 200, 'aviso repetido'); assert.equal(db.produtoVenda[0].status, 'ESTORNADO');
    // outra compra paga do mesmo e-mail continua valendo
    vendaPronta({ id: 'v2', itensBumpIds: null, status: 'PAGO', paymentDate: new Date(), asaasPaymentId: 'pay_y' }); assert.deepEqual(await produtosDe(), ['p1'], 'estornar uma venda não tira o que outra venda paga liberou'); db.produtoVenda.pop();

    // chargeback
    seed({ asaasPaymentId: 'pay_x' }); await hook('PAYMENT_CONFIRMED', 'v1'); r = await hook('PAYMENT_CHARGEBACK_REQUESTED', 'v1'); assert.equal(r.status, 200); assert.equal(db.produtoVenda[0].status, 'ESTORNADO', 'contestação no cartão também tira o acesso'); assert.deepEqual(await produtosDe(), []);

    // aviso de "pago" atrasado depois do reembolso não devolve o acesso
    seed({ asaasPaymentId: 'pay_x' }); process.env.MEMBROS_URL = 'https://membros.test'; await hook('PAYMENT_CONFIRMED', 'v1'); await hook('PAYMENT_REFUNDED', 'v1'); const e1 = emails().length;
    A.live['pay_x'] = 'REFUNDED'; r = await hook('PAYMENT_CONFIRMED', 'v1'); assert.deepEqual(r, { status: 200, json: { received: true } }); assert.equal(db.produtoVenda[0].status, 'ESTORNADO', 'a Asaas diz que está reembolsada: segue estornada'); assert.equal(emails().length, e1, 'sem e-mail'); assert.ok(calls.some((c) => c.url.endsWith('/payments/pay_x')), 'conferiu a cobrança certa na Asaas'); assert.deepEqual(await produtosDe(), []);
    for (const status of ['PENDING', 'OVERDUE', 'REFUND_REQUESTED', 'CHARGEBACK_REQUESTED', undefined as any]) { A.live['pay_x'] = status; await hook('PAYMENT_RECEIVED', 'v1'); assert.equal(db.produtoVenda[0].status, 'ESTORNADO', 'status ao vivo ' + status); }
    A.liveFails = true; await hook('PAYMENT_CONFIRMED', 'v1'); assert.equal(db.produtoVenda[0].status, 'ESTORNADO', 'sem conseguir conferir na Asaas: segue estornada'); A.liveFails = false;
    A.live['pay_x'] = 'CONFIRMED'; r = await hook('PAYMENT_CONFIRMED', 'v1'); assert.equal(db.produtoVenda[0].status, 'PAGO', 'chargeback revertido: a Asaas confirma que o dinheiro voltou'); assert.equal(emails().length, e1 + 1, 'e a entrega é refeita'); assert.deepEqual(await produtosDe(), ['p1', 'p2']); assert.equal(db.produtoTreinoAcesso.length, 1, 'mesmo acesso de antes (sem duplicar)'); vv = await vivos(); assert.equal(vv.treino, 200); assert.equal(vv.curso, 200);
    for (const status of ['RECEIVED', 'RECEIVED_IN_CASH']) { await hook('PAYMENT_REFUNDED', 'v1'); A.live['pay_x'] = status; await hook('PAYMENT_RECEIVED', 'v1'); assert.equal(db.produtoVenda[0].status, 'PAGO', 'volta com ' + status); }
    // venda antiga, sem asaasPaymentId: confere pela cobrança do aviso
    seed({ asaasPaymentId: null }); await hook('PAYMENT_CONFIRMED', 'v1'); await hook('PAYMENT_REFUNDED', 'v1'); A.live['pay_v1'] = 'REFUNDED'; await hook('PAYMENT_CONFIRMED', 'v1'); assert.equal(db.produtoVenda[0].status, 'ESTORNADO'); assert.ok(calls.some((c) => c.url.endsWith('/payments/pay_v1')));
    // reembolso chegando antes do "pago": a venda vira estornada e o "pago" que chega depois é ignorado
    seed({ asaasPaymentId: 'pay_x' }); r = await hook('PAYMENT_REFUNDED', 'v1'); assert.equal(db.produtoVenda[0].status, 'ESTORNADO'); A.live['pay_x'] = 'REFUNDED'; await hook('PAYMENT_CONFIRMED', 'v1'); assert.equal(db.produtoVenda[0].status, 'ESTORNADO'); assert.equal(emails().length, 0); assert.equal(db.produtoTreinoAcesso.length, 0, 'nenhum acesso criado');
    // venda que não existe / aviso sem id
    seed(); r = await hook('PAYMENT_REFUNDED', 'nao-existe'); assert.deepEqual(r, { status: 200, json: { received: true } }); r = await hook('PAYMENT_REFUNDED', ''); assert.equal(r.status, 200); assert.equal(db.produtoVenda[0].status, 'PENDENTE');

    // ═════ 6) Meta pelo servidor quando a venda é paga ═════
    seed({ tracking: JSON.stringify({ fbp: 'fb.1.1700000000000.1234567890', ip: '8.8.8.8', ua: 'UA', url: 'https://membros.test/comprar/', retiradaHash: 'seg' }), valorTotal: 42.8 }); r = await hook('PAYMENT_CONFIRMED', 'v1'); assert.equal(r.status, 200); assert.equal(graph().length, 0, 'sem META_PIXEL_ID e META_CAPI_TOKEN nada é enviado'); assert.equal(emails().length, 1);
    seed({ tracking: JSON.stringify({ fbp: 'fb.1.1700000000000.1234567890', ip: '8.8.8.8', ua: 'UA', url: 'https://membros.test/comprar/', retiradaHash: 'seg' }), valorTotal: 42.8 }); process.env.META_PIXEL_ID = '999'; process.env.META_CAPI_TOKEN = 'TOK_SECRETO';
    r = await hook('PAYMENT_CONFIRMED', 'v1'); assert.equal(r.status, 200); assert.equal(graph().length, 1); g = graph()[0]; assert.equal(g.url, 'https://graph.facebook.com/v23.0/999/events'); const e = g.body.data[0];
    assert.equal(e.event_name, 'Purchase'); assert.equal(e.event_id, 'v1', 'mesmo id do pixel do navegador (a venda)'); near(e.custom_data.value, 42.8); assert.equal(e.custom_data.currency, 'BRL'); assert.deepEqual(e.custom_data.content_ids, ['p1', 'p2'], 'produto principal e bump'); assert.equal(e.custom_data.content_name, 'Ficha Feminina PA Elite Team'); assert.deepEqual(e.user_data.em, [sha('ana@gmail.com')]); assert.equal(e.user_data.fbp, 'fb.1.1700000000000.1234567890'); assert.equal(e.user_data.client_ip_address, '8.8.8.8'); assert.equal(e.event_source_url, 'https://membros.test/comprar/'); assert.ok(!JSON.stringify(g.body).includes('seg'), 'sem o segredo da retirada');
    assert.equal(emails().length, 1, 'e o e-mail da compra sai'); r = await hook('PAYMENT_CONFIRMED', 'v1'); r = await hook('PAYMENT_RECEIVED', 'v1'); assert.equal(graph().length, 1, 'aviso repetido da Asaas não repete a compra no Meta'); assert.equal(emails().length, 1);
    r = await hook('PAYMENT_CREATED', 'v1'); assert.equal(graph().length, 1);
    // quem leva o sobrenome na venda sem tracking (venda antiga) também é avisado
    seed(); process.env.META_PIXEL_ID = '999'; process.env.META_CAPI_TOKEN = 'T'; await hook('PAYMENT_CONFIRMED', 'v1'); assert.equal(graph().length, 1); assert.equal(graph()[0].body.data[0].user_data.fbp, undefined);
    // Meta fora do ar: o pagamento e o e-mail não dependem disso
    for (const falha of ['status', 'rede']) { seed(); process.env.META_PIXEL_ID = '999'; process.env.META_CAPI_TOKEN = 'T'; if (falha === 'status') META.status = 500; else META.throws = true; r = await hook('PAYMENT_CONFIRMED', 'v1'); assert.equal(r.status, 200, 'Meta ' + falha); assert.equal(db.produtoVenda[0].status, 'PAGO'); assert.equal(emails().length, 1, 'e-mail sai mesmo assim'); assert.equal(db.produtoTreinoAcesso.length, 1); }
    // chargeback revertido manda a compra de novo, com o MESMO event_id (o Meta junta as duas)
    seed({ asaasPaymentId: 'pay_x' }); process.env.META_PIXEL_ID = '999'; process.env.META_CAPI_TOKEN = 'T'; await hook('PAYMENT_CONFIRMED', 'v1'); await hook('PAYMENT_REFUNDED', 'v1'); assert.equal(graph().length, 1, 'reembolso não manda nada ao Meta'); A.live['pay_x'] = 'CONFIRMED'; await hook('PAYMENT_CONFIRMED', 'v1'); assert.equal(graph().length, 2); assert.equal(graph()[1].body.data[0].event_id, graph()[0].body.data[0].event_id);
    for (const k of ENVS) delete process.env[k];

    // ═════ 7) entrar logo depois de pagar (sem digitar código) ═════
    const entrarCompraR = await import('@/app/api/membros/entrar-compra/route');
    const entrarCompra = (body: any, headers: Record<string, string> = ip()) => entrarCompraR.POST(mkReq('/api/membros/entrar-compra', 'POST', body, headers) as any);
    const NEGADO = /Não foi possível entrar direto/;
    const pedido = async (bump: string[] = ['p2']) => { const x = await jr(await comprar({ itensBumpIds: bump })); assert.equal(x.status, 201); return { vendaId: x.json.vendaId as string, retirada: x.json.retirada as string }; };
    const entrarCompraId = (id: string) => db.membroSessao.length === 1 && db.produtoVenda.some((y: any) => y.id === id);
    const usada = (id: string) => JSON.parse(db.produtoVenda.find((y: any) => y.id === id).tracking).retiradaUsada;

    reset(); produtos(); let { vendaId, retirada } = await pedido();
    let en = await jr(await entrarCompra({ vendaId, retirada })); assert.equal(en.status, 401, 'ainda não pagou'); assert.ok(NEGADO.test(en.json.error)); assert.equal(db.membro.length, 0, 'nenhuma conta criada'); assert.equal(db.membroSessao.length, 0); assert.equal(usada(vendaId), undefined, 'e a retirada NÃO foi gasta: dá para tentar de novo quando o PIX cair');
    await hook('PAYMENT_CONFIRMED', vendaId);
    for (const corpo of [{ vendaId, retirada: 'a'.repeat(64) }, { vendaId, retirada: 'abc' }, { vendaId }, { retirada }, { vendaId: 'nao-e-uuid', retirada }, { vendaId: crypto.randomUUID(), retirada }, {}, 'lixo', { vendaId: [vendaId], retirada }, { vendaId, retirada: [retirada] }]) { en = await jr(await entrarCompra(corpo)); assert.equal(en.status, 401, JSON.stringify(corpo)); assert.ok(NEGADO.test(en.json.error)); }
    assert.equal(db.membroSessao.length, 0); assert.equal(usada(vendaId), undefined, 'tentativas erradas não gastam a retirada');
    en = await jr(await entrarCompra({ vendaId, retirada })); assert.equal(en.status, 200); assert.ok(HEX64.test(en.json.token)); assert.ok(new Date(en.json.expiraEm).getTime() > Date.now() + 80 * 86_400_000, 'sessão de 90 dias'); assert.deepEqual(en.json.membro, { nome: 'Ana Souza', email: 'ana@gmail.com' });
    assert.equal(db.membro.length, 1); assert.equal(db.membro[0].telefone, '(41) 99999-0000'); assert.equal(db.membroSessao.length, 1); assert.equal(db.membroSessao[0].tokenHash, M.hashSessao(en.json.token)); assert.equal(db.membroSessao[0].userAgent, 'UA-Teste/1.0');
    const minha = await jr(await meGet(en.json.token)); assert.equal(minha.status, 200); assert.deepEqual(minha.json.produtos.map((x: any) => x.produtoId).sort(), ['p1', 'p2'], 'já entra vendo o que comprou');
    assert.ok(usada(vendaId), 'retirada gasta'); assert.equal(JSON.parse(db.produtoVenda[0].tracking).retiradaHash, M.hashRetirada(retirada), 'o resto do tracking continua');
    en = await jr(await entrarCompra({ vendaId, retirada })); assert.equal(en.status, 401, 'segunda vez não entra'); assert.equal(db.membroSessao.length, 1);
    // dois toques ao mesmo tempo: só um entra
    reset(); produtos(); ({ vendaId, retirada } = await pedido()); await hook('PAYMENT_CONFIRMED', vendaId); const dois = await Promise.all([entrarCompra({ vendaId, retirada }), entrarCompra({ vendaId, retirada })]); assert.deepEqual(dois.map((x) => x.status).sort(), [200, 401], 'uso único mesmo com dois pedidos juntos'); assert.equal(db.membroSessao.length, 1);
    // com a área de membros ligada, o webhook já criou a conta: usa a mesma
    reset(); produtos(); process.env.MEMBROS_URL = 'https://membros.test'; ({ vendaId, retirada } = await pedido()); await hook('PAYMENT_CONFIRMED', vendaId); assert.equal(db.membro.length, 1); en = await jr(await entrarCompra({ vendaId, retirada })); assert.equal(en.status, 200); assert.equal(db.membro.length, 1, 'mesma conta'); delete process.env.MEMBROS_URL;
    // janela de 48 h depois do pagamento
    reset(); produtos(); ({ vendaId, retirada } = await pedido()); await hook('PAYMENT_CONFIRMED', vendaId); db.produtoVenda[0].paymentDate = new Date(new Date().getTime() - 49 * HORA); en = await jr(await entrarCompra({ vendaId, retirada })); assert.equal(en.status, 401, 'passou de 48 h: e-mail ou código'); assert.equal(db.membroSessao.length, 0);
    db.produtoVenda[0].paymentDate = new Date(new Date().getTime() - 47 * HORA); en = await jr(await entrarCompra({ vendaId, retirada })); assert.equal(en.status, 200, '47 h ainda vale');
    // estornada não entra; e depois de estornar nem a retirada que sobrou serve
    reset(); produtos(); ({ vendaId, retirada } = await pedido()); await hook('PAYMENT_CONFIRMED', vendaId); await hook('PAYMENT_REFUNDED', vendaId); en = await jr(await entrarCompra({ vendaId, retirada })); assert.equal(en.status, 401); assert.equal(db.membroSessao.length, 0);
    // a retirada de uma compra não abre outra
    reset(); produtos(); const a = await pedido(); const b2 = await pedido(); await hook('PAYMENT_CONFIRMED', a.vendaId); await hook('PAYMENT_CONFIRMED', b2.vendaId); en = await jr(await entrarCompra({ vendaId: a.vendaId, retirada: b2.retirada })); assert.equal(en.status, 401, 'retirada de outra compra'); en = await jr(await entrarCompra({ vendaId: a.vendaId, retirada: a.retirada })); assert.equal(en.status, 200);
    // vendaId que não é texto nem chega ao banco; id com zeros em todos os grupos
    reset(); produtos(); { const orig = (prisma as any).produtoVenda.findUnique; let buscas = 0; (prisma as any).produtoVenda.findUnique = async (a: any) => { buscas++; return orig(a); }; try { const x = await pedido(); await hook('PAYMENT_CONFIRMED', x.vendaId); buscas = 0; for (const lixo of [[x.vendaId], { toString: () => x.vendaId }, 5, null, true]) { en = await jr(await entrarCompra({ vendaId: lixo, retirada: x.retirada })); assert.equal(en.status, 401, JSON.stringify(lixo)); } assert.equal(buscas, 0, 'vendaId que não é texto nem consulta o banco'); } finally { (prisma as any).produtoVenda.findUnique = orig; } }
    reset(); produtos(); { const m = C.montarTracking({}, {}); const fixoId = '00a00a00-0b0b-40c0-80d0-0e0e0e0e0e0e'; vendaPronta({ id: fixoId, status: 'PAGO', paymentDate: new Date(), asaasPaymentId: 'pay_z', tracking: JSON.stringify(m.tracking) }); en = await jr(await entrarCompra({ vendaId: fixoId, retirada: m.retirada })); assert.equal(en.status, 200, 'id com zeros em todos os grupos vale'); assert.equal(entrarCompraId(fixoId), true); }
    // limite por IP: 15 tentativas em 15 minutos
    reset(); const fixo = { 'x-forwarded-for': '10.5.5.5', 'user-agent': 'UA' }; for (let i = 1; i <= 15; i++) { en = await jr(await entrarCompra({ vendaId: crypto.randomUUID(), retirada: 'a'.repeat(64) }, fixo)); assert.equal(en.status, 401, 'tentativa ' + i); }
    en = await jr(await entrarCompra({ vendaId: crypto.randomUUID(), retirada: 'a'.repeat(64) }, fixo)); assert.equal(en.status, 429); assert.ok(/Muitas tentativas/.test(en.json.error)); en = await jr(await entrarCompra({ vendaId: crypto.randomUUID(), retirada: 'a'.repeat(64) }, { 'x-forwarded-for': '10.5.5.6' })); assert.equal(en.status, 401, 'outro IP não é afetado');
    skew += 15 * MIN - 1000; en = await jr(await entrarCompra({ vendaId: crypto.randomUUID(), retirada: 'a'.repeat(64) }, fixo)); assert.equal(en.status, 429, 'ainda dentro dos 15 minutos'); skew += 1001; en = await jr(await entrarCompra({ vendaId: crypto.randomUUID(), retirada: 'a'.repeat(64) }, fixo)); assert.equal(en.status, 401, 'passada a janela, volta a aceitar tentativas');
    // banco fora do ar: erro genérico, sem detalhes
    reset(); { const orig = (prisma as any).produtoVenda.findUnique; (prisma as any).produtoVenda.findUnique = async () => { throw new Error('senha do banco: segredo'); }; try { en = await jr(await entrarCompra({ vendaId: crypto.randomUUID(), retirada: 'a'.repeat(64) })); } finally { (prisma as any).produtoVenda.findUnique = orig; } } assert.equal(en.status, 500); assert.ok(/Tente de novo/.test(en.json.error) && !JSON.stringify(en.json).includes('segredo'));

    console.log = realLog; realLog('OK  checkout próprio: dados do navegador guardados com formato fixo, retirada de uso único (48 h, sem gastar em tentativa errada), pedido com bump validado no servidor e retorno automático sem cobrança em dobro, reembolso/chargeback revogam membros, treino, curso e status (e só voltam se a Asaas confirmar), compra avisada ao Meta com o mesmo id do pixel sem nunca travar a entrega');
  } catch (e: any) { console.log = realLog; realLog('FALHOU', e && e.stack ? e.stack.split('\n').slice(0, 7).join('\n') : e); process.exit(1); }
})();
