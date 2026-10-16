// Visualizar do painel de produtos: link do site de membros quando está ligado; aviso claro quando o produto já é da Área de Membros mas o servidor ainda não tem MEMBROS_URL;
// e a página antiga (venda TESTE) abre de verdade, sem nunca liberar vendas que não são PAGO nem TESTE.
import assert from 'assert';
import prisma from '@/lib/prisma';
import { signAuthToken } from '@/lib/auth';
import { POST as preview } from '@/app/api/admin/produtos/[id]/treino-preview/route';
import * as treinoR from '@/app/api/produtos/treino/[token]/route';
import * as treinoP from '@/app/api/produtos/treino/[token]/progresso/route';

process.env.JWT_SECRET = 'segredo-de-teste'; process.env.APP_URL = 'https://app.test';
const realLog = console.log.bind(console); console.log = () => {}; console.warn = () => {}; console.error = () => {};
const db: any = (prisma as any).__db;
const tok = (id: string, role = 'COACH') => signAuthToken({ id, role, coachId: null } as any);
const reqP = (token?: string) => new Request('http://x/api/admin/produtos/p1/treino-preview', { method: 'POST', headers: token ? { Authorization: 'Bearer ' + token } : {} }) as any;
const chama = async (id: string, token?: string) => { const r: Response = await (preview as any)(reqP(token), { params: { id } }); return { status: r.status, json: await r.json() }; };
const get = async (t: string) => { const r: Response = await (treinoR.GET as any)(new Request('http://x/x') as any, { params: { token: t } }); return { status: r.status, json: await r.json() }; };
const post = async (t: string) => { const r: Response = await (treinoP.POST as any)(new Request('http://x/x', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ treinoIndex: 0, cargas: {} }) }) as any, { params: { token: t } }); return { status: r.status, json: await r.json() }; };
const reset = () => { for (const k of Object.keys(db)) db[k].length = 0; delete process.env.MEMBROS_URL; };
const ABAS = JSON.stringify([{ id: 'treino', tipo: 'treino', titulo: 'Treino', semanas: 8 }, { id: 'receitas', tipo: 'receitas', titulo: 'Receitas', modelo: 'receitas' }]);
const PROG = JSON.stringify({ treinos: [{ nome: 'A', exercicios: [] }] });
const COACH = 'coach-1';
let ok = 0; const pass = (m: string) => { ok++; realLog('OK  ' + m); };

(async () => {
  // ── produto da Área de Membros (abas) ──
  reset(); db.produtoDigital.push({ id: 'p1', coachId: COACH, treinoAvulsoId: 'q1', membrosAbas: ABAS, treinoPrograma: PROG });
  process.env.MEMBROS_URL = 'https://membros.exemplo.com.br/';
  let r = await chama('p1', tok(COACH)); assert.equal(r.status, 200); assert.equal(r.json.membros, true); assert.ok(/^https:\/\/membros\.exemplo\.com\.br\/p\/\?p=p1#previa=p1\.p1\.\d+\.[0-9a-f]{64}$/.test(r.json.url), r.json.url); assert.equal(db.produtoVenda.length, 0, 'não cria venda'); pass('com MEMBROS_URL: link do site de membros com token de prévia, sem criar venda');
  delete process.env.MEMBROS_URL; r = await chama('p1', tok(COACH)); assert.equal(r.status, 400); assert.ok(/MEMBROS_URL/.test(r.json.error) && /Render/.test(r.json.error)); assert.equal(r.json.url, undefined, 'não devolve a página antiga'); assert.equal(db.produtoVenda.length, 0); assert.equal(db.produtoTreinoAcesso.length, 0);
  process.env.MEMBROS_URL = '   '; r = await chama('p1', tok(COACH)); assert.equal(r.status, 400, 'variável em branco conta como não configurada'); pass('sem MEMBROS_URL: aviso claro dizendo o que fazer no Render, em vez de abrir a página antiga');

  // ── acesso ──
  process.env.MEMBROS_URL = 'https://membros.exemplo.com.br'; assert.equal((await chama('p1')).status, 401); assert.equal((await chama('p1', tok('outro-coach'))).status, 403, 'só o dono'); assert.equal((await chama('nao-existe', tok(COACH))).status, 404); pass('acesso: sem login 401, outro coach 403, produto que não existe 404');

  // ── produto só com o programa antigo: página antiga com venda de teste ──
  reset(); db.produtoDigital.push({ id: 'p2', nome: 'Produto Dois', coachId: COACH, treinoAvulsoId: null, membrosAbas: null, treinoPrograma: PROG });
  r = await chama('p2', tok(COACH)); assert.equal(r.status, 200); assert.ok(/^https:\/\/[^/]+\/ProdutoTreino\?token=[0-9a-f]{48}$/.test(r.json.url), r.json.url); assert.equal(db.produtoVenda.length, 1); assert.equal(db.produtoVenda[0].status, 'TESTE');
  const t = r.json.token; const r2 = await chama('p2', tok(COACH)); assert.equal(r2.json.token, t, 'o mesmo link nas próximas vezes'); assert.equal(db.produtoVenda.length, 1);
  let g = await get(t); assert.equal(g.status, 200, 'a página antiga abre com a venda de teste'); assert.equal(g.json.produtoNome, 'Produto Dois'); assert.equal(g.json.nomeCliente, 'Pré-visualização'); assert.equal((await post(t)).status, 200, 'e salva o progresso'); pass('programa antigo: a página abre (venda TESTE vale) e o link é sempre o mesmo');
  for (const st of ['PENDENTE', 'REEMBOLSADO', 'CHARGEBACK', 'CANCELADO', 'pago', '']) { db.produtoVenda[0].status = st; assert.equal((await get(t)).status, 404, st); assert.equal((await post(t)).status, 404, st); }
  db.produtoVenda[0].status = 'PAGO'; assert.equal((await get(t)).status, 200); assert.equal((await get('inexistente')).status, 404); pass('só PAGO e TESTE abrem; reembolso, chargeback, pendente e token que não existe continuam bloqueados');

  // ── nada configurado ──
  reset(); db.produtoDigital.push({ id: 'p3', coachId: COACH, treinoAvulsoId: null, membrosAbas: null, treinoPrograma: null }); r = await chama('p3', tok(COACH)); assert.equal(r.status, 400); assert.ok(/Ligue um treino/.test(r.json.error)); pass('produto sem treino nem abas: pede para ligar um treino');
  realLog('\nTUDO OK: ' + ok + ' verificações');
})().catch((e) => { realLog('FALHOU: ' + (e && e.stack || e)); process.exit(1); });
