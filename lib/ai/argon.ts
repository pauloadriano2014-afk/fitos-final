// lib/ai/argon.ts
// 🧪 (19 out 2026) Motor de TESTE: Gemini 4 Argon (`gemini-4-argon`), só para os masters (Paulo e Adri), em dois lugares:
//   • Protocolo ELITE (montagem do treino) — lib/ai/workoutGen.ts, motor "ARGON";
//   • avaliação das fotos do check-in — app/api/ai/evaluate-checkin/route.ts, motor "gemini-argon".
// Os outros motores continuam como estavam; o Argon é uma opção a mais para comparar nota e custo com o mesmo aluno.
//   • "nível de pensamento" (thinkingLevel): low | medium | high (o do Google é medium). Aqui o padrão é medium; dá para trocar sem mexer no código com a variável ARGON_THINKING_LEVEL;
//   • o pensamento do modelo conta como texto escrito (e é cobrado como tal): por isso o teto de escrita é alto (o treino é um JSON grande) e o custo estimado soma o pensamento;
//   • preço de lançamento US$ 2 (entrada) / US$ 10 (saída) por milhão de tokens até 30/11/2026; depois US$ 4 / US$ 20 — é só estimativa para o registro de custo (AiLog);
//   • o acesso ao modelo está sendo liberado por etapas: se a chave ainda não enxerga o Argon, ou ficou sem saldo, o coach recebe um aviso claro em português (e escolhe outro motor), não um erro técnico;
//   • devolve os tokens gastos, o tempo e o custo estimado para o registro (é o que permite comparar com o Flash/Haiku/GPT em número real).
export const ARGON_MODEL = 'gemini-4-argon';
export const ARGON_LABEL = 'Gemini Argon';
export type ArgonThinking = 'low' | 'medium' | 'high';
export const normalizeThinking = (x: any): ArgonThinking => { const v = String(x || '').trim().toLowerCase(); return v === 'low' || v === 'high' ? v : 'medium'; };
/** Teto de escrita (inclui o pensamento). O Argon aceita até 65.536. */
export const ARGON_MAX_OUTPUT = 48_000;
export const ARGON_PRICE_UNTIL = Date.UTC(2026, 10, 30, 23, 59, 59);   // 30/11/2026
export const ARGON_PRICE_INTRO: [number, number] = [2, 10];
export const ARGON_PRICE_REGULAR: [number, number] = [4, 20];
export const argonPrice = (at: number = Date.now()): [number, number] => (at <= ARGON_PRICE_UNTIL ? ARGON_PRICE_INTRO : ARGON_PRICE_REGULAR);

export interface ArgonUsage { model: string; thinking: ArgonThinking; inputTokens: number; outputTokens: number; thinkingTokens: number; cacheReadTokens: number; ms: number; usd: number }
/** Custo estimado: entrada (o que veio do cache sai 90% mais barato) + saída (texto + pensamento). */
export const estimateArgonUsd = (u: { inputTokens: number; outputTokens: number; thinkingTokens: number; cacheReadTokens: number }, at: number = Date.now()): number => {
  const [pin, pout] = argonPrice(at);
  const fresh = Math.max(0, u.inputTokens - u.cacheReadTokens);
  return Math.round(((fresh * pin + u.cacheReadTokens * pin * 0.1 + (u.outputTokens + u.thinkingTokens) * pout) / 1e6) * 100000) / 100000;
};

const statusOf = (e: any): number => Number(e?.status ?? e?.code ?? e?.error?.code ?? e?.response?.status) || 0;
const textOf = (e: any): string => String(e?.message || e?.error?.message || e || '');
/** Traduz o erro do Google para um aviso que o coach entende. Erro que não é conhecido passa como veio. */
export function argonError(e: any, who: string = ARGON_LABEL): Error {
  const st = statusOf(e); const msg = textOf(e);
  if (e?.name === 'AbortError' || e?.name === 'TimeoutError' || /time(d)? ?out|deadline/i.test(msg)) return new Error(`${who} demorou demais. Tente de novo ou escolha outro motor.`);
  if (st === 404 || /not found|is not supported|unknown model|no such model|does not exist/i.test(msg)) return new Error(`${who} ainda não está liberado para a chave do Gemini deste servidor (o Google está liberando por etapas). Escolha outro motor.`);
  if (st === 429 || /quota|resource.?exhausted|rate.?limit|credit|billing|prepayment/i.test(msg)) return new Error(`A chave do Gemini está sem saldo ou no limite de uso agora (${who}). Veja o painel do Google AI Studio ou escolha outro motor.`);
  if (st === 401 || st === 403 || /api key|permission|unauthori[sz]ed|forbidden/i.test(msg)) return new Error(`A chave do Gemini não tem permissão para usar o ${who}. Escolha outro motor.`);
  return e instanceof Error ? e : new Error(msg);
}
const retryable = (e: any) => { const st = statusOf(e); return st === 503 || st === 500 || /unavailable|overloaded|try again/i.test(textOf(e)); };

