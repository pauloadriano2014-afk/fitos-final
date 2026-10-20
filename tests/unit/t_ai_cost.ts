// Painel de custo de IA por coach (20 out 2026): classifica cada linha do AiLog, estima o custo e soma por coach (o aluno conta para o coach dele).
import assert from 'assert';
import fs from 'fs';
import jwt from 'jsonwebtoken';
import prisma from '@/lib/prisma';
import { GET as USAGE } from '/home/user/fitos-final/app/api/admin/coach-ai-usage/route';
import { categorize, costOfRow, usdFromTokens, logAiUse, USE_KINDS, BRL_PER_USD } from '/home/user/fitos-final/lib/aiCost';
import { PAULO_ID } from '/home/user/fitos-final/lib/masterIds';

const P = prisma as any; const S = P.__state;
const SECRET = 'dev-only-troque-isso-configurando-JWT_SECRET-no-env';
const tok = (id: string, role = 'COACH') => jwt.sign({ id, role, coachId: null }, SECRET);
const get = async (as: string | null, qs = '') => {
  const headers: any = {}; if (as) headers.authorization = 'Bearer ' + as;
  const r = await USAGE(new Request('http://x/api/admin/coach-ai-usage' + qs, { method: 'GET', headers }));
  return { status: r.status, json: await r.json().catch(() => null) };
};
let fails = 0, ok = 0;
const t = async (name: string, fn: () => Promise<void> | void) => { P.__reset(); try { await fn(); ok++; console.log('  ok  ' + name); } catch (e: any) { fails++; console.log('  FALHOU  ' + name + '\n' + (e?.stack || e)); } };
const u = (id: string, role: string, extra: any = {}) => S.user.push({ id, role, name: id, accountStatus: 'ACTIVE', active: true, coachBillingStatus: 'ACTIVE', coachId: null, coachPlan: null, ...extra });
const log = (userId: string, question: string, answer: any, createdAt = new Date()) => S.aiLog.push({ id: Math.random().toString(36).slice(2), userId, question, answer: typeof answer === 'string' ? answer : JSON.stringify(answer), createdAt });
const near = (a: number, b: number, d = 1e-6) => assert.ok(Math.abs(a - b) <= d, `${a} ≠ ${b}`);

