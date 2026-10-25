// Recursos do coach liberados pelo master (20 out 2026): treino avulso, protocolo de corrida, IA de treino e de dieta (com limite mensal e regras de qualidade)
// e o cofre de dietas separado por coach. Tudo com banco e IA simulados.
import assert from 'assert';
import jwt from 'jsonwebtoken';
import prisma from '@/lib/prisma';
import * as DG from '@/lib/ai/dietGen';
import * as WG from '@/lib/ai/workoutGen';
import * as CA from '/home/user/fitos-final/lib/coachAi';
import * as CF from '/home/user/fitos-final/lib/coachFeatures';
import { GET as GET_ME } from '/home/user/fitos-final/app/api/coach-features/route';
import { PUT as PUT_ADM } from '/home/user/fitos-final/app/api/admin/coach-features/route';
import { GET as GET_STATUS } from '/home/user/fitos-final/app/api/coach-ai/status/route';
import { POST as POST_TREINO } from '/home/user/fitos-final/app/api/ai/gerar-treino/route';
import { POST as POST_DIETA } from '/home/user/fitos-final/app/api/admin/generate-diet/route';
import { GET as GET_QUICK } from '/home/user/fitos-final/app/api/quick-workout/route';
import { POST as POST_RUN } from '/home/user/fitos-final/app/api/running/protocol/route';
import { GET as GET_DT, POST as POST_DT, DELETE as DEL_DT } from '/home/user/fitos-final/app/api/admin/diet-templates/route';
import { GET as GET_MT, POST as POST_MT, DELETE as DEL_MT } from '/home/user/fitos-final/app/api/admin/meal-templates/route';
import { PATCH as PATCH_USER } from '/home/user/fitos-final/app/api/admin/user/[id]/route';
import { PAULO_ID, ADRI_ID } from '/home/user/fitos-final/lib/masterIds';

const P = prisma as any; const S = P.__state;
const SECRET = 'dev-only-troque-isso-configurando-JWT_SECRET-no-env';
const tok = (id: string, role = 'COACH') => jwt.sign({ id, role, coachId: null }, SECRET);
const call = async (fn: any, url: string, as: string | null, init: any = {}, ctx?: any) => {
  const headers: any = { 'content-type': 'application/json' }; if (as) headers.authorization = 'Bearer ' + as;
  const r = await fn(new Request('http://x' + url, { ...init, headers }), ctx);
  return { status: r.status, json: await r.json().catch(() => null) };
};
const post = (o: any) => ({ method: 'POST', body: JSON.stringify(o) }); const put = (o: any) => ({ method: 'PUT', body: JSON.stringify(o) }); const del = () => ({ method: 'DELETE' });
const master = tok(PAULO_ID, 'ADMIN'), c1 = tok('c1'), c2 = tok('c2'), aluno = tok('s1', 'USER');
let fails = 0, ok = 0;
const t = async (name: string, fn: () => Promise<void> | void) => { P.__reset(); (DG as any).__calls.length = 0; (WG as any).__calls.length = 0; try { await fn(); ok++; console.log('  ok  ' + name); } catch (e: any) { fails++; console.log('  FALHOU  ' + name + '\n' + (e?.stack || e)); } };

