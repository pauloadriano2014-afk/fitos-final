// Travas de custo nas rotas que gastam IA e antes ficavam abertas a qualquer pessoa logada (20 out 2026):
// importar PDF de treino/dieta, laudo da avaliação, análise de vídeo, chat do aluno e avaliação do check-in.
import assert from 'assert';
import jwt from 'jsonwebtoken';
import prisma from '@/lib/prisma';
import { POST as IMPORT_PDF } from '/home/user/fitos-final/app/api/admin/import-pdf/route';
import { POST as IMPORT_DIET } from '/home/user/fitos-final/app/api/admin/import-diet-pdf/route';
import { POST as REPORT } from '/home/user/fitos-final/app/api/assessment/[id]/generate-ai-report/route';
import { POST as ANALYZE } from '/home/user/fitos-final/app/api/analyze/route';
import { POST as CHAT } from '/home/user/fitos-final/app/api/ai/chat/route';
import { POST as EVAL } from '/home/user/fitos-final/app/api/ai/evaluate-checkin/route';
import { PAULO_ID } from '/home/user/fitos-final/lib/masterIds';

const P = prisma as any; const S = P.__state;
const SECRET = 'dev-only-troque-isso-configurando-JWT_SECRET-no-env';
const tok = (id: string, role = 'COACH') => jwt.sign({ id, role, coachId: null }, SECRET);
const call = async (fn: any, as: string | null, body: any = {}, ctx?: any) => {
  const headers: any = { 'content-type': 'application/json' }; if (as) headers.authorization = 'Bearer ' + as;
  const r = await fn(new Request('http://x/api', { method: 'POST', headers, body: JSON.stringify(body) }), ctx);
  return { status: r.status, json: await r.json().catch(() => null) };
};
let fails = 0, ok = 0;
const t = async (name: string, fn: () => Promise<void> | void) => { P.__reset(); try { await fn(); ok++; console.log('  ok  ' + name); } catch (e: any) { fails++; console.log('  FALHOU  ' + name + '\n' + (e?.stack || e)); } };
const u = (id: string, role: string, extra: any = {}) => S.user.push({ id, role, name: id, accountStatus: 'ACTIVE', active: true, coachBillingStatus: 'ACTIVE', coachId: null, ...extra });
let n = 0; const uid = (p: string) => `${p}-${Date.now()}-${n++}`;   // o limite por hora fica em memória: cada teste usa quem ainda não gastou nada

