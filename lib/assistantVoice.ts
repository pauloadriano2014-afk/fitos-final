// lib/assistantVoice.ts
// 🔊 (13 out 2026) VOZ NATURAL das respostas do assistente (OpenAI gpt-4o-mini-tts). Por enquanto SÓ o time master (Paulo/Adri).
// Regras: texto curto (a resposta falada já é curta), vozes de uma lista fixa, CACHE das respostas repetidas (não gasta de novo), LIMITE MENSAL de letras (env TTS_MONTHLY_CHARS,
// padrão 200 mil ≈ R$ 18) contado na tabela AiLog que já existe (sem tabela nova) e, se qualquer coisa falhar, o app volta sozinho para a voz do aparelho.
import { createHash } from 'crypto';

export const TTS_MODEL = 'gpt-4o-mini-tts';
export const TTS_VOICES = ['coral', 'nova', 'shimmer', 'sage', 'ash', 'onyx'] as const;
export type TtsVoice = (typeof TTS_VOICES)[number];
export const DEFAULT_VOICE: TtsVoice = 'coral';
export const MAX_TTS_CHARS = 700;
export const DEFAULT_MONTHLY_CHARS = 200_000;
export const TTS_LOG_PREFIX = '[TTS] ';
export const TTS_INSTRUCTIONS = 'Fale em português do Brasil, com voz natural, calorosa e clara, como uma assistente atenciosa. Ritmo normal, sem exagero. Leia nomes próprios com naturalidade e faça pausas curtas entre as frases.';

export const isVoice = (v: any): v is TtsVoice => (TTS_VOICES as readonly string[]).includes(String(v));
export const monthlyLimit = (): number => { const n = parseInt(String(process.env.TTS_MONTHLY_CHARS || ''), 10); return Number.isFinite(n) && n > 0 ? n : DEFAULT_MONTHLY_CHARS; };
export const cleanTtsText = (t: any): string => String(t == null ? '' : t).replace(/\s+/g, ' ').trim();
export const monthStart = (now: Date): Date => new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));

// ─── cache em memória (some no deploy; serve para "OUVIR" de novo e para a mesma pergunta no dia) ───
const MAX_CACHE = 60;
const cache = new Map<string, string>();
export const cacheKey = (voice: string, text: string) => createHash('sha256').update(`${voice}|${text}`).digest('hex');
export const cacheGet = (k: string): string | null => cache.get(k) ?? null;
export function cacheSet(k: string, b64: string) { if (cache.size >= MAX_CACHE) { const first = cache.keys().next().value; if (first !== undefined) cache.delete(first); } cache.set(k, b64); }
export const cacheClear = () => cache.clear();

/** Letras já gastas neste mês (soma do AiLog). Falha do banco = 0 (nunca derruba a fala; o limite do processo e o de uso por hora ainda valem). */
export async function usedThisMonth(db: any, now: Date = new Date()): Promise<number> {
  try {
    const rows: any[] = await db.aiLog.findMany({ where: { question: { startsWith: TTS_LOG_PREFIX }, createdAt: { gte: monthStart(now) } }, select: { answer: true } });
    return rows.reduce((n, r) => n + (parseInt(String(r.answer), 10) || 0), 0);
  } catch { return 0; }
}
export async function logUsage(db: any, userId: string, voice: string, chars: number): Promise<void> {
  try { await db.aiLog.create({ data: { userId, question: TTS_LOG_PREFIX + voice, answer: String(chars) } }); } catch (e: any) { console.error('[voz] não registrou o uso:', e?.message || e); }
}
