import assert from 'assert';
import fs from 'fs';
import { GET as myGet, POST as myPost, DELETE as myDel } from '/home/user/wt-back/app/api/android-tester/route';
import { GET as adminGet, PATCH as adminPatch } from '/home/user/wt-back/app/api/admin/android-testers/route';
import { normalizeTesterEmail, testerSummary, TESTER_GOAL } from '/home/user/wt-back/lib/androidTester';
import { state } from './mocks3';

const req = (user: any, body?: any) => ({ __user: user, json: async () => { if (body === 'BAD') throw new Error('x'); return body ?? {}; }, headers: new Map() }) as any;
const U = (id: string, o: any = {}) => ({ id, name: 'Aluno ' + id, email: id + '@x.com', phone: '119' + id, role: 'USER', androidTesterEmail: null, androidTesterAt: null, androidTesterAddedAt: null, ...o });
const seed = (...us: any[]) => { state.users.length = 0; state.users.push(...us); };
let ok = 0, bad = 0;
const t = async (name: string, fn: () => any) => { try { await fn(); ok++; console.log('  ok  ' + name); } catch (e: any) { bad++; console.log('FALHOU ' + name + '\n   ' + (e.stack || e)); } };
const me = (id: string) => ({ id, role: 'USER', coachId: null });
const master = { id: 'master', role: 'COACH', coachId: null };

