import assert from 'assert';
import jwt from 'jsonwebtoken';
import prisma from '@/lib/prisma';
import { GET, POST } from '/home/user/fitos-final/app/api/contents/route';
import { PATCH } from '/home/user/fitos-final/app/api/contents/[id]/route';
import { parseAudience, audienceToString, studentCanSee, studentTabFlags } from '/home/user/fitos-final/lib/contentAudience';
import { PAULO_ID } from '/home/user/fitos-final/lib/masterIds';
const P = prisma as any; const S = P.__state; const G: any = globalThis;
const SECRET = 'dev-only-troque-isso-configurando-JWT_SECRET-no-env';
const tok = (id: string, role = 'USER', coachId: string | null = null) => jwt.sign({ id, role, coachId }, SECRET);
const realLog = (s: string) => process.stdout.write(s + '\n');
console.log = () => {}; console.error = () => {}; console.warn = () => {};
let n = 0, bad = 0;
const t = async (name: string, fn: () => any) => { P.__reset(); G.__broadcasts = []; try { await fn(); n++; realLog('  ok  ' + name); } catch (e: any) { bad++; realLog('FALHOU ' + name + '\n   ' + (e.stack || e)); } };

// alunos de cenários diferentes (o que o cadastro do coach define)
const U = (id: string, extra: any) => S.user.push({ id, role: 'USER', name: id, coachId: null, nutritionistId: null, plan: 'PREMIUM', dietModule: false, studentModules: 'TREINO', ...extra });
const C = (id: string, extra: any = {}) => S.user.push({ id, role: 'COACH', name: id, coachPlan: 'ELITE', accountStatus: 'ACTIVE', coachBillingStatus: 'ACTIVE', ...extra });
const V = (title: string, audience: string | null, coachId: string | null = null) => S.content.push({ id: 'c_' + title, title, category: 'COMO USAR O APP', audience, coachId });
const titles = async (userId: string, role = 'USER', q = '') => { const r: any = await GET(new Request('http://x/api/contents?userId=' + userId + q, { headers: { Authorization: 'Bearer ' + tok(userId, role) } })); assert.equal(r.status, 200); return (await r.json()).map((c: any) => c.title).sort(); };
const seed = () => { V('Todos', null); V('Treino', 'TREINO'); V('Dieta', 'DIETA'); V('Ambos', 'TREINO,DIETA'); V('Completo', 'PREMIUM'); V('Exames', 'EXAMES'); };

