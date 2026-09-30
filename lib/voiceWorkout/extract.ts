// lib/voiceWorkout/extract.ts
// 🎙️ (30 set 2026) Chamada à IA que transforma a fala do coach em dados
// estruturados. Ela SÓ extrai o que foi dito -- não escolhe exercício do banco
// (isso é do match.ts) e não preenche padrões (isso é do normalize.ts).
//
// Modelo padrão: Claude Haiku 4.5 (rápido e barato; tarefa de extração).
// Se a resposta vier inválida, uma segunda tentativa com Claude Sonnet 5.5.
import Anthropic from '@anthropic-ai/sdk';
import { TECH_KEYS } from './techniques';
import { normalizeParse, type RawParse } from './normalize';

export const PRIMARY_MODEL = 'claude-haiku-4-5';
export const FALLBACK_MODEL = 'claude-sonnet-5-5';

const TOOL_NAME = 'registrar_treino';

export const SYSTEM_PROMPT = `Você transforma a descrição FALADA de um treino de musculação (português do Brasil) em dados estruturados, chamando a ferramenta ${TOOL_NAME}.

REGRAS
1. Um item em "exercicios" para cada exercício citado, na ordem em que foram ditos. Nunca invente exercícios e nunca junte dois exercícios em um item.
2. "nome_falado": só o nome do exercício, como foi dito (ex.: "agachamento livre", "leg press 45", "búlgaro no Smith"). Sem séries, repetições, técnica ou descanso.
3. "blocos": lista de grupos de séries consecutivas iguais.
   - "3 séries de 15, 12 e 10 repetições" -> 3 blocos: {series:1,reps:"15"}, {series:1,reps:"12"}, {series:1,reps:"10"}.
   - "3x10" ou "3 séries de 10" -> 1 bloco: {series:3,reps:"10"}.
   - Faixas: "3x8 a 10" -> {series:3,reps:"8-10"}.
   - Técnica numa série específica separa essa série no seu próprio bloco: "3x10 com drop set na última" -> [{series:2,reps:"10"},{series:1,reps:"10",tecnica:"DROPSET"}].
   - "até a falha" -> reps:"Falha".
   - Se o número de séries ou de repetições NÃO foi dito, omita o campo. Não chute.
4. Técnicas (campo "tecnica" do bloco ou "tecnica_geral" do exercício): ${TECH_KEYS.join(', ')}, OUTRA.
   DROPSET = drop set; RESTPAUSE = rest pause; BISET = bi-set; TRISET = tri-set; 21 = método 21; CLUSTERSET = cluster; 1_5_REPS = 1 e meia repetição; TUT = tempo sob tensão; GVT = 10x10 alemão; OUTRA = qualquer outra (escreva o nome em "observacao").
   - Use "tecnica_geral" quando a técnica vale para o exercício inteiro (GVT, bi-set, tri-set, método 21, TUT, cluster).
   - GVT: se disseram só "GVT" ou "método GVT", NÃO preencha séries nem reps (o sistema aplica o padrão). Se disseram "GVT 6x10", use series:6 e reps:"10". Se disseram "10 séries de GVT", use series:10.
5. Descanso, sempre em segundos: "um minuto" = 60, "um minuto e meio" = 90, "45 segundos" = 45.
   - "descanso_seg" (no exercício) vale para as séries daquele exercício.
   - Se o coach deu UM descanso para todos os exercícios ("descanso de 60 em todos"), use "descanso_padrao_seg" e não repita em cada exercício.
   - Se o descanso não foi dito, omita.
6. Números por extenso viram dígitos.
7. Ignore o que não for treino (nome da aluna, "beleza", "próximo", hesitações).
8. "observacao": só orientação de execução dita pelo coach, ou o nome de uma técnica OUTRA. Curta. Omita se não houver.
9. "avisos": só dúvidas relevantes (ex.: trecho ininteligível). Curtos. Lista vazia se não houver.`;

const TECH_ENUM = [...TECH_KEYS, 'OUTRA'];