(async () => {
  await t('categorias: cada tipo de linha cai no lugar certo; falhou e chave própria não contam', () => {
    const c = categorize;
    assert.strictEqual(c('gerar-treino:gemini-flash'), 'treino'); assert.strictEqual(c('gerar-dieta:google'), 'dieta');
    assert.strictEqual(c('avaliar-checkin:gemini-argon'), 'checkin'); assert.strictEqual(c('insight-analysis:abc:full'), 'analise'); assert.strictEqual(c('insight-group'), 'analise');
    assert.strictEqual(c('weekly-feedback:2026-10-12'), 'feedback'); assert.strictEqual(c('weekly-whatsapp-parse:2026-10-12'), 'feedback');
    assert.strictEqual(c('[TTS] coral'), 'voz'); assert.strictEqual(c(USE_KINDS.pdfTreino), 'pdf'); assert.strictEqual(c(USE_KINDS.pdfDieta), 'pdf');
    assert.strictEqual(c(USE_KINDS.laudo), 'laudo'); assert.strictEqual(c(USE_KINDS.video), 'video');
    assert.strictEqual(c('Como faço o agachamento?'), 'chat');
    assert.strictEqual(c('gerar-treino:gemini-flash:falhou'), null); assert.strictEqual(c('gerar-treino:gemini-flash:OWN_KEY'), null); assert.strictEqual(c('gerar-dieta:google:OWN_KEY'), null);
  });

  await t('custo da linha: usa o valor gravado; senão calcula pelos tokens e pelo modelo; senão valor médio marcado como estimado', () => {
    let r = costOfRow('gerar-treino:claude', JSON.stringify({ model: 'claude-haiku-4-5', inputTokens: 1000, outputTokens: 1000, usd: 0.25 }))!;
    near(r.usd, 0.25); assert.strictEqual(r.estimated, false);
    r = costOfRow('gerar-dieta:google', JSON.stringify({ usageAndCost: { costUsd: 0.07 } }))!; near(r.usd, 0.07); assert.strictEqual(r.estimated, false);
    r = costOfRow('insight-analysis:x:full', JSON.stringify({ usage: { usd: 0.4 } }))!; near(r.usd, 0.4);
    r = costOfRow('gerar-treino:gemini-flash', JSON.stringify({ model: 'gemini-2.5-flash', inputTokens: 200000, outputTokens: 10000 }))!;
    near(r.usd, 0.2 * 0.3 + 0.01 * 2.5); assert.strictEqual(r.estimated, false);
    near(usdFromTokens('gpt-4o', 1_000_000, 1_000_000), 12.5); near(usdFromTokens('modelo-desconhecido', 1_000_000, 0), 1);
    r = costOfRow('Qual a minha carga?', 'Resposta qualquer')!; assert.strictEqual(r.category, 'chat'); assert.strictEqual(r.estimated, true); assert.ok(r.usd > 0);
    r = costOfRow('[TTS] coral', '2000')!; assert.strictEqual(r.category, 'voz'); near(r.usd, 2000 * 18 / BRL_PER_USD / 200000);
    assert.strictEqual(costOfRow('gerar-treino:x:falhou', '{}'), null);
  });

  await t('rota: só o master vê (401 sem login, 403 para coach e aluno)', async () => {
    const co = 'co1', st = 'st1'; u(co, 'COACH'); u(st, 'USER', { coachId: co });
    assert.strictEqual((await get(null)).status, 401);
    assert.strictEqual((await get(tok(co))).status, 403);
    assert.strictEqual((await get(tok(st, 'USER'))).status, 403);
    assert.strictEqual((await get(tok(PAULO_ID, 'ADMIN'))).status, 200);
  });

  await t('rota: soma por coach, aluno conta para o coach dele, ignora falhou/chave própria/outro mês e ordena do mais caro', async () => {
    u('coA', 'COACH', { name: 'Coach A', coachPlan: 'ELITE' }); u('coB', 'COACH', { name: 'Coach B', coachPlan: 'PERSONAL' });
    u('stA', 'USER', { coachId: 'coA' }); u('stFree', 'USER', { coachId: null }); u(PAULO_ID, 'ADMIN', { name: 'Paulo' });
    const old = new Date(Date.now() - 80 * 24 * 3600 * 1000);
    log('coA', 'gerar-treino:gemini-flash', { usd: 0.10 }); log('coA', 'gerar-treino:gemini-flash', { usd: 0.10 });
    log('coA', 'gerar-treino:gemini-flash:falhou', { usd: 9 }); log('coA', 'gerar-treino:gemini-flash:OWN_KEY', { usd: 9 });
    log('coA', 'gerar-dieta:google', { usageAndCost: { costUsd: 0.05 } });
    log('coA', 'gerar-treino:gemini-flash', { usd: 9 }, old);
    log('stA', 'Posso trocar o treino?', 'Pode sim');          // chat do aluno → Coach A
    log('stA', 'weekly-feedback:2026-10-12', { usage: { usd: 0.02 } });
    log('coB', USE_KINDS.laudo, { usd: 0.5 });
    log('stFree', 'Dúvida?', 'resposta');                       // aluno sem coach
    log(PAULO_ID, 'gerar-treino:claude', { usd: 2 });
    const r = await get(tok(PAULO_ID, 'ADMIN'));
    assert.strictEqual(r.status, 200);
    const by = (id: string | null) => r.json.coaches.find((c: any) => c.coachId === id);
    const A = by('coA'), B = by('coB'), M = by(PAULO_ID), F = by(null);
    near(A.usd, 0.10 * 2 + 0.05 + 0.02 + 0.004, 1e-4); assert.strictEqual(A.count, 5); near(A.brl, A.usd * 5.5, 0.01);
    const cat = (c: any, k: string) => c.categories.find((x: any) => x.category === k);
    assert.strictEqual(cat(A, 'treino').count, 2); assert.strictEqual(cat(A, 'treino').estimated, false); assert.strictEqual(cat(A, 'chat').count, 1); assert.strictEqual(cat(A, 'chat').estimated, true);
    assert.strictEqual(cat(A, 'feedback').count, 1); assert.strictEqual(cat(A, 'dieta').count, 1);
    near(B.usd, 0.5); assert.strictEqual(cat(B, 'laudo').count, 1);
    assert.strictEqual(M.master, true); near(M.usd, 2); assert.strictEqual(M.limits, null);
    assert.strictEqual(F.name, 'Alunos sem coach'); assert.strictEqual(F.count, 1);
    assert.deepStrictEqual(r.json.coaches.map((c: any) => c.coachId), [PAULO_ID, 'coB', 'coA', null], 'do mais caro para o mais barato');
    near(r.json.totals.usd, A.usd + B.usd + M.usd + F.usd, 1e-3);
    near(r.json.totals.partnersBrl, (A.usd + B.usd + F.usd) * 5.5, 0.02); assert.ok(r.json.totals.partnersBrl < r.json.totals.brl);
    assert.deepStrictEqual(A.limits, { treino: { used: 2, limit: 30 }, dieta: { used: 1, limit: 60 } });
    assert.deepStrictEqual(B.limits, { treino: { used: 0, limit: 30 }, dieta: { used: 0, limit: 0 } });
    assert.ok(Array.isArray(r.json.notMeasured) && r.json.notMeasured.length > 0);
  });

  await t('rota: escolher o mês (?month=AAAA-MM) mostra só aquele mês; mês inválido volta para o atual', async () => {
    u('coA', 'COACH', { name: 'Coach A', coachPlan: 'ELITE' });
    log('coA', 'gerar-treino:gemini-flash', { usd: 1 }, new Date('2026-08-10T15:00:00Z')); log('coA', 'gerar-treino:gemini-flash', { usd: 3 }, new Date('2026-09-10T15:00:00Z'));
    // 1º de setembro às 01:00 em Brasília ainda é 31/08 22:00 → conta em agosto? (UTC-3: 01:00 BRT = 04:00 UTC)
    log('coA', 'gerar-treino:gemini-flash', { usd: 5 }, new Date('2026-09-01T02:30:00Z'));   // 31/08 23:30 em Brasília → agosto
    let r = await get(tok(PAULO_ID, 'ADMIN'), '?month=2026-08'); assert.strictEqual(r.json.month, '2026-08'); near(r.json.totals.usd, 6);
    r = await get(tok(PAULO_ID, 'ADMIN'), '?month=2026-09'); near(r.json.totals.usd, 3);
    r = await get(tok(PAULO_ID, 'ADMIN'), '?month=lixo'); assert.match(r.json.month, /^\d{4}-\d{2}$/); assert.notStrictEqual(r.json.month, 'lixo'); assert.strictEqual(r.json.coaches.length, 0);
    r = await get(tok(PAULO_ID, 'ADMIN'), '?month=2026-13'); assert.notStrictEqual(r.json.month, '2026-13'); assert.notStrictEqual(r.json.month, '2027-01');
  });

  await t('registro das rotas que não deixavam rastro: logAiUse grava tokens e custo; as 4 rotas chamam com o tipo certo', async () => {
    u('coA', 'COACH');
    await logAiUse(P, 'coA', USE_KINDS.pdfTreino, 'gpt-4o', 4000, 2000, { x: 1 });
    const row = S.aiLog[0]; assert.strictEqual(row.question, USE_KINDS.pdfTreino); const a = JSON.parse(row.answer);
    assert.strictEqual(a.model, 'gpt-4o'); assert.strictEqual(a.inputTokens, 4000); near(a.usd, 0.004 * 2.5 + 0.002 * 10, 1e-6);
    // banco quebrado nunca derruba a rota
    await logAiUse({ aiLog: { create: async () => { throw new Error('banco fora'); } } }, 'coA', USE_KINDS.video, 'gemini-2.5-flash', 1, 1);
    const R = '/home/user/fitos-final/app/api/';
    for (const [f, kind] of [['admin/import-pdf/route.ts', 'pdfTreino'], ['admin/import-diet-pdf/route.ts', 'pdfDieta'], ['assessment/[id]/generate-ai-report/route.ts', 'laudo'], ['analyze/route.ts', 'video']] as const) {
      const src = fs.readFileSync(R + f, 'utf8');
      assert.ok(src.includes(`logAiUse(prisma, auth.user.id, USE_KINDS.${kind},`), f + ' deve registrar o uso (' + kind + ')');
    }
    assert.ok(fs.readFileSync(R + 'analyze/route.ts', 'utf8').includes("usedModel = 'gemini-2.5-pro'"), 'se cair para o Pro, o custo é do Pro');
  });

  console.log(`\n${ok} de ${ok + fails} testes passaram`); if (fails) process.exit(1);
})();