(async () => {
  await t('marcas: aceita texto ou lista, ignora lixo e repetição, grava em ordem fixa; vazio vira null (= todos)', () => {
    assert.deepEqual(parseAudience('dieta, TREINO ,xx,treino'), ['TREINO', 'DIETA']);
    assert.deepEqual(parseAudience(['EXAMES', 'premium']), ['PREMIUM', 'EXAMES']);
    assert.deepEqual(parseAudience(null), []); assert.deepEqual(parseAudience(''), []); assert.deepEqual(parseAudience(42), []);
    assert.equal(audienceToString(parseAudience('DIETA,TREINO')), 'TREINO,DIETA'); assert.equal(audienceToString([]), null);
  });
  await t('aluno do Paulo/Adri sem dieta: vê Todos, Treino e Completo; NÃO vê Dieta, Ambos nem Exames', async () => {
    seed(); U('a1', { coachId: PAULO_ID, dietModule: false });
    assert.deepEqual(await titles('a1'), ['Completo', 'Todos', 'Treino']);
  });
  await t('aluno do Paulo com dieta ligada (ou plano ELITE): vê Dieta e Ambos', async () => {
    seed(); U('a1', { coachId: PAULO_ID, dietModule: true }); U('a2', { coachId: PAULO_ID, plan: 'ELITE' }); U('a3', { coachId: PAULO_ID, plan: 'VIP' });
    for (const id of ['a1', 'a2', 'a3']) assert.deepEqual(await titles(id), ['Ambos', 'Completo', 'Dieta', 'Todos', 'Treino'], id);
  });
  await t('coach parceiro PERSONAL: aluno só tem treino (nunca vê Dieta/Ambos); coach NUTRI: só dieta (nunca vê Treino/Ambos)', async () => {
    seed(); C('cp', { coachPlan: 'PERSONAL' }); C('cn', { coachPlan: 'NUTRICIONISTA' });
    U('p1', { coachId: 'cp', studentModules: 'AMBOS' }); U('n1', { coachId: 'cn', studentModules: 'TREINO' });
    S.content.forEach((c: any) => { c.coachId = null; });   // o conteúdo é dos coaches: copia para cada pool
    S.content.splice(0, S.content.length); ['cp', 'cn'].forEach((cid) => { V('Todos', null, cid); V('Treino', 'TREINO', cid); V('Dieta', 'DIETA', cid); V('Ambos', 'TREINO,DIETA', cid); });
    assert.deepEqual(await titles('p1'), ['Todos', 'Treino']);
    assert.deepEqual(await titles('n1'), ['Dieta', 'Todos']);
  });
  await t('coach parceiro ELITE: vale a escolha do cadastro do aluno (TREINO / DIETA / AMBOS)', async () => {
    C('ce', { coachPlan: 'ELITE' }); ['Todos:', 'Treino:TREINO', 'Dieta:DIETA', 'Ambos:TREINO,DIETA'].forEach((s) => { const [a, b] = s.split(':'); V(a, b || null, 'ce'); });
    U('e1', { coachId: 'ce', studentModules: 'TREINO' }); U('e2', { coachId: 'ce', studentModules: 'DIETA' }); U('e3', { coachId: 'ce', studentModules: 'AMBOS' });
    assert.deepEqual(await titles('e1'), ['Todos', 'Treino']); assert.deepEqual(await titles('e2'), ['Dieta', 'Todos']); assert.deepEqual(await titles('e3'), ['Ambos', 'Dieta', 'Todos', 'Treino']);
  });
  await t('plano completo: LOW_COST, CHALLENGE_21 e FICHA_8S não veem "Completo"; plano vazio conta como completo', async () => {
    seed(); ['LOW_COST', 'CHALLENGE_21', 'FICHA_8S'].forEach((p, i) => U('l' + i, { coachId: PAULO_ID, plan: p })); U('l9', { coachId: PAULO_ID, plan: null });
    for (const id of ['l0', 'l1', 'l2']) assert.ok(!(await titles(id)).includes('Completo'), id);
    assert.ok((await titles('l9')).includes('Completo'));
  });
  await t('exames: só vê quem tem personal/nutri com o recurso ligado (chave por coach ou conta master)', async () => {
    seed(); S.user.push({ id: PAULO_ID, role: 'COACH', name: 'Paulo' }); C('cx', { coachPlan: 'PERSONAL' }); S.content.forEach((c: any) => { c.coachId = null; });
    U('x1', { coachId: PAULO_ID }); U('x2', { coachId: 'cx' });
    assert.ok((await titles('x1')).includes('Exames'), 'coach master tem exames');
    // aluno do coach parceiro sem a chave: nem o conteúdo é dele (pool do coach) -> cria no pool do coach
    V('ExamesCx', 'EXAMES', 'cx'); assert.ok(!(await titles('x2')).includes('ExamesCx'), 'sem a chave: não vê');
    S.coachFeature.push({ id: 'f1', coachId: 'cx', feature: 'exames', reason: 'MANUAL', grantedAt: new Date(), revokedAt: null });
    assert.ok((await titles('x2')).includes('ExamesCx'), 'com a chave: vê');
  });
  await t('coach e master veem TUDO (para gerenciar), com o campo audience na resposta', async () => {
    seed(); C('cc'); const r: any = await GET(new Request('http://x/api/contents?adminId=' + PAULO_ID, { headers: { Authorization: 'Bearer ' + tok(PAULO_ID, 'COACH') } }));
    const j = await r.json(); assert.equal(j.length, 6); assert.equal(j.find((c: any) => c.title === 'Ambos').audience, 'TREINO,DIETA');
  });
  await t('qualquer jeito de ler vale para o aluno: com adminId, global e format=grouped também filtram', async () => {
    seed(); U('a1', { coachId: PAULO_ID, dietModule: false });
    const h = { headers: { Authorization: 'Bearer ' + tok('a1', 'USER', PAULO_ID) } };
    const real = P.content.findMany.bind(P.content); S.override.content = { findMany: async (a: any) => (await real(a)).map((c: any) => ({ ...c, _count: { likes: 0, comments: 0 } })) };   // o mock não faz include
    let r: any = await GET(new Request('http://x/api/contents?adminId=' + PAULO_ID + '&global=true', h)); assert.ok(!(await r.json()).some((c: any) => c.title === 'Dieta'));
    r = await GET(new Request('http://x/api/contents?userId=a1&format=grouped', h)); const g = await r.json(); assert.ok(!g.flatMap((x: any) => x.videos).some((c: any) => c.title === 'Dieta'));
    assert.ok(g.flatMap((x: any) => x.videos).some((c: any) => c.title === 'Treino'));
  });
  await t('conteúdo antigo (sem audience) continua igual para todos; sem login 401', async () => {
    V('Velho', null); U('a1', { coachId: PAULO_ID }); assert.deepEqual(await titles('a1'), ['Velho']);
    const r: any = await GET(new Request('http://x/api/contents?userId=a1')); assert.equal(r.status, 401);
  });
  await t('criar: grava as marcas normalizadas; sem marcas = todos (null)', async () => {
    C('cc'); const post = async (b: any) => { const r: any = await POST(new Request('http://x/api/contents', { method: 'POST', headers: { Authorization: 'Bearer ' + tok('cc', 'COACH'), 'Content-Type': 'application/json' }, body: JSON.stringify({ title: 'X', category: 'GERAL', adminId: 'cc', ...b }) })); return r.json(); };
    assert.equal((await post({ audience: ['dieta', 'treino', 'lixo'] })).audience, 'TREINO,DIETA');
    assert.equal((await post({ audience: [] })).audience, null); assert.equal((await post({})).audience, null);
  });
  await t('aviso em massa: sai como sempre; NÃO sai quando o coach desliga o aviso nem quando o vídeo é só para um grupo', async () => {
    C('cc'); const post = async (b: any) => { const r: any = await POST(new Request('http://x/api/contents', { method: 'POST', headers: { Authorization: 'Bearer ' + tok('cc', 'COACH'), 'Content-Type': 'application/json' }, body: JSON.stringify({ title: 'X', category: 'GERAL', adminId: 'cc', ...b }) })); await r.json(); };
    await post({}); assert.equal(G.__broadcasts.length, 1, 'comum: avisa todo mundo');
    await post({ notify: false }); assert.equal(G.__broadcasts.length, 1, 'aviso desligado');
    await post({ audience: ['DIETA'] }); assert.equal(G.__broadcasts.length, 1, 'só para um grupo: sem aviso em massa');
    await post({ notify: true }); assert.equal(G.__broadcasts.length, 2);
  });
  await t('editar: troca as marcas; limpar (lista vazia) volta para todos; sem o campo (app antigo) mantém', async () => {
    C('cc'); V('V1', 'DIETA', 'cc'); const patch = async (b: any) => { const r: any = await PATCH(new Request('http://x/api/contents/c_V1', { method: 'PATCH', headers: { Authorization: 'Bearer ' + tok('cc', 'COACH'), 'Content-Type': 'application/json' }, body: JSON.stringify({ title: 'V1', category: 'COMO USAR O APP', type: 'video', ...b }) }), { params: { id: 'c_V1' } } as any); assert.equal(r.status, 200); return S.content.find((c: any) => c.id === 'c_V1').audience; };
    assert.equal(await patch({}), 'DIETA', 'app antigo não apaga'); assert.equal(await patch({ audience: ['TREINO', 'PREMIUM'] }), 'TREINO,PREMIUM'); assert.equal(await patch({ audience: [] }), null);
  });
  await t('marcas novas: relatório do mês (liberado por aluno), sugestão de carga (ligada por padrão), só alunos do time master', async () => {
    C('cp', { coachPlan: 'PERSONAL' });
    V('Rel', 'RELATORIO'); V('Carga', 'CARGA'); V('SoMaster', 'MASTER');
    U('m1', { coachId: PAULO_ID, monthlyReportOn: true }); U('m2', { coachId: PAULO_ID, loadSuggestOff: true }); U('m3', { coachId: null });
    assert.deepEqual(await titles('m1'), ['Carga', 'Rel', 'SoMaster']); assert.deepEqual(await titles('m2'), ['SoMaster']); assert.deepEqual(await titles('m3'), ['Carga', 'SoMaster']);
    assert.equal(studentCanSee(['MASTER'], { coachId: 'cp' }, 'PERSONAL', {}), false, 'aluno de coach parceiro não é do time master'); assert.equal(studentCanSee(['MASTER'], { coachId: 'cp', nutritionistId: PAULO_ID }, 'PERSONAL', {}), true, 'nutri do time master conta');
  });
  await t('vídeo de execução: vê quem tem coach com o recurso ligado (concessão, chave geral ou master); sem coach = master', async () => {
    S.user.push({ id: PAULO_ID, role: 'COACH', name: 'Paulo' }); C('c1'); C('c2');
    S.coachFeature.push({ id: 'f1', coachId: 'c1', feature: 'execVideo', reason: 'MANUAL', grantedAt: new Date(), revokedAt: null });
    ['c1', 'c2', PAULO_ID].forEach((pool, i) => S.content.push({ id: 'ex' + i, title: 'Exec', category: 'X', audience: 'EXEC_VIDEO', coachId: pool })); U('s1', { coachId: 'c1' }); U('s2', { coachId: 'c2' }); U('s3', { coachId: PAULO_ID }); U('s4', { coachId: null });
    assert.deepEqual(await titles('s1'), ['Exec']); assert.deepEqual(await titles('s2'), [], 'coach sem o recurso'); assert.deepEqual(await titles('s3'), ['Exec']); assert.deepEqual(await titles('s4'), ['Exec']);
  });
  await t('PARA TODOS OS COACHES: aluno de coach parceiro recebe o que o master marcou "shared", ainda filtrado pelo QUEM VÊ; o que não foi marcado do master não vaza', async () => {
    S.user.push({ id: PAULO_ID, role: 'COACH', name: 'Paulo' }); C('cp', { coachPlan: 'PERSONAL' }); C('cx', { coachPlan: 'ELITE' });
    S.content.push({ id: 'g1', title: 'GeralMaster', category: 'COMO USAR O APP', audience: null, coachId: PAULO_ID, shared: true });
    S.content.push({ id: 'g2', title: 'DietaMaster', category: 'COMO USAR O APP', audience: 'DIETA', coachId: PAULO_ID, shared: true });
    S.content.push({ id: 'g3', title: 'TreinoMaster', category: 'COMO USAR O APP', audience: 'TREINO', coachId: PAULO_ID, shared: true });
    S.content.push({ id: 'g4', title: 'SoDoMaster', category: 'X', audience: null, coachId: PAULO_ID, shared: false });
    S.content.push({ id: 'g5', title: 'DoOutroCoach', category: 'X', audience: null, coachId: 'cx', shared: true });   // coach parceiro não consegue compartilhar (a rota ignora), mas mesmo que viesse marcado, não é do master
    S.content.push({ id: 'g6', title: 'Meu', category: 'X', audience: null, coachId: 'cp', shared: false });
    U('p1', { coachId: 'cp' });
    assert.deepEqual(await titles('p1'), ['GeralMaster', 'Meu', 'TreinoMaster'], 'personal puro: só treino, sem dieta, e sem o que é de outro coach');
  });
  await t('só o master compartilha: coach parceiro marcando "shared" na criação ou na edição é ignorado; master consegue', async () => {
    C('cc'); S.user.push({ id: PAULO_ID, role: 'COACH', name: 'Paulo' });
    const post = async (as: string, b: any) => { const r: any = await POST(new Request('http://x/api/contents', { method: 'POST', headers: { Authorization: 'Bearer ' + tok(as, 'COACH'), 'Content-Type': 'application/json' }, body: JSON.stringify({ title: 'X', category: 'GERAL', adminId: as, shared: true, ...b }) })); return r.json(); };
    assert.equal((await post('cc', {})).shared, false); assert.equal((await post(PAULO_ID, {})).shared, true); assert.equal((await post(PAULO_ID, { shared: false })).shared, false);
    V('V2', null, 'cc'); const patch = async (as: string, b: any) => { const r: any = await PATCH(new Request('http://x/api/contents/c_V2', { method: 'PATCH', headers: { Authorization: 'Bearer ' + tok(as, 'COACH'), 'Content-Type': 'application/json' }, body: JSON.stringify({ title: 'V2', category: 'G', type: 'video', ...b }) }), { params: { id: 'c_V2' } } as any); assert.equal(r.status, 200); return S.content.find((c: any) => c.id === 'c_V2').shared; };
    assert.notEqual(await patch('cc', { shared: true }), true, 'coach parceiro não consegue'); assert.equal(await patch(PAULO_ID, { shared: true }), true); assert.equal(await patch(PAULO_ID, {}), true, 'sem o campo mantém');
  });
  realLog(`\n${n} ok, ${bad} falhas`); process.exit(bad ? 1 : 0);
})();
