// lib/aiCost.ts
// 💰 (20 out 2026) Custo de IA por coach, a partir da tabela AiLog que já existe (sem tabela nova).
// Cada linha do AiLog vira uma "categoria" (treino, dieta, check-in…) e um custo estimado em dólar:
//   1) se a linha já traz o custo (usd / costUsd), usa ele;  2) se traz só os tokens, calcula pela tabela de preços abaixo;
//   3) se não traz nada (ex.: chat do aluno), usa um valor médio fixo e marca como "estimado".
// É estimativa para decisão (quanto cada coach gasta), não é a fatura do provedor.
import { TTS_LOG_PREFIX } from './assistantVoice';

export const BRL_PER_USD = 5.5;

/** USD por milhão de tokens [entrada, saída]. */
export const PRICES: Record<string, [number, number]> = {
  'gpt-4o': [2.5, 10],
  'gpt-4o-mini': [0.15, 0.6],
  'gemini-2.0-flash': [0.1, 0.4],
  'gemini-2.5-flash': [0.3, 2.5],
  'gemini-2.5-pro': [1.25, 10],
  'claude-haiku-4-5': [1, 5],
  'claude-haiku-5-5': [1, 5],
  'claude-opus-4-6': [15, 75],
};
const DEFAULT_PRICE: [number, number] = [1, 5];
const TTS_USD_PER_CHAR = 18 / BRL_PER_USD / 200_000;   // ~R$ 18 a cada 200 mil letras (mesma conta do limite mensal da voz)

export function priceFor(model: string | null | undefined): [number, number] {
  const m = String(model || '').toLowerCase();
  if (PRICES[m]) return PRICES[m];
  const key = Object.keys(PRICES).sort((a, b) => b.length - a.length).find((k) => m.startsWith(k) || m.includes(k));
  if (key) return PRICES[key];
  if (m.includes('flash')) return PRICES['gemini-2.5-flash'];
  if (m.includes('haiku')) return PRICES['claude-haiku-4-5'];
  return DEFAULT_PRICE;
}
export const usdFromTokens = (model: string | null | undefined, inputTokens: number, outputTokens: number): number => {
  const [pi, po] = priceFor(model);
  return (Math.max(0, inputTokens) / 1e6) * pi + (Math.max(0, outputTokens) / 1e6) * po;
};

export type CostCategory = 'treino' | 'dieta' | 'checkin' | 'analise' | 'feedback' | 'voz' | 'ditado' | 'pergunta' | 'corrida' | 'pdf' | 'laudo' | 'video' | 'chat';
export const CATEGORY_LABEL: Record<CostCategory, string> = {
  treino: 'Treino por IA', dieta: 'Dieta por IA', checkin: 'Avaliação de check-in', analise: 'Análise com memória',
  feedback: 'Feedback da semana', voz: 'Voz (OUVIR)', ditado: 'Ditado por voz (notas, treino, dieta)', pergunta: 'Perguntas ao assistente', corrida: 'Protocolo de corrida por IA', pdf: 'Importar PDF', laudo: 'Laudo da avaliação', video: 'Análise de vídeo', chat: 'Chat do aluno',
};
export const CATEGORY_ORDER: CostCategory[] = ['treino', 'dieta', 'checkin', 'analise', 'feedback', 'ditado', 'pergunta', 'corrida', 'pdf', 'laudo', 'video', 'voz', 'chat'];
/** Valor médio (USD) usado quando a linha não traz custo nem tokens. */
const FLAT_USD: Partial<Record<CostCategory, number>> = { chat: 0.004, ditado: 0.003, pergunta: 0.003, corrida: 0.05, checkin: 0.01, treino: 0.05, dieta: 0.01, analise: 0.03, feedback: 0.005, pdf: 0.08, laudo: 0.01, video: 0.1 };
/** O que a IA do servidor faz mas AINDA não deixa registro (portanto não entra nesta conta). */
export const NOT_MEASURED = ['Uso com a chave de IA do próprio coach (o custo é dele)', 'Qualquer uso feito antes de 20/10/2026 em importar PDF, laudo, vídeo, ditado por voz, perguntas ao assistente e check-in (não havia registro)'];