const coach = (id: string, extra: any = {}) => S.user.push({ id, role: 'COACH', name: 'Coach ' + id, email: id + '@x.com', accountStatus: 'ACTIVE', coachBillingStatus: 'ACTIVE', isLaunchPromo: false, coachPlan: 'ELITE', ...extra });
const feat = (coachId: string, feature: string) => S.coachFeature.push({ id: 'f' + Math.random(), coachId, feature, reason: 'MANUAL', grantedAt: new Date(), revokedAt: null, revokedReason: null, grantedBy: PAULO_ID });
const GOOD = { peso: 80, altura: 178, objetivo: 'HIPERTROFIA', nivel: 'INTERMEDIARIO', frequencia: 4, limitacoes: [], cirurgias: [], equipamentos: ['HALTER'], mealsPerDay: 5, wakeUpTime: '06:00', sleepTime: '22:00', foodPreferences: 'arroz', healthConditions: [], medications: [] };
const student = (id = 's1', coachId = 'c1', anamnese: any = GOOD) => S.user.push({ id, role: 'USER', name: 'Aluno ' + id, coachId, anamneses: anamnese ? [anamnese] : [] });
const library = (coachId: string, n: number) => { for (let i = 0; i < n; i++) S.exercise.push({ id: `e-${coachId}-${i}`, name: 'Ex ' + i, coachId, category: 'Peito' }); };
const log = (userId: string, question: string, createdAt = new Date()) => S.aiLog.push({ id: 'l' + Math.random(), userId, question, answer: '{}', createdAt });
const dietBody = (anamnese: any = GOOD) => post({ anamnese, dayType: 'TREINO', provider: 'anthropic' });

