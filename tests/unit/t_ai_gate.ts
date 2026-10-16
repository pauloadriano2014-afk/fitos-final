import assert from 'assert';
import jwt from 'jsonwebtoken';
import prisma from '@/lib/prisma';
import * as A from '/home/user/fitos-final/lib/aiAccess';
import { PAULO_ID, ADRI_ID } from '/home/user/fitos-final/lib/masterIds';
import { POST as treinoIA } from '/home/user/fitos-final/app/api/ai/gerar-treino/route';
import { POST as dietaIA } from '/home/user/fitos-final/app/api/admin/generate-diet/route';
import { POST as corridaIA } from '/home/user/fitos-final/app/api/running/generate/route';
import { POST as vozTreinoInterpretar } from '/home/user/fitos-final/app/api/ai/treino-por-voz/interpretar/route';
import { POST as vozTranscrever } from '/home/user/fitos-final/app/api/ai/treino-por-voz/transcrever/route';
import { POST as vozDietaInterpretar } from '/home/user/fitos-final/app/api/ai/dieta-por-voz/interpretar/route';
const db = (prisma as any).__db;
const tok = (id: string, role = 'COACH') => jwt.sign({ id, role, coachId: null }, 'dev-only-troque-isso-configurando-JWT_SECRET-no-env');
const post = async (fn: any, as: string | null, role: string, body: any = {}) => {
  const headers: any = { 'content-type': 'application/json' }; if (as) headers.authorization = 'Bearer ' + tok(as, role);
  const r = await fn(new Request('http://x/api', { method: 'POST', headers, body: JSON.stringify(body) })); let j: any = null; try { j = await r.json(); } catch {} return { status: r.status, json: j };
};
const quiet = async (fn: () => Promise<any>) => { const w = console.warn, e = console.error, i = console.info; console.warn = console.error = console.info = () => {}; try { return await fn(); } finally { console.warn = w; console.error = e; console.info = i; } };
(async () => {
  db.users.push(
    { id: PAULO_ID, role: 'ADMIN', accountStatus: 'ACTIVE', active: true, name: 'Paulo' }, { id: ADRI_ID, role: 'ADMIN', accountStatus: 'ACTIVE', active: true, name: 'Adri' },
    { id: 'parceiro', role: 'COACH', accountStatus: 'ACTIVE', active: true, name: 'Parceiro' },
    { id: 'pausado', role: 'COACH', accountStatus: 'PAUSED', active: true, name: 'Pausado' },
    { id: 'aluno', role: 'USER', accountStatus: 'ACTIVE', active: true, name: 'Aluno', coachId: 'parceiro' },
  );
  // ═════ helpers ═════
  assert.equal(A.canUseAiBuilder({ id: PAULO_ID, role: 'ADMIN', coachId: null }), true); assert.equal(A.canUseAiBuilder({ id: ADRI_ID, role: 'ADMIN', coachId: null }), true);
  assert.equal(A.canUseAiBuilder({ id: 'parceiro', role: 'COACH', coachId: null }), false); assert.equal(A.canUseAiBuilder(null), false);
  assert.equal(await A.isActiveCoach(prisma, { id: 'parceiro', role: 'COACH', coachId: null }), true); assert.equal(await A.isActiveCoach(prisma, { id: 'pausado', role: 'COACH', coachId: null }), false, 'coach pausado');
  assert.equal(await A.isActiveCoach(prisma, { id: 'aluno', role: 'USER', coachId: 'parceiro' }), false, 'aluno'); assert.equal(await A.isActiveCoach(prisma, { id: 'sumiu', role: 'COACH', coachId: null }), false, 'usuário que não existe mais');
  assert.equal(await A.isActiveCoach(prisma, { id: PAULO_ID, role: 'ADMIN', coachId: null }), true); assert.equal(await A.isActiveCoach(prisma, null), false);
  // ═════ montagem por IA: só master ═════
  const builders: Array<[string, any, any]> = [['gerar treino', treinoIA, { userId: 'aluno', adminId: 'parceiro', cycleConfig: {} }], ['gerar dieta', dietaIA, { anamnese: {} }], ['protocolo de corrida', corridaIA, { userId: 'aluno' }]];
  for (const [name, fn, body] of builders) {
    const semToken = await post(fn, null, 'COACH', body); assert.equal(semToken.status, 401, name + ': sem login');
    for (const [who, id, role] of [['parceiro', 'parceiro', 'COACH'], ['aluno', 'aluno', 'USER'], ['coach pausado', 'pausado', 'COACH']] as const) {
      const r = await post(fn, id, role, body); assert.equal(r.status, 403, `${name}: ${who} bloqueado`); assert.equal(r.json.code, 'AI_BUILDER_LOCKED', `${name}: ${who}`); assert.ok(r.json.error.includes('time master'));
    }
    for (const id of [PAULO_ID, ADRI_ID]) { const r = await quiet(() => post(fn, id, 'ADMIN', body)); assert.notEqual(r.status, 403, `${name}: master passa da trava`); assert.notEqual(r.status, 401); if (r.json && r.json.code) assert.notEqual(r.json.code, 'AI_BUILDER_LOCKED'); }
  }
  // master "no lugar" de um parceiro (usa o token do master): continua passando
  const imp = await quiet(() => post(treinoIA, PAULO_ID, 'ADMIN', { userId: 'aluno', adminId: 'parceiro', cycleConfig: {} })); assert.notEqual(imp.status, 403, 'master agindo pelo parceiro');
  console.log('OK  montagem por IA (treino, dieta, corrida): parceiro, aluno e coach pausado recebem 403 AI_BUILDER_LOCKED; master passa, inclusive agindo pelo parceiro; sem login = 401');

  // ═════ criação por voz: liberada pra coach ativo ═════
  process.env.OPENAI_API_KEY = 'k';
  const voz: Array<[string, any, any]> = [['treino interpretar', vozTreinoInterpretar, { adminId: 'parceiro', text: '' }], ['dieta interpretar', vozDietaInterpretar, { adminId: 'parceiro', text: '' }]];
  for (const [name, fn, body] of voz) {
    assert.equal((await post(fn, null, 'COACH', body)).status, 401, name);
    const ok = await post(fn, 'parceiro', 'COACH', body); assert.equal(ok.status, 400, `${name}: parceiro passa da trava (chega na validação do texto)`);
    for (const [who, id, role] of [['aluno', 'aluno', 'USER'], ['coach pausado', 'pausado', 'COACH']] as const) { const r = await post(fn, id, role, body); assert.equal(r.status, 403, `${name}: ${who}`); assert.equal(r.json.code, 'COACH_ONLY'); }
    assert.equal((await post(fn, PAULO_ID, 'ADMIN', { adminId: PAULO_ID, text: '' })).status, 400, `${name}: master continua`);
    assert.equal((await post(fn, 'parceiro', 'COACH', { adminId: PAULO_ID, text: 'abc def' })).status, 403, `${name}: parceiro não age pela biblioteca de outro coach`);
  }
  const form = () => { const f = new FormData(); return f; };
  const tr = async (as: string | null, role: string) => { const headers: any = {}; if (as) headers.authorization = 'Bearer ' + tok(as, role); const r = await vozTranscrever(new Request('http://x/api', { method: 'POST', headers, body: form() })); let j: any = null; try { j = await r.json(); } catch {} return { status: r.status, json: j }; };
  assert.equal((await tr(null, 'COACH')).status, 401); assert.equal((await tr('parceiro', 'COACH')).status, 400, 'transcrever: parceiro passa da trava (chega na checagem do áudio)'); assert.equal((await tr('aluno', 'USER')).status, 403, 'transcrever: aluno não'); assert.equal((await tr('pausado', 'COACH')).status, 403); assert.equal((await tr(PAULO_ID, 'ADMIN')).status, 400);
  console.log('OK  criação por voz (treino e dieta): coach ativo usa; aluno e coach pausado não; parceiro só na própria biblioteca; master continua');
  process.exit(0);
})().catch((e) => { console.error('FALHOU:', e.stack || e.message); process.exit(1); });
