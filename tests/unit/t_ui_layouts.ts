// "Personalizar o app" (20 out 2026): cada coach guarda o desenho (A, B ou C) de cada tela; só os próprios; só telas e letras válidas; tabela ausente não derruba nada.
import assert from 'assert';
import jwt from 'jsonwebtoken';
import prisma from '@/lib/prisma';
import { GET, PUT } from '/home/user/fitos-final/app/api/coach/ui-layouts/route';
import { UI_SCREENS, sanitizeLayouts, isUiScreen, isUiVariant } from '/home/user/fitos-final/lib/uiLayouts';
import { PAULO_ID } from '/home/user/fitos-final/lib/masterIds';

const P = prisma as any; const S = P.__state;
const SECRET = 'dev-only-troque-isso-configurando-JWT_SECRET-no-env';
const tok = (id: string, role = 'COACH') => jwt.sign({ id, role, coachId: null }, SECRET);
const call = async (fn: any, as: string | null, body?: any) => {
  const headers: any = { 'content-type': 'application/json' }; if (as) headers.authorization = 'Bearer ' + as;
  const r = await fn(new Request('http://x/api/coach/ui-layouts', { method: body === undefined ? 'GET' : 'PUT', headers, ...(body === undefined ? {} : { body: typeof body === 'string' ? body : JSON.stringify(body) }) }));
  return { status: r.status, json: await r.json().catch(() => null) };
};
let fails = 0, ok = 0;
const t = async (name: string, fn: () => Promise<void> | void) => { P.__reset(); try { await fn(); ok++; console.log('  ok  ' + name); } catch (e: any) { fails++; console.log('  FALHOU  ' + name + '\n' + (e?.stack || e)); } };
const u = (id: string, role: string, extra: any = {}) => S.user.push({ id, role, name: id, accountStatus: 'ACTIVE', active: true, coachBillingStatus: 'ACTIVE', coachId: null, ...extra });

