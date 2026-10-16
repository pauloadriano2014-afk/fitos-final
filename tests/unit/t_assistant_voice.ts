import assert from 'assert';
import jwt from 'jsonwebtoken';
import prisma from '@/lib/prisma';
import * as V from '/home/user/fitos-final/lib/assistantVoice';
import { POST as VOZ } from '/home/user/fitos-final/app/api/coach-assistant/voz/route';
import { GET as CATALOGO } from '/home/user/fitos-final/app/api/coach-assistant/catalogo/route';
import { PAULO_ID, ADRI_ID } from '/home/user/fitos-final/lib/masterIds';

const P = prisma as any; const S = P.__state; const G: any = globalThis;
const SECRET = 'dev-only-troque-isso-configurando-JWT_SECRET-no-env';
const tok = (id: string, role = 'COACH') => jwt.sign({ id, role, coachId: null }, SECRET);
const post = async (as: string | null, body: any) => { const headers: any = { 'content-type': 'application/json' }; if (as) headers.authorization = 'Bearer ' + as; const r = await VOZ(new Request('http://x/api/coach-assistant/voz', { method: 'POST', body: JSON.stringify(body), headers })); return { status: r.status, json: await r.json().catch(() => null) }; };
let fails = 0, ok = 0;
const t = async (name: string, fn: () => Promise<void> | void) => { P.__reset(); V.cacheClear(); G.__TTS_CALLS = 0; G.__TTS_FAIL = false; G.__TTS_BYTES = undefined; G.__TTS_ARGS = undefined; process.env.OPENAI_API_KEY = 'k'; delete process.env.TTS_MONTHLY_CHARS; try { await fn(); ok++; console.log('  ok  ' + name); } catch (e: any) { fails++; console.log('  FALHOU  ' + name + '\n        ' + (e && e.stack ? e.stack.split('\n').slice(0, 4).join('\n        ') : e)); } };
const seed = () => { for (const [id, n] of [[PAULO_ID, 'Paulo'], [ADRI_ID, 'Adri'], ['cA', 'Coach A']]) S.user.push({ id, role: 'COACH', name: n, accountStatus: 'ACTIVE', active: true }); S.user.push({ id: 'a1', role: 'USER', accountStatus: 'ACTIVE', active: true }); };
const FRASE = '3 pessoas com cobrança vencendo nos próximos 7 dias: Ana, vence amanhã.';

