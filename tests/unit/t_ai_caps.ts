// Limite mensal (20 out 2026) dos usos leves de IA do coach parceiro: ditado por voz, perguntas ao assistente e avaliação de check-in.
// O master não tem limite; o mês é o de Brasília; o que falhou não conta; as perguntas rápidas por regra seguem de graça quando acaba.
import assert from 'assert';
import fs from 'fs';
import jwt from 'jsonwebtoken';
import prisma from '@/lib/prisma';
import { capLimit, capState, capUsed, capResponse, CAP_DEFAULTS, CAP_PREFIXES } from '/home/user/fitos-final/lib/coachMonthlyCaps';
import { USE_KINDS, costOfRow, categorize } from '/home/user/fitos-final/lib/aiCost';
import { PAULO_ID } from '/home/user/fitos-final/lib/masterIds';
import { POST as NOTE_INTERPRET } from '/home/user/fitos-final/app/api/coach-notes/interpretar/route';
import { POST as NOTE_TRANSCRIBE } from '/home/user/fitos-final/app/api/coach-notes/transcrever/route';
import { POST as WORKOUT_INTERPRET } from '/home/user/fitos-final/app/api/ai/treino-por-voz/interpretar/route';
import { POST as DIET_INTERPRET } from '/home/user/fitos-final/app/api/ai/dieta-por-voz/interpretar/route';
import { POST as WORKOUT_TRANSCRIBE } from '/home/user/fitos-final/app/api/ai/treino-por-voz/transcrever/route';
import { POST as ELITE } from '/home/user/fitos-final/app/api/ai/elite-assistant/route';
import { POST as ASK } from '/home/user/fitos-final/app/api/coach-assistant/perguntar/route';
import { POST as EVAL } from '/home/user/fitos-final/app/api/ai/evaluate-checkin/route';
import { GET as USAGE } from '/home/user/fitos-final/app/api/admin/coach-ai-usage/route';

const P = prisma as any; const S = P.__state;
const SECRET = 'dev-only-troque-isso-configurando-JWT_SECRET-no-env';
const tok = (id: string, role = 'COACH') => jwt.sign({ id, role, coachId: null }, SECRET);
const call = async (fn: any, as: string | null, body: any = {}, method = 'POST') => {
  const headers: any = { 'content-type': 'application/json' }; if (as) headers.authorization = 'Bearer ' + as;
  const r = await fn(new Request('http://x/api', { method, headers, ...(method === 'POST' ? { body: JSON.stringify(body) } : {}) }));
  return { status: r.status, json: await r.json().catch(() => null) };
};
let fails = 0, ok = 0;
const t = async (name: string, fn: () => Promise<void> | void) => { P.__reset(); try { await fn(); ok++; console.log('  ok  ' + name); } catch (e: any) { fails++; console.log('  FALHOU  ' + name + '\n' + (e?.stack || e)); } };
const u = (id: string, role: string, extra: any = {}) => S.user.push({ id, role, name: id, accountStatus: 'ACTIVE', active: true, coachBillingStatus: 'ACTIVE', coachId: null, coachPlan: 'ELITE', ...extra });
const grant = (coachId: string, feature: string) => S.coachFeature.push({ id: coachId + feature, coachId, feature, grantedAt: new Date(), revokedAt: null });
const log = (userId: string, question: string, createdAt = new Date()) => S.aiLog.push({ id: Math.random().toString(36).slice(2), userId, question, answer: '{}', createdAt });
let n = 0; const uid = (p: string) => `${p}-${Date.now()}-${n++}`;   // o limite por hora fica em memória: cada teste usa quem ainda não gastou nada
const fill = (id: string, q: string, count: number) => { for (let i = 0; i < count; i++) log(id, q); };
const llm = { calls: 0 }; (globalThis as any).__LLM = async ({ args }: any) => { llm.calls++; return args?.tool_choice?.name ? { content: [{ type: 'tool_use', name: args.tool_choice.name, input: { consulta: 'NENHUMA' } }] } : { content: [{ type: 'text', text: 'ok' }] }; };
process.env.ANTHROPIC_API_KEY = 'x';