/** Tag das rotas que passaram a deixar registro agora (uso:<tipo>). */
export const USE_PREFIX = 'uso:';
export const USE_KINDS = {
  pdfTreino: 'uso:importar-pdf-treino', pdfDieta: 'uso:importar-pdf-dieta', laudo: 'uso:laudo-avaliacao', video: 'uso:analise-video',
  transcricao: 'uso:transcricao', notaVoz: 'uso:nota-voz', treinoVoz: 'uso:treino-voz', dietaVoz: 'uso:dieta-voz',
  perguntaCoach: 'uso:pergunta-coach', eliteAssistente: 'uso:elite-assistente', corrida: 'uso:corrida-ia',
} as const;

/** Qual categoria é esta linha do AiLog? Null = linha que não conta (falhou, chave própria do coach). */
export function categorize(question: string): CostCategory | null {
  const q = String(question || '');
  if (q.endsWith(':falhou') || q.endsWith(':OWN_KEY')) return null;
  if (q.startsWith('gerar-treino:')) return 'treino';
  if (q.startsWith('gerar-dieta:')) return 'dieta';
  if (q.startsWith('avaliar-checkin:')) return 'checkin';
  if (q.startsWith('insight-analysis:') || q === 'insight-group') return 'analise';
  if (q.startsWith('weekly-feedback:') || q.startsWith('weekly-whatsapp-parse:')) return 'feedback';
  if (q.startsWith(TTS_LOG_PREFIX)) return 'voz';
  if (q === USE_KINDS.pdfTreino || q === USE_KINDS.pdfDieta) return 'pdf';
  if (q === USE_KINDS.transcricao || q === USE_KINDS.notaVoz || q === USE_KINDS.treinoVoz || q === USE_KINDS.dietaVoz) return 'ditado';
  if (q === USE_KINDS.perguntaCoach || q === USE_KINDS.eliteAssistente) return 'pergunta';
  if (q === USE_KINDS.corrida) return 'corrida';
  if (q === USE_KINDS.laudo) return 'laudo';
  if (q === USE_KINDS.video) return 'video';
  return 'chat';   // o que sobra no AiLog é pergunta do aluno ao assistente (a pergunta é o próprio texto)
}

const parse = (s: string): any => { try { const v = JSON.parse(s); return v && typeof v === 'object' ? v : null; } catch { return null; } };
const n = (v: any): number => { const x = Number(v); return Number.isFinite(x) && x >= 0 ? x : 0; };

/** Custo estimado desta linha, em USD. `estimated` = não veio do registro (usou valor médio ou tabela de preços sobre o texto). */
export function costOfRow(question: string, answer: string): { category: CostCategory; usd: number; estimated: boolean } | null {
  const category = categorize(question);
  if (!category) return null;
  if (category === 'voz') return { category, usd: n(parseInt(String(answer), 10)) * TTS_USD_PER_CHAR, estimated: true };
  const a = parse(answer);
  if (a) {
    const direct = n(a.usd) || n(a.usage?.usd) || n(a.usageAndCost?.costUsd) || n(a.costUsd);
    if (direct > 0) return { category, usd: direct, estimated: false };
    const u = a.usage && typeof a.usage === 'object' ? a.usage : a.usageAndCost && typeof a.usageAndCost === 'object' ? a.usageAndCost : a;
    // cada lugar grava os tokens com um nome (inputTokens, input_tokens da Anthropic, prompt_tokens da OpenAI…): aceita todos
    const tin = n(u.inputTokens) || n(u.inTokens) || n(u.input_tokens) || n(u.prompt_tokens), tout = n(u.outputTokens) || n(u.outTokens) || n(u.output_tokens) || n(u.completion_tokens);
    if (tin + tout > 0) return { category, usd: usdFromTokens(a.model || u.model || a.modelUsed, tin, tout), estimated: false };
  }
  return { category, usd: FLAT_USD[category] ?? 0.01, estimated: true };
}

export interface CategoryTotal { category: CostCategory; label: string; count: number; usd: number; brl: number; estimated: boolean }
export interface CoachCost { coachId: string | null; name: string; plan: string | null; master: boolean; count: number; usd: number; brl: number; categories: CategoryTotal[] }

const round = (x: number, d = 4) => Math.round(x * 10 ** d) / 10 ** d;

/**
 * Junta as linhas do AiLog por coach. `ownerOf(userId)` diz de qual coach é aquela linha
 * (o próprio coach, ou o coach do aluno que perguntou); devolve null para "sem coach".
 */