export const TOOL = {
  name: TOOL_NAME,
  description: 'Registra o treino descrito pelo coach, um item por exercício, na ordem falada.',
  input_schema: {
    type: 'object' as const,
    properties: {
      descanso_padrao_seg: { type: 'integer', minimum: 0, maximum: 600, description: 'Descanso único para todos os exercícios, em segundos.' },
      exercicios: {
        type: 'array',
        maxItems: 40,
        items: {
          type: 'object',
          properties: {
            nome_falado: { type: 'string' },
            blocos: {
              type: 'array',
              maxItems: 20,
              items: {
                type: 'object',
                properties: {
                  series: { type: 'integer', minimum: 1, maximum: 30 },
                  reps: { type: 'string', description: 'Ex.: "12", "8-10", "Falha".' },
                  tecnica: { type: 'string', enum: TECH_ENUM },
                  descanso_seg: { type: 'integer', minimum: 0, maximum: 600 },
                },
              },
            },
            tecnica_geral: { type: 'string', enum: TECH_ENUM },
            descanso_seg: { type: 'integer', minimum: 0, maximum: 600 },
            observacao: { type: 'string' },
          },
          required: ['nome_falado'],
        },
      },
      avisos: { type: 'array', items: { type: 'string' } },
    },
    required: ['exercicios'],
  },
};

export type ExtractUsage = {
  model: string;
  inputTokens: number;
  outputTokens: number;
  ms: number;
  usedFallback: boolean;
};

export type ExtractResult = {
  parsed: NonNullable<ReturnType<typeof normalizeParse>>;
  usage: ExtractUsage;
};

// Haiku aceita forçar a ferramenta e temperatura 0; os modelos maiores (Sonnet
// 5.5, Opus 5.5...) não aceitam tool_choice forçado (400).
const isHaikuModel = (model: string) => model.startsWith('claude-haiku');

async function callModel(client: Anthropic, model: string, text: string, forced: boolean) {
  const t0 = Date.now();
  const isHaiku = isHaikuModel(model);
  const resp = await client.messages.create({
    model,
    max_tokens: isHaiku ? 3000 : 6000,
    ...(isHaiku ? { temperature: 0 } : {}),
    system: forced ? SYSTEM_PROMPT : `${SYSTEM_PROMPT}\n\nResponda chamando a ferramenta ${TOOL_NAME}.`,
    tools: [TOOL],
    // Haiku 4.5 aceita forçar a ferramenta. O Sonnet 5.5 NÃO (400): lá o
    // "tool_choice" fica em auto e a instrução acima manda usar a ferramenta.
    tool_choice: forced ? { type: 'tool', name: TOOL_NAME } : { type: 'auto' },
    messages: [{ role: 'user', content: text }],
  } as any);

  const block: any = (resp.content as any[]).find((b) => b.type === 'tool_use' && b.name === TOOL_NAME);
  return {
    input: (block?.input ?? null) as RawParse | null,
    inputTokens: resp.usage?.input_tokens ?? 0,
    outputTokens: resp.usage?.output_tokens ?? 0,
    ms: Date.now() - t0,
  };
}

function makeClient() {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY não configurada no servidor.');
  return new Anthropic({ apiKey, timeout: 40_000, maxRetries: 1 });
}

/** Uma chamada só, com o modelo pedido, sem tentativa reserva. Usada pela avaliação (scripts/voz-eval). */
export async function extractOnce(text: string, model: string) {
  return callModel(makeClient(), model, text, isHaikuModel(model));
}

export async function extractWorkout(text: string): Promise<ExtractResult> {
  const client = makeClient();

  const attempts: Array<{ model: string; forced: boolean }> = [
    { model: PRIMARY_MODEL, forced: true },
    { model: FALLBACK_MODEL, forced: false },
  ];

  let lastError: unknown = null;
  for (let i = 0; i < attempts.length; i++) {
    const { model, forced } = attempts[i];
    try {
      const r = await callModel(client, model, text, forced);
      const parsed = normalizeParse(r.input);
      if (parsed && parsed.exercises.length > 0) {
        return {
          parsed,
          usage: { model, inputTokens: r.inputTokens, outputTokens: r.outputTokens, ms: r.ms, usedFallback: i > 0 },
        };
      }
      lastError = new Error('A IA não devolveu nenhum exercício reconhecível.');
    } catch (e) {
      lastError = e;
    }
  }
  throw lastError instanceof Error ? lastError : new Error('Falha ao interpretar o treino.');
}