(async () => {
  await t('lista de telas: sem as telas do aluno nem montar treino/dieta; validadores e limpeza de dados vindos de fora', () => {
    assert.ok(UI_SCREENS.includes('alunos' as any) && UI_SCREENS.includes('ficha' as any) && UI_SCREENS.includes('formularios' as any));
    for (const banned of ['montarTreino', 'montarDieta', 'home', 'treino', 'dieta', 'perfil', 'aluno']) assert.ok(!(UI_SCREENS as readonly string[]).includes(banned), banned + ' não é personalizável');
    assert.ok(isUiScreen('alunos') && !isUiScreen('xx') && !isUiScreen(undefined)); assert.ok(isUiVariant('A') && isUiVariant('C') && isUiVariant('D') && !isUiVariant('E') && !isUiVariant('a') && !isUiVariant(1));
    assert.deepStrictEqual(sanitizeLayouts({ alunos: 'B', ficha: 'Z', inventada: 'A', feed: 'C' }), { alunos: 'B', feed: 'C' });
    assert.deepStrictEqual(sanitizeLayouts({ alunos: 'D', ficha: 'E' }), { alunos: 'D' }, 'o quarto desenho (D) vale; a letra seguinte não');
    assert.ok(UI_SCREENS.includes('painel' as any) && isUiScreen('painel') && !isUiScreen('home'), 'tela inicial do painel (A = abas em cima, D = painel)'); assert.deepStrictEqual(sanitizeLayouts({ painel: 'D', home: 'D' }), { painel: 'D' });
    assert.ok(UI_SCREENS.includes('modo' as any) && isUiScreen('modo'), 'chave geral do Modo Bento'); assert.deepStrictEqual(sanitizeLayouts({ modo: 'D', alunos: 'A' }), { modo: 'D', alunos: 'A' }); assert.deepStrictEqual(sanitizeLayouts({ modo: 'Z' }), {});
    assert.deepStrictEqual(sanitizeLayouts(null), {}); assert.deepStrictEqual(sanitizeLayouts('x'), {}); assert.deepStrictEqual(sanitizeLayouts(['A']), {}); assert.deepStrictEqual(sanitizeLayouts({ __proto__: { alunos: 'B' } }), {});
  });

  await t('só coach ativo: sem login 401; aluno 403; coach pendente 403; coach ativo e master passam', async () => {
    u('co', 'COACH'); u('st', 'USER'); u('pend', 'COACH', { accountStatus: 'PENDING_APPROVAL' }); u(PAULO_ID, 'ADMIN');
    assert.strictEqual((await call(GET, null)).status, 401); assert.strictEqual((await call(PUT, null, { screen: 'alunos', variant: 'B' })).status, 401);
    for (const fn of [GET, PUT]) { const r = await call(fn, tok('st', 'USER'), fn === PUT ? { screen: 'alunos', variant: 'B' } : undefined); assert.strictEqual(r.status, 403, 'aluno'); assert.strictEqual(r.json.code, 'COACH_ONLY'); }
    assert.strictEqual((await call(PUT, tok('pend'), { screen: 'alunos', variant: 'B' })).status, 403);
    assert.strictEqual((await call(GET, tok('co'))).status, 200); assert.strictEqual((await call(GET, tok(PAULO_ID, 'ADMIN'))).status, 200);
  });

  await t('sem escolha: vazio (o app usa o desenho A, o de sempre); escolher uma tela salva e as outras ficam como estavam', async () => {
    u('co', 'COACH');
    assert.deepStrictEqual((await call(GET, tok('co'))).json, { layouts: {} });
    let r = await call(PUT, tok('co'), { screen: 'alunos', variant: 'B' }); assert.strictEqual(r.status, 200); assert.deepStrictEqual(r.json.layouts, { alunos: 'B' });
    r = await call(PUT, tok('co'), { screen: 'ficha', variant: 'C' }); assert.deepStrictEqual(r.json.layouts, { alunos: 'B', ficha: 'C' });
    r = await call(PUT, tok('co'), { screen: 'alunos', variant: 'A' }); assert.deepStrictEqual(r.json.layouts, { alunos: 'A', ficha: 'C' }, 'voltar ao A é uma escolha como outra');
    assert.deepStrictEqual((await call(GET, tok('co'))).json.layouts, { alunos: 'A', ficha: 'C' });
    assert.strictEqual(S.coachUiLayout.length, 1, 'uma linha por coach');
  });

  await t('cada coach só vê e muda o seu (o id vem do login, não do corpo)', async () => {
    u('c1', 'COACH'); u('c2', 'COACH');
    await call(PUT, tok('c1'), { screen: 'alunos', variant: 'B' });
    const r = await call(PUT, tok('c2'), { screen: 'alunos', variant: 'C', coachId: 'c1' } as any); assert.deepStrictEqual(r.json.layouts, { alunos: 'C' });
    assert.deepStrictEqual((await call(GET, tok('c1'))).json.layouts, { alunos: 'B' }, 'o c1 continua com a dele');
    assert.deepStrictEqual((await call(GET, tok('c2'))).json.layouts, { alunos: 'C' });
  });

  await t('dado antigo ou sujo no banco nunca chega ao app: o GET devolve só tela e letra válidas', async () => {
    u('co', 'COACH'); S.coachUiLayout.push({ coachId: 'co', layouts: { alunos: 'B', antiga: 'A', ficha: 'Z', feed: 'C' }, updatedAt: new Date() });
    assert.deepStrictEqual((await call(GET, tok('co'))).json.layouts, { alunos: 'B', feed: 'C' });
  });

  await t('entradas inválidas: tela ou letra que não existe, corpo vazio ou torto dão 400 e não gravam nada', async () => {
    u('co', 'COACH');
    for (const body of [{ screen: 'montarDieta', variant: 'B' }, { screen: 'alunos', variant: 'E' }, { screen: 'alunos' }, { variant: 'B' }, {}, { layouts: { inventada: 'B' } }, 'não é json']) {
      const r = await call(PUT, tok('co'), body as any); assert.strictEqual(r.status, 400, JSON.stringify(body));
    }
    assert.strictEqual(S.coachUiLayout.length, 0);
  });

  await t('várias de uma vez (o app manda o que tinha só no aparelho): grava as válidas e ignora o resto', async () => {
    u('co', 'COACH'); await call(PUT, tok('co'), { screen: 'feed', variant: 'B' });
    const r = await call(PUT, tok('co'), { layouts: { alunos: 'C', ficha: 'B', inventada: 'A', vendas: 'Z' } }); assert.strictEqual(r.status, 200);
    assert.deepStrictEqual(r.json.layouts, { feed: 'B', alunos: 'C', ficha: 'B' });
  });

  await t('tabela ainda não criada no banco: GET responde vazio com "unavailable" (nada quebra), PUT responde 503 explicando', async () => {
    u('co', 'COACH'); S.failOn.coachUiLayout = { code: 'P2021', message: 'The table `public.CoachUiLayout` does not exist in the current database.' };
    const g = await call(GET, tok('co')); assert.strictEqual(g.status, 200); assert.deepStrictEqual(g.json, { layouts: {}, unavailable: true });
    const p = await call(PUT, tok('co'), { screen: 'alunos', variant: 'B' }); assert.strictEqual(p.status, 503); assert.strictEqual(p.json.unavailable, true); assert.match(p.json.error, /prisma db push/);
    S.failOn.coachUiLayout = { code: 'XX', message: 'outro erro' };
    assert.strictEqual((await call(GET, tok('co'))).status, 500, 'erro de verdade continua erro');
    delete S.failOn.coachUiLayout;
  });

  console.log(`\n${ok} de ${ok + fails} testes passaram`); if (fails) process.exit(1);
})();