export function aggregate(rows: Array<{ userId: string; question: string; answer: string }>, ownerOf: (userId: string) => string | null): Map<string | null, Map<CostCategory, { count: number; usd: number; estimated: boolean }>> {
  const out = new Map<string | null, Map<CostCategory, { count: number; usd: number; estimated: boolean }>>();
  for (const r of rows) {
    const c = costOfRow(r.question, r.answer);
    if (!c) continue;
    const owner = ownerOf(r.userId);
    const per = out.get(owner) || new Map();
    const cur = per.get(c.category) || { count: 0, usd: 0, estimated: false };
    cur.count += 1; cur.usd += c.usd; cur.estimated = cur.estimated || c.estimated;
    per.set(c.category, cur); out.set(owner, per);
  }
  return out;
}

export function toCategories(per: Map<CostCategory, { count: number; usd: number; estimated: boolean }> | undefined): CategoryTotal[] {
  return CATEGORY_ORDER.filter((k) => per?.has(k)).map((k) => { const v = per!.get(k)!; return { category: k, label: CATEGORY_LABEL[k], count: v.count, usd: round(v.usd), brl: round(v.usd * BRL_PER_USD, 2), estimated: v.estimated }; });
}

/** Registro de uso das rotas que gastam IA e antes não deixavam rastro. Nunca derruba a rota. */
export async function logAiUse(db: any, userId: string, kind: string, model: string, inputTokens: number, outputTokens: number, extra: Record<string, any> = {}): Promise<void> {
  try {
    await db.aiLog.create({ data: { userId, question: kind, answer: JSON.stringify({ model, inputTokens: n(inputTokens), outputTokens: n(outputTokens), usd: round(usdFromTokens(model, n(inputTokens), n(outputTokens)), 6), ...extra }).slice(0, 2000) } });
  } catch (e: any) { console.error('[aiCost] não registrou o uso:', e?.message || e); }
}

const clip = (t: any, max: number) => { const x = String(t ?? '').replace(/\s+/g, ' ').trim(); return x.length > max ? x.slice(0, max - 1) + '…' : x; };

/** Resumo de uma linha do que aconteceu naquele uso (motor, tokens, tempo, fotos…). Nunca devolve o texto da resposta. */
export function describeRow(question: string, answer: string): string {
  const q = String(question || ''); const a = parse(answer) || {};
  const u = a.usage && typeof a.usage === 'object' ? a.usage : a.usageAndCost && typeof a.usageAndCost === 'object' ? a.usageAndCost : a;
  const parts: string[] = [];
  const motor = q.includes(':') ? q.split(':')[1] : '';
  const model = a.model || u.model || a.modelUsed;
  if (q.startsWith('gerar-treino:') || q.startsWith('gerar-dieta:') || q.startsWith('avaliar-checkin:')) parts.push(`motor ${motor}`);
  else if (model) parts.push(String(model));
  if (a.dayType) parts.push(`dia ${a.dayType}`);
  if (a.days) parts.push(`${a.days} dia(s)`); if (a.exercises) parts.push(`${a.exercises} exercício(s)`);
  if (a.photos) parts.push(`${a.photos} foto(s)`);
  if (a.bytes) parts.push(`áudio ${Math.round(n(a.bytes) / 1024)} KB`);
  if (q.startsWith('[TTS]')) parts.push(`${n(parseInt(String(answer), 10))} letras, voz ${q.replace('[TTS] ', '')}`);
  const tin = n(u.inputTokens) || n(u.input_tokens) || n(u.inTokens) || n(u.prompt_tokens), tout = n(u.outputTokens) || n(u.output_tokens) || n(u.outTokens) || n(u.completion_tokens);
  if (tin + tout > 0) parts.push(`${tin} entrada + ${tout} saída (tokens)`);
  if (n(u.ms) > 0) parts.push(`${(n(u.ms) / 1000).toFixed(1)} s`);
  if (q.startsWith('weekly-feedback:') || q.startsWith('weekly-whatsapp-parse:')) parts.push(`semana ${q.split(':').slice(1).join(':')}`);
  if (q.startsWith('insight-analysis:')) parts.push(q.endsWith(':inc') ? 'análise incremental' : 'análise completa');
  return parts.join(' · ');
}
/** Só o chat do aluno guarda a pergunta como texto: mostra um pedaço dela (o painel só mostra isso para o time master). */
export const chatQuestion = (q: string, max = 160) => clip(q, max);
