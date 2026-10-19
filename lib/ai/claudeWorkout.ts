// lib/ai/claudeWorkout.ts
// 🧠 (19 out 2026) Montagem de treino com os modelos da Anthropic (HAIKU = Claude Haiku 5.5, CLAUDE = Claude Sonnet 5.5), no mesmo formato dos outros motores: recebe o prompt
// (regras + biblioteca = parte que NÃO muda de aluno para aluno, mais a mensagem do aluno) e devolve o texto com o JSON do treino. Quem monta o prompt e valida a resposta é
// lib/ai/workoutGen.ts (ids inventados saem, bi-set é consertado...). Aqui só a chamada:
//   • o prompt fixo vai com `cache_control` (cache de 5 min da Anthropic): gerar treino para várias alunas seguidas paga a biblioteca com ~90% de desconto a partir da 2ª;
//   • sem forçar ferramenta (o Sonnet 5.5 recusa `tool_choice` forçado) e sem prefill; só pede JSON no texto, como os outros motores;
//   • limite de 90 s (o Render corta a requisição em ~100 s): estourou, o coach recebe um aviso claro em vez de erro genérico;
//   • devolve os tokens gastos para o registro de custo (AiLog).
export const WORKOUT_CLAUDE_MODELS = { HAIKU: 'claude-haiku-5-5', CLAUDE: 'claude-sonnet-5-5' } as const;
export type ClaudeEngine = keyof typeof WORKOUT_CLAUDE_MODELS;
export const isClaudeEngine = (x: any): x is ClaudeEngine => x === 'HAIKU' || x === 'CLAUDE';
export const WORKOUT_LABEL: Record<ClaudeEngine, string> = { HAIKU: 'O Claude Haiku', CLAUDE: 'O Claude Sonnet' };
export const WORKOUT_TIMEOUT_MS = 90_000;
export const WORKOUT_MAX_TOKENS = 16_000;
/** US$ por milhão de tokens (entrada, saída) — só para a estimativa do registro de custo. */
export const WORKOUT_PRICE: Record<ClaudeEngine, [number, number]> = { HAIKU: [0.1, 0.5], CLAUDE: [2, 10] };

export interface WorkoutUsage { model: string; inputTokens: number; outputTokens: number; cacheReadTokens: number; cacheWriteTokens: number; ms: number; usd: number }
export const estimateUsd = (engine: ClaudeEngine, u: { inputTokens: number; outputTokens: number; cacheReadTokens: number; cacheWriteTokens: number }): number => {
  const [pin, pout] = WORKOUT_PRICE[engine];
  return Math.round(((u.inputTokens * pin + u.cacheReadTokens * pin * 0.1 + u.cacheWriteTokens * pin * 1.25 + u.outputTokens * pout) / 1e6) * 100000) / 100000;
};

export async function callClaudeWorkout(client: any, o: { engine: ClaudeEngine; system: string; user: string; now?: () => number }): Promise<{ text: string; usage: WorkoutUsage }> {
  const now = o.now || Date.now; const t0 = now();
  const model = WORKOUT_CLAUDE_MODELS[o.engine]; const who = WORKOUT_LABEL[o.engine];
  let r: any;
  try {
    r = await client.messages.create({
      model, max_tokens: WORKOUT_MAX_TOKENS,
      system: [{ type: 'text', text: o.system, cache_control: { type: 'ephemeral' } }],
      messages: [{ role: 'user', content: o.user }],
      output_config: { effort: o.engine === 'HAIKU' ? 'low' : 'medium' },
    });
  } catch (e: any) {
    if (e?.name === 'APIConnectionTimeoutError' || /time(d)? ?out/i.test(String(e?.message || ''))) throw new Error(`${who} demorou demais para montar o treino. Tente de novo ou escolha outro motor.`);
    throw e;
  }
  if (r?.stop_reason === 'refusal') throw new Error(`${who} recusou montar este treino. Tente outro motor.`);
  if (r?.stop_reason === 'max_tokens') throw new Error(`${who} não terminou de escrever o treino (ficou grande demais). Tente de novo ou escolha outro motor.`);
  const text = (Array.isArray(r?.content) ? r.content : []).filter((c: any) => c && c.type === 'text').map((c: any) => String(c.text || '')).join('');
  const u = r?.usage || {};
  const base = { inputTokens: Number(u.input_tokens) || 0, outputTokens: Number(u.output_tokens) || 0, cacheReadTokens: Number(u.cache_read_input_tokens) || 0, cacheWriteTokens: Number(u.cache_creation_input_tokens) || 0 };
  return { text, usage: { model, ...base, ms: now() - t0, usd: estimateUsd(o.engine, base) } };
}