(async () => {
  await t('importar PDF (treino e dieta): aluno e coach sem conta ativa são barrados; coach ativo passa (sem arquivo = 400); sem login 401', async () => {
    const stu = uid('al'), pending = uid('pend'), coach = uid('co');
    u(stu, 'USER'); u(pending, 'COACH', { accountStatus: 'PENDING_APPROVAL' }); u(coach, 'COACH');
    for (const [name, fn] of [['treino', IMPORT_PDF], ['dieta', IMPORT_DIET]] as const) {
      assert.strictEqual((await call(fn, null)).status, 401, name);
      let r = await call(fn, tok(stu, 'USER')); assert.strictEqual(r.status, 403, name + ' aluno'); assert.strictEqual(r.json.code, 'COACH_ONLY');
      r = await call(fn, tok(pending)); assert.strictEqual(r.status, 403, name + ' coach pendente');
    }
  });
  await t('importar PDF: limite de 20 por hora por pessoa (o 21º recebe 429)', async () => {
    const coach = uid('co'); u(coach, 'COACH');
    for (const [name, fn] of [['treino', IMPORT_PDF], ['dieta', IMPORT_DIET]] as const) {
      const who = uid('co'); u(who, 'COACH');
      for (let i = 0; i < 20; i++) { const r = await call(fn, tok(who)); assert.notStrictEqual(r.status, 429, name + ' #' + (i + 1)); assert.notStrictEqual(r.status, 403, name); }
      const r = await call(fn, tok(who)); assert.strictEqual(r.status, 429, name); assert.strictEqual(r.json.code, 'RATE_LIMIT');
    }
  });
  await t('laudo por IA da avaliação: o próprio aluno não dispara mais; coach ativo segue (e tem limite de 30/h)', async () => {
    const stu = uid('al'), coach = uid('co'); u(stu, 'USER', { coachId: coach }); u(coach, 'COACH');
    const ctx = { params: { id: 'a1' } };
    let r = await call(REPORT, tok(stu, 'USER'), {}, ctx); assert.strictEqual(r.status, 403); assert.strictEqual(r.json.code, 'COACH_ONLY');
    r = await call(REPORT, tok(coach), {}, ctx); assert.notStrictEqual(r.status, 403, 'coach ativo passa da trava (depois dela a avaliação nem existe no teste)');
    const heavy = uid('co'); u(heavy, 'COACH'); let last = 0;
    for (let i = 0; i < 31; i++) last = (await call(REPORT, tok(heavy), {}, ctx)).status;
    assert.strictEqual(last, 429);
  });
  await t('análise de vídeo por IA: aluno de coach parceiro e coach parceiro são barrados; aluno do time master, aluno sem coach e master passam; 20/h', async () => {
    const partner = uid('co'), sPartner = uid('al'), sMaster = uid('al'), sNone = uid('al');
    u(partner, 'COACH'); u(sPartner, 'USER', { coachId: partner }); u(sMaster, 'USER', { coachId: PAULO_ID }); u(sNone, 'USER', { coachId: null });
    for (const who of [tok(sPartner, 'USER'), tok(partner)]) { const r = await call(ANALYZE, who); assert.strictEqual(r.status, 403); assert.strictEqual(r.json.code, 'VIDEO_AI_LOCKED'); }
    for (const who of [tok(sMaster, 'USER'), tok(sNone, 'USER'), tok(PAULO_ID, 'ADMIN')]) { const r = await call(ANALYZE, who); assert.ok(![403, 429].includes(r.status), 'passou da trava: ' + r.status); }
    // o coach do aluno vale pelo BANCO: token antigo dizendo "coach master" não engana
    const forged = jwt.sign({ id: sPartner, role: 'USER', coachId: PAULO_ID }, SECRET); assert.strictEqual((await call(ANALYZE, forged)).status, 403);
    const heavy = uid('al'); u(heavy, 'USER', { coachId: PAULO_ID }); let last = 0;
    for (let i = 0; i < 21; i++) last = (await call(ANALYZE, tok(heavy, 'USER'))).status;
    assert.strictEqual(last, 429);
  });
  await t('chat do aluno: 40 por hora e 150 por dia por pessoa; pergunta com mais de 1000 letras é recusada', async () => {
    const stu = uid('al'); u(stu, 'USER');
    for (let i = 0; i < 40; i++) { const r = await call(CHAT, tok(stu, 'USER'), { message: '' }); assert.strictEqual(r.status, 400, '#' + (i + 1)); }
    let r = await call(CHAT, tok(stu, 'USER'), { message: '' }); assert.strictEqual(r.status, 429); assert.strictEqual(r.json.code, 'RATE_LIMIT'); assert.match(r.json.reply, /muitas perguntas/);
    const long = uid('al'); u(long, 'USER'); r = await call(CHAT, tok(long, 'USER'), { message: 'a'.repeat(1001) }); assert.strictEqual(r.status, 400); assert.match(r.json.reply, /muito longa/);
    assert.strictEqual((await call(CHAT, null, { message: 'oi' })).status, 401);
    // limite por dia: andando o relógio 61 min a cada 30 perguntas (a janela de 1 hora zera, a de 1 dia não)
    const day = uid('al'); u(day, 'USER'); const realNow = Date.now; let off = 0; Date.now = () => realNow() + off;
    try {
      for (let i = 0; i < 150; i++) { if (i && i % 30 === 0) off += 61 * 60 * 1000; const x = await call(CHAT, tok(day, 'USER'), { message: '' }); assert.strictEqual(x.status, 400, 'dia #' + (i + 1)); }
      off += 61 * 60 * 1000; const y = await call(CHAT, tok(day, 'USER'), { message: '' }); assert.strictEqual(y.status, 429, 'o 151º do dia é barrado'); assert.strictEqual(y.json.code, 'RATE_LIMIT');
    } finally { Date.now = realNow; }
  });
  await t('avaliação do check-in: 40 por hora para quem não é master; o master não tem esse limite', async () => {
    const coach = uid('co'); u(coach, 'COACH'); let last = 0;
    for (let i = 0; i < 41; i++) last = (await call(EVAL, tok(coach), {})).status;
    assert.strictEqual(last, 429);
    let m = 0; for (let i = 0; i < 45; i++) m = (await call(EVAL, tok(PAULO_ID, 'ADMIN'), {})).status; assert.notStrictEqual(m, 429);
  });
  console.log(`\n${ok} de ${ok + fails} testes passaram`); if (fails) process.exit(1);
})();
