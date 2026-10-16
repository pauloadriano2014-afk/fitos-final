import assert from 'assert';
import prisma from '@/lib/prisma';
import * as M from '/home/user/fitos-final/lib/membros';

process.env.ASAAS_WEBHOOK_TOKEN = 'tok'; process.env.RESEND_API_KEY = 're_test'; process.env.JWT_SECRET = 'segredo-de-teste'; process.env.APP_URL = 'https://app.test';
delete process.env.MEMBROS_URL; delete process.env.MEMBROS_SECRET; delete process.env.MEMBROS_FROM; delete process.env.RESEND_FROM;

const db: any = (prisma as any).__db;
const G: any = globalThis;
const sent: any[] = [];
let fetchFails = false;
G.fetch = async (url: string, init: any) => { sent.push({ url, body: JSON.parse(init.body), headers: init.headers }); return fetchFails ? { ok: false, status: 422, json: async () => ({ message: 'domínio não verificado' }) } : { ok: true, status: 200, json: async () => ({}) }; };
// o limitador de tentativas (lib/rateLimit.ts) vive na memória do processo: cada cenário anda o relógio 16 minutos para começar com as contas zeradas
const realNow = Date.now.bind(Date); let skew = 0; const t0 = realNow(); Date.now = () => t0 + skew;   // relógio virtual: só anda quando o teste manda (os limites de tempo ficam exatos)
const reset = () => { for (const k of Object.keys(db)) db[k].length = 0; sent.length = 0; fetchFails = false; skew += 16 * 60_000; };
const quiet = async <T,>(fn: () => Promise<T>) => { const e = console.error; console.error = () => {}; try { return await fn(); } finally { console.error = e; } };
const mkReq = (path: string, method = 'POST', body?: any, headers: Record<string, string> = {}) => new Request('http://x' + path, { method, headers: { 'Content-Type': 'application/json', ...headers }, body: body === undefined ? undefined : JSON.stringify(body) });
const jr = async (res: Response) => ({ status: res.status, json: await res.json() });
const codeOf = () => { const m = /^(\d{6}) é o seu código/.exec(sent.at(-1)?.body.subject || ''); return m ? m[1] : null; };
const T0 = new Date('2026-10-05T12:00:00Z'); const plus = (ms: number) => new Date(T0.getTime() + ms);
const MIN = 60_000, DAY = 86_400_000;
const venda = (o: any = {}) => db.produtoVenda.push({ id: 'v1', produtoId: 'p1', nomeCliente: 'Ana Souza', emailCliente: 'Ana@Gmail.com', telefoneCliente: '41999990000', cpfCliente: '1', status: 'PAGO', valorTotal: 97, itensBumpIds: null, createdAt: new Date('2026-09-01T10:00:00Z'), paymentDate: new Date('2026-09-01T10:05:00Z'), ...o });
const produto = (o: any = {}) => db.produtoDigital.push({ id: 'p1', slug: 'ficha-feminina', nome: 'Ficha Feminina 8 Semanas', descricao: 'Protocolo', capaUrl: 'https://img/capa.png', linkEntrega: null, treinoPrograma: null, cursoPrograma: null, ...o });