(async () => {
  await t('e-mail: limpa espaços/maiúsculas e aceita Gmail e outros domínios (só marca se é Google)', () => {
    for (const [raw, email, google] of [['  Ana.Souza@Gmail.COM ', 'ana.souza@gmail.com', true], ['x@googlemail.com', 'x@googlemail.com', true], ['ana@empresa.com.br', 'ana@empresa.com.br', false], ["o'neil+play@gmail.com", "o'neil+play@gmail.com", true]] as any[]) {
      const r: any = normalizeTesterEmail(raw); assert.equal(r.ok, true, raw); assert.equal(r.email, email); assert.equal(r.google, google, raw);
    }
  });
  await t('e-mail: recusa o que não é e-mail (vazio, sem @, sem domínio, espaço no meio, pontos seguidos, grande demais, não-texto)', () => {
    for (const bad of ['', '   ', 'ana', 'ana@', '@gmail.com', 'ana@gmail', 'ana@@gmail.com', 'an a@gmail.com', 'ana..x@gmail.com', 'ana@gmail..com', '.ana@gmail.com', 'ana@-gmail.com', 'a'.repeat(65) + '@gmail.com', 'a@' + 'b'.repeat(250) + '.com', null, undefined, 12, {}, ['a@b.com']]) {
      assert.equal((normalizeTesterEmail(bad) as any).ok, false, String(bad).slice(0, 30));
    }
    assert.ok((normalizeTesterEmail('ana') as any).error.includes('não parece válido')); assert.ok((normalizeTesterEmail('') as any).error.includes('Informe'));
  });
  await t('resumo: pessoas, e-mails diferentes, quantos já estão na Play, pendentes e quanto falta para 12', () => {
    assert.equal(TESTER_GOAL, 12);
    const rows: any[] = [{ androidTesterEmail: 'a@gmail.com', androidTesterAddedAt: new Date() }, { androidTesterEmail: 'A@gmail.com', androidTesterAddedAt: null }, { androidTesterEmail: 'b@gmail.com', androidTesterAddedAt: null }, { androidTesterEmail: null, androidTesterAddedAt: null }];
    assert.deepEqual(testerSummary(rows), { goal: 12, people: 3, unique: 2, added: 1, pending: 1, missing: 10 }, 'a@ e A@ são o mesmo e-mail; ele já está na Play');
    assert.deepEqual(testerSummary([]), { goal: 12, people: 0, unique: 0, added: 0, pending: 0, missing: 12 }); assert.equal(testerSummary(Array.from({ length: 15 }, (_, i) => ({ androidTesterEmail: `u${i}@g.com`, androidTesterAddedAt: null })) as any).missing, 0, 'passou da meta: falta 0');
  });
  await t('aluno: precisa estar logado em todas as rotas', async () => {
    seed(U('a')); for (const f of [myGet, myPost, myDel]) { const r: any = await f(req(null, { email: 'a@gmail.com' })); assert.equal(r.status, 401); }
    assert.equal(state.users[0].androidTesterEmail, null);
  });
  await t('aluno: deixa o e-mail (normalizado), vê de volta, troca (zera o "já está na Play") e sai da lista', async () => {
    seed(U('a')); let r: any = await myPost(req(me('a'), { email: '  Ana@GMAIL.com ' })); assert.equal(r.status, 200); assert.equal(r.body.email, 'ana@gmail.com'); assert.equal(r.body.google, true); assert.equal(r.body.changed, true);
    assert.equal(state.users[0].androidTesterEmail, 'ana@gmail.com'); assert.ok(state.users[0].androidTesterAt instanceof Date);
    r = await myGet(req(me('a'))); assert.equal(r.body.email, 'ana@gmail.com'); assert.ok(r.body.at);
    state.users[0].androidTesterAddedAt = new Date('2026-10-18'); const at1 = state.users[0].androidTesterAt;
    r = await myPost(req(me('a'), { email: 'ana@gmail.com' })); assert.equal(r.body.changed, false); assert.ok(state.users[0].androidTesterAddedAt, 'mesmo e-mail: continua marcado'); assert.equal(state.users[0].androidTesterAt, at1, 'e a data não muda');
    r = await myPost(req(me('a'), { email: 'outro@gmail.com' })); assert.equal(r.body.changed, true); assert.equal(state.users[0].androidTesterAddedAt, null, 'trocou o e-mail: o novo ainda não está na Play'); assert.equal(state.users[0].androidTesterEmail, 'outro@gmail.com');
    state.users[0].androidTesterAddedAt = new Date('2026-10-19'); r = await myDel(req(me('a'))); assert.equal(r.status, 200); assert.deepEqual([state.users[0].androidTesterEmail, state.users[0].androidTesterAt, state.users[0].androidTesterAddedAt], [null, null, null]);
    r = await myGet(req(me('a'))); assert.equal(r.body.email, null);
  });
  await t('aluno: e-mail inválido é recusado e nada é gravado; corpo quebrado também; cada um só mexe no próprio cadastro', async () => {
    seed(U('a'), U('b', { androidTesterEmail: 'b@gmail.com', androidTesterAt: new Date() }));
    for (const body of [{ email: 'abc' }, { email: '' }, {}, { email: 123 }, 'BAD']) { const r: any = await myPost(req(me('a'), body as any)); assert.equal(r.status, 400, JSON.stringify(body)); }
    assert.equal(state.users[0].androidTesterEmail, null);
    await myPost(req(me('a'), { email: 'a@gmail.com', userId: 'b', id: 'b' })); assert.equal(state.users[1].androidTesterEmail, 'b@gmail.com', 'não dá para gravar no cadastro de outra pessoa'); assert.equal(state.users[0].androidTesterEmail, 'a@gmail.com');
    await myDel(req(me('a'))); assert.equal(state.users[1].androidTesterEmail, 'b@gmail.com', 'sair da lista só tira a si mesmo');
    const gone: any = await myPost(req(me('zzz'), { email: 'z@gmail.com' })); assert.equal(gone.status, 404);
  });
  await t('relatório do master: só o master vê; lista só quem deixou e-mail, na ordem de chegada, marca repetidos e traz o resumo', async () => {
    seed(U('a', { androidTesterEmail: 'a@gmail.com', androidTesterAt: new Date('2026-10-17T10:00:00Z') }), U('n'), U('b', { androidTesterEmail: 'b@gmail.com', androidTesterAt: new Date('2026-10-17T08:00:00Z'), androidTesterAddedAt: new Date('2026-10-18') }), U('c', { androidTesterEmail: 'A@gmail.com', androidTesterAt: new Date('2026-10-17T12:00:00Z') }));
    for (const u of [null, me('a')]) { const r: any = await adminGet(req(u)); assert.ok([401, 403].includes(r.status)); assert.equal(r.body.items, undefined, 'aluno comum não vê a lista'); }
    const r: any = await adminGet(req(master)); assert.equal(r.status, 200);
    assert.deepEqual(r.body.items.map((i: any) => i.id), ['b', 'a', 'c'], 'quem não deixou e-mail não entra; ordem de chegada'); assert.deepEqual(r.body.items.map((i: any) => i.duplicate), [false, false, true]);
    assert.deepEqual(r.body.items[0], { id: 'b', name: 'Aluno b', accountEmail: 'b@x.com', phone: '119b', testerEmail: 'b@gmail.com', at: new Date('2026-10-17T08:00:00Z'), addedAt: new Date('2026-10-18'), duplicate: false });
    assert.deepEqual(r.body.summary, { goal: 12, people: 3, unique: 2, added: 1, pending: 1, missing: 10 });
  });
  await t('relatório do master: marcar "já está na Play" (todos os novos, ou alguns) e desmarcar', async () => {
    const mk = () => seed(U('a', { androidTesterEmail: 'a@gmail.com', androidTesterAt: new Date() }), U('b', { androidTesterEmail: 'b@gmail.com', androidTesterAt: new Date(), androidTesterAddedAt: new Date('2026-10-01') }), U('n'));
    mk(); for (const u of [null, me('a')]) { const r: any = await adminPatch(req(u, { all: true, added: true })); assert.ok([401, 403].includes(r.status)); } assert.equal(state.users[0].androidTesterAddedAt, null, 'aluno não marca');
    let r: any = await adminPatch(req(master, { all: true, added: true })); assert.equal(r.body.count, 1, 'só o que ainda não estava marcado'); assert.ok(state.users[0].androidTesterAddedAt); assert.equal(+state.users[1].androidTesterAddedAt, +new Date('2026-10-01'), 'quem já estava marcado mantém a data'); assert.equal(state.users[2].androidTesterAddedAt, null, 'quem não deixou e-mail não é marcado');
    mk(); r = await adminPatch(req(master, { userIds: ['a'], added: true })); assert.equal(r.body.count, 1); assert.ok(state.users[0].androidTesterAddedAt); assert.equal(+state.users[1].androidTesterAddedAt, +new Date('2026-10-01'));
    r = await adminPatch(req(master, { userIds: ['a', 'b'], added: false })); assert.equal(r.body.count, 2); assert.equal(state.users[0].androidTesterAddedAt, null); assert.equal(state.users[1].androidTesterAddedAt, null);
    r = await adminPatch(req(master, { userIds: ['n'], added: true })); assert.equal(r.body.count, 0, 'sem e-mail não marca');
    for (const body of [{ all: true }, { added: true }, { added: 'true', all: true }, { userIds: [], added: true }, { userIds: [1], added: true }, {}]) { r = await adminPatch(req(master, body)); assert.equal(r.status, 400, JSON.stringify(body)); }
  });
  await t('o servidor tem as 3 colunas novas (e são opcionais)', () => {
    const s = fs.readFileSync('/home/user/wt-back/prisma/schema/user.prisma', 'utf8');
    for (const c of ['androidTesterEmail   String?', 'androidTesterAt      DateTime?', 'androidTesterAddedAt DateTime?']) assert.ok(s.includes(c), c);
  });
  console.log(`\n${ok} ok, ${bad} falhas`); process.exit(bad ? 1 : 0);
})();