export interface ArgonCall {
  /** Regras fixas (vão como instrução do sistema). */
  system?: string;
  /** Mensagem do pedido (texto). */
  user: string;
  /** Imagens já em base64 no formato do Gemini: { inlineData: { data, mimeType } }. */
  images?: any[];
  /** Nível de pensamento (padrão: ARGON_THINKING_LEVEL ou medium). */
  thinking?: ArgonThinking;
  maxOutputTokens?: number;
  timeoutMs?: number;
  /** Quantas vezes tentar de novo quando o Google responde "indisponível" (503/500). */
  retries?: number;
  now?: () => number;
  wait?: (ms: number) => Promise<void>;
}

/**
 * Uma chamada ao Argon. `client` é um `GoogleGenAI` (@google/genai). Devolve o texto e o gasto.
 * Falhas viram `Error` com mensagem em português (ver `argonError`).
 */
export async function callArgon(client: any, o: ArgonCall): Promise<{ text: string; usage: ArgonUsage }> {
  const now = o.now || Date.now; const t0 = now();
  const thinking = o.thinking || normalizeThinking(process.env.ARGON_THINKING_LEVEL);
  const timeoutMs = o.timeoutMs ?? 85_000;
  const parts: any[] = [{ text: o.user }, ...(o.images || [])];
  const tries = 1 + Math.max(0, o.retries ?? 0);
  let r: any;
  for (let i = 0; i < tries; i++) {
    const ctl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    let timer: any;
    try {
      const call = client.models.generateContent({
        model: ARGON_MODEL,
        contents: [{ role: 'user', parts }],
        config: {
          ...(o.system ? { systemInstruction: o.system } : {}),
          thinkingConfig: { thinkingLevel: thinking.toUpperCase() },
          maxOutputTokens: o.maxOutputTokens ?? ARGON_MAX_OUTPUT,
          ...(ctl ? { abortSignal: ctl.signal } : {}),
        },
      });
      const limit = new Promise<never>((_, rej) => { timer = setTimeout(() => { try { ctl && ctl.abort(); } catch (_) { /* nada */ } const err: any = new Error('timeout'); err.name = 'TimeoutError'; rej(err); }, timeoutMs); });
      r = await Promise.race([call, limit]);
      break;
    } catch (e: any) {
      if (i < tries - 1 && retryable(e)) { await (o.wait || ((ms: number) => new Promise<void>((res) => setTimeout(res, ms))))(3000); continue; }
      throw argonError(e);
    } finally { if (timer) clearTimeout(timer); }
  }
  const cand = Array.isArray(r?.candidates) ? r.candidates[0] : null;
  const reason = String(cand?.finishReason || '');
  if (r?.promptFeedback?.blockReason || reason === 'SAFETY' || reason === 'PROHIBITED_CONTENT' || reason === 'BLOCKLIST') throw new Error(`${ARGON_LABEL} recusou este pedido. Tente outro motor.`);
  if (reason === 'MAX_TOKENS') throw new Error(`${ARGON_LABEL} não terminou de escrever (ficou grande demais). Tente de novo ou escolha outro motor.`);
  // `r.text` do SDK junta só as partes de texto (o pensamento vem separado)
  const text = String(r?.text ?? '');
  const u = r?.usageMetadata || {};
  const base = { inputTokens: Number(u.promptTokenCount) || 0, outputTokens: Number(u.candidatesTokenCount) || 0, thinkingTokens: Number(u.thoughtsTokenCount) || 0, cacheReadTokens: Number(u.cachedContentTokenCount) || 0 };
  return { text, usage: { model: ARGON_MODEL, thinking, ...base, ms: now() - t0, usd: estimateArgonUsd(base) } };
}