(async () => {
  await t('limites: padrão 600 voz / 300 perguntas / 100 check-in; muda pelo Render; valor vazio ou ruim volta ao padrão', () => {
    assert.deepStrictEqual(CAP_DEFAULTS, { voz: 600, perguntas: 300, checkin: 100 });
    assert.strictEqual(capLimit('voz', {}), 600); assert.strictEqual(capLimit('voz', { COACH_LIMIT_VOZ: '50' }), 50); assert.strictEqual(capLimit('perguntas', { COACH_LIMIT_PERGUNTAS: '0' }), 0);
    assert.strictEqual(capLimit('checkin', { COACH_LIMIT_CHECKIN: '' }), 100); assert.strictEqual(capLimit('checkin', { COACH_LIMIT_CHECKIN: 'abc' }), 100); assert.strictEqual(capLimit('checkin', { COACH_LIMIT_CHECKIN: '-5' }), 100);
  });

  await t('contagem: só o que é do tipo, do coach, do mês de Brasília; falhou e chave própria não contam', async () => {
    const co = uid('co'), other = uid('co'); u(co, 'COACH'); u(other, 'COACH');
    fill(co, USE_KINDS.transcricao, 2); fill(co, USE_KINDS.notaVoz, 1); fill(co, USE_KINDS.treinoVoz, 1); fill(co, USE_KINDS.dietaVoz, 1); fill(co, USE_KINDS.perguntaCoach, 4); fill(co, USE_KINDS.eliteAssistente, 2);
    fill(co, 'avaliar-checkin:gemini-flash', 3); fill(co, 'avaliar-checkin:gemini-flash:falhou', 5); fill(co, 'avaliar-checkin:gemini-flash:OWN_KEY', 5);
    fill(other, USE_KINDS.transcricao, 9);
    log(co, USE_KINDS.transcricao, new Date(Date.now() - 80 * 24 * 3600 * 1000));
    assert.strictEqual(await capUsed(P, co, 'voz'), 5); assert.strictEqual(await capUsed(P, co, 'perguntas'), 6); assert.strictEqual(await capUsed(P, co, 'checkin'), 3);
    assert.strictEqual(await capUsed({ aiLog: { count: async () => { throw new Error('x'); } } }, co, 'voz'), -1);
    for (const k of ['voz', 'perguntas', 'checkin'] as const) for (const q of CAP_PREFIXES[k]) assert.ok(q.length > 3, 'prefixo');
  });

  await t('estado: master e aluno nunca chegam ao limite; coach chega no limite exato; banco com erro deixa passar', async () => {
    const co = uid('co'); u(co, 'COACH'); fill(co, USE_KINDS.perguntaCoach, 299);
    let s = await capState(P, { id: co, role: 'COACH' }, 'perguntas'); assert.strictEqual(s.reached, false); assert.strictEqual(s.used, 299); assert.strictEqual(s.limit, 300);
    log(co, USE_KINDS.perguntaCoach); s = await capState(P, { id: co, role: 'COACH' }, 'perguntas'); assert.strictEqual(s.reached, true); assert.match(s.resetsOn, /^01\/\d\d$/);
    fill(PAULO_ID, USE_KINDS.perguntaCoach, 400); assert.strictEqual((await capState(P, { id: PAULO_ID, role: 'ADMIN' }, 'perguntas')).reached, false, 'master sem limite');
    const st = uid('al'); fill(st, USE_KINDS.perguntaCoach, 400); assert.strictEqual((await capState(P, { id: st, role: 'USER' }, 'perguntas')).reached, false, 'aluno não é coach');
    assert.strictEqual((await capState({ aiLog: { count: async () => { throw new Error('x'); } } }, { id: co, role: 'COACH' }, 'perguntas')).reached, false, 'erro nosso nunca trava o coach');
    const r = await capResponse(P, { id: co, role: 'COACH' }, 'perguntas'); assert.strictEqual(r!.status, 429);
    const j: any = await r!.json(); assert.strictEqual(j.message, j.error); assert.strictEqual(j.reply, j.error); assert.strictEqual(j.code, 'LIMITE_MENSAL'); assert.strictEqual(j.kind, 'perguntas'); assert.strictEqual(j.limit, 300); assert.match(j.error, /300 perguntas ao assistente/);
  });

  await t('ditado por voz: com o limite do mês acabado, nota (interpretar e transcrever), treino e dieta por voz respondem 429; coach com saldo e master passam da trava', async () => {
    const full = uid('co'), fine = uid('co'); u(full, 'COACH'); u(fine, 'COACH'); grant(full, 'notasVoz'); grant(fine, 'notasVoz'); u(PAULO_ID, 'ADMIN');
    fill(full, USE_KINDS.transcricao, 600); fill(PAULO_ID, USE_KINDS.transcricao, 900);
    for (const [name, fn, body] of [['nota interpretar', NOTE_INTERPRET, { text: 'Anotar que a Maria melhorou' }], ['treino interpretar', WORKOUT_INTERPRET, { text: 'supino 3x10 e crucifixo 3x12' }], ['dieta interpretar', DIET_INTERPRET, { text: 'café da manhã: 2 ovos e pão' }]] as const) {
      const r = await call(fn, tok(full), body); assert.strictEqual(r.status, 429, name + ': ' + JSON.stringify(r.json)); assert.strictEqual(r.json.code, 'LIMITE_MENSAL', name); assert.strictEqual(r.json.kind, 'voz');
      const ok1 = await call(fn, tok(fine), body); assert.notStrictEqual(ok1.json?.code, 'LIMITE_MENSAL', name + ' com saldo');
      const ok2 = await call(fn, tok(PAULO_ID, 'ADMIN'), body); assert.notStrictEqual(ok2.json?.code, 'LIMITE_MENSAL', name + ' master');
    }
    for (const [name, fn] of [['nota transcrever', NOTE_TRANSCRIBE], ['treino transcrever', WORKOUT_TRANSCRIBE]] as const) {
      const r = await call(fn, tok(full)); assert.strictEqual(r.status, 429, name); assert.strictEqual(r.json.code, 'LIMITE_MENSAL', name);
    }
  });

  await t('perguntas ao assistente: elite-assistant barra com 429; a pergunta ao coach-assistant NÃO dá erro, só deixa de usar IA (segue pelas palavras-chave)', async () => {
    const full = uid('co'), fine = uid('co'); u(full, 'COACH'); u(fine, 'COACH'); grant(full, 'perguntasVoz'); grant(fine, 'perguntasVoz');
    fill(full, USE_KINDS.eliteAssistente, 150); fill(full, USE_KINDS.perguntaCoach, 150);
    let r = await call(ELITE, tok(full), { message: 'Como cadastro um aluno?' }); assert.strictEqual(r.status, 429); assert.strictEqual(r.json.code, 'LIMITE_MENSAL'); assert.match(r.json.reply, /300 perguntas ao assistente/, 'o chat do assistente lê o campo reply');
    llm.calls = 0; r = await call(ELITE, tok(fine), { message: 'Como cadastro um aluno?' }); assert.strictEqual(r.status, 200); assert.strictEqual(llm.calls, 1);
    assert.strictEqual(S.aiLog.filter((x: any) => x.userId === fine && x.question === USE_KINDS.eliteAssistente).length, 1, 'registrou o custo');
    llm.calls = 0; r = await call(ASK, tok(full), { text: 'quais alunos estão sem treino' }); assert.notStrictEqual(r.status, 429); assert.strictEqual(llm.calls, 0, 'sem saldo: não chamou a IA'); assert.ok(r.json?.ok, JSON.stringify(r.json)); assert.strictEqual(r.json.ai, false);
    llm.calls = 0; r = await call(ASK, tok(fine), { text: 'quais alunos estão sem treino' }); assert.strictEqual(llm.calls, 1, 'com saldo: usa a IA'); assert.strictEqual(S.aiLog.filter((x: any) => x.userId === fine && x.question === USE_KINDS.perguntaCoach).length, 1);
  });

  await t('check-in: com 100 avaliações no mês o coach parceiro recebe 429; master não tem limite', async () => {
    const full = uid('co'), fine = uid('co'); u(full, 'COACH'); u(fine, 'COACH'); fill(full, 'avaliar-checkin:gemini-flash', 100); fill(fine, 'avaliar-checkin:gemini-flash', 99); fill(PAULO_ID, 'avaliar-checkin:gemini-argon', 300);
    let r = await call(EVAL, tok(full), {}); assert.strictEqual(r.status, 429); assert.strictEqual(r.json.code, 'LIMITE_MENSAL'); assert.strictEqual(r.json.kind, 'checkin'); assert.match(r.json.message, /100 avaliações de check-in/, 'a tela do check-in lê o campo message');
    r = await call(EVAL, tok(fine), {}); assert.notStrictEqual(r.json?.code, 'LIMITE_MENSAL', 'o 100º ainda passa da trava');
    r = await call(EVAL, tok(PAULO_ID, 'ADMIN'), {}); assert.notStrictEqual(r.json?.code, 'LIMITE_MENSAL');
  });

  await t('painel de custo: novas categorias (ditado, pergunta) e os 5 limites de cada coach parceiro', async () => {
    const co = uid('co'); u(co, 'COACH', { name: 'Coach X', coachPlan: 'ELITE' }); u(PAULO_ID, 'ADMIN');
    fill(co, USE_KINDS.transcricao, 3); fill(co, USE_KINDS.notaVoz, 2); fill(co, USE_KINDS.perguntaCoach, 4); fill(co, 'avaliar-checkin:gemini-flash', 6); fill(co, 'gerar-treino:gemini-flash', 1);
    assert.strictEqual(categorize(USE_KINDS.transcricao), 'ditado'); assert.strictEqual(categorize(USE_KINDS.eliteAssistente), 'pergunta'); assert.strictEqual(categorize(USE_KINDS.corrida), 'corrida'); assert.strictEqual(categorize(USE_KINDS.dietaVoz), 'ditado');
    assert.strictEqual(costOfRow(USE_KINDS.corrida, JSON.stringify({ model: 'claude-opus-4-6', inputTokens: 1_000_000, outputTokens: 0 }))!.usd, 15);
    const r = await call(USAGE, tok(PAULO_ID, 'ADMIN'), {}, 'GET'); assert.strictEqual(r.status, 200);
    const c = r.json.coaches.find((x: any) => x.coachId === co);
    assert.deepStrictEqual(c.limits, { treino: { used: 1, limit: 30 }, dieta: { used: 0, limit: 60 }, voz: { used: 5, limit: 600 }, perguntas: { used: 4, limit: 300 }, checkin: { used: 6, limit: 100 } });
    // o limite mostrado acompanha o Render (e não um número fixo)
    process.env.COACH_LIMIT_VOZ = '11'; process.env.COACH_LIMIT_PERGUNTAS = '12'; process.env.COACH_LIMIT_CHECKIN = '13';
    try { const r2 = await call(USAGE, tok(PAULO_ID, 'ADMIN'), {}, 'GET'); const c2 = r2.json.coaches.find((x: any) => x.coachId === co); assert.deepStrictEqual([c2.limits.voz.limit, c2.limits.perguntas.limit, c2.limits.checkin.limit], [11, 12, 13]); }
    finally { delete process.env.COACH_LIMIT_VOZ; delete process.env.COACH_LIMIT_PERGUNTAS; delete process.env.COACH_LIMIT_CHECKIN; }
    const cat = (k: string) => c.categories.find((x: any) => x.category === k);
    assert.strictEqual(cat('ditado').count, 5); assert.strictEqual(cat('pergunta').count, 4); assert.strictEqual(cat('checkin').count, 6);
  });

  await t('fiação: cada rota registra o custo com o tipo certo', () => {
    const R = '/home/user/fitos-final/app/api/'; const need: Array<[string, string]> = [
      ['coach-notes/transcrever/route.ts', 'USE_KINDS.transcricao'], ['ai/treino-por-voz/transcrever/route.ts', 'USE_KINDS.transcricao'], ['coach-notes/interpretar/route.ts', 'USE_KINDS.notaVoz'],
      ['ai/treino-por-voz/interpretar/route.ts', 'USE_KINDS.treinoVoz'], ['ai/dieta-por-voz/interpretar/route.ts', 'USE_KINDS.dietaVoz'], ['coach-assistant/perguntar/route.ts', 'USE_KINDS.perguntaCoach'],
      ['ai/elite-assistant/route.ts', 'USE_KINDS.eliteAssistente'], ['running/generate/route.ts', 'USE_KINDS.corrida']];
    for (const [f, k] of need) assert.ok(fs.readFileSync(R + f, 'utf8').includes(`logAiUse(prisma, auth.user.id, ${k},`), f + ' deve registrar ' + k);
    const ev = fs.readFileSync(R + 'ai/evaluate-checkin/route.ts', 'utf8'); assert.ok(/if \(!argonUsage\) \{\s*await logAiUse\(prisma, auth\.user\.id, `avaliar-checkin:\$\{selectedModel\}`/.test(ev), 'check-in registra todos os motores');
    for (const f of ['coach-notes/transcrever', 'coach-notes/interpretar', 'ai/treino-por-voz/transcrever', 'ai/treino-por-voz/interpretar', 'ai/dieta-por-voz/interpretar']) assert.ok(fs.readFileSync(R + f + '/route.ts', 'utf8').includes("capResponse(prisma, auth.user, 'voz')"), f + ' tem o limite de voz');
  });

  console.log(`\n${ok} de ${ok + fails} testes passaram`); if (fails) process.exit(1);
})();
