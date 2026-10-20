import assert from 'assert';
import jwt from 'jsonwebtoken';
import prisma from '@/lib/prisma';
import { POST as avaliar } from '/home/user/fitos-final/app/api/ai/evaluate-checkin/route';
import { callArgon, argonError, estimateArgonUsd, argonPrice, normalizeThinking, ARGON_MODEL, ARGON_MAX_OUTPUT, ARGON_PRICE_UNTIL } from '/home/user/fitos-final/lib/ai/argon';
import { PAULO_ID, ADRI_ID } from '/home/user/fitos-final/lib/masterIds';

const G: any = globalThis; const db: any = (prisma as any).__db;
const tok = (id: string, role = 'COACH') => jwt.sign({ id, role, coachId: null }, 'dev-only-troque-isso-configurando-JWT_SECRET-no-env');
const quiet = async <T,>(fn: () => Promise<T>) => { const w = console.warn, e = console.error, l = console.log; console.warn = console.error = console.log = () => {}; try { return await fn(); } finally { console.warn = w; console.error = e; console.log = l; } };
let ok = 0; const t = async (name: string, fn: () => Promise<void> | void) => { try { await fn(); ok++; console.log('  ok  ' + name); } catch (e: any) { console.log('FALHOU  ' + name + '\n' + String(e?.stack || e).split('\n').slice(0, 6).join('\n')); process.exitCode = 1; } };