(async () => {
  // ── chaves ──
  await t('as 8 chaves existem e o master liga as novas coach a coach', async () => {
    assert.deepStrictEqual([...CF.FEATURE_KEYS], ['execVideo', 'notasVoz', 'perguntasVoz', 'treinoAvulso', 'iaTreino', 'iaDieta', 'protocoloCorrida', 'exames']);
    assert.deepStrictEqual([...CF.FOUNDER_KEYS], ['execVideo', 'notasVoz'], 'Fundador NÃO ganha as novas sozinho');
    coach('c1');
    for (const k of ['treinoAvulso', 'iaTreino', 'iaDieta', 'protocoloCorrida']) {
      assert.strictEqual((await call(PUT_ADM, '/api/admin/coach-features', master, put({ coachId: 'c1', feature: k, enabled: true }))).status, 200, k);
      assert.strictEqual((await CF.resolveCoachFeatures(P, 'c1'))[k as CF.FeatureKey].on, true, k);
    }
    const r = await call(GET_ME, '/api/coach-features', c1); assert.deepStrictEqual(Object.keys(r.json.features), [...CF.FEATURE_KEYS]); assert.ok(['treinoAvulso', 'iaTreino', 'iaDieta', 'protocoloCorrida'].every((k) => r.json.features[k] === true)); assert.deepStrictEqual([r.json.features.execVideo, r.json.features.notasVoz, r.json.features.perguntasVoz], [false, false, false]);
    const a = await call(GET_ME, '/api/coach-features', aluno); assert.strictEqual(Object.values(a.json.features).filter(Boolean).length, 0);
  });

  // ── limites e regras puras ──
  await t('limites por tipo de coach e pela variável de ambiente', () => {
    assert.deepStrictEqual(CA.limitsFor('PERSONAL', {}), { treino: 30, dieta: 0 });
    assert.deepStrictEqual(CA.limitsFor('NUTRICIONISTA', {}), { treino: 0, dieta: 60 });
    assert.deepStrictEqual(CA.limitsFor('ELITE', {}), { treino: 30, dieta: 60 });
    assert.deepStrictEqual(CA.limitsFor(null, {}), { treino: 30, dieta: 0 }, 'sem tipo = Personal');
    assert.deepStrictEqual(CA.limitsFor('ELITE', { COACH_AI_LIMIT_TREINO: '10', COACH_AI_LIMIT_DIETA: '25' }), { treino: 10, dieta: 25 });
    assert.deepStrictEqual(CA.limitsFor('ELITE', { COACH_AI_LIMIT_TREINO: 'abc', COACH_AI_LIMIT_DIETA: '-3' }), { treino: 30, dieta: 60 }, 'valor ruim volta ao padrão');
  });
  await t('mês de Brasília: vira à meia-noite daqui (03:00 UTC), não à do UTC', () => {
    const d = (s: string) => new Date(s);
    assert.strictEqual(CA.monthStartBR(d('2026-10-20T15:00:00Z')).toISOString(), '2026-10-01T03:00:00.000Z');
    assert.strictEqual(CA.monthStartBR(d('2026-11-01T02:59:00Z')).toISOString(), '2026-10-01T03:00:00.000Z', '31/10 23:59 em Brasília ainda é outubro');
    assert.strictEqual(CA.monthStartBR(d('2026-11-01T03:00:00Z')).toISOString(), '2026-11-01T03:00:00.000Z');
    assert.strictEqual(CA.nextMonthStartBR(d('2026-12-15T12:00:00Z')).toISOString(), '2027-01-01T03:00:00.000Z', 'vira o ano');
  });

  // ── a porta: checkCoachAi ──
  await t('master não tem limite nem chave; aluno e sem login não passam', async () => {
    const m = await CA.checkCoachAi(P, { id: PAULO_ID, role: 'ADMIN' } as any, 'treino'); assert.ok(m.ok && (m as any).master === true);
    const a = await CA.checkCoachAi(P, { id: 's1', role: 'USER' } as any, 'treino'); assert.ok(!a.ok && a.status === 403);
    const n = await CA.checkCoachAi(P, null, 'treino'); assert.ok(!n.ok && n.status === 401);
  });
  await t('coach sem a chave: bloqueado com código AI_BUILDER_LOCKED; com a chave: passa e mostra o saldo', async () => {
    coach('c1');
    let g: any = await CA.checkCoachAi(P, { id: 'c1', role: 'COACH' } as any, 'treino'); assert.ok(!g.ok); assert.strictEqual(g.status, 403); assert.strictEqual(g.body.code, 'AI_BUILDER_LOCKED');
    feat('c1', 'iaTreino');
    g = await CA.checkCoachAi(P, { id: 'c1', role: 'COACH' } as any, 'treino'); assert.ok(g.ok); assert.deepStrictEqual([g.usage.used, g.usage.limit, g.usage.left], [0, 30, 30]);
    g = await CA.checkCoachAi(P, { id: 'c1', role: 'COACH' } as any, 'dieta'); assert.ok(!g.ok, 'a chave do treino não abre a dieta');
  });
  await t('o tipo do coach manda: Personal não monta dieta, Nutri não monta treino (mesmo com a chave)', async () => {
    coach('c1', { coachPlan: 'PERSONAL' }); feat('c1', 'iaDieta'); feat('c1', 'iaTreino');
    let g: any = await CA.checkCoachAi(P, { id: 'c1', role: 'COACH' } as any, 'dieta'); assert.ok(!g.ok); assert.strictEqual(g.body.code, 'AI_NOT_IN_PLAN'); assert.match(g.body.error, /Personal/);
    assert.ok((await CA.checkCoachAi(P, { id: 'c1', role: 'COACH' } as any, 'treino')).ok);
    P.__reset(); coach('c2', { coachPlan: 'NUTRICIONISTA' }); feat('c2', 'iaDieta'); feat('c2', 'iaTreino');
    g = await CA.checkCoachAi(P, { id: 'c2', role: 'COACH' } as any, 'treino'); assert.ok(!g.ok); assert.strictEqual(g.body.code, 'AI_NOT_IN_PLAN');
    assert.ok((await CA.checkCoachAi(P, { id: 'c2', role: 'COACH' } as any, 'dieta')).ok);
  });
  await t('limite do mês: conta só o que deu certo e usou a IA do servidor, só deste coach e só deste mês', async () => {
    coach('c1'); coach('c2'); feat('c1', 'iaTreino');
    const now = new Date('2026-10-20T15:00:00Z');
    for (let i = 0; i < 3; i++) log('c1', 'gerar-treino:GEMINI_FLASH', new Date('2026-10-10T12:00:00Z'));
    log('c1', 'gerar-treino:GEMINI_FLASH:falhou', new Date('2026-10-11T12:00:00Z'));   // falhou: não conta
    log('c1', 'gerar-treino:OWN_KEY', new Date('2026-10-11T12:00:00Z'));               // chave própria do coach: não conta
    log('c1', 'gerar-treino:GEMINI_FLASH', new Date('2026-09-30T20:00:00Z'));          // mês passado (30/09 17:00 em Brasília)
    log('c1', 'gerar-dieta:google', new Date('2026-10-12T12:00:00Z'));                 // dieta é outra conta
    log('c2', 'gerar-treino:GEMINI_FLASH', new Date('2026-10-12T12:00:00Z'));          // outro coach
    assert.strictEqual(await CA.countUsage(P, 'c1', 'treino', now), 3);
    assert.strictEqual(await CA.countUsage(P, 'c1', 'dieta', now), 1);
    const g: any = await CA.checkCoachAi(P, { id: 'c1', role: 'COACH' } as any, 'treino', now); assert.ok(g.ok); assert.strictEqual(g.usage.left, 27);
  });
  await t('estourou o limite: 429 com data de volta; no mês seguinte libera de novo', async () => {
    coach('c1'); feat('c1', 'iaTreino');
    process.env.COACH_AI_LIMIT_TREINO = '2';
    try {
      const now = new Date('2026-10-20T15:00:00Z');
      log('c1', 'gerar-treino:GEMINI_FLASH', new Date('2026-10-05T12:00:00Z')); log('c1', 'gerar-treino:GEMINI_FLASH', new Date('2026-10-06T12:00:00Z'));
      const g: any = await CA.checkCoachAi(P, { id: 'c1', role: 'COACH' } as any, 'treino', now);
      assert.ok(!g.ok); assert.strictEqual(g.status, 429); assert.strictEqual(g.body.code, 'AI_QUOTA'); assert.deepStrictEqual([g.body.used, g.body.limit], [2, 2]); assert.match(g.body.error, /01\/11/);
      const next: any = await CA.checkCoachAi(P, { id: 'c1', role: 'COACH' } as any, 'treino', new Date('2026-11-02T15:00:00Z')); assert.ok(next.ok); assert.strictEqual(next.usage.left, 2);
    } finally { delete process.env.COACH_AI_LIMIT_TREINO; }
  });
  await t('coach com mensalidade atrasada perde a IA na hora (mesmo com a chave)', async () => {
    coach('c1', { coachBillingStatus: 'OVERDUE' }); feat('c1', 'iaTreino');
    const g: any = await CA.checkCoachAi(P, { id: 'c1', role: 'COACH' } as any, 'treino'); assert.ok(!g.ok); assert.strictEqual(g.status, 403);
  });

  // ── prontidão ──
  await t('prontidão do treino: bloqueia o que impede, avisa o que merece atenção', () => {
    assert.strictEqual(CA.workoutReadiness({ anamnese: null, libraryCount: 100 }).ok, false);
    assert.strictEqual(CA.workoutReadiness({ anamnese: { ...GOOD, peso: 0 }, libraryCount: 100 }).ok, false, 'peso zerado');
    assert.strictEqual(CA.workoutReadiness({ anamnese: { ...GOOD, altura: 17 }, libraryCount: 100 }).ok, false, 'altura impossível');
    assert.strictEqual(CA.workoutReadiness({ anamnese: { ...GOOD, altura: 1.78 }, libraryCount: 100 }).ok, true, 'altura em metros também vale');
    assert.strictEqual(CA.workoutReadiness({ anamnese: { ...GOOD, objetivo: '' }, libraryCount: 100 }).ok, false);
    const small = CA.workoutReadiness({ anamnese: GOOD, libraryCount: 19 }); assert.strictEqual(small.ok, false); assert.match(small.blockers.join(' '), /19 exercícios/);
    const mid = CA.workoutReadiness({ anamnese: GOOD, libraryCount: 40 }); assert.strictEqual(mid.ok, true); assert.ok(mid.warnings.some((w) => /40 exercícios/.test(w)));
    const inj = CA.workoutReadiness({ anamnese: { ...GOOD, limitacoes: ['JOELHO'] }, libraryCount: 100, hasPreviousWorkout: false }); assert.strictEqual(inj.ok, true); assert.strictEqual(inj.warnings.length, 2);
    const clean = CA.workoutReadiness({ anamnese: GOOD, libraryCount: 100, hasPreviousWorkout: true }); assert.deepStrictEqual([clean.ok, clean.blockers.length, clean.warnings.length], [true, 0, 0]);
  });
  await t('prontidão da dieta', () => {
    assert.strictEqual(CA.dietReadiness(null).ok, false);
    assert.strictEqual(CA.dietReadiness({ ...GOOD, peso: 500 }).ok, false);
    assert.strictEqual(CA.dietReadiness({ ...GOOD, objetivo: null }).ok, false);
    const w = CA.dietReadiness({ ...GOOD, mealsPerDay: 0, wakeUpTime: '', foodPreferences: '', healthConditions: ['DIABETES'] }); assert.strictEqual(w.ok, true); assert.strictEqual(w.warnings.length, 4);
    assert.deepStrictEqual(CA.dietReadiness(GOOD).warnings, []);
  });

  // ── rota de status ──
  await t('GET /api/coach-ai/status: sem chave diz por quê; com chave traz saldo, checklist e dicas; aluno de outro coach 403', async () => {
    coach('c1'); coach('c2'); student('s1', 'c1'); library('c1', 80);
    let r = await call(GET_STATUS, '/api/coach-ai/status?kind=treino&userId=s1', c1); assert.strictEqual(r.json.allowed, false); assert.strictEqual(r.json.code, 'AI_BUILDER_LOCKED'); assert.ok(r.json.tips.length >= 4);
    feat('c1', 'iaTreino');
    r = await call(GET_STATUS, '/api/coach-ai/status?kind=treino&userId=s1', c1); assert.strictEqual(r.json.allowed, true); assert.strictEqual(r.json.usage.limit, 30); assert.strictEqual(r.json.readiness.ok, true);
    assert.ok(r.json.readiness.warnings.some((w: string) => /primeiro treino/.test(w)));
    S.user.find((u: any) => u.id === 's1').anamneses = []; r = await call(GET_STATUS, '/api/coach-ai/status?kind=treino&userId=s1', c1); assert.strictEqual(r.json.readiness.ok, false);
    feat('c2', 'iaTreino'); r = await call(GET_STATUS, '/api/coach-ai/status?kind=treino&userId=s1', c2); assert.strictEqual(r.status, 403, 'não espia aluno de outro coach');
    r = await call(GET_STATUS, '/api/coach-ai/status?kind=dieta', master); assert.deepStrictEqual([r.json.master, r.json.allowed], [true, true]);
    assert.strictEqual((await call(GET_STATUS, '/api/coach-ai/status?kind=treino', null)).status, 401);
  });

  // ── geração de treino ──
  await t('POST gerar-treino: sem chave 403; sem anamnese ou biblioteca pequena 422; tudo certo chama o gerador; estourou 429; master passa direto', async () => {
    coach('c1'); student('s1', 'c1'); library('c1', 80);
    const body = post({ userId: 's1', adminId: 'c1', cycleConfig: { selectedAI: 'GEMINI_FLASH' } });
    let r = await call(POST_TREINO, '/api/ai/gerar-treino', c1, body); assert.strictEqual(r.status, 403); assert.strictEqual(r.json.code, 'AI_BUILDER_LOCKED'); assert.strictEqual((WG as any).__calls.length, 0);
    feat('c1', 'iaTreino');
    S.user.find((u: any) => u.id === 's1').anamneses = [];
    r = await call(POST_TREINO, '/api/ai/gerar-treino', c1, body); assert.strictEqual(r.status, 422); assert.strictEqual(r.json.code, 'NAO_PRONTO'); assert.strictEqual((WG as any).__calls.length, 0, 'não gasta IA sem anamnese');
    S.user.find((u: any) => u.id === 's1').anamneses = [GOOD]; S.exercise = S.exercise.slice(0, 10);
    r = await call(POST_TREINO, '/api/ai/gerar-treino', c1, body); assert.strictEqual(r.status, 422); assert.match(r.json.error, /10 exercícios/);
    library('c1', 80);
    r = await call(POST_TREINO, '/api/ai/gerar-treino', c1, body); assert.strictEqual(r.status, 200); assert.strictEqual((WG as any).__calls.length, 1);
    process.env.COACH_AI_LIMIT_TREINO = '1';
    try { log('c1', 'gerar-treino:GEMINI_FLASH'); r = await call(POST_TREINO, '/api/ai/gerar-treino', c1, body); assert.strictEqual(r.status, 429); assert.strictEqual(r.json.code, 'AI_QUOTA'); assert.strictEqual((WG as any).__calls.length, 1); } finally { delete process.env.COACH_AI_LIMIT_TREINO; }
    r = await call(POST_TREINO, '/api/ai/gerar-treino', c2, body); assert.ok([401, 403].includes(r.status), 'outro coach não gera para o aluno do c1');
    S.user.find((u: any) => u.id === 's1').anamneses = []; r = await call(POST_TREINO, '/api/ai/gerar-treino', master, post({ userId: 's1', adminId: PAULO_ID })); assert.strictEqual(r.status, 200, 'master não tem checklist');
  });

  // ── geração de dieta ──
  await t('POST generate-diet: sem chave 403; Personal 403; anamnese ruim 422; coach usa SEMPRE o motor barato e a aba fica no registro; master escolhe o motor', async () => {
    coach('c1'); coach('c2', { coachPlan: 'PERSONAL' });
    let r = await call(POST_DIETA, '/api/admin/generate-diet', c1, dietBody()); assert.strictEqual(r.status, 403); assert.strictEqual(r.json.code, 'AI_BUILDER_LOCKED');
    feat('c1', 'iaDieta'); feat('c2', 'iaDieta');
    r = await call(POST_DIETA, '/api/admin/generate-diet', c2, dietBody()); assert.strictEqual(r.json.code, 'AI_NOT_IN_PLAN');
    r = await call(POST_DIETA, '/api/admin/generate-diet', c1, dietBody({ ...GOOD, peso: 0 })); assert.strictEqual(r.status, 422); assert.strictEqual((DG as any).__calls.length, 0);
    r = await call(POST_DIETA, '/api/admin/generate-diet', c1, dietBody()); assert.strictEqual(r.status, 200);
    assert.strictEqual((DG as any).__calls[0].provider, 'google', 'pediu anthropic e levou google');
    assert.strictEqual(S.aiLog.filter((l: any) => l.userId === 'c1' && l.question === 'gerar-dieta:google').length, 1);
    assert.strictEqual(await CA.countUsage(P, 'c1', 'dieta'), 1, 'a aba gerada entra na conta do mês');
    r = await call(POST_DIETA, '/api/admin/generate-diet', c1, post({ anamnese: GOOD, provider: 'anthropic-haiku' })); assert.strictEqual(r.status, 403, 'Haiku continua do master');
    r = await call(POST_DIETA, '/api/admin/generate-diet', master, dietBody()); assert.strictEqual(r.status, 200); assert.strictEqual((DG as any).__calls[1].provider, 'anthropic');
    const nCalls = (DG as any).__calls.length;
    r = await call(POST_DIETA, '/api/admin/generate-diet', c1, post({ anamnese: GOOD, provider: 'gemini-argon' })); assert.strictEqual(r.status, 403, 'Gemini Argon (teste) é só do master'); assert.strictEqual((DG as any).__calls.length, nCalls, 'e a IA nem foi chamada');
    r = await call(POST_DIETA, '/api/admin/generate-diet', master, post({ anamnese: GOOD, provider: 'gemini-argon' })); assert.strictEqual(r.status, 200); assert.strictEqual((DG as any).__calls[nCalls].provider, 'gemini-argon', 'o master escolhe e o Argon vai até a geração');
    assert.strictEqual(S.aiLog.filter((l: any) => l.userId === PAULO_ID && l.question === 'gerar-dieta:gemini-argon').length, 1, 'o custo do Argon fica no registro');
  });

  // ── treino avulso ──
  await t('treino avulso: coach só com a chave; revogar tranca de novo; aluno nunca; master sempre', async () => {
    coach('c1');
    assert.strictEqual((await call(GET_QUICK, '/api/quick-workout', c1)).status, 403);
    feat('c1', 'treinoAvulso'); assert.strictEqual((await call(GET_QUICK, '/api/quick-workout', c1)).status, 200);
    await CF.setCoachFeature(P, { coachId: 'c1', feature: 'treinoAvulso', enabled: false, by: PAULO_ID }); assert.strictEqual((await call(GET_QUICK, '/api/quick-workout', c1)).status, 403);
    assert.strictEqual((await call(GET_QUICK, '/api/quick-workout', aluno)).status, 403);
    assert.strictEqual((await call(GET_QUICK, '/api/quick-workout', master)).status, 200);
  });

  // ── protocolo de corrida ──
  await t('protocolo de corrida: coach sem a chave toma FEATURE_LOCKED; com a chave a trava some (o resto é validação normal); master livre', async () => {
    coach('c1'); student('s1', 'c1');
    let r = await call(POST_RUN, '/api/running/protocol', c1, post({ userId: 's1' })); assert.strictEqual(r.status, 403); assert.strictEqual(r.json.code, 'FEATURE_LOCKED');
    feat('c1', 'protocoloCorrida'); r = await call(POST_RUN, '/api/running/protocol', c1, post({ userId: 's1' })); assert.notStrictEqual(r.json?.code, 'FEATURE_LOCKED');
    r = await call(POST_RUN, '/api/running/protocol', master, post({ userId: 's1' })); assert.notStrictEqual(r.json?.code, 'FEATURE_LOCKED');
  });

  await t('ligar o módulo de corrida do aluno também depende da chave (e só quando o corpo mexe em runningModule)', async () => {
    coach('c1'); student('s1', 'c1');
    const CTX = { params: { id: 's1' } };
    const patch = (o: any) => ({ method: 'PATCH', body: JSON.stringify(o) });
    let r = await call(PATCH_USER, '/api/admin/user/s1', c1, patch({ runningModule: true }), CTX);
    assert.strictEqual(r.status, 403); assert.strictEqual(r.json.code, 'FEATURE_LOCKED'); assert.notStrictEqual(S.user.find((u: any) => u.id === 's1').runningModule, true);
    r = await call(PATCH_USER, '/api/admin/user/s1', c1, patch({ name: 'Novo nome' }), CTX); assert.strictEqual(r.status, 200, 'outros campos seguem livres');
    feat('c1', 'protocoloCorrida');
    r = await call(PATCH_USER, '/api/admin/user/s1', c1, patch({ runningModule: true }), CTX); assert.strictEqual(r.status, 200); assert.strictEqual(S.user.find((u: any) => u.id === 's1').runningModule, true);
  });

  // ── cofre de dietas e modelos de refeição ──
  await t('cofre de dietas: cada coach vê só o dele; master vê o acervo do time; ninguém apaga o do outro; aluno nada', async () => {
    coach('c1'); coach('c2');
    S.dietTemplate.push({ id: 'old', name: 'Antigo do time', coachId: null, meals: [], createdAt: new Date() }, { id: 'paulo', name: 'Do Paulo', coachId: PAULO_ID, meals: [], createdAt: new Date() }, { id: 'adri', name: 'Da Adri', coachId: ADRI_ID, meals: [], createdAt: new Date() });
    let r = await call(POST_DT, '/api/admin/diet-templates', c1, post({ name: 'Cutting do c1', meals: [{ name: 'Café' }] })); assert.strictEqual(r.status, 200); const mine = r.json.id; assert.strictEqual(r.json.coachId, 'c1');
    r = await call(POST_DT, '/api/admin/diet-templates', c2, post({ name: 'Do c2', meals: [{ name: 'Café' }] })); const other = r.json.id;
    r = await call(GET_DT, '/api/admin/diet-templates', c1); assert.deepStrictEqual(r.json.templates.map((x: any) => x.name), ['Cutting do c1'], 'c1 não vê o acervo do time nem o do c2');
    r = await call(GET_DT, '/api/admin/diet-templates', master); assert.deepStrictEqual(r.json.templates.map((x: any) => x.name).sort(), ['Antigo do time', 'Da Adri', 'Do Paulo']);
    assert.strictEqual((await call(DEL_DT, '/api/admin/diet-templates?id=' + other, c1, del())).status, 403, 'não apaga o do outro');
    assert.strictEqual((await call(DEL_DT, '/api/admin/diet-templates?id=old', c1, del())).status, 403, 'não apaga o acervo do time');
    assert.strictEqual((await call(DEL_DT, '/api/admin/diet-templates?id=' + other, master, del())).status, 403, 'nem o master apaga o de um coach parceiro');
    assert.strictEqual((await call(DEL_DT, '/api/admin/diet-templates?id=' + mine, c1, del())).status, 200);
    assert.strictEqual((await call(DEL_DT, '/api/admin/diet-templates?id=old', master, del())).status, 200, 'master apaga o acervo do time');
    assert.strictEqual((await call(DEL_DT, '/api/admin/diet-templates?id=nao', c1, del())).status, 404);
    assert.strictEqual((await call(GET_DT, '/api/admin/diet-templates', aluno)).status, 403);
    assert.strictEqual((await call(POST_DT, '/api/admin/diet-templates', aluno, post({ name: 'x', meals: [] }))).status, 403);
    assert.strictEqual((await call(GET_DT, '/api/admin/diet-templates', null)).status, 401);
  });
  await t('modelos de refeição: mesma separação', async () => {
    coach('c1'); coach('c2');
    S.mealTemplate.push({ id: 'old', name: 'Antiga', coachId: null, items: [], createdAt: new Date() });
    let r = await call(POST_MT, '/api/admin/meal-templates', c1, post({ name: 'Pré-treino do c1', items: [1] })); assert.strictEqual(r.status, 200); const mine = r.json.id;
    r = await call(GET_MT, '/api/admin/meal-templates', c2); assert.deepStrictEqual(r.json.templates, []);
    r = await call(GET_MT, '/api/admin/meal-templates', c1); assert.strictEqual(r.json.templates.length, 1);
    r = await call(GET_MT, '/api/admin/meal-templates', master); assert.deepStrictEqual(r.json.templates.map((x: any) => x.name), ['Antiga']);
    assert.strictEqual((await call(DEL_MT, '/api/admin/meal-templates?id=' + mine, c2, del())).status, 403);
    assert.strictEqual((await call(DEL_MT, '/api/admin/meal-templates?id=old', c2, del())).status, 403);
    assert.strictEqual((await call(DEL_MT, '/api/admin/meal-templates?id=' + mine, c1, del())).status, 200);
    assert.strictEqual((await call(GET_MT, '/api/admin/meal-templates', aluno)).status, 403);
  });

  console.log(`\n${ok} de ${ok + fails} testes passaram`);
  if (fails) process.exit(1);
})();
