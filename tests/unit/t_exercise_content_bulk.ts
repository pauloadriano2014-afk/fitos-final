import assert from 'assert';
import jwt from 'jsonwebtoken';
import prisma from '@/lib/prisma';
import { POST as contentPOST } from '/home/user/wt-back/app/api/admin/bulk-update-exercise-content/route';
import { PAULO_ID, ADRI_ID } from '/home/user/wt-back/lib/masterIds';

const P = prisma as any; const S = P.__state;
const SECRET = 'dev-only-troque-isso-configurando-JWT_SECRET-no-env';
const tok = (id: string, role = 'COACH') => jwt.sign({ id, role, coachId: null }, SECRET);
const MASTER = tok(PAULO_ID, 'ADMIN');
const call = async (as: string | null, o: any) => { const h: any = { 'content-type': 'application/json' }; if (as) h.authorization = 'Bearer ' + as; const r = await contentPOST(new Request('http://x/api/admin/bulk-update-exercise-content', { method: 'POST', headers: h, body: JSON.stringify(o) })); return { status: r.status, json: await r.json().catch(() => null) }; };
const ex = (id: string, name: string, o: any = {}) => ({ id, name, category: 'Pernas', subCategory: 'Geral', coachId: PAULO_ID, videoUrl: 'v', defaultSubstitutes: [], tags: {}, howToExecute: null, commonMistakes: null, maleFocus: null, femaleFocus: null, ...o });
const row = (id: string) => S.exercise.find((e: any) => e.id === id);
const seed = () => {
  P.__reset();
  S.user.push({ id: PAULO_ID, role: 'ADMIN', email: 'paulo@x.com', accountStatus: 'ACTIVE' }, { id: ADRI_ID, role: 'ADMIN', email: 'adri.personal@hotmail.com', accountStatus: 'ACTIVE' }, { id: 'c1', role: 'COACH', email: 'c1@x.com', accountStatus: 'ACTIVE' });
  S.exercise.push(
    ex('a1', 'Agachamento Livre'), ex('a2', 'Agachamento Livre', { coachId: ADRI_ID }),
    ex('sp', 'Búlgaro Tronco Inclinado ', {}), ex('dbl', 'Elevação  Pélvica', { howToExecute: 'Texto do coach' }),
    ex('half', 'Stiff c/barra', { howToExecute: 'Já escrito', commonMistakes: '' }), ex('other', 'Supino reto', { category: 'Peito' }),
  );
};
let ok = 0, bad = 0;
const t = async (name: string, fn: () => any) => { try { seed(); await fn(); ok++; console.log('  ok  ' + name); } catch (e: any) { bad++; console.log('FALHOU ' + name + '\n   ' + (e.stack || e)); } };

(async () => {
  await t('só o time master aplica; sem lista é 400', async () => {
    assert.ok([401, 403].includes((await call(null, { items: [{ name: 'x', howToExecute: 'y' }] })).status));
    assert.ok([401, 403].includes((await call(tok('c1'), { items: [{ name: 'x', howToExecute: 'y' }] })).status));
    assert.equal((await call(MASTER, { items: [] })).status, 400);
  });
  await t('o mesmo exercício de dois coaches recebe o mesmo texto; o resto não muda', async () => {
    const r = await call(MASTER, { items: [{ name: 'Agachamento Livre', howToExecute: 'Desça até 90°', commonMistakes: 'Joelho para dentro' }] }); assert.equal(r.status, 200);
    assert.equal(r.json.totalUpdated, 2); assert.equal(row('a1').howToExecute, 'Desça até 90°'); assert.equal(row('a2').commonMistakes, 'Joelho para dentro'); assert.equal(row('other').howToExecute, null);
  });
  await t('nome bate sem diferenciar maiúsculas, acentos e espaços sobrando (nome do banco com espaço no fim, espaço duplo)', async () => {
    const r = await call(MASTER, { items: [{ name: 'bulgaro tronco inclinado', howToExecute: 'A' }, { name: 'ELEVAÇÃO PÉLVICA', maleFocus: 'M' }] });
    assert.equal(r.json.totalUpdated, 2, JSON.stringify(r.json)); assert.equal(row('sp').howToExecute, 'A'); assert.equal(row('dbl').maleFocus, 'M'); assert.equal(row('dbl').howToExecute, 'Texto do coach', 'campo não enviado não é tocado');
  });
  await t('onlyEmpty: preenche só o que está vazio, nunca sobrescreve o que o coach escreveu; sem onlyEmpty sobrescreve', async () => {
    let r = await call(MASTER, { onlyEmpty: true, items: [{ name: 'Elevação Pélvica', howToExecute: 'NOVO', commonMistakes: 'Erro novo' }, { name: 'Stiff c/barra', howToExecute: 'NOVO', commonMistakes: 'Erro' }] });
    assert.equal(row('dbl').howToExecute, 'Texto do coach'); assert.equal(row('dbl').commonMistakes, 'Erro novo', 'o vazio é preenchido');
    assert.equal(row('half').howToExecute, 'Já escrito'); assert.equal(row('half').commonMistakes, 'Erro', 'string vazia conta como vazio');
    r = await call(MASTER, { onlyEmpty: true, items: [{ name: 'Stiff c/barra', howToExecute: 'OUTRO', commonMistakes: 'OUTRO' }] }); assert.equal(r.json.totalUpdated, 0); assert.equal(r.json.notFoundCount, 0, 'já preenchido não é "não encontrado"'); assert.equal(r.json.alreadyFilledCount, 1);
    await call(MASTER, { items: [{ name: 'Stiff c/barra', howToExecute: 'SOBRESCRITO' }] }); assert.equal(row('half').howToExecute, 'SOBRESCRITO');
  });
  await t('relatório: nome inexistente conta como não encontrado; item sem texto dá erro e não grava', async () => {
    const r = await call(MASTER, { items: [{ name: 'Não existe', howToExecute: 'x' }, { name: 'Agachamento Livre' }, { howToExecute: 'sem nome' }] });
    assert.equal(r.json.notFoundCount, 1); assert.equal(r.json.totalUpdated, 0); assert.ok(r.json.results[1].error && r.json.results[2].error); assert.equal(row('a1').howToExecute, null);
  });
  console.log(`\n${ok} ok, ${bad} falhas`); process.exit(bad ? 1 : 0);
})();
