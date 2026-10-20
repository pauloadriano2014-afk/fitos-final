// Gemini Argon na dieta por IA (20 out 2026): motor de teste só do time master; custo vem pronto do Argon; coach parceiro nunca chega nele.
import assert from 'assert';
import jwt from 'jsonwebtoken';
import { generateDietDay } from '/home/user/fitos-final/lib/ai/dietGen';
import { PAULO_ID } from '/home/user/fitos-final/lib/masterIds';

const G: any = globalThis;
process.env.GOOGLE_AI_KEY = 'chave-teste';
const ana = { peso: 80, altura: 180, objetivo: 'Hipertrofia', frequencia: 4, refeicoesDia: 4, favoriteFoodIds: [] };
const DIET = JSON.stringify({ meals: [], reasoning: 'Plano de teste' });
const GOOD = { text: DIET, candidates: [{ finishReason: 'STOP' }], usageMetadata: { promptTokenCount: 10000, candidatesTokenCount: 2000, thoughtsTokenCount: 3000, cachedContentTokenCount: 0 } };
let ok = 0, fails = 0;
const t = async (name: string, fn: () => Promise<void>) => { G.__ARGON_CALLS = []; G.__ARGON = async () => GOOD; try { await fn(); ok++; console.log('  ok  ' + name); } catch (e: any) { fails++; console.log('  FALHOU  ' + name + '\n' + (e?.stack || e)); } };

(async () => {
  await t('provider gemini-argon: chama o modelo do Argon com o pedido da dieta, devolve o plano e o custo estimado pronto (entrada + saída + pensamento)', async () => {
    const r: any = await generateDietDay({ anamnese: ana, dayType: 'TREINO', provider: 'gemini-argon' });
    assert.strictEqual(G.__ARGON_CALLS.length, 1); const a = G.__ARGON_CALLS[0]; assert.strictEqual(a.model, 'gemini-4-argon'); assert.ok(a.contents[0].parts[0].text.length > 200, 'o pedido da dieta foi junto');
    assert.strictEqual(r.reasoning, 'Plano de teste'); assert.strictEqual(r.meta.provider, 'gemini-argon'); assert.strictEqual(r.meta.modelUsed, 'gemini-4-argon');
    assert.strictEqual(r.usageAndCost.inTokens, 10000); assert.strictEqual(r.usageAndCost.outTokens, 5000, 'saída + pensamento');
    assert.ok(Math.abs(r.usageAndCost.costUsd - (10000 * 2 + 5000 * 10) / 1e6) < 1e-4, 'US$ 0,07 no preço de lançamento: ' + r.usageAndCost.costUsd);
    assert.ok(Math.abs(r.usageAndCost.costBrl - r.usageAndCost.costUsd * 5.5) < 1e-9);
  });
  await t('os outros motores seguem sem passar pelo Argon', async () => {
    G.__LLM = async () => ({ content: [{ type: 'text', text: DIET }] });
    process.env.ANTHROPIC_API_KEY = 'x';
    const r: any = await generateDietDay({ anamnese: ana, dayType: 'TREINO', provider: 'anthropic-haiku' });
    assert.strictEqual(G.__ARGON_CALLS.length, 0); assert.strictEqual(r.meta.provider, 'anthropic-haiku');
  });
  await t('Argon sem acesso: o aviso em português chega inteiro (não vira erro genérico)', async () => {
    G.__ARGON = async () => { throw Object.assign(new Error('models/gemini-4-argon is not found'), { status: 404 }); };
    await assert.rejects(() => generateDietDay({ anamnese: ana, dayType: 'TREINO', provider: 'gemini-argon' }), /ainda não está liberado/);
  });
  await t('resposta que não é JSON de dieta dá erro claro', async () => {
    G.__ARGON = async () => ({ ...GOOD, text: 'desculpe, não consegui' });
    await assert.rejects(() => generateDietDay({ anamnese: ana, dayType: 'TREINO', provider: 'gemini-argon' }), /JSON válido/);
  });
  console.log(`\n${ok} de ${ok + fails} testes passaram`); if (fails) process.exit(1);
})();