(async () => {
  const GOOD = { text: '{"a":1}', candidates: [{ finishReason: 'STOP' }], usageMetadata: { promptTokenCount: 1000, candidatesTokenCount: 400, thoughtsTokenCount: 600, cachedContentTokenCount: 200 } };
  const mk = (resp: any) => { const calls: any[] = []; return { calls, models: { generateContent: async (a: any) => { calls.push(a); if (resp instanceof Error) throw resp; return typeof resp === 'function' ? resp(a, calls.length) : resp; } } }; };
  const err = (status: number, message: string) => Object.assign(new Error(message), { status });

  await t('chamada: modelo certo, instrução fixa à parte, pensamento em maiúsculas, teto de escrita, texto + imagens; devolve texto, tokens, tempo e custo', async () => {
    const c = mk(GOOD); const imgs = [{ inlineData: { data: 'AAA', mimeType: 'image/jpeg' } }];
    const r = await callArgon(c, { system: 'REGRAS', user: 'ALUNO', images: imgs, now: (() => { let n = 5000; return () => (n += 300); })() });
    const a = c.calls[0]; assert.equal(ARGON_MODEL, 'gemini-4-argon'); assert.equal(a.model, 'gemini-4-argon'); assert.equal(a.config.systemInstruction, 'REGRAS'); assert.deepEqual(a.config.thinkingConfig, { thinkingLevel: 'MEDIUM' }); assert.equal(a.config.maxOutputTokens, ARGON_MAX_OUTPUT);
    assert.deepEqual(a.contents, [{ role: 'user', parts: [{ text: 'ALUNO' }, imgs[0]] }]); assert.ok(a.config.abortSignal);
    assert.equal(r.text, '{"a":1}'); assert.deepEqual([r.usage.inputTokens, r.usage.outputTokens, r.usage.thinkingTokens, r.usage.cacheReadTokens, r.usage.ms, r.usage.thinking], [1000, 400, 600, 200, 300, 'medium']);
    assert.equal(r.usage.usd, estimateArgonUsd({ inputTokens: 1000, outputTokens: 400, thinkingTokens: 600, cacheReadTokens: 200 })); assert.ok(r.usage.usd > 0);
    const sem = mk(GOOD); await callArgon(sem, { user: 'x' }); assert.ok(!('systemInstruction' in sem.calls[0].config), 'sem regras fixas: nada de instrução vazia');
  });

  await t('nível de pensamento: padrão medium; pedido (low/high) vale; variável de ambiente troca o padrão; lixo vira medium', async () => {
    for (const [lvl, up] of [['low', 'LOW'], ['high', 'HIGH'], ['medium', 'MEDIUM']] as const) { const c = mk(GOOD); const r = await callArgon(c, { user: 'x', thinking: lvl }); assert.equal(c.calls[0].config.thinkingConfig.thinkingLevel, up); assert.equal(r.usage.thinking, lvl); }
    assert.equal(normalizeThinking('LOW'), 'low'); assert.equal(normalizeThinking(' High '), 'high'); assert.equal(normalizeThinking('banana'), 'medium'); assert.equal(normalizeThinking(undefined), 'medium');
    process.env.ARGON_THINKING_LEVEL = 'low'; try { const c = mk(GOOD); await callArgon(c, { user: 'x' }); assert.equal(c.calls[0].config.thinkingConfig.thinkingLevel, 'LOW'); } finally { delete process.env.ARGON_THINKING_LEVEL; }
  });

  await t('custo: preço de lançamento (US$ 2 / 10) até 30/11/2026 e depois US$ 4 / 20; cache da entrada sai 90% mais barato; pensamento cobra como saída', async () => {
    const u = { inputTokens: 100000, outputTokens: 5000, thinkingTokens: 5000, cacheReadTokens: 0 };
    assert.deepEqual(argonPrice(ARGON_PRICE_UNTIL), [2, 10]); assert.deepEqual(argonPrice(ARGON_PRICE_UNTIL + 1000), [4, 20]);
    assert.equal(estimateArgonUsd(u, ARGON_PRICE_UNTIL), 0.3); assert.equal(estimateArgonUsd(u, ARGON_PRICE_UNTIL + 1000), 0.6);
    assert.equal(estimateArgonUsd({ ...u, cacheReadTokens: 100000 }, ARGON_PRICE_UNTIL), 0.12, 'tudo em cache: 100 mil x 0,2 + 10 mil x 10');
    assert.ok(estimateArgonUsd({ ...u, thinkingTokens: 0 }, ARGON_PRICE_UNTIL) < estimateArgonUsd(u, ARGON_PRICE_UNTIL), 'pensar custa');
  });

  await t('erros do Google viram aviso em português: não liberado, sem saldo, sem permissão, tempo; erro desconhecido passa como veio', async () => {
    const run = (e: any, o: any = {}) => callArgon(mk(e), { user: 'x', ...o });
    await assert.rejects(() => run(err(404, 'models/gemini-4-argon is not found for API version v1beta')), /Gemini Argon ainda não está liberado.*Escolha outro motor/);
    await assert.rejects(() => run(new Error('{"error":{"code":404,"message":"model not found","status":"NOT_FOUND"}}')), /ainda não está liberado/, '404 que vem só dentro do texto');
    await assert.rejects(() => run(err(429, 'RESOURCE_EXHAUSTED: quota exceeded')), /sem saldo ou no limite/); await assert.rejects(() => run(new Error('Your prepayment credits are depleted')), /sem saldo ou no limite/);
    await assert.rejects(() => run(err(403, 'API key not valid')), /não tem permissão para usar o Gemini Argon/); await assert.rejects(() => run(err(401, 'x')), /não tem permissão/);
    await assert.rejects(() => run(Object.assign(new Error('The operation was aborted'), { name: 'AbortError' })), /demorou demais/);
    await assert.rejects(() => run(new Error('Deadline exceeded')), /demorou demais/);
    const odd = new Error('falha estranha 123'); assert.strictEqual(argonError(odd), odd, 'erro desconhecido: o mesmo erro'); assert.ok(!(odd as any).userMessage); assert.equal((argonError(err(404, 'x')) as any).userMessage, true); await assert.rejects(() => run(odd), /falha estranha 123/);
  });

  await t('tempo limite: passou do prazo cancela a chamada e avisa; nenhuma tentativa extra para erro que não é "indisponível"', async () => {
    let aborted = false; const slow: any = { models: { generateContent: (a: any) => new Promise(() => { a.config.abortSignal.addEventListener('abort', () => { aborted = true; }); }) } };
    await assert.rejects(() => callArgon(slow, { user: 'x', timeoutMs: 30 }), /Gemini Argon demorou demais/); assert.equal(aborted, true, 'a chamada pendurada foi cancelada');
    const c = mk(err(404, 'not found')); await assert.rejects(() => callArgon(c, { user: 'x', retries: 2 })); assert.equal(c.calls.length, 1, 'não insiste em "não liberado"');
  });

  await t('tentativa extra só quando o Google diz "indisponível" (503/500) e só até o limite pedido', async () => {
    const waits: number[] = []; const wait = async (ms: number) => { waits.push(ms); };
    const c = mk((_a: any, n: number) => { if (n === 1) throw err(503, 'The model is overloaded. Please try again later.'); return GOOD; });
    const r = await callArgon(c, { user: 'x', retries: 1, wait }); assert.equal(c.calls.length, 2); assert.equal(r.text, '{"a":1}'); assert.deepEqual(waits, [3000]);
    const c2 = mk(err(503, 'UNAVAILABLE')); await assert.rejects(() => callArgon(c2, { user: 'x', retries: 1, wait }), /UNAVAILABLE/); assert.equal(c2.calls.length, 2, 'uma tentativa extra e acabou');
    const c3 = mk(err(503, 'UNAVAILABLE')); await assert.rejects(() => callArgon(c3, { user: 'x', wait })); assert.equal(c3.calls.length, 1, 'padrão: sem tentativa extra (o treino já leva até 85 s)');
  });

  await t('resposta cortada, bloqueada ou vazia: aviso claro (o texto parcial não é usado)', async () => {
    await assert.rejects(() => callArgon(mk({ ...GOOD, candidates: [{ finishReason: 'MAX_TOKENS' }] }), { user: 'x' }), /não terminou de escrever/);
    await assert.rejects(() => callArgon(mk({ ...GOOD, candidates: [{ finishReason: 'SAFETY' }] }), { user: 'x' }), /recusou este pedido/);
    await assert.rejects(() => callArgon(mk({ text: '', promptFeedback: { blockReason: 'OTHER' } }), { user: 'x' }), /recusou este pedido/);
    const vazio = await callArgon(mk({ candidates: [{ finishReason: 'STOP' }] }), { user: 'x' }); assert.equal(vazio.text, '', 'sem texto: devolve vazio (quem chama decide)'); assert.equal(vazio.usage.inputTokens, 0);
  });

  // ═════ rota de avaliação do check-in ═════
  process.env.GOOGLE_AI_KEY = 'chave-teste';
  const photos = ['data:image/jpeg;base64,AAAA', 'data:image/jpeg;base64,BBBB'];
  const post = async (as: string, body: any) => { const r = await quiet(() => avaliar(new Request('http://x/api/ai/evaluate-checkin', { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + tok(as, as === 'coach-p' ? 'COACH' : 'ADMIN') }, body: JSON.stringify(body) }))); let j: any = null; try { j = await r.json(); } catch {} return { status: r.status, json: j }; };
  const reset = () => { G.__ARGON_CALLS = []; G.__FLASH_CALLS = []; G.__ARGON_KEYS = []; db.aiLog.length = 0; G.__LOG_FAIL = false; G.__ARGON = async () => GOOD; };

  await t('avaliação das fotos: master escolhe Argon -> texto, nome do motor, uso na resposta e custo no registro; fotos e orientação do coach vão na mesma chamada', async () => {
    reset(); G.__ARGON = async () => { await new Promise((r) => setTimeout(r, 25)); return { ...GOOD, text: 'Ótima evolução, Maria!' }; };   // 25 ms de demora: um limite de tempo curto demais na rota estragaria a resposta
    const r = await post(PAULO_ID, { coachId: PAULO_ID, aiModel: 'gemini-argon', customCurrentPhotos: photos, contextText: 'foque na cintura' });
    assert.equal(r.status, 200, JSON.stringify(r.json)); assert.equal(r.json.analysis, 'Ótima evolução, Maria!'); assert.equal(r.json.modelUsed, 'Gemini 4 Argon (teste)'); assert.equal(r.json.usage.model, 'gemini-4-argon'); assert.equal(r.json.usage.outputTokens, 400); assert.equal(r.json.usage.thinkingTokens, 600);
    assert.equal(G.__ARGON_CALLS.length, 1); const a = G.__ARGON_CALLS[0]; assert.equal(a.model, 'gemini-4-argon'); assert.equal(a.contents[0].parts.length, 3, 'texto + 2 fotos'); assert.ok(/foque na cintura/.test(a.contents[0].parts[0].text)); assert.equal(a.contents[0].parts[1].inlineData.data, 'AAAA'); assert.equal(G.__ARGON_KEYS[0], 'chave-teste'); assert.deepEqual(G.__FLASH_CALLS, [], 'o Flash nem foi chamado');
    assert.equal(db.aiLog.length, 1); assert.equal(db.aiLog[0].question, 'avaliar-checkin:gemini-argon'); assert.equal(db.aiLog[0].userId, PAULO_ID); const lj = JSON.parse(db.aiLog[0].answer); assert.equal(lj.photos, 2); assert.equal(lj.usd, r.json.usage.usd); assert.equal(lj.chars, 'Ótima evolução, Maria!'.length);
    reset(); const adri = await post(ADRI_ID, { coachId: ADRI_ID, aiModel: 'gemini-argon', customCurrentPhotos: photos }); assert.equal(adri.status, 200); assert.equal(G.__ARGON_CALLS.length, 1, 'a Adri também é master');
  });

  await t('quem não é master nunca chega no Argon (nem forjando o corpo); modelo desconhecido cai no Flash; os outros motores seguem iguais', async () => {
    reset(); const p = await post('coach-p', { coachId: 'coach-p', aiModel: 'gemini-argon', customCurrentPhotos: photos }); assert.equal(p.status, 200, JSON.stringify(p.json)); assert.equal(G.__ARGON_CALLS.length, 0, 'parceiro: Argon não é chamado'); assert.deepEqual(G.__FLASH_CALLS, ['gemini-2.5-flash']); assert.equal(p.json.modelUsed, 'Gemini 2.5 Flash'); assert.ok(!('usage' in p.json)); assert.equal(db.aiLog.length, 1, 'o Flash do parceiro também deixa registro (painel de custo e limite do mês)'); assert.equal(db.aiLog[0].question, 'avaliar-checkin:gemini-flash'); assert.equal(db.aiLog[0].userId, 'coach-p'); assert.equal(JSON.parse(db.aiLog[0].answer).photos, 2);
    reset(); const x = await post(PAULO_ID, { coachId: PAULO_ID, aiModel: 'gemini-9-inventado', customCurrentPhotos: photos }); assert.equal(x.status, 200); assert.deepEqual(G.__FLASH_CALLS, ['gemini-2.5-flash'], 'nome inventado/__proto__ vira Flash'); assert.equal(G.__ARGON_CALLS.length, 0);
    reset(); const y = await post(PAULO_ID, { coachId: PAULO_ID, aiModel: 'toString', customCurrentPhotos: photos }); assert.deepEqual(G.__FLASH_CALLS, ['gemini-2.5-flash'], 'chave herdada do objeto não vale'); assert.equal(y.status, 200);
    reset(); const pro = await post(PAULO_ID, { coachId: PAULO_ID, aiModel: 'gemini-pro', customCurrentPhotos: photos }); assert.equal(pro.status, 200); assert.deepEqual(G.__FLASH_CALLS, ['gemini-2.5-pro']); assert.equal(pro.json.modelUsed, 'Gemini 2.5 Pro'); assert.equal(G.__ARGON_CALLS.length, 0); assert.equal(db.aiLog.length, 1); assert.equal(db.aiLog[0].question, 'avaliar-checkin:gemini-pro'); assert.equal(JSON.parse(db.aiLog[0].answer).model, 'gemini-2.5-pro');
  });

  await t('avaliação: Argon fora do ar (não liberado / sem saldo) devolve erro com o aviso em português e não grava custo; falha ao gravar o custo não derruba a avaliação', async () => {
    reset(); G.__ARGON = async () => { throw err(404, 'models/gemini-4-argon is not found'); }; const a = await post(PAULO_ID, { coachId: PAULO_ID, aiModel: 'gemini-argon', customCurrentPhotos: photos });
    assert.equal(a.status, 500); assert.match(a.json.details, /Gemini Argon ainda não está liberado/); assert.equal(a.json.message, a.json.details, 'o app mostra o campo message'); assert.equal(db.aiLog.length, 0);
    reset(); G.__ARGON = async () => { throw err(429, 'RESOURCE_EXHAUSTED'); }; const b = await post(PAULO_ID, { coachId: PAULO_ID, aiModel: 'gemini-argon', customCurrentPhotos: photos }); assert.equal(b.status, 500); assert.match(b.json.details, /sem saldo ou no limite/); assert.match(b.json.message, /sem saldo/);
    reset(); G.__LOG_FAIL = true; const c = await post(PAULO_ID, { coachId: PAULO_ID, aiModel: 'gemini-argon', customCurrentPhotos: photos }); assert.equal(c.status, 200, 'o registro de custo nunca derruba a avaliação'); assert.ok(c.json.analysis);
    reset(); let n503 = 0; G.__ARGON = async () => { if (++n503 === 1) throw err(503, 'The model is overloaded'); return GOOD; }; const e503 = await post(PAULO_ID, { coachId: PAULO_ID, aiModel: 'gemini-argon', customCurrentPhotos: photos }); assert.equal(e503.status, 200, JSON.stringify(e503.json)); assert.equal(G.__ARGON_CALLS.length, 2, 'Google "indisponível": a avaliação tenta mais uma vez');
    reset(); G.__ARGON = async () => ({ ...GOOD, text: '' }); const d = await post(PAULO_ID, { coachId: PAULO_ID, aiModel: 'gemini-argon', customCurrentPhotos: photos }); assert.equal(d.status, 503, 'resposta vazia: o aviso de motor indisponível de sempre'); assert.equal(d.json.error, 'ai_unavailable');
  });

  console.log(`\n${ok} blocos ok`);
})().catch((e) => { console.error(e); process.exit(1); });
