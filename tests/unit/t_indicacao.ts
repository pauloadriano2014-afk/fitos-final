import assert from 'assert';
import jwt from 'jsonwebtoken';
import prisma from '@/lib/prisma';
import * as K from '/home/user/fitos-final/lib/cupom';
import * as PP from '/home/user/fitos-final/lib/produtoPedido';
import * as I from '/home/user/fitos-final/lib/indicacao';

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

  const indRoute = await import('@/app/api/indicacao/route');
  const adminInd = await import('@/app/api/admin/indicacoes/route');
  const adminIndId = await import('@/app/api/admin/indicacoes/[id]/route');
  const G2: any = globalThis; const pushes = () => (G2.__pushes = G2.__pushes || []) as any[];
  let un = 0;
  const aluno = (o: any = {}) => { ++un; const u = { id: 'al' + un, email: `aluno${un}@x.com`, name: 'Ana Souza', cpf: null, coachId: PAULO, pushToken: 'ExponentPushToken[abc]', ...o }; db.user.push(u); return u; };
  const meu = (t?: string) => indRoute.GET(mkReq('/api/indicacao', 'GET', undefined, auth(t)) as any);
  const codigoDe = async (u: any) => (await jr(await meu(tok(u.id, 'USER')))).json.codigo as string;
  const pagar = (vendaId: string, event = 'PAYMENT_CONFIRMED') => webhook(new Request('http://x/api/payments/webhook', { method: 'POST', headers: { 'asaas-access-token': 'tok', 'Content-Type': 'application/json' }, body: JSON.stringify({ event, payment: { id: 'pay_' + vendaId, externalReference: 'produto:' + vendaId, status: event === 'PAYMENT_REFUNDED' ? 'REFUNDED' : 'CONFIRMED' } }) }) as any);
  const lista = (t?: string) => adminInd.GET(mkReq('/api/admin/indicacoes', 'GET', undefined, auth(t)) as any);
  const pausar = (id: string, body: any, t?: string) => adminIndId.PATCH(mkReq('/api/admin/indicacoes/' + id, 'PATCH', body, auth(t)) as any, { params: { id } });
  const amigo = { email: 'amiga@x.com', cpf: '123.456.789-09' };
  const seq = (...ns: number[]) => { let i = 0; return (n: number) => ns[i++ % ns.length] % n; };

  // ═════════════ lib/indicacao.ts: regras puras ═════════════
  await block('códigos: nome sem acento + 4 sorteados (sem 0/O/1/I), sempre num formato de cupom válido; "PREMIO" + 6', () => {
    assert.strictEqual(I.gerarCodigoDoAluno('Ana Souza', seq(0, 1, 2, 3)), 'ANAABCD');
    assert.strictEqual(I.gerarCodigoDoAluno('João', seq(0, 1, 2, 3)), 'JOAOABCD'); assert.strictEqual(I.gerarCodigoDoAluno('Ça', seq(0)), 'CAAAAA'); assert.strictEqual(I.gerarCodigoDoAluno('Ana-Maria Lima', seq(0)), 'ANAMARIAAAAA', 'hífen do nome sai');
    assert.strictEqual(I.gerarCodigoDoAluno('Maximiliano', seq(0)), 'MAXIMILIAAAA', 'no máximo 8 letras do nome'); assert.strictEqual(I.gerarCodigoDoAluno(null, seq(0)), 'AMIGOAAAA'); assert.strictEqual(I.gerarCodigoDoAluno('   ', seq(0)), 'AMIGOAAAA'); assert.strictEqual(I.gerarCodigoDoAluno('123 Fulano', seq(0)), 'AMIGOAAAA', 'primeira palavra sem letras: AMIGO');
    assert.strictEqual(I.gerarCodigoDoAluno('Ana', seq(31)), 'ANA9999'.replace(/9/g, '9').slice(0, 3) + '9999'); // último caractere do alfabeto
    const alfabeto = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; assert.strictEqual(I.gerarCodigoDoAluno('X', (n) => n - 1), 'X9999'); for (const ch of 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789') assert.ok(alfabeto.includes(ch));
    assert.strictEqual(I.gerarCodigoDoPremio(seq(0, 1, 2, 3, 4, 5)), 'PREMIOABCDEF'); assert.ok(K.codigoValido(I.gerarCodigoDoPremio()) && K.codigoValido(I.gerarCodigoDoAluno('Ana Souza')) && K.codigoValido(I.gerarCodigoDoAluno('Maximiliano Alexandre')));
    for (let i = 0; i < 200; i++) { const c = I.gerarCodigoDoAluno('Ana'); assert.ok(/^ANA[A-HJ-NP-Z2-9]{4}$/.test(c), c); }
  });

  await block('mesmo contato (e-mail sem diferenciar maiúsculas/espaços, ou CPF completo), donos dos produtos, situação do prêmio, constantes', () => {
    assert.strictEqual(K.mesmoContato({ email: 'Ana@X.com ' }, { email: ' ana@x.com' }), true); assert.strictEqual(K.mesmoContato({ cpf: '529.982.247-25' }, { cpf: '52998224725' }), true); assert.strictEqual(K.mesmoContato({ email: 'a@x.com', cpf: '52998224725' }, { email: 'b@x.com', cpf: '52998224725' }), true, 'basta um dos dois');
    assert.strictEqual(K.mesmoContato({ email: 'a@x.com' }, { email: 'b@x.com' }), false); assert.strictEqual(K.mesmoContato({ email: '' }, { email: '' }), false, 'vazio não é igual a vazio'); assert.strictEqual(K.mesmoContato({ cpf: '123' }, { cpf: '123' }), false, 'CPF incompleto não vale'); assert.strictEqual(K.mesmoContato(null, { email: 'a@x.com' }), false); assert.strictEqual(K.mesmoContato({ email: null, cpf: null }, undefined), false);
    assert.deepStrictEqual(I.donosDosProdutos(PAULO), [PAULO, ADRI]); assert.deepStrictEqual(I.donosDosProdutos(ADRI), [PAULO, ADRI]); assert.deepStrictEqual(I.donosDosProdutos(COACH), [COACH]);
    const agora2 = new Date('2026-10-07T15:00:00Z'); const S = (o: any, usos = 0) => I.situacaoDoPremio({ ativo: true, validoAte: new Date('2027-01-01'), usoMaximo: 1, ...o }, usos, agora2);
    assert.deepStrictEqual([S({}), S({}, 1), S({ ativo: false }), S({ ativo: false }, 1), S({ validoAte: new Date('2026-10-07T14:59:59Z') }), S({ validoAte: new Date('2026-10-07T14:59:59Z') }, 1), S({ validoAte: new Date('2026-10-07T15:00:00Z') }), S({ validoAte: null }), S({ usoMaximo: null }, 5)], ['DISPONIVEL', 'USADO', 'PAUSADO', 'USADO', 'EXPIRADO', 'USADO', 'DISPONIVEL', 'DISPONIVEL', 'DISPONIVEL']);
    assert.deepStrictEqual([I.PERCENTUAL_AMIGO, I.PERCENTUAL_PREMIO, I.VALIDADE_PREMIO_DIAS, I.ORIGEM_CODIGO, I.ORIGEM_PREMIO], [10, 10, 180, 'INDICACAO', 'PREMIO']);
  });

  await block('avaliar: o dono não usa o próprio código (e-mail ou CPF); só vale para código de indicação; vem depois de "outro produto" e antes de esgotado / já usou', () => {
    const now = new Date('2026-10-07T15:00:00Z'); const prod = { id: 'p1', coachId: PAULO };
    const C = (o: any = {}) => ({ id: 'c', codigo: 'ANAK7X2', tipo: 'PERCENTUAL', valor: 10, coachId: PAULO, produtoIds: null, validoDe: null, validoAte: null, usoMaximo: null, umaVezPorCliente: true, ativo: true, origem: 'INDICACAO', indicadorId: 'al1', ...o });
    const E = (o: any = {}, ctx: any = {}) => K.avaliarCupom(C(o), { now, produto: prod, total: 32.9, usosTotal: 0, usosCliente: 0, indicador: { email: 'ana@x.com', cpf: '529.982.247-25' }, comprador: { email: 'amiga@x.com', cpf: '12345678909' }, ...ctx }) as any;
    assert.strictEqual(E().ok, true);
    const no = (r: any, m: string) => { assert.strictEqual(r.ok, false); assert.strictEqual(r.motivo, m); return r; };
    assert.strictEqual(no(E({}, { comprador: { email: ' ANA@x.com' } }), 'AUTO_INDICACAO').mensagem, 'Você não pode usar o seu próprio código de indicação.'); no(E({}, { comprador: { email: 'amiga@x.com', cpf: '52998224725' } }), 'AUTO_INDICACAO');
    assert.strictEqual(E({ origem: null }, { comprador: { email: 'ana@x.com' } }).ok, true, 'cupom comum não tem dono'); assert.strictEqual(E({ origem: 'PREMIO' }, { comprador: { email: 'ana@x.com' } }).ok, true, 'o prêmio é para o próprio aluno usar');
    assert.strictEqual(E({}, { comprador: undefined }).ok, true, 'sem e-mail/CPF ainda (conferir antes de preencher): a compra confere de novo'); assert.strictEqual(E({}, { indicador: null, comprador: { email: 'ana@x.com' } }).ok, true, 'dono não encontrado: não bloqueia');
    no(E({ produtoIds: JSON.stringify(['outro']) }, { comprador: { email: 'ana@x.com' } }), 'OUTRO_PRODUTO'); no(E({ usoMaximo: 1 }, { usosTotal: 1, comprador: { email: 'ana@x.com' } }), 'AUTO_INDICACAO'); no(E({}, { usosCliente: 1, comprador: { email: 'ana@x.com' } }), 'AUTO_INDICACAO');
    no(E({ ativo: false }, { comprador: { email: 'ana@x.com' } }), 'INATIVO'); no(E({ validoAte: new Date('2020-01-01') }, { comprador: { email: 'ana@x.com' } }), 'EXPIRADO');
  });

  // ═════════════ obterCodigoDoAluno ═════════════
  await block('código do aluno: criado uma vez só (mesmo com dois pedidos juntos), com as regras certas; sorteio repetido tenta de novo; sem sorte, avisa', async () => {
    const a = aluno({ name: 'Ana Souza' }); const c = await I.obterCodigoDoAluno(prisma, { id: a.id, name: a.name, coachId: PAULO });
    assert.ok(/^ANA[A-HJ-NP-Z2-9]{4}$/.test(c.codigo)); assert.deepStrictEqual([c.tipo, c.valor, c.coachId, c.origem, c.indicadorId, c.codigoDeId, c.umaVezPorCliente, c.ativo, c.usoMaximo ?? null, c.produtoIds ?? null, c.validoAte ?? null, c.descricao], ['PERCENTUAL', 10, PAULO, 'INDICACAO', a.id, a.id, true, true, null, null, null, 'Indicação de aluno']);
    assert.strictEqual((await I.obterCodigoDoAluno(prisma, { id: a.id, name: a.name, coachId: PAULO })).id, c.id); assert.strictEqual(db.cupomDesconto.length, 1);
    const b = aluno({ name: 'Beto' }); const [x, y] = await Promise.all([I.obterCodigoDoAluno(prisma, { id: b.id, name: b.name, coachId: COACH }), I.obterCodigoDoAluno(prisma, { id: b.id, name: b.name, coachId: COACH })]); assert.strictEqual(x.id, y.id, 'dois pedidos ao mesmo tempo: um código só'); assert.strictEqual(db.cupomDesconto.filter((r: any) => r.indicadorId === b.id).length, 1);
    const d = aluno({ name: 'Ana Souza' }); const ca = await I.obterCodigoDoAluno(prisma, { id: d.id, name: d.name, coachId: PAULO }, seq(0)); const e = aluno({ name: 'Ana Souza' }); let n = 0; const sorteio = (m: number) => (n++ < 4 ? 0 : (n % m));
    const ce = await I.obterCodigoDoAluno(prisma, { id: e.id, name: e.name, coachId: PAULO }, sorteio); assert.notStrictEqual(ce.codigo, ca.codigo, 'o código repetido do sorteio é descartado e outro é sorteado');
    const f = aluno({ name: 'Ana Souza' }); await assert.rejects(I.obterCodigoDoAluno(prisma, { id: f.id, name: f.name, coachId: PAULO }, seq(0)), /Não foi possível gerar o seu código/);
    const g = aluno({ name: null }); assert.ok(/^AMIGO/.test((await I.obterCodigoDoAluno(prisma, { id: g.id, name: g.name, coachId: PAULO })).codigo));
  });

  // ═════════════ GET /api/indicacao (aluno) ═════════════
  await block('aluno: login obrigatório; só aluno de coach; devolve o código, os produtos do coach dele e contas — nunca dados dos amigos', async () => {
    produtos(); assert.strictEqual((await meu()).status, 401); assert.strictEqual((await meu('lixo')).status, 401);
    const solto = aluno({ coachId: null }); assert.strictEqual((await meu(tok(solto.id, 'USER'))).status, 403);
    const ana = aluno({ name: 'Ana Souza' }); let r = await jr(await meu(tok(ana.id, 'USER'))); assert.strictEqual(r.status, 200);
    assert.ok(/^ANA[A-HJ-NP-Z2-9]{4}$/.test(r.json.codigo)); assert.deepStrictEqual([r.json.ativo, r.json.percentualAmigo, r.json.percentualPremio, r.json.validadePremioDias, r.json.indicacoes, r.json.premios], [true, 10, 10, 180, { pagas: 0, pendentes: 0 }, []]);
    assert.deepStrictEqual(r.json.produtos.map((p: any) => p.nome), ['Baratinho', 'Checklist', 'Ficha Feminina', 'Receitas'], 'produtos ativos do coach (Paulo e Adri dividem), sem o desativado nem os de outro coach'); assert.deepStrictEqual(Object.keys(r.json.produtos[0]).sort(), ['id', 'nome', 'slug']);
    const antes = r.json.codigo; assert.strictEqual((await jr(await meu(tok(ana.id, 'USER')))).json.codigo, antes); assert.strictEqual(db.cupomDesconto.length, 1, 'abrir de novo não cria outro');
    const bia = aluno({ name: 'Bia', coachId: COACH }); r = await jr(await meu(tok(bia.id, 'USER'))); assert.deepStrictEqual(r.json.produtos.map((p: any) => p.nome), ['Do Coach X']); assert.ok(/^BIA/.test(r.json.codigo)); assert.strictEqual(db.cupomDesconto.find((c: any) => c.indicadorId === bia.id).coachId, COACH);
    const [p, q] = await Promise.all([meu(tok(aluno({ name: 'Caio' }).id, 'USER')), meu(tok(aluno({ name: 'Caio' }).id, 'USER'))]); assert.strictEqual(p.status, 200); assert.strictEqual(q.status, 200);
    reset(); produtos(); assert.strictEqual((await meu(tok('nao-existe', 'USER'))).status, 403, 'conta que não existe mais');
  });

  await block('aluno: conta as compras pagas e as pendentes recentes do código; lista os prêmios com a situação certa e só os dele', async () => {
    produtos(); const ana = aluno({ name: 'Ana Souza' }); const outra = aluno({ name: 'Outra' }); const cod = await I.obterCodigoDoAluno(prisma, { id: ana.id, name: ana.name, coachId: PAULO });
    vendaDe(cod.id, { status: 'PAGO', emailCliente: 'segredo1@x.com', nomeCliente: 'Fulana Secreta' }); vendaDe(cod.id, { status: 'PAGO' }); vendaDe(cod.id, { status: 'PENDENTE', createdAt: ago(10 * MIN) }); vendaDe(cod.id, { status: 'PENDENTE', createdAt: ago(3 * HORA) }); vendaDe(cod.id, { status: 'ESTORNADO' }); vendaDe('outro', { status: 'PAGO' });
    const premio = (o: any = {}) => { const p = { id: 'pr' + ++cn, codigo: 'PREMIO' + cn, tipo: 'PERCENTUAL', valor: 10, coachId: PAULO, origem: 'PREMIO', indicadorId: ana.id, usoMaximo: 1, umaVezPorCliente: false, ativo: true, validoAte: later(30 * DIA), createdAt: new Date(Date.now() + cn), ...o }; db.cupomDesconto.push(p); return p; };
    const p1 = premio(); const p2 = premio(); vendaDe(p2.id, { status: 'PAGO' }); const p3 = premio({ validoAte: ago(MIN) }); const p4 = premio({ ativo: false }); premio({ indicadorId: outra.id, codigo: 'PREMIODEOUTRA' });
    const r = await jr(await meu(tok(ana.id, 'USER'))); assert.deepStrictEqual(r.json.indicacoes, { pagas: 2, pendentes: 1 });
    assert.deepStrictEqual(r.json.premios.map((p: any) => [p.codigo, p.situacao, p.percentual]), [[p4.codigo, 'PAUSADO', 10], [p3.codigo, 'EXPIRADO', 10], [p2.codigo, 'USADO', 10], [p1.codigo, 'DISPONIVEL', 10]], 'o mais novo primeiro; só os dele'); assert.ok(r.json.premios[3].validoAte);
    const txt = JSON.stringify(r.json); assert.ok(!txt.includes('segredo1') && !txt.includes('Fulana Secreta') && !txt.includes('fulana@x.com'), 'nenhum dado dos amigos'); assert.ok(!txt.includes('PREMIODEOUTRA'));
    db.cupomDesconto.find((c: any) => c.id === cod.id).ativo = false; assert.strictEqual((await jr(await meu(tok(ana.id, 'USER')))).json.ativo, false, 'o coach pausou o código');
  });

  // ═════════════ checkout com o código de indicação ═════════════
  await block('compra com o código de um amigo: 10% de desconto; o dono não usa o próprio (e-mail ou CPF, sem cobrar nada); o amigo só usa uma vez', async () => {
    produtos(); const ana = aluno({ name: 'Ana Souza', email: 'ana@x.com', cpf: '52998224725' }); const cod = await codigoDe(ana);
    let r = await jr(await validar({ codigo: cod })); assert.deepStrictEqual([r.status, r.json.valido, r.json.descricao, r.json.desconto, r.json.valorFinal], [200, true, '10% de desconto', 3.29, 29.61]);
    r = await jr(await validar({ codigo: cod.toLowerCase(), email: 'ANA@x.com' })); assert.deepStrictEqual([r.status, r.json.motivo, r.json.error], [400, 'AUTO_INDICACAO', 'Você não pode usar o seu próprio código de indicação.']);
    r = await jr(await validar({ codigo: cod, cpf: '529.982.247-25' })); assert.strictEqual(r.json.motivo, 'AUTO_INDICACAO'); r = await jr(await validar({ codigo: cod, email: amigo.email, cpf: amigo.cpf })); assert.strictEqual(r.status, 200);
    const tenta = async (o: any) => { calls.length = 0; const x = await jr(await comprar({ cupom: cod, ...o })); assert.strictEqual(x.status, 400, JSON.stringify(x.json)); assert.deepStrictEqual([x.json.cupomInvalido, x.json.motivo], [true, 'AUTO_INDICACAO']); assert.strictEqual(db.produtoVenda.length, 0); assert.strictEqual(calls.length, 0, 'nem falou com a Asaas'); };
    await tenta({ email: ' ANA@x.com ' }); await tenta({ email: 'outro@x.com', cpf: '529.982.247-25' });
    const ok1 = await jr(await comprar({ cupom: cod, email: amigo.email, cpf: amigo.cpf })); assert.strictEqual(ok1.status, 201); const v = db.produtoVenda[0]; assert.deepStrictEqual([v.cupomCodigo, v.valorTotal, v.valorOriginal, v.descontoValor, v.cupomId], [cod, 29.61, 32.9, 3.29, db.cupomDesconto[0].id]);
    const ok2 = await jr(await comprar({ cupom: cod, email: 'AMIGA@x.com', cpf: '999.999.999-99' })); assert.deepStrictEqual([ok2.status, ok2.json.motivo], [400, 'JA_USOU'], 'a mesma pessoa não usa o código duas vezes');
    const outra = await jr(await comprar({ cupom: cod, email: 'terceira@x.com', cpf: '111.111.111-11' })); assert.strictEqual(outra.status, 201, 'outro amigo pode usar o mesmo código');
    db.cupomDesconto[0].ativo = false; const pausado = await jr(await validar({ codigo: cod, email: 'quarta@x.com' })); assert.deepStrictEqual([pausado.status, pausado.json.motivo], [400, 'INATIVO'], 'o coach pausou o código');
  });

  // ═════════════ prêmio quando a compra do amigo é paga ═════════════
  await block('pagamento do amigo confirmado: o aluno ganha UM prêmio (10%, 1 uso, 180 dias) e um aviso; aviso repetido da Asaas não duplica; compra comum não gera prêmio', async () => {
    produtos(); const ana = aluno({ name: 'Ana Souza', email: 'ana@x.com' }); const cod = await codigoDe(ana); G2.__pushes = [];
    const r = await jr(await comprar({ cupom: cod, email: amigo.email, cpf: amigo.cpf })); const id = r.json.vendaId; assert.strictEqual(db.cupomDesconto.filter((c: any) => c.origem === 'PREMIO').length, 0, 'pendente ainda não dá prêmio');
    assert.strictEqual((await pagar(id)).status, 200); const premios = db.cupomDesconto.filter((c: any) => c.origem === 'PREMIO'); assert.strictEqual(premios.length, 1); const p = premios[0];
    assert.ok(/^PREMIO[A-HJ-NP-Z2-9]{6}$/.test(p.codigo)); assert.deepStrictEqual([p.tipo, p.valor, p.coachId, p.indicadorId, p.vendaOrigemId, p.usoMaximo, p.umaVezPorCliente, p.ativo, p.descricao], ['PERCENTUAL', 10, PAULO, ana.id, id, 1, false, true, 'Prêmio por indicar um amigo']);
    const dias = (new Date(p.validoAte).getTime() - Date.now()) / DIA; assert.ok(dias > 179.9 && dias <= 180, 'vale por 180 dias: ' + dias);
    assert.strictEqual(pushes().length, 1); assert.deepStrictEqual([pushes()[0].to, pushes()[0].title, pushes()[0].data], [ana.id, '🎁 Seu amigo comprou!', { type: 'INDICACAO' }]); assert.ok(pushes()[0].body.includes('10%'));
    assert.strictEqual((await pagar(id, 'PAYMENT_RECEIVED')).status, 200); assert.strictEqual(db.cupomDesconto.filter((c: any) => c.origem === 'PREMIO').length, 1, 'aviso repetido não cria outro'); assert.strictEqual(pushes().length, 1, 'nem avisa de novo');
    const comum = cup({ codigo: 'VERAO10' }); const r2 = await jr(await comprar({ cupom: 'VERAO10', email: 'x1@x.com', cpf: '222.222.222-22' })); await pagar(r2.json.vendaId); const r3 = await jr(await comprar({ email: 'x2@x.com', cpf: '333.333.333-33' })); await pagar(r3.json.vendaId);
    assert.strictEqual(db.cupomDesconto.filter((c: any) => c.origem === 'PREMIO').length, 1, 'cupom comum e compra sem cupom não geram prêmio'); assert.strictEqual(comum.origem, undefined);
    const m = await jr(await meu(tok(ana.id, 'USER'))); assert.deepStrictEqual([m.json.indicacoes, m.json.premios.length, m.json.premios[0].situacao, m.json.premios[0].codigo], [{ pagas: 1, pendentes: 0 }, 1, 'DISPONIVEL', p.codigo]);
  });

  await block('prêmio: o aluno usa em uma compra (10%), vale uma vez só, não gera outro prêmio; vencido e pausado são recusados; se o aviso de push falhar, o prêmio existe mesmo assim', async () => {
    produtos(); const ana = aluno({ name: 'Ana Souza', email: 'ana@x.com', cpf: '52998224725' }); const cod = await codigoDe(ana); G2.__pushes = []; G2.__pushFail = true;
    try { const r = await jr(await comprar({ cupom: cod, email: amigo.email, cpf: amigo.cpf })); assert.strictEqual((await pagar(r.json.vendaId)).status, 200, 'webhook não cai se o aviso falhar'); } finally { G2.__pushFail = false; }
    const p = db.cupomDesconto.find((c: any) => c.origem === 'PREMIO'); assert.ok(p, 'o prêmio foi criado mesmo sem o aviso'); assert.strictEqual(pushes().length, 0);
    let v = await jr(await validar({ codigo: p.codigo, email: ana.email, cpf: '529.982.247-25' })); assert.deepStrictEqual([v.status, v.json.valido, v.json.desconto, v.json.valorFinal], [200, true, 3.29, 29.61], 'o dono usa o próprio prêmio (não é o "código de indicação")');
    const u = await jr(await comprar({ cupom: p.codigo, email: ana.email, cpf: '529.982.247-25' })); assert.strictEqual(u.status, 201); await pagar(u.json.vendaId); assert.strictEqual(db.cupomDesconto.filter((c: any) => c.origem === 'PREMIO').length, 1, 'usar um prêmio não gera outro prêmio');
    v = await jr(await validar({ codigo: p.codigo, email: 'outra@x.com' })); assert.deepStrictEqual([v.status, v.json.motivo], [400, 'ESGOTADO'], 'vale uma vez só');
    assert.strictEqual((await jr(await meu(tok(ana.id, 'USER')))).json.premios[0].situacao, 'USADO');
    const p2 = { ...p, id: 'pr9', codigo: 'PREMIOVENCIDO', vendaOrigemId: 'outra-venda', validoAte: ago(MIN) }; db.cupomDesconto.push(p2); assert.strictEqual((await jr(await validar({ codigo: 'PREMIOVENCIDO' }))).json.motivo, 'EXPIRADO');
    db.cupomDesconto.push({ ...p, id: 'pr10', codigo: 'PREMIOPAUSADO', vendaOrigemId: 'outra-venda-2', ativo: false, validoAte: later(DIA) }); assert.strictEqual((await jr(await validar({ codigo: 'PREMIOPAUSADO' }))).json.motivo, 'INATIVO');
  });

  await block('estorno da compra do amigo: o prêmio ainda não usado fica pausado; se a Asaas confirmar de novo, volta (sem novo aviso); prêmio já usado não muda', async () => {
    produtos(); const ana = aluno({ name: 'Ana Souza', email: 'ana@x.com' }); const cod = await codigoDe(ana); G2.__pushes = [];
    const r = await jr(await comprar({ cupom: cod, email: amigo.email, cpf: amigo.cpf })); await pagar(r.json.vendaId); const p = db.cupomDesconto.find((c: any) => c.origem === 'PREMIO'); assert.strictEqual(p.ativo, true);
    await pagar(r.json.vendaId, 'PAYMENT_REFUNDED'); assert.strictEqual(db.produtoVenda[0].status, 'ESTORNADO'); assert.strictEqual(p.ativo, false, 'prêmio pausado'); assert.strictEqual((await jr(await validar({ codigo: p.codigo }))).json.motivo, 'INATIVO'); assert.strictEqual((await jr(await meu(tok(ana.id, 'USER')))).json.premios[0].situacao, 'PAUSADO');
    await pagar(r.json.vendaId, 'PAYMENT_CONFIRMED'); assert.strictEqual(db.produtoVenda[0].status, 'PAGO'); assert.strictEqual(p.ativo, true, 'voltou a valer'); assert.strictEqual(db.cupomDesconto.filter((c: any) => c.origem === 'PREMIO').length, 1); assert.strictEqual(pushes().length, 1, 'sem novo aviso');
    const u = await jr(await comprar({ cupom: p.codigo, email: ana.email, cpf: '444.444.444-44' })); await pagar(u.json.vendaId); await pagar(r.json.vendaId, 'PAYMENT_REFUNDED'); assert.strictEqual((await jr(await meu(tok(ana.id, 'USER')))).json.premios[0].situacao, 'USADO', 'já usado: continua usado');
    const comum = cup({ codigo: 'COMUM1' }); const c1 = await jr(await comprar({ cupom: 'COMUM1', email: 'k@x.com', cpf: '555.555.555-55' })); await pagar(c1.json.vendaId); await pagar(c1.json.vendaId, 'PAYMENT_REFUNDED'); assert.strictEqual(db.produtoVenda.find((v: any) => v.id === c1.json.vendaId).status, 'ESTORNADO'); assert.strictEqual(comum.ativo, true, 'estorno de compra comum não mexe em cupom');
  });

  // ═════════════ admin: /api/admin/indicacoes ═════════════
  await block('admin: login obrigatório; coach vê só os alunos dele, master vê todos; só quem já teve compra aparece; números e resumo', async () => {
    produtos(); const ana = aluno({ name: 'Ana Souza' }); const bia = aluno({ name: 'Bia Lima', coachId: COACH }); const cris = aluno({ name: 'Cris' });
    const ca = await I.obterCodigoDoAluno(prisma, { id: ana.id, name: ana.name, coachId: PAULO }); const cb = await I.obterCodigoDoAluno(prisma, { id: bia.id, name: bia.name, coachId: COACH }); await I.obterCodigoDoAluno(prisma, { id: cris.id, name: cris.name, coachId: PAULO });
    vendaDe(ca.id, { status: 'PAGO', valorTotal: 29.61, descontoValor: 3.29 }); vendaDe(ca.id, { status: 'PAGO', valorTotal: 22.9, descontoValor: 2.54 }); vendaDe(ca.id, { status: 'PENDENTE', createdAt: ago(5 * MIN) }); vendaDe(ca.id, { status: 'PENDENTE', createdAt: ago(5 * HORA) }); vendaDe(ca.id, { status: 'ESTORNADO', valorTotal: 99, descontoValor: 9 }); vendaDe(cb.id, { status: 'PAGO', valorTotal: 45, descontoValor: 5 });
    const pr = (o: any) => { const p = { id: 'pr' + ++cn, codigo: 'PREMIO' + cn, tipo: 'PERCENTUAL', valor: 10, coachId: PAULO, origem: 'PREMIO', indicadorId: ana.id, usoMaximo: 1, umaVezPorCliente: false, ativo: true, ...o }; db.cupomDesconto.push(p); return p; }; pr({}); const usado = pr({}); vendaDe(usado.id, { status: 'PAGO', valorTotal: 26, descontoValor: 2.9 });
    assert.strictEqual((await lista()).status, 401); assert.strictEqual((await lista('lixo')).status, 401);
    let r = await jr(await lista(tok(COACH))); assert.strictEqual(r.status, 200); assert.deepStrictEqual(r.json.indicacoes.map((i: any) => i.aluno), ['Bia Lima']); assert.deepStrictEqual(r.json.resumo, { codigos: 1, comIndicacao: 1, vendasPagas: 1, receita: 45, descontoAmigos: 5, premiosGerados: 0, premiosUsados: 0, descontoPremios: 0 });
    r = await jr(await lista(tok(PAULO, 'ADMIN'))); assert.deepStrictEqual(r.json.indicacoes.map((i: any) => i.aluno), ['Ana Souza', 'Bia Lima'], 'mais compras pagas primeiro; Cris (sem compra) fica de fora');
    const A = r.json.indicacoes[0]; assert.deepStrictEqual([A.id, A.codigo, A.alunoId, A.ativo, A.pagas, A.pendentes, A.receita, A.descontoDado, A.premios, A.premiosUsados], [ca.id, ca.codigo, ana.id, true, 2, 1, 52.51, 5.83, 2, 1]);
    assert.deepStrictEqual(r.json.resumo, { codigos: 3, comIndicacao: 2, vendasPagas: 3, receita: 97.51, descontoAmigos: 10.83, premiosGerados: 2, premiosUsados: 1, descontoPremios: 2.9 });
    assert.strictEqual((await jr(await lista(tok(ADRI, 'ADMIN')))).json.indicacoes.length, 2, 'os dois masters veem tudo'); reset(); assert.deepStrictEqual((await jr(await lista(tok(COACH)))).json, { resumo: { codigos: 0, comIndicacao: 0, vendasPagas: 0, receita: 0, descontoAmigos: 0, premiosGerados: 0, premiosUsados: 0, descontoPremios: 0 }, indicacoes: [] });
  });

  await block('admin: pausar e reativar o código de um aluno (só o coach dono ou o master); pausado, o código para de valer na compra', async () => {
    produtos(); const ana = aluno({ name: 'Ana Souza' }); const cod = await I.obterCodigoDoAluno(prisma, { id: ana.id, name: ana.name, coachId: PAULO }); const row = () => db.cupomDesconto.find((c: any) => c.id === cod.id);
    assert.strictEqual((await pausar(cod.id, { ativo: false })).status, 401); assert.strictEqual((await pausar(cod.id, { ativo: false }, tok(COACH))).status, 403, 'outro coach não mexe');
    assert.strictEqual((await pausar(cod.id, { ativo: 'nao' }, tok(PAULO, 'ADMIN'))).status, 400); assert.strictEqual((await pausar(cod.id, {}, tok(PAULO, 'ADMIN'))).status, 400); assert.strictEqual((await pausar('nao-existe', { ativo: false }, tok(PAULO, 'ADMIN'))).status, 404);
    const comum = cup({ codigo: 'COMUM2' }); assert.strictEqual((await pausar(comum.id, { ativo: false }, tok(PAULO, 'ADMIN'))).status, 404, 'cupom comum não é código de indicação'); assert.strictEqual(comum.ativo, true);
    let r = await jr(await pausar(cod.id, { ativo: false }, tok(PAULO, 'ADMIN'))); assert.deepStrictEqual([r.status, r.json], [200, { ok: true, ativo: false }]); assert.strictEqual(row().ativo, false);
    assert.strictEqual((await jr(await validar({ codigo: cod.codigo }))).json.motivo, 'INATIVO'); assert.strictEqual((await jr(await meu(tok(ana.id, 'USER')))).json.ativo, false);
    r = await jr(await pausar(cod.id, { ativo: true }, tok(PAULO, 'ADMIN'))); assert.deepStrictEqual(r.json, { ok: true, ativo: true }); assert.strictEqual((await jr(await validar({ codigo: cod.codigo }))).status, 200);
    row().coachId = COACH; assert.strictEqual((await pausar(cod.id, { ativo: false }, tok(COACH))).status, 200, 'o coach dono do aluno pode'); assert.strictEqual(row().ativo, false);
  });

  await block('o painel de cupons do coach não mostra (nem edita) códigos de aluno e prêmios', async () => {
    produtos(); const ana = aluno({ name: 'Ana Souza' }); const cod = await I.obterCodigoDoAluno(prisma, { id: ana.id, name: ana.name, coachId: PAULO }); const comum = cup({ codigo: 'COMUM3', coachId: PAULO });
    db.cupomDesconto.push({ id: 'prx', codigo: 'PREMIOXYZ', tipo: 'PERCENTUAL', valor: 10, coachId: PAULO, origem: 'PREMIO', indicadorId: ana.id, usoMaximo: 1, ativo: true, createdAt: new Date() });
    for (const t of [tok(PAULO, 'ADMIN'), tok(COACH)]) { const r = await jr(await aList(t)); assert.ok(!r.json.cupons.some((c: any) => c.codigo === cod.codigo || c.codigo === 'PREMIOXYZ')); }
    assert.deepStrictEqual((await jr(await aList(tok(PAULO, 'ADMIN')))).json.cupons.map((c: any) => c.codigo), ['COMUM3']); assert.ok(comum);
    assert.strictEqual((await aPatch(cod.id, { ativo: false }, tok(PAULO, 'ADMIN'))).status, 404); assert.strictEqual(db.cupomDesconto.find((c: any) => c.id === cod.id).ativo, true); assert.strictEqual((await aDel(cod.id, tok(PAULO, 'ADMIN'))).status, 404); assert.ok(db.cupomDesconto.some((c: any) => c.id === cod.id)); assert.strictEqual((await aDel('prx', tok(PAULO, 'ADMIN'))).status, 404);
  });

  // ═════════════ casos extras (achados pelo teste de mutação) ═════════════
  await block('extras (lib): erro de banco sobe na hora, sem venda/cupom não consulta, código sem dono, colisão sem fim, pausar só o prêmio da venda, dono do código só para código', async () => {
    produtos(); const ana = aluno({ name: 'Ana Souza', email: 'ana@x.com', cpf: '52998224725' });
    { const orig = (prisma as any).cupomDesconto.create; let n = 0; (prisma as any).cupomDesconto.create = async () => { n++; throw new Error('banco fora do ar'); };
      try { await assert.rejects(I.obterCodigoDoAluno(prisma, { id: ana.id, name: ana.name, coachId: PAULO }), /banco fora do ar/); assert.strictEqual(n, 1, 'não repete');
        db.cupomDesconto.push({ id: 'cx', codigo: 'CODIGOX', origem: 'INDICACAO', indicadorId: ana.id, coachId: PAULO }); n = 0; await assert.rejects(I.criarPremio(prisma, { id: 'v1', cupomId: 'cx' }), /banco fora do ar/); assert.strictEqual(n, 1, 'não repete'); } finally { (prisma as any).cupomDesconto.create = orig; } }
    { const orig = (prisma as any).cupomDesconto.findUnique; let n = 0; (prisma as any).cupomDesconto.findUnique = async (...a: any[]) => { n++; return orig(...a); };
      try { assert.deepStrictEqual(await I.criarPremio(prisma, { id: 'v9' }), { criado: false }); assert.deepStrictEqual(await I.criarPremio(prisma, { id: 'v9', cupomId: null }), { criado: false }); assert.strictEqual(n, 0, 'venda sem cupom nem consulta o banco'); } finally { (prisma as any).cupomDesconto.findUnique = orig; } }
    db.cupomDesconto.push({ id: 'sd', codigo: 'SEMDONO', origem: 'INDICACAO', indicadorId: null, coachId: PAULO }); assert.deepStrictEqual(await I.criarPremio(prisma, { id: 'v2', cupomId: 'sd' }), { criado: false }); assert.ok(!db.cupomDesconto.some((c: any) => c.origem === 'PREMIO'), 'código sem dono não gera prêmio');
    db.cupomDesconto.push({ id: 'ocupado', codigo: 'PREMIOAAAAAA', origem: 'PREMIO', indicadorId: 'x', vendaOrigemId: 'outra', coachId: PAULO }); await assert.rejects(I.criarPremio(prisma, { id: 'v3', cupomId: 'cx' }, new Date(), seq(0)), /Não foi possível gerar o prêmio/, 'sorteio que só repete: avisa em vez de seguir sem prêmio');
    reset(); produtos(); const A = { id: 'pa', codigo: 'PREMIOAAAAAA', origem: 'PREMIO', vendaOrigemId: 'va', ativo: true, coachId: PAULO }; const Bp = { id: 'pb', codigo: 'PREMIOBBBBBB', origem: 'PREMIO', vendaOrigemId: 'vb', ativo: true, coachId: PAULO }; const falso = { id: 'pf', codigo: 'FALSO1', origem: 'INDICACAO', vendaOrigemId: 'va', ativo: true, coachId: PAULO }; db.cupomDesconto.push(A, Bp, falso);
    assert.strictEqual(await I.pausarPremioDaVenda(prisma, 'va'), 1); assert.deepStrictEqual([A.ativo, Bp.ativo, falso.ativo], [false, true, true], 'só o prêmio daquela venda'); assert.strictEqual(await I.pausarPremioDaVenda(prisma, 'nada'), 0);
    reset(); const a2 = aluno({ name: 'Ana', email: 'ana2@x.com', cpf: '52998224725' }); const mk = (o: any) => { const c = { id: 'c' + ++cn, codigo: 'X' + cn, coachId: PAULO, ...o }; db.cupomDesconto.push(c); return c; };
    assert.deepStrictEqual(await I.carregarIndicador(prisma, mk({ origem: 'INDICACAO', indicadorId: a2.id })), { email: 'ana2@x.com', cpf: '52998224725' }); assert.strictEqual(await I.carregarIndicador(prisma, mk({ origem: 'PREMIO', indicadorId: a2.id })), null, 'prêmio não tem "dono do código"');
    assert.strictEqual(await I.carregarIndicador(prisma, mk({ origem: null, indicadorId: a2.id })), null); assert.strictEqual(await I.carregarIndicador(prisma, null), null); assert.strictEqual(await I.carregarIndicador(prisma, mk({ origem: 'INDICACAO', indicadorId: 'sumiu' })), null); assert.strictEqual(await I.carregarIndicador(prisma, mk({ origem: 'INDICACAO', indicadorId: null })), null);
  });

  await block('extras (aluno): pendentes recentes contam e os velhos não; prêmio com compra pendente ou estornada continua disponível; só os campos combinados; erro interno vira 500 sem vazar', async () => {
    produtos(); const ana = aluno({ name: 'Ana Souza' }); const cod = await I.obterCodigoDoAluno(prisma, { id: ana.id, name: ana.name, coachId: PAULO });
    vendaDe(cod.id, { status: 'PENDENTE', createdAt: ago(10 * MIN) }); vendaDe(cod.id, { status: 'PENDENTE', createdAt: ago(20 * MIN) }); vendaDe(cod.id, { status: 'PENDENTE', createdAt: ago(3 * HORA) });
    const p = { id: 'pr1', codigo: 'PREMIOKKKKKK', tipo: 'PERCENTUAL', valor: 10, coachId: PAULO, origem: 'PREMIO', indicadorId: ana.id, vendaOrigemId: 'vo1', usoMaximo: 1, umaVezPorCliente: false, ativo: true, validoAte: later(30 * DIA), createdAt: new Date() }; db.cupomDesconto.push(p); vendaDe(p.id, { status: 'PENDENTE' }); vendaDe(p.id, { status: 'ESTORNADO' });
    const r = await jr(await meu(tok(ana.id, 'USER'))); assert.deepStrictEqual(r.json.indicacoes, { pagas: 0, pendentes: 2 }, 'só os pendentes de menos de 2 horas'); assert.strictEqual(r.json.premios[0].situacao, 'DISPONIVEL', 'pendente e estornado não gastam o prêmio'); assert.deepStrictEqual(Object.keys(r.json.premios[0]).sort(), ['codigo', 'criadoEm', 'id', 'percentual', 'situacao', 'validoAte']);
    assert.deepStrictEqual(Object.keys(r.json).sort(), ['ativo', 'codigo', 'indicacoes', 'percentualAmigo', 'percentualPremio', 'premios', 'produtos', 'validadePremioDias']);
    const orig = (prisma as any).user.findUnique; (prisma as any).user.findUnique = async () => { throw new Error('segredo do banco'); }; try { const e = await jr(await meu(tok(ana.id, 'USER'))); assert.strictEqual(e.status, 500); assert.ok(e.json.error.includes('Tente de novo')); assert.ok(!JSON.stringify(e.json).includes('segredo do banco')); } finally { (prisma as any).user.findUnique = orig; }
  });

  await block('extras (coach): ordem (compras, depois pendentes, depois nome), quem só tem compra pendente aparece, nome ausente vira "Aluno", prêmios de cada um, prêmio usado conta uma vez, código pausado aparece como pausado; erro interno vira 500', async () => {
    produtos(); const mkA = async (nome: string | null, coachId = PAULO) => { const a = aluno({ name: nome, coachId }); const c = await I.obterCodigoDoAluno(prisma, { id: a.id, name: a.name, coachId }); return { a, c: db.cupomDesconto.find((x: any) => x.id === c.id) }; };
    const ana = await mkA('Ana Souza'); const bia = await mkA('Bia Lima'); const dani = await mkA('Dani'); const eva = await mkA('Eva'); const fabi = await mkA('Fabi'); const gil = await mkA(null); const hugo = await mkA('Hugo');
    for (const x of [ana, bia, eva, fabi, gil, hugo]) vendaDe(x.c.id, { status: 'PAGO', valorTotal: 30, descontoValor: 3 }); vendaDe(ana.c.id, { status: 'PAGO', valorTotal: 20, descontoValor: 2 });
    vendaDe(ana.c.id, { status: 'PENDENTE', createdAt: ago(5 * MIN) }); vendaDe(ana.c.id, { status: 'PENDENTE', createdAt: ago(6 * MIN) }); vendaDe(ana.c.id, { status: 'PENDENTE', createdAt: ago(5 * HORA) }); vendaDe(fabi.c.id, { status: 'PENDENTE', createdAt: ago(5 * MIN) }); vendaDe(dani.c.id, { status: 'PENDENTE', createdAt: ago(5 * MIN) });
    hugo.c.ativo = false; const pr = (dono: any, o: any = {}) => { const x = { id: 'pr' + ++cn, codigo: 'PREMIO' + cn, tipo: 'PERCENTUAL', valor: 10, coachId: PAULO, origem: 'PREMIO', indicadorId: dono.a.id, usoMaximo: 1, umaVezPorCliente: false, ativo: true, ...o }; db.cupomDesconto.push(x); return x; };
    pr(ana); const usado = pr(ana); vendaDe(usado.id, { status: 'PAGO', valorTotal: 26, descontoValor: 2.9 }); vendaDe(usado.id, { status: 'PAGO', valorTotal: 26, descontoValor: 2.9 }); pr(bia);
    const r = await jr(await lista(tok(PAULO, 'ADMIN'))); const nomes = r.json.indicacoes.map((i: any) => i.aluno); assert.deepStrictEqual(nomes, ['Ana Souza', 'Fabi', 'Aluno', 'Bia Lima', 'Eva', 'Hugo', 'Dani'], 'mais compras pagas; empate: mais pendentes; empate: nome');
    const por = (n: string) => r.json.indicacoes.find((i: any) => i.aluno === n); assert.deepStrictEqual([por('Ana Souza').pagas, por('Ana Souza').pendentes, por('Ana Souza').premios, por('Ana Souza').premiosUsados], [2, 2, 2, 1], 'pendente velho fora; prêmio usado conta uma vez'); assert.deepStrictEqual([por('Bia Lima').premios, por('Bia Lima').premiosUsados, por('Eva').premios], [1, 0, 0], 'cada um com os prêmios dele');
    assert.deepStrictEqual([por('Dani').pagas, por('Dani').pendentes, por('Hugo').ativo, por('Eva').ativo], [0, 1, false, true]); assert.strictEqual(r.json.resumo.codigos, 7); assert.strictEqual(r.json.resumo.comIndicacao, 7); assert.strictEqual(r.json.resumo.premiosGerados, 3); assert.strictEqual(r.json.resumo.premiosUsados, 1);
    const orig = (prisma as any).cupomDesconto.findMany; (prisma as any).cupomDesconto.findMany = async () => { throw new Error('segredo'); }; try { const e = await jr(await lista(tok(PAULO, 'ADMIN'))); assert.deepStrictEqual([e.status, e.json], [500, { error: 'Erro ao buscar as indicações.' }]); } finally { (prisma as any).cupomDesconto.findMany = orig; }
    const origU = (prisma as any).cupomDesconto.update; (prisma as any).cupomDesconto.update = async () => { throw new Error('segredo'); }; try { const e = await jr(await pausar(ana.c.id, { ativo: false }, tok(PAULO, 'ADMIN'))); assert.deepStrictEqual([e.status, e.json], [500, { error: 'Erro ao atualizar o código.' }]); } finally { (prisma as any).cupomDesconto.update = origU; }
  });

  await block('extras (checkout e webhook): o painel de cupons de um coach comum não mostra códigos nem prêmios de aluno; sem o dono do código cadastrado o prêmio sai sem aviso', async () => {
    produtos(); const bia = aluno({ name: 'Bia', coachId: COACH }); const cod = await I.obterCodigoDoAluno(prisma, { id: bia.id, name: bia.name, coachId: COACH }); db.cupomDesconto.push({ id: 'prc', codigo: 'PREMIOCOACH', tipo: 'PERCENTUAL', valor: 10, coachId: COACH, origem: 'PREMIO', indicadorId: bia.id, usoMaximo: 1, ativo: true, createdAt: new Date() }); const comum = cup({ codigo: 'DOCOACH', coachId: COACH });
    assert.deepStrictEqual((await jr(await aList(tok(COACH)))).json.cupons.map((c: any) => c.codigo), ['DOCOACH'], 'só o cupom comum do coach'); assert.ok(comum && cod);
    reset(); produtos(); const ana = aluno({ name: 'Ana Souza', email: 'ana@x.com' }); const codigo = await codigoDe(ana); G2.__pushes = [];
    const r = await jr(await comprar({ cupom: codigo, email: amigo.email, cpf: amigo.cpf })); db.user.length = 0; assert.strictEqual((await pagar(r.json.vendaId)).status, 200); assert.strictEqual(db.cupomDesconto.filter((c: any) => c.origem === 'PREMIO').length, 1, 'o prêmio nasce mesmo assim'); assert.strictEqual(pushes().length, 0, 'sem a conta do aluno não há para quem avisar');
  });

  out(`\n${passed} ok, ${fails} falhas`); process.exit(fails ? 1 : 0);
})();