(async () => {
  try {
    // ═════ 1) e-mail, segredos e códigos ═════
    assert.equal(M.normalizeEmail('  Ana@Gmail.COM '), 'ana@gmail.com'); assert.equal(M.normalizeEmail(undefined), ''); assert.equal(M.normalizeEmail(null), ''); assert.equal(M.normalizeEmail(12), '12');
    for (const ok of ['a@b.co', 'ana.souza+x@gmail.com']) assert.equal(M.isValidEmail(ok), true, ok);
    for (const bad of ['', 'ana', 'ana@', '@gmail.com', 'ana@gmail', 'a b@c.com', 'ana@gmail.c', 'a@b.' + 'c'.repeat(260)]) assert.equal(M.isValidEmail(bad), false, bad);
    assert.equal(M.isValidEmail('x'.repeat(249) + '@b.co'), true, 'exatamente 254 caracteres ainda vale'); assert.equal(M.isValidEmail('x'.repeat(250) + '@b.co'), false, '255 caracteres não vale');
    for (let i = 0; i < 50; i++) assert.ok(/^\d{6}$/.test(M.gerarCodigo())); assert.ok(/^[0-9a-f]{64}$/.test(M.gerarToken())); assert.notEqual(M.gerarToken(), M.gerarToken());
    assert.notEqual(M.hashCodigo('a@b.co', '123456'), M.hashCodigo('c@d.co', '123456'), 'mesmo código de duas pessoas não colide'); assert.notEqual(M.hashLink('x'), M.hashSessao('x'), 'link e sessão com o mesmo valor têm hashes diferentes'); assert.notEqual(M.hashCodigo('a@b.co', '123456'), M.hashCodigo('a@b.co', '123457'));
    assert.ok(/^[0-9a-f]{64}$/.test(M.hashLink('x')));
    process.env.MEMBROS_SECRET = 'outro'; const h2 = M.hashLink('x'); delete process.env.MEMBROS_SECRET; assert.notEqual(h2, M.hashLink('x'), 'o segredo faz parte do hash'); const hj = M.hashLink('x'); delete process.env.JWT_SECRET; assert.notEqual(hj, M.hashLink('x')); process.env.JWT_SECRET = 'segredo-de-teste';
    assert.equal(M.membrosBaseUrl(), ''); process.env.MEMBROS_URL = ' https://membros.test// '; assert.equal(M.membrosBaseUrl(), 'https://membros.test'); delete process.env.MEMBROS_URL;
    assert.equal(M.tokenDoCabecalho('Bearer ' + 'a'.repeat(64)), 'a'.repeat(64)); assert.equal(M.tokenDoCabecalho('bearer ' + 'A'.repeat(64)), 'a'.repeat(64), 'minúsculas e maiúsculas'); for (const bad of [null, undefined, '', 'Bearer', 'Bearer abc', 'Token ' + 'a'.repeat(64), 'Bearer ' + 'a'.repeat(63), 'Bearer ' + 'g'.repeat(64)]) assert.equal(M.tokenDoCabecalho(bad as any), null, String(bad));
    assert.equal(M.CODE_TTL_MS, 10 * MIN); assert.equal(M.LINK_TTL_MS, 14 * DAY); assert.equal(M.SESSION_TTL_MS, 90 * DAY); assert.equal(M.MAX_CODE_ATTEMPTS, 5);

    // ═════ 2) membro ═════
    reset();
    let m = await M.garantirMembro(prisma, { email: ' Ana@Gmail.com ', nome: ' Ana Souza ', telefone: '4199' }); assert.equal(m.email, 'ana@gmail.com'); assert.equal(m.nome, 'Ana Souza'); assert.equal(m.telefone, '4199'); assert.equal(m.origem, 'COMPRA'); assert.equal(db.membro.length, 1);
    const m2 = await M.garantirMembro(prisma, { email: 'ANA@gmail.com', nome: 'Outro Nome', telefone: '0000' }); assert.equal(m2.id, m.id); assert.equal(db.membro.length, 1); assert.equal(db.membro[0].nome, 'Ana Souza', 'não troca o nome que já existe'); assert.equal(db.membro[0].telefone, '4199');
    reset(); await M.garantirMembro(prisma, { email: 'b@c.co' }); assert.equal(db.membro[0].nome, null); await M.garantirMembro(prisma, { email: 'b@c.co', nome: 'Bia', telefone: '55' }); assert.equal(db.membro[0].nome, 'Bia', 'completa o que faltava'); assert.equal(db.membro[0].telefone, '55');
    await M.garantirMembro(prisma, { email: 'imp@c.co', origem: 'IMPORTACAO' }); assert.equal(db.membro.find((x: any) => x.email === 'imp@c.co').origem, 'IMPORTACAO'); await M.garantirMembro(prisma, { email: 'vazio@c.co', nome: '   ' }); assert.equal(db.membro.find((x: any) => x.email === 'vazio@c.co').nome, null);
    reset(); const dois = await Promise.all([M.garantirMembro(prisma, { email: 'c@c.co' }), M.garantirMembro(prisma, { email: 'c@c.co' })]); assert.equal(dois[0].id, dois[1].id); assert.equal(db.membro.length, 1, 'duas compras ao mesmo tempo: uma conta só');
    reset(); { const orig = (prisma as any).membro.create; (prisma as any).membro.create = async () => { throw new Error('banco caiu'); }; try { await assert.rejects(M.garantirMembro(prisma, { email: 'd@c.co' }), /banco caiu/); } finally { (prisma as any).membro.create = orig; } }
    reset(); venda(); assert.equal((await M.vendaPagaDoEmail(prisma, 'ana@gmail.com')).id, 'v1', 'sem diferenciar maiúsculas'); assert.equal(await M.vendaPagaDoEmail(prisma, 'outra@gmail.com'), null); db.produtoVenda[0].status = 'PENDENTE'; assert.equal(await M.vendaPagaDoEmail(prisma, 'ana@gmail.com'), null, 'pendente não conta');

    // ═════ 3) código de 6 dígitos ═════
    reset(); m = await M.garantirMembro(prisma, { email: 'ana@gmail.com', nome: 'Ana' });
    let cod = await M.emitirCodigo(prisma, m, T0); assert.ok(/^\d{6}$/.test(cod)); assert.equal(db.membroCodigo.length, 1); const reg = db.membroCodigo[0]; assert.equal(reg.tipo, 'CODIGO'); assert.ok(!JSON.stringify(reg).includes(cod) || reg.hash !== cod, 'guarda só o hash'); assert.equal(reg.hash, M.hashCodigo('ana@gmail.com', cod)); assert.equal(reg.expiraEm.getTime(), T0.getTime() + 10 * MIN); assert.equal(reg.tentativas, 0); assert.equal(reg.usadoEm, null);
    let v = await M.validarCodigo(prisma, ' ANA@gmail.com ', ` ${cod.slice(0, 3)} ${cod.slice(3)} `, plus(MIN)); assert.equal(v.ok, true, 'e-mail em maiúsculas e código com espaço'); assert.equal((v as any).membro.id, m.id); assert.ok(db.membroCodigo[0].usadoEm, 'marcou como usado');
    assert.equal((await M.validarCodigo(prisma, 'ana@gmail.com', cod, plus(2 * MIN))).ok, false, 'código vale uma vez só');
    cod = await M.emitirCodigo(prisma, m, T0); assert.equal(db.membroCodigo.length, 1, 'novo pedido apaga o anterior'); const velho = cod; cod = await M.emitirCodigo(prisma, m, T0); assert.equal((await M.validarCodigo(prisma, 'ana@gmail.com', velho === cod ? '000000' : velho, plus(MIN))).ok, velho === cod, 'só o último código vale');
    cod = await M.emitirCodigo(prisma, m, T0); assert.equal((await M.validarCodigo(prisma, 'ana@gmail.com', cod, plus(10 * MIN - 1))).ok, true, 'ainda dentro dos 10 minutos');
    cod = await M.emitirCodigo(prisma, m, T0); assert.equal((await M.validarCodigo(prisma, 'ana@gmail.com', cod, plus(10 * MIN))).ok, false, 'aos 10 minutos já expirou'); assert.equal((await M.validarCodigo(prisma, 'ana@gmail.com', cod, plus(30 * MIN))).ok, false);
    for (const bad of ['12345', '1234567', 'abcdef', '', '12 34', '١٢٣٤٥٦']) { cod = await M.emitirCodigo(prisma, m, T0); assert.equal((await M.validarCodigo(prisma, 'ana@gmail.com', bad, plus(MIN))).ok, false, 'formato: ' + bad); assert.equal(db.membroCodigo[0].tentativas, 0, 'formato errado não gasta tentativa: ' + bad); }
    assert.equal((await M.validarCodigo(prisma, 'ninguem@gmail.com', '123456', plus(MIN))).ok, false); assert.equal((await M.validarCodigo(prisma, 'inválido', '123456', plus(MIN))).ok, false); assert.equal((await M.validarCodigo(prisma, 'ana@gmail.com', undefined as any, plus(MIN))).ok, false);
    // erros: conta, e depois de 5 nem o código certo vale
    cod = await M.emitirCodigo(prisma, m, T0); const errado = cod === '000000' ? '111111' : '000000';
    for (let i = 1; i <= 4; i++) { assert.equal((await M.validarCodigo(prisma, 'ana@gmail.com', errado, plus(MIN))).ok, false); assert.equal(db.membroCodigo[0].tentativas, i); }
    assert.equal((await M.validarCodigo(prisma, 'ana@gmail.com', cod, plus(MIN))).ok, true, 'na 5ª tentativa o certo ainda entra (4 erros antes)');
    cod = await M.emitirCodigo(prisma, m, T0); for (let i = 0; i < 5; i++) await M.validarCodigo(prisma, 'ana@gmail.com', errado, plus(MIN)); assert.equal(db.membroCodigo[0].tentativas, 5); assert.equal((await M.validarCodigo(prisma, 'ana@gmail.com', cod, plus(MIN))).ok, false, 'depois de 5 erros o código morre'); assert.equal(db.membroCodigo[0].tentativas, 5, 'e não conta mais');
    // o código de uma pessoa não abre a conta de outra
    const b = await M.garantirMembro(prisma, { email: 'bia@gmail.com' }); const codB = await M.emitirCodigo(prisma, b, T0); assert.equal((await M.validarCodigo(prisma, 'ana@gmail.com', codB, plus(MIN))).ok, false, 'código da Bia não entra na conta da Ana'); assert.equal((await M.validarCodigo(prisma, 'bia@gmail.com', codB, plus(MIN))).ok, true);
    // dois toques ao mesmo tempo: só um entra
    cod = await M.emitirCodigo(prisma, m, T0); const par = await Promise.all([M.validarCodigo(prisma, 'ana@gmail.com', cod, plus(MIN)), M.validarCodigo(prisma, 'ana@gmail.com', cod, plus(MIN))]); assert.equal(par.filter((x) => x.ok).length, 1, 'uso único mesmo com concorrência');
    // limpeza de códigos vencidos de outras pessoas
    reset(); m = await M.garantirMembro(prisma, { email: 'ana@gmail.com' }); const o = await M.garantirMembro(prisma, { email: 'o@c.co' }); await M.emitirCodigo(prisma, o, T0); await M.emitirCodigo(prisma, m, plus(11 * MIN)); assert.equal(db.membroCodigo.length, 1, 'o código vencido da outra pessoa foi limpo'); await M.emitirCodigo(prisma, o, plus(11 * MIN)); assert.equal(db.membroCodigo.length, 2, 'o código novo dela segue valendo');

    // ═════ 4) link do e-mail da compra ═════
    reset(); m = await M.garantirMembro(prisma, { email: 'ana@gmail.com' });
    let tk = await M.emitirLink(prisma, m, T0); assert.ok(/^[0-9a-f]{64}$/.test(tk)); assert.equal(db.membroCodigo[0].tipo, 'LINK'); assert.equal(db.membroCodigo[0].hash, M.hashLink(tk)); assert.equal(db.membroCodigo[0].expiraEm.getTime(), T0.getTime() + 14 * DAY);
    await M.emitirLink(prisma, m, T0); assert.equal(db.membroCodigo.length, 2, 'cada compra tem o seu link (não apaga o anterior)');
    v = await M.validarLink(prisma, tk, plus(DAY)); assert.equal(v.ok, true); assert.equal((v as any).membro.id, m.id); assert.equal((await M.validarLink(prisma, tk, plus(DAY))).ok, false, 'link vale uma vez só');
    tk = await M.emitirLink(prisma, m, T0); assert.equal((await M.validarLink(prisma, tk, plus(14 * DAY - 1))).ok, true, 'no último instante dos 14 dias'); tk = await M.emitirLink(prisma, m, T0); assert.equal((await M.validarLink(prisma, tk, plus(14 * DAY))).ok, false, 'aos 14 dias expirou');
    for (const bad of ['', 'abc', 'g'.repeat(64), 'a'.repeat(64), 'a'.repeat(63), undefined as any]) assert.equal((await M.validarLink(prisma, bad, plus(DAY))).ok, false, String(bad));
    tk = await M.emitirLink(prisma, m, T0); assert.equal((await M.validarLink(prisma, '  ' + tk.toUpperCase() + ' ', plus(DAY))).ok, false, 'o link é exatamente o que foi enviado (maiúsculas não valem)'); assert.equal((await M.validarLink(prisma, ' ' + tk + ' ', plus(DAY))).ok, true, 'espaços nas pontas não atrapalham');
    cod = await M.emitirCodigo(prisma, m, T0); assert.equal((await M.validarLink(prisma, cod.padStart(64, '0'), plus(MIN))).ok, false, 'código não serve de link');
    // duas pessoas tentam o mesmo link
    tk = await M.emitirLink(prisma, m, T0); const par2 = await Promise.all([M.validarLink(prisma, tk, plus(DAY)), M.validarLink(prisma, tk, plus(DAY))]); assert.equal(par2.filter((x) => x.ok).length, 1);
    // membro apagado depois do link
    tk = await M.emitirLink(prisma, m, T0); db.membro.length = 0; assert.equal((await M.validarLink(prisma, tk, plus(DAY))).ok, false, 'sem a conta, o link não entra');

    // ═════ 5) sessão ═════
    reset(); m = await M.garantirMembro(prisma, { email: 'ana@gmail.com', nome: 'Ana' });
    const s = await M.criarSessao(prisma, m, 'Mozilla/5.0 ' + 'x'.repeat(400), T0); assert.ok(/^[0-9a-f]{64}$/.test(s.token)); assert.equal(s.expiraEm.getTime(), T0.getTime() + 90 * DAY); assert.equal(db.membroSessao.length, 1); assert.equal(db.membroSessao[0].tokenHash, M.hashSessao(s.token)); assert.ok(db.membroSessao[0].userAgent.length === 300, 'user agent cortado em 300'); assert.equal(db.membro[0].ultimoAcesso.getTime(), T0.getTime());
    assert.equal((await M.criarSessao(prisma, m, null, T0)).token.length, 64); assert.equal(db.membroSessao[1].userAgent, null);
    let ss = await M.sessaoValida(prisma, s.token, plus(30 * MIN)); assert.equal(ss!.membro.id, m.id); assert.equal(await M.sessaoValida(prisma, null, plus(DAY)), null); assert.equal(await M.sessaoValida(prisma, 'f'.repeat(64), plus(DAY)), null);
    assert.equal(db.membroSessao[0].ultimoUso.getTime(), T0.getTime(), 'dentro de 1 hora não regrava'); await M.sessaoValida(prisma, s.token, plus(61 * MIN)); assert.equal(db.membroSessao[0].ultimoUso.getTime(), plus(61 * MIN).getTime(), 'depois de 1 hora atualiza o último uso'); assert.equal(db.membro[0].ultimoAcesso.getTime(), plus(61 * MIN).getTime());
    await M.sessaoValida(prisma, s.token, plus(61 * MIN + 60 * MIN)); assert.equal(db.membroSessao[0].ultimoUso.getTime(), plus(61 * MIN).getTime(), 'exatamente 1 hora depois ainda não regrava'); await M.sessaoValida(prisma, s.token, plus(61 * MIN + 60 * MIN + 1)); assert.equal(db.membroSessao[0].ultimoUso.getTime(), plus(121 * MIN + 1).getTime(), '1 hora e 1 ms depois regrava');
    assert.ok(await M.sessaoValida(prisma, s.token, plus(90 * DAY - 1)), 'vale até o último instante'); assert.equal(await M.sessaoValida(prisma, s.token, plus(90 * DAY)), null, 'aos 90 dias expirou');
    const velha = await M.criarSessao(prisma, m, null, T0); const antes = db.membroSessao.length; await M.criarSessao(prisma, m, null, plus(91 * DAY)); assert.ok(db.membroSessao.length < antes + 1 && !db.membroSessao.some((x: any) => x.tokenHash === M.hashSessao(velha.token)), 'sessões vencidas do mesmo membro são limpas');
    const out = await M.criarSessao(prisma, await M.garantirMembro(prisma, { email: 'o@c.co' }), null, T0); await M.criarSessao(prisma, m, null, plus(200 * DAY)); assert.ok(db.membroSessao.some((x: any) => x.tokenHash === M.hashSessao(out.token)), 'a sessão de outra pessoa não é apagada');
    await M.encerrarSessao(prisma, out.token); assert.equal(await M.sessaoValida(prisma, out.token, T0), null); assert.ok(db.membroSessao.length >= 1, 'sair não apaga as sessões dos outros aparelhos');
    { const so = await M.criarSessao(prisma, m, null, T0); db.membro.length = 0; assert.equal(await M.sessaoValida(prisma, so.token, plus(DAY)), null, 'sem a conta a sessão não vale'); }

    // ═════ 6) o que o membro tem liberado ═════
    reset(); assert.deepEqual(await M.produtosDoMembro(prisma, 'ana@gmail.com', 'https://app.test'), []);
    produto(); produto({ id: 'p2', slug: 'cardio', nome: 'Guia de Cardio', descricao: null, capaUrl: null, linkEntrega: 'https://drive/cardio' }); produto({ id: 'p3', slug: 'receitas', nome: '30 Receitas', linkEntrega: 'https://drive/rec' });
    venda({ itensBumpIds: JSON.stringify(['p2', 'p1', 'p-sumiu']) }); db.produtoTreinoAcesso.push({ vendaId: 'v1', produtoId: 'p1', token: 'ttt' }); db.produtoCursoAcesso.push({ vendaId: 'v1', produtoId: 'p2', token: 'ccc' });
    venda({ id: 'v2', produtoId: 'p3', emailCliente: 'outra@gmail.com' }); venda({ id: 'v3', produtoId: 'p3', status: 'PENDENTE' });
    let ps = await M.produtosDoMembro(prisma, 'ana@gmail.com', 'https://app.test//');
    assert.deepEqual(ps.map((p) => p.produtoId), ['p1', 'p2'], 'principal e bump; bump repetido e produto que sumiu ficam de fora; venda pendente e de outra pessoa não entram');
    assert.deepEqual(ps[0], { produtoId: 'p1', vendaId: 'v1', nome: 'Ficha Feminina 8 Semanas', descricao: 'Protocolo', capaUrl: 'https://img/capa.png', comprouEm: '2026-09-01T10:05:00.000Z', noSite: false, treinoUrl: 'https://app.test/ProdutoTreino?token=ttt', cursoUrl: null, materialUrl: null });
    assert.deepEqual(ps[1], { produtoId: 'p2', vendaId: 'v1', nome: 'Guia de Cardio', descricao: null, capaUrl: null, comprouEm: '2026-09-01T10:05:00.000Z', noSite: false, treinoUrl: null, cursoUrl: 'https://app.test/ProdutoCurso?token=ccc', materialUrl: 'https://drive/cardio' });
    assert.equal((await M.produtosDoMembro(prisma, 'ANA@GMAIL.COM', 'https://app.test')).length, 2, 'e-mail em maiúsculas acha as compras'); assert.equal((await M.produtosDoMembro(prisma, 'outra@gmail.com', 'https://app.test')).map((p) => p.produtoId).join(), 'p3');
    // comprou duas vezes: aparece uma vez, com a compra mais nova; sem data de pagamento usa a data da venda
    venda({ id: 'v4', produtoId: 'p1', paymentDate: null, createdAt: new Date('2026-10-01T09:00:00Z') }); db.produtoTreinoAcesso.push({ vendaId: 'v4', produtoId: 'p1', token: 'novo' });
    ps = await M.produtosDoMembro(prisma, 'ana@gmail.com', 'https://app.test'); assert.deepEqual(ps.map((p) => p.produtoId + ':' + p.vendaId), ['p1:v4', 'p2:v1'], 'mais novo primeiro, sem repetir produto'); assert.equal(ps[0].comprouEm, '2026-10-01T09:00:00.000Z'); assert.equal(ps[0].treinoUrl, 'https://app.test/ProdutoTreino?token=novo');
    db.produtoVenda.find((x: any) => x.id === 'v1').itensBumpIds = 'isto não é json'; assert.deepEqual((await M.produtosDoMembro(prisma, 'ana@gmail.com', 'https://app.test')).map((p) => p.produtoId), ['p1'], 'lista de bumps quebrada não derruba'); db.produtoVenda.find((x: any) => x.id === 'v1').itensBumpIds = '{"a":1}'; assert.equal((await M.produtosDoMembro(prisma, 'ana@gmail.com', 'https://app.test')).length, 1, 'bumps que não é lista é ignorado');

    // ═════ 7) e-mails ═════
    reset(); sent.length = 0;
    assert.equal(await M.enviarCodigoPorEmail({ email: 'ana@gmail.com', nome: 'Ana <b>Souza</b>' }, '123456'), true); assert.equal(sent.length, 1);
    assert.equal(sent[0].url, 'https://api.resend.com/emails'); assert.equal(sent[0].headers.Authorization, 'Bearer re_test'); assert.deepEqual(sent[0].body.to, ['ana@gmail.com']); assert.equal(sent[0].body.from, 'PA ELITE TEAM <onboarding@resend.dev>'); assert.equal(sent[0].body.subject, '123456 é o seu código de acesso');
    assert.ok(sent[0].body.html.includes('>123456<') && sent[0].body.html.includes('10 minutos') && sent[0].body.html.includes('PA ELITE TEAM'), 'código em destaque'); assert.ok(sent[0].body.html.includes('Fala, <strong>Ana</strong>'), 'primeiro nome'); assert.ok(!sent[0].body.html.includes('<b>'), 'nome escapado');
    assert.ok(M.emailCodigoHtml(null, '000000').includes('<strong>Atleta</strong>')); assert.ok(M.emailCodigoHtml('<img src=x onerror=1> Zé', '000000').includes('&lt;img'), 'HTML do nome é escapado'); assert.ok(M.emailCodigoHtml('A&B', '1').includes('A&amp;B')); assert.ok(M.emailCodigoHtml('A=B', '1').includes('<strong>A=B</strong>'), 'o sinal de igual passa sem mudar'); assert.ok(M.emailCodigoHtml('A>B<C"x"\'y\'', '1').includes('A&gt;B&lt;C&quot;x&quot;&#39;y&#39;'), 'todos os caracteres perigosos são trocados');
    process.env.RESEND_FROM = 'ELITE FIT <ola@elitefitapp.com.br>'; await M.enviarCodigoPorEmail({ email: 'a@b.co' }, '111111'); assert.equal(sent.at(-1).body.from, 'ELITE FIT <ola@elitefitapp.com.br>', 'usa o remetente verificado quando existe'); process.env.MEMBROS_FROM = 'PA ELITE TEAM <acesso@pauloadrianoteam.com.br>'; await M.enviarCodigoPorEmail({ email: 'a@b.co' }, '111111'); assert.equal(sent.at(-1).body.from, 'PA ELITE TEAM <acesso@pauloadrianoteam.com.br>', 'MEMBROS_FROM tem preferência'); delete process.env.RESEND_FROM; delete process.env.MEMBROS_FROM;
    fetchFails = true; assert.equal(await quiet(() => M.enviarCodigoPorEmail({ email: 'a@b.co' }, '111111')), false, 'erro do Resend: devolve false, sem lançar'); fetchFails = false;
    { const f0 = G.fetch; G.fetch = async () => { throw new Error('sem rede'); }; try { assert.equal(await quiet(() => M.enviarCodigoPorEmail({ email: 'a@b.co' }, '1')), false, 'sem rede: devolve false'); } finally { G.fetch = f0; } }
    { const k = process.env.RESEND_API_KEY; delete process.env.RESEND_API_KEY; const n = sent.length; assert.equal(await quiet(() => M.enviarCodigoPorEmail({ email: 'a@b.co' }, '1')), false, 'sem chave: não envia'); assert.equal(sent.length, n); process.env.RESEND_API_KEY = k; }
    reset(); assert.equal(await M.criarLinkDeAcesso(prisma, { email: 'ana@gmail.com' }), null, 'sem MEMBROS_URL: nada muda'); assert.equal(db.membro.length, 0, 'e nenhuma conta é criada');
    process.env.MEMBROS_URL = 'https://membros.test/'; const lk = await M.criarLinkDeAcesso(prisma, { email: ' Ana@Gmail.com ', nome: 'Ana Souza', telefone: '4199' }); assert.ok(/^https:\/\/membros\.test\/\?t=[0-9a-f]{64}$/.test(lk!), String(lk)); assert.equal(db.membro[0].email, 'ana@gmail.com'); assert.equal(db.membro[0].nome, 'Ana Souza');
    assert.equal((await M.validarLink(prisma, lk!.split('=')[1])).ok, true, 'o link do e-mail entra'); delete process.env.MEMBROS_URL;

    // ═════ 8) rotas ═════
    const codigoRoute = await import('@/app/api/membros/codigo/route'); const entrarRoute = await import('@/app/api/membros/entrar/route'); const meRoute = await import('@/app/api/membros/me/route'); const sairRoute = await import('@/app/api/membros/sair/route');
    let ipN = 0; const ip = () => ({ 'x-forwarded-for': `10.0.0.${++ipN}` });
    const pedir = (email: any, headers = ip()) => codigoRoute.POST(mkReq('/api/membros/codigo', 'POST', { email }, headers));
    const entrar = (body: any, headers = ip()) => entrarRoute.POST(mkReq('/api/membros/entrar', 'POST', body, headers));
    const me = (token?: string) => meRoute.GET(mkReq('/api/membros/me', 'GET', undefined, token ? { Authorization: 'Bearer ' + token } : {}));

    // pedir código
    reset(); produto(); venda();
    let r = await jr(await pedir('isto-nao-e-email')); assert.equal(r.status, 400); assert.ok(/e-mail válido/.test(r.json.error)); assert.equal(sent.length, 0);
    r = await jr(await codigoRoute.POST(new Request('http://x/api/membros/codigo', { method: 'POST', body: 'lixo', headers: ip() }))); assert.equal(r.status, 400, 'corpo que não é JSON');
    r = await jr(await pedir('estranho@gmail.com')); assert.deepEqual(r, { status: 200, json: { ok: true } }, 'e-mail sem compra: resposta igual'); assert.equal(sent.length, 0, 'e nada é enviado'); assert.equal(db.membro.length, 0, 'e nenhuma conta é criada');
    r = await jr(await pedir('Ana@Gmail.com')); assert.deepEqual(r, { status: 200, json: { ok: true } }); assert.equal(sent.length, 1, 'e-mail com compra paga recebe o código'); assert.deepEqual(sent[0].body.to, ['ana@gmail.com']); assert.equal(db.membro.length, 1); assert.equal(db.membro[0].nome, 'Ana Souza'); assert.equal(db.membro[0].telefone, '41999990000'); assert.ok(codeOf());
    db.produtoVenda[0].status = 'PENDENTE'; db.membro.length = 0; sent.length = 0; await pedir('ana@gmail.com'); assert.equal(sent.length, 0, 'compra pendente não ganha conta'); db.produtoVenda[0].status = 'PAGO';
    reset(); produto(); venda(); await pedir('ana@gmail.com'); await pedir('ana@gmail.com'); assert.equal(db.membro.length, 1); assert.equal(db.membroCodigo.length, 1, 'cada pedido substitui o anterior'); assert.equal(sent.length, 2);
    // limite por e-mail: 4 envios a cada 10 minutos, resposta sempre igual
    reset(); produto(); venda(); for (let i = 0; i < 6; i++) { r = await jr(await pedir('ana@gmail.com')); assert.deepEqual(r, { status: 200, json: { ok: true } }, 'resposta ' + (i + 1)); } assert.equal(sent.length, 4, 'só 4 e-mails em 10 minutos');
    // as janelas de tempo: 4 por e-mail em 10 minutos, 20 por IP em 15 minutos
    reset(); produto(); venda(); for (let i = 0; i < 4; i++) await pedir('ana@gmail.com'); assert.equal(sent.length, 4); skew += 10 * MIN - 1; await pedir('ana@gmail.com'); assert.equal(sent.length, 4, 'um instante antes dos 10 minutos ainda bloqueia'); skew += 2; await pedir('ana@gmail.com'); assert.equal(sent.length, 5, 'passados 10 minutos libera de novo');
    reset(); produto(); venda(); { const ipf = { 'x-forwarded-for': '7.7.7.7' }; for (let i = 1; i <= 20; i++) await pedir(`janela${i}@gmail.com`, ipf); assert.equal((await pedir('janela21@gmail.com', ipf)).status, 429); skew += 15 * MIN - 1; assert.equal((await pedir('janela21@gmail.com', ipf)).status, 429, 'um instante antes dos 15 minutos ainda bloqueia'); skew += 2; assert.equal((await pedir('janela21@gmail.com', ipf)).status, 200, 'passados 15 minutos libera de novo'); }
    // limite por IP: 20 por 15 minutos
    reset(); produto(); venda(); const fixo = { 'x-forwarded-for': '9.9.9.9' }; for (let i = 1; i <= 20; i++) assert.equal((await pedir(`pessoa${i}@gmail.com`, fixo)).status, 200, 'pedido ' + i); r = await jr(await pedir('pessoa21@gmail.com', fixo)); assert.equal(r.status, 429); assert.ok(/Muitas tentativas/.test(r.json.error)); assert.equal((await pedir('pessoa21@gmail.com', { 'x-forwarded-for': '9.9.9.10' })).status, 200, 'outro IP segue');
    // erro do e-mail: o site não revela nada
    reset(); produto(); venda(); fetchFails = true; r = await jr(await quiet(() => pedir('ana@gmail.com'))); assert.deepEqual(r, { status: 200, json: { ok: true } }, 'Resend fora do ar: mesma resposta'); fetchFails = false;
    // banco caiu
    reset(); { const orig = (prisma as any).membro.findUnique; (prisma as any).membro.findUnique = async () => { throw new Error('banco'); }; try { r = await jr(await quiet(() => pedir('ana@gmail.com'))); } finally { (prisma as any).membro.findUnique = orig; } assert.equal(r.status, 500); assert.ok(/Tente de novo/.test(r.json.error)); }

    // entrar com código
    reset(); produto(); venda(); await pedir('ana@gmail.com'); const c1 = codeOf()!;
    r = await jr(await entrar({ email: 'ana@gmail.com', codigo: c1 === '000000' ? '111111' : '000000' })); assert.equal(r.status, 401); assert.ok(/inválido ou expirado/.test(r.json.error)); assert.equal(db.membroSessao.length, 0);
    r = await jr(await entrar({ email: 'ANA@gmail.com', codigo: c1 })); assert.equal(r.status, 200); assert.ok(/^[0-9a-f]{64}$/.test(r.json.token)); assert.deepEqual(r.json.membro, { nome: 'Ana Souza', email: 'ana@gmail.com' }); assert.ok(Math.abs(new Date(r.json.expiraEm).getTime() - (realNow() + 90 * DAY)) < 60_000, 'sessão de 90 dias'); assert.equal(db.membroSessao.length, 1);
    r = await jr(await entrar({ email: 'ana@gmail.com', codigo: c1 })); assert.equal(r.status, 401, 'o mesmo código não entra de novo');
    r = await jr(await entrarRoute.POST(new Request('http://x/api/membros/entrar', { method: 'POST', body: 'lixo', headers: ip() }))); assert.equal(r.status, 401, 'corpo inválido'); r = await jr(await entrar({})); assert.equal(r.status, 401); r = await jr(await entrar({ email: 'ana@gmail.com' })); assert.equal(r.status, 401, 'sem código');
    // entrar com o link da compra
    reset(); produto(); venda(); process.env.MEMBROS_URL = 'https://membros.test'; const link = await M.criarLinkDeAcesso(prisma, { email: 'ana@gmail.com', nome: 'Ana Souza' }); delete process.env.MEMBROS_URL; const t1 = link!.split('=')[1];
    r = await jr(await entrar({ token: 'x'.repeat(64) })); assert.equal(r.status, 401); r = await jr(await entrar({ token: t1 })); assert.equal(r.status, 200); assert.equal(r.json.membro.email, 'ana@gmail.com'); r = await jr(await entrar({ token: t1 })); assert.equal(r.status, 401, 'link de uso único');
    reset(); produto(); venda(); process.env.MEMBROS_URL = 'https://membros.test'; const t2 = (await M.criarLinkDeAcesso(prisma, { email: 'ana@gmail.com' }))!.split('=')[1]; delete process.env.MEMBROS_URL; r = await jr(await entrar({ token: t2, email: 'lixo', codigo: '123456' })); assert.equal(r.status, 200, 'se vier o link, vale o link');
    // limite de tentativas: 10 por IP e e-mail
    reset(); produto(); venda(); await pedir('ana@gmail.com'); const fx = { 'x-forwarded-for': '8.8.8.8' }; for (let i = 1; i <= 10; i++) assert.equal((await entrar({ email: 'ana@gmail.com', codigo: '999999' }, fx)).status, 401, 'tentativa ' + i); r = await jr(await entrar({ email: 'ana@gmail.com', codigo: '999999' }, fx)); assert.equal(r.status, 429); assert.equal((await entrar({ email: 'outra@gmail.com', codigo: '999999' }, fx)).status, 401, 'outro e-mail no mesmo IP tem a própria conta de tentativas');
    skew += 15 * MIN - 1; r = await jr(await entrar({ email: 'ana@gmail.com', codigo: '999999' }, fx)); assert.equal(r.status, 429, 'um instante antes dos 15 minutos ainda bloqueia'); skew += 2; r = await jr(await entrar({ email: 'ana@gmail.com', codigo: '999999' }, fx)); assert.equal(r.status, 401, 'passados 15 minutos volta a tentar');
    // banco caiu
    { const orig = (prisma as any).membro.findUnique; (prisma as any).membro.findUnique = async () => { throw new Error('banco'); }; try { r = await jr(await quiet(() => entrar({ email: 'ana@gmail.com', codigo: '123456' }))); } finally { (prisma as any).membro.findUnique = orig; } assert.equal(r.status, 500); }

    // me + sair
    reset(); produto(); produto({ id: 'p2', slug: 'c', nome: 'Cardio', linkEntrega: 'https://drive/c' }); venda({ itensBumpIds: JSON.stringify(['p2']) }); db.produtoTreinoAcesso.push({ vendaId: 'v1', produtoId: 'p1', token: 'ttt' }); await pedir('ana@gmail.com'); const tokenSessao = (await jr(await entrar({ email: 'ana@gmail.com', codigo: codeOf() }))).json.token;
    r = await jr(await me()); assert.equal(r.status, 401); assert.ok(/Entre de novo/.test(r.json.error)); r = await jr(await me('a'.repeat(64))); assert.equal(r.status, 401);
    r = await jr(await me(tokenSessao)); assert.equal(r.status, 200); assert.deepEqual(r.json.membro, { nome: 'Ana Souza', email: 'ana@gmail.com' }); assert.deepEqual(r.json.produtos.map((p: any) => p.nome), ['Ficha Feminina 8 Semanas', 'Cardio']); assert.equal(r.json.produtos[0].treinoUrl, 'https://app.test/ProdutoTreino?token=ttt', 'usa APP_URL'); assert.ok(!JSON.stringify(r.json).includes('hash'), 'nada de segredo na resposta');
    r = await jr(await sairRoute.POST(mkReq('/api/membros/sair', 'POST', undefined, { Authorization: 'Bearer ' + tokenSessao }))); assert.deepEqual(r, { status: 200, json: { ok: true } }); r = await jr(await me(tokenSessao)); assert.equal(r.status, 401, 'depois de sair a sessão morre'); r = await jr(await sairRoute.POST(mkReq('/api/membros/sair', 'POST'))); assert.equal(r.status, 200, 'sair sem sessão não dá erro');
    { const orig = (prisma as any).membroSessao.findUnique; (prisma as any).membroSessao.findUnique = async () => { throw new Error('banco'); }; try { r = await jr(await quiet(() => me('b'.repeat(64)))); } finally { (prisma as any).membroSessao.findUnique = orig; } assert.equal(r.status, 500); const o2 = (prisma as any).membroSessao.deleteMany; (prisma as any).membroSessao.deleteMany = async () => { throw new Error('banco'); }; try { r = await jr(await quiet(() => sairRoute.POST(mkReq('/api/membros/sair', 'POST', undefined, { Authorization: 'Bearer ' + 'c'.repeat(64) })))); } finally { (prisma as any).membroSessao.deleteMany = o2; } assert.equal(r.status, 500); }

    // ═════ 9) e-mail da compra (webhook de pagamento) ═════
    const { POST: webhook } = await import('@/app/api/payments/webhook/route');
    const hook = async (event: string, vendaId: string) => jr(await webhook(new Request('http://x/api/payments/webhook', { method: 'POST', headers: { 'asaas-access-token': 'tok', 'Content-Type': 'application/json' }, body: JSON.stringify({ event, payment: { id: 'pay_' + vendaId, externalReference: 'produto:' + vendaId, status: 'CONFIRMED' } }) })));
    const seedCompra = () => { reset(); produto({ treinoPrograma: '{"treinos":[]}', linkEntrega: 'https://drive/ficha' }); produto({ id: 'p2', slug: 'c', nome: 'Guia de Cardio', linkEntrega: 'https://drive/cardio', cursoPrograma: '{"modulos":[]}' }); venda({ status: 'PENDENTE', paymentDate: null, itensBumpIds: JSON.stringify(['p2']) }); };
    // sem MEMBROS_URL: o e-mail sai como sempre saiu
    seedCompra(); r = await hook('PAYMENT_CONFIRMED', 'v1'); assert.equal(r.status, 200); assert.equal(db.produtoVenda[0].status, 'PAGO'); assert.equal(sent.length, 1); assert.ok(!sent[0].body.html.includes('ÁREA DE MEMBROS'), 'sem MEMBROS_URL: sem o botão'); assert.ok(sent[0].body.html.includes('ACESSAR: FICHA FEMININA') && sent[0].body.html.includes('ProdutoTreino?token='), 'materiais e treino interativo seguem'); assert.equal(db.membro.length, 0, 'e nenhuma conta é criada');
    // com MEMBROS_URL: botão no e-mail + conta + link que entra
    process.env.MEMBROS_URL = 'https://membros.test'; seedCompra(); r = await hook('PAYMENT_CONFIRMED', 'v1'); assert.equal(r.status, 200); assert.equal(sent.length, 1); const html = sent[0].body.html as string;
    const mt = /href="https:\/\/membros\.test\/\?t=([0-9a-f]{64})"/.exec(html); assert.ok(mt, 'botão com o link de acesso'); assert.ok(html.includes('ENTRAR NA MINHA ÁREA DE MEMBROS') && html.includes('vale uma vez e por 14 dias')); assert.ok(html.indexOf('ENTRAR NA MINHA ÁREA') < html.indexOf('ACESSAR: FICHA'), 'o botão da área vem antes dos links de cada material'); assert.ok(html.includes('ACESSAR: GUIA DE CARDIO') && html.includes('ProdutoTreino?token=') && html.includes('ACESSAR MEU CURSO: GUIA DE CARDIO') && html.includes('ProdutoCurso?token='), 'os links diretos (material, treino e curso) seguem como reserva');
    assert.equal(db.membro.length, 1); assert.equal(db.membro[0].email, 'ana@gmail.com'); assert.equal(db.membro[0].nome, 'Ana Souza'); assert.equal(db.membro[0].telefone, '41999990000');
    const entrou = await jr(await entrar({ token: mt![1] })); assert.equal(entrou.status, 200, 'o link do e-mail abre a conta'); const lista = await jr(await me(entrou.json.token)); assert.deepEqual(lista.json.produtos.map((p: any) => p.nome).sort(), ['Ficha Feminina 8 Semanas', 'Guia de Cardio'], 'principal e bump liberados'); assert.ok(lista.json.produtos.find((p: any) => p.produtoId === 'p1').treinoUrl.includes('/ProdutoTreino?token='));
    // Asaas reenvia o mesmo webhook: não manda e-mail nem link de novo
    r = await hook('PAYMENT_CONFIRMED', 'v1'); assert.equal(sent.length, 1, 'webhook repetido não reenvia'); assert.equal(db.membroCodigo.filter((x: any) => x.tipo === 'LINK').length, 1);
    // segunda compra do mesmo e-mail: a mesma conta, outro link
    venda({ id: 'v9', produtoId: 'p2', status: 'PENDENTE', paymentDate: null }); await hook('PAYMENT_RECEIVED', 'v9'); assert.equal(db.membro.length, 1, 'mesma pessoa, mesma conta'); assert.equal(sent.length, 2); assert.equal(db.membroCodigo.filter((x: any) => x.tipo === 'LINK').length, 2);
    // falha ao criar a conta: a entrega normal sai mesmo assim
    seedCompra(); { const orig = (prisma as any).membro.create; (prisma as any).membro.create = async () => { throw new Error('banco'); }; try { r = await quiet(() => hook('PAYMENT_CONFIRMED', 'v1')); } finally { (prisma as any).membro.create = orig; } } assert.equal(r.status, 200); assert.equal(sent.length, 1, 'o e-mail sai'); assert.ok(!sent[0].body.html.includes('ÁREA DE MEMBROS') && sent[0].body.html.includes('ACESSAR: FICHA FEMININA'), 'sem o botão, mas com todos os materiais'); assert.equal(db.produtoVenda[0].status, 'PAGO');
    // pagamento pendente (sem confirmação) não cria nada
    seedCompra(); r = await hook('PAYMENT_CREATED', 'v1'); assert.equal(sent.length, 0); assert.equal(db.membro.length, 0); delete process.env.MEMBROS_URL;

    console.log('OK  área de membros: login por código e por link (uso único, validade, 5 tentativas, concorrência), sessão de 90 dias, produtos liberados pelas vendas pagas, rotas sem revelar quem é cliente, e-mail da compra com botão (e sem quebrar a entrega)');
  } catch (e: any) { console.log('FALHOU', e && e.stack ? e.stack.split('\n').slice(0, 7).join('\n') : e); process.exit(1); }
})();
