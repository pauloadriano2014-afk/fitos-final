// lib/geminiCache.ts
// 🔥 (21 set 2026) Cache explícito do Gemini (SDK novo @google/genai) — a
// pedido do Paulo, pra não pagar o preço cheio de reenviar o catálogo de
// exercícios/dieta inteiro em toda chamada de IA.
//
// Como funciona: a chave do cache é um hash do CONTEÚDO estático (banco de
// exercícios + guia de variação, por coach+ambiente). Se o Paulo editar um
// exercício, o hash muda sozinho e um cache novo é criado — não precisa
// invalidar nada manualmente.
//
// Guardamos o "nome" do cache (devolvido pela Gemini) num Map em memória.
// Isso vive só enquanto o processo do servidor estiver de pé — se o Render
// reiniciar a instância, o Map esvazia e o próximo request recria o cache
// (custo normal só nessa primeira chamada). Múltiplas instâncias/réplicas
// não compartilham esse Map, mas isso só significa "menos cache hit", nunca
// erro — sempre cai no fallback de criar um novo.
//
// ⚠️ Cache explícito da Gemini só é aceito acima de um mínimo de tokens
// (4096 pros modelos 3.x Flash). Por isso só usamos isso pro TREINO (banco
// de exercícios é grande o suficiente); a dieta tem um catálogo pequeno
// demais pra qualificar — ver nota em generate-diet/route.ts.

import { GoogleGenAI } from '@google/genai';
import crypto from 'crypto';

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY as string });

type CacheEntry = { name: string; expiresAt: number };
const cacheStore = new Map<string, CacheEntry>();

const DEFAULT_TTL_SECONDS = 3600; // 1h — dá pra reusar ao longo de uma sessão de trabalho do coach
const MIN_TOKENS_FOR_CACHE = 4096; // mínimo exigido pelos modelos Flash 3.x da Gemini

export function hashForCache(...parts: string[]): string {
  return crypto.createHash('sha1').update(parts.join('|')).digest('hex').slice(0, 16);
}

// Estimativa grosseira de tokens (~4 chars/token) só pra decidir se vale a
// pena tentar cachear — não precisa ser exata, é só um corte de segurança
// pra não gastar uma chamada extra tentando cachear algo pequeno demais
// (a API rejeita e a gente teria que cair no fallback de qualquer forma).
function roughTokenEstimate(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * Retorna o `name` de um cachedContent já existente (e ainda válido) ou cria
 * um novo. Se o conteúdo for pequeno demais pra qualificar pro cache
 * explícito da Gemini, retorna null — quem chamar deve então mandar o
 * conteúdo estático direto no prompt, sem cache.
 */
export async function getOrCreateGeminiCache(opts: {
  model: string;
  cacheKey: string;
  systemInstruction?: string;
  staticContent: string;
  ttlSeconds?: number;
}): Promise<string | null> {
  const { model, cacheKey, systemInstruction, staticContent, ttlSeconds = DEFAULT_TTL_SECONDS } = opts;

  const estTokens = roughTokenEstimate((systemInstruction || '') + staticContent);
  if (estTokens < MIN_TOKENS_FOR_CACHE) return null;

  const existing = cacheStore.get(cacheKey);
  if (existing && existing.expiresAt > Date.now()) {
    return existing.name;
  }

  try {
    const cache = await ai.caches.create({
      model,
      config: {
        contents: [{ role: 'user', parts: [{ text: staticContent }] }],
        ...(systemInstruction ? { systemInstruction } : {}),
        ttl: `${ttlSeconds}s`,
      },
    });
    cacheStore.set(cacheKey, { name: cache.name as string, expiresAt: Date.now() + ttlSeconds * 1000 });
    return cache.name as string;
  } catch (err) {
    // Se der qualquer erro criando o cache (conteúdo pequeno, modelo sem
    // suporte, quota etc.) simplesmente não cacheia — a chamada principal
    // segue sem cachedContent, sem quebrar a geração do treino/dieta.
    console.warn('[geminiCache] Falha ao criar cache, seguindo sem cache:', (err as any)?.message || err);
    return null;
  }
}

export { ai as geminiClient };