(async () => {
  await t('só o time master: Paulo e Adri falam; coach comum, aluno e sem login são barrados SEM gastar a OpenAI', async () => {
    seed();
    for (const id of [PAULO_ID, ADRI_ID]) { const r = await post(tok(id), { text: FRASE }); assert.strictEqual(r.status, 200, id); assert.strictEqual(r.json.mime, 'audio/mpeg'); assert.strictEqual(Buffer.from(r.json.audio, 'base64').toString(), 'mp3-bytes'); }
    G.__TTS_CALLS = 0; const c = await post(tok('cA'), { text: FRASE }); assert.strictEqual(c.status, 403); assert.strictEqual(c.json.locked, true); assert.strictEqual((await post(tok('a1', 'USER'), { text: FRASE })).status, 403); assert.strictEqual((await post(null, { text: FRASE })).status, 401); assert.strictEqual(G.__TTS_CALLS, 0, 'nenhuma chamada à OpenAI');
  });
  await t('pedido à OpenAI: modelo, voz escolhida (lista fixa; voz inválida cai na padrão), instruções em português, mp3', async () => {
    seed(); await post(tok(PAULO_ID), { text: FRASE, voice: 'nova' }); const a = G.__TTS_ARGS; assert.strictEqual(a.model, 'gpt-4o-mini-tts'); assert.strictEqual(a.voice, 'nova'); assert.strictEqual(a.input, FRASE); assert.strictEqual(a.response_format, 'mp3'); assert.ok(/português do Brasil/.test(a.instructions));
    await post(tok(PAULO_ID), { text: FRASE + ' x', voice: 'hacker; DROP' }); assert.strictEqual(G.__TTS_ARGS.voice, 'coral'); assert.deepStrictEqual([...V.TTS_VOICES], ['coral', 'nova', 'shimmer', 'sage', 'ash', 'onyx']);
  });
  await t('texto: vazio e longo demais recusados; espaços e quebras são limpos antes de falar e de contar', async () => {
    seed(); const m = tok(PAULO_ID); assert.strictEqual((await post(m, { text: ' ' })).status, 400); assert.strictEqual((await post(m, {})).status, 400); assert.strictEqual((await post(m, { text: 'x'.repeat(701) })).status, 400); assert.strictEqual((await post(m, { text: 'x'.repeat(700) })).status, 200);
    await post(m, { text: '  Ana,\n\n vence   amanhã.  ' }); assert.strictEqual(G.__TTS_ARGS.input, 'Ana, vence amanhã.'); assert.strictEqual(G.__TTS_CALLS, 2);
  });
  await t('cache: a mesma fala (mesma voz) não chama a OpenAI nem gasta o limite de novo; voz diferente é outra fala', async () => {
    seed(); const m = tok(PAULO_ID); const a = await post(m, { text: FRASE, voice: 'coral' }); assert.strictEqual(a.json.cached, false); const b = await post(m, { text: FRASE, voice: 'coral' }); assert.strictEqual(b.json.cached, true); assert.strictEqual(b.json.audio, a.json.audio); assert.strictEqual(G.__TTS_CALLS, 1);
    assert.strictEqual(S.aiLog.length, 1, 'só a 1ª vez foi registrada'); await post(m, { text: FRASE, voice: 'onyx' }); assert.strictEqual(G.__TTS_CALLS, 2); assert.strictEqual(S.aiLog.length, 2);
    for (let i = 0; i < 70; i++) V.cacheSet('k' + i, 'v'); assert.strictEqual(V.cacheGet('k0'), null, 'cache tem teto'); assert.strictEqual(V.cacheGet('k69'), 'v');
  });
  await t('limite mensal: soma do AiLog do mês; passou = 429 com budget (o app cai na voz do aparelho); cache ainda toca; mês novo zera; env muda o limite', async () => {
    seed(); const m = tok(PAULO_ID); process.env.TTS_MONTHLY_CHARS = '100';
    const a = await post(m, { text: 'a'.repeat(60) }); assert.strictEqual(a.status, 200); assert.deepStrictEqual([a.json.used, a.json.limit], [60, 100]);
    const b = await post(m, { text: 'b'.repeat(60) }); assert.strictEqual(b.status, 429); assert.strictEqual(b.json.budget, true); assert.strictEqual(G.__TTS_CALLS, 1, 'não chamou a OpenAI');
    const c = await post(m, { text: 'a'.repeat(60) }); assert.strictEqual(c.status, 200); assert.strictEqual(c.json.cached, true, 'o que já está no cache toca de graça');
    const d = await post(m, { text: 'c'.repeat(40) }); assert.strictEqual(d.status, 200, 'cabe exatamente no que sobra'); assert.strictEqual((await post(m, { text: 'd'.repeat(2) })).status, 429);
    S.aiLog.forEach((r: any) => { r.createdAt = new Date(Date.now() - 40 * 86400000); }); assert.strictEqual(await V.usedThisMonth(P), 0, 'gasto de outro mês não conta'); assert.strictEqual((await post(m, { text: 'e'.repeat(60) })).status, 200);
    S.aiLog.push({ id: 'x', userId: 'u', question: 'pergunta qualquer', answer: '999999', createdAt: new Date() }); assert.strictEqual(await V.usedThisMonth(P) < 999999, true, 'registros de outras IAs não entram'); assert.strictEqual(V.monthlyLimit(), 100); delete process.env.TTS_MONTHLY_CHARS; assert.strictEqual(V.monthlyLimit(), 200000); process.env.TTS_MONTHLY_CHARS = 'lixo'; assert.strictEqual(V.monthlyLimit(), 200000);
  });
  await t('falhas viram erro simples (o app usa a voz do aparelho): sem chave 503; OpenAI fora 502; áudio vazio 502; banco fora não derruba a fala', async () => {
    seed(); const m = tok(PAULO_ID); delete process.env.OPENAI_API_KEY; assert.strictEqual((await post(m, { text: FRASE })).status, 503); process.env.OPENAI_API_KEY = 'k';
    G.__TTS_FAIL = true; assert.strictEqual((await post(m, { text: FRASE })).status, 502); G.__TTS_FAIL = false; assert.strictEqual(S.aiLog.length, 0, 'falha não conta como gasto');
    G.__TTS_BYTES = ''; assert.strictEqual((await post(m, { text: FRASE + ' 2' })).status, 502);
    G.__TTS_BYTES = undefined; S.__failAi = true; P.__state.failOn.aiLog = { message: 'banco fora' }; const r = await post(m, { text: FRASE + ' 3' }); assert.strictEqual(r.status, 200, 'sem o registro de uso a fala continua'); P.__state.failOn = {};
  });
  await t('limite por hora (120 falas novas) protege a conta; o catálogo avisa quem tem a voz natural (só master)', async () => {
    seed(); const m = tok(ADRI_ID); let last: any = null; for (let i = 0; i < 121; i++) last = await post(m, { text: 'fala numero ' + i }); assert.strictEqual(last.status, 429); assert.ok(!last.json.budget, 'é o limite por hora, não o do mês');
    const cat = async (id: string) => (await (await CATALOGO(new Request('http://x/api/coach-assistant/catalogo', { headers: { authorization: 'Bearer ' + tok(id) } }))).json());
    assert.strictEqual((await cat(PAULO_ID)).voice, true); assert.strictEqual((await cat('cA')).voice, false);
  });
  console.log(`\n${ok} ok, ${fails} falharam`); process.exit(fails ? 1 : 0);
})();
