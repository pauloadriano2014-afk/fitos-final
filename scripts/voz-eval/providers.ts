// scripts/voz-eval/providers.ts
// Cada "provedor" recebe o texto e devolve a resposta BRUTA da IA (no formato
// da ferramenta registrar_treino) + uso de tokens. O resto (normalizar,
// casar com a biblioteca, corrigir) é o mesmo código de produção para todos.
import type { RawParse } from '../../lib/voiceWorkout/normalize';

export type ProviderResult = {
  raw: RawParse | null;
  inputTokens: number;
  outputTokens: number;
  ms: number;
};
export type Provider = {
  spec: string;                    // ex.: "claude:claude-haiku-4-5"
  model: string;
  run: (text: string, caseId: string) => Promise<ProviderResult>;
};

// US$ por 1M de tokens. Claude: tabela de modelos (25/09/2026). Gemini 3.8 Flash:
// preço INTRODUTÓRIO até 31/12/2026; a partir de 01/01/2027 vira 1,50 / 7,50.
// Confira em https://ai.google.dev/gemini-api/docs/pricing antes de decidir.
export const PRICES: Record<string, { in: number; out: number }> = {
  'claude-haiku-4-5': { in: 1, out: 5 },
  'claude-sonnet-5-5': { in: 2, out: 10 },
  'gemini-3.8-flash': { in: 0.75, out: 3.75 },
};
export const costUsd = (model: string, inTok: number, outTok: number) => {
  const p = PRICES[model];
  return p ? (inTok * p.in + outTok * p.out) / 1_000_000 : 0;
};

// Estimativa (NÃO medida) usada só no aviso de custo antes de rodar.
export const ASSUMED_TOKENS = { in: 1500, out: 700 };

export async function makeProvider(spec: string, oracle: (caseId: string) => RawParse): Promise<Provider> {
  const [kind, ...rest] = spec.split(':');
  const model = rest.join(':');

  if (kind === 'oracle') {
    return { spec, model: 'oracle', run: async (_t, id) => ({ raw: oracle(id), inputTokens: 0, outputTokens: 0, ms: 0 }) };
  }
  if (kind === 'null') {
    return { spec, model: 'null', run: async () => ({ raw: { exercicios: [] }, inputTokens: 0, outputTokens: 0, ms: 0 }) };
  }
  if (kind === 'sloppy') {
    // Simula um modelo que esquece TODA técnica (drop set, GVT...). Serve só pra
    // provar que a avaliação enxerga esse tipo de erro (e apenas ele).
    const strip = (id: string): RawParse => {
      const j = JSON.parse(JSON.stringify(oracle(id)));
      for (const e of (j.exercicios as any[]) || []) { delete e.tecnica_geral; for (const bl of e.blocos || []) delete bl.tecnica; }
      return j;
    };
    return { spec, model: 'sloppy', run: async (_t, id) => ({ raw: strip(id), inputTokens: 0, outputTokens: 0, ms: 0 }) };
  }
  if (kind === 'broken') {
    return { spec, model: 'broken', run: async () => { throw new Error('erro induzido de API'); } };
  }

  if (kind === 'claude') {
    // Entrada REAL de produção (mesmo prompt, ferramenta e parâmetros da rota).
    const { extractOnce } = await import('../../lib/voiceWorkout/extract');
    return {
      spec, model,
      run: async (text) => {
        const r = await extractOnce(text, model);
        return { raw: r.input, inputTokens: r.inputTokens, outputTokens: r.outputTokens, ms: r.ms };
      },
    };
  }

  if (kind === 'gemini') {
    // Candidato: usa o MESMO prompt e o MESMO esquema de produção, só troca o modelo.
    // ⚠ Este caminho não foi testado contra a API real do Gemini.
    const { SYSTEM_PROMPT, TOOL } = await import('../../lib/voiceWorkout/extract');
    const { GoogleGenerativeAI } = await import('@google/generative-ai');
    const key = process.env.GEMINI_API_KEY;
    if (!key) throw new Error('GEMINI_API_KEY não configurada.');
    const gm = new GoogleGenerativeAI(key).getGenerativeModel({
      model,
      systemInstruction:
        `${SYSTEM_PROMPT}\n\nEm vez de chamar a ferramenta, responda SOMENTE com um JSON válido (sem markdown, sem texto extra) que siga este esquema:\n${JSON.stringify(TOOL.input_schema)}`,
      generationConfig: { temperature: 0, responseMimeType: 'application/json' },
    });
    return {
      spec, model,
      run: async (text) => {
        const t0 = Date.now();
        const r = await gm.generateContent(text);
        const ms = Date.now() - t0;
        let txt = r.response.text().trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
        let raw: RawParse | null = null;
        try { raw = JSON.parse(txt); } catch { raw = null; }
        const u: any = r.response.usageMetadata || {};
        const inTok = u.promptTokenCount ?? 0;
        // total - prompt inclui os tokens de "raciocínio", que são cobrados como saída
        const outTok = u.totalTokenCount ? u.totalTokenCount - inTok : (u.candidatesTokenCount ?? 0);
        return { raw, inputTokens: inTok, outputTokens: outTok, ms };
      },
    };
  }

  throw new Error(`Provedor desconhecido: "${spec}". Use claude:<modelo>, gemini:<modelo>, oracle, null, sloppy ou broken.`);
}
