// lib/voiceDiet/extract.ts
// 🎙️ (30 set 2026) Dieta por voz -- chamada à IA que transforma a fala do coach
// em refeições/alimentos estruturados. Ela SÓ extrai o que foi dito: não escolhe
// alimento do catálogo (match.ts), não converte unidades (units.ts) e não
// preenche porções (o app).
//
// Modelo padrão: Claude Haiku 4.5 (extração, rápido e barato). Se a resposta vier
// inválida, segunda tentativa com Claude Sonnet 5.5 -- o mesmo esquema do treino por voz.
import Anthropic from '@anthropic-ai/sdk';
import { SPOKEN_UNITS } from './units';
import { normalizeDiet, type RawDiet } from './normalize';

export const PRIMARY_MODEL = 'claude-haiku-4-5';
export const FALLBACK_MODEL = 'claude-sonnet-5-5';

const TOOL_NAME = 'registrar_dieta';

export const SYSTEM_PROMPT = `Você transforma a descrição FALADA de uma dieta (português do Brasil) em dados estruturados, chamando a ferramenta ${TOOL_NAME}.

REGRAS
1. "refeicoes": uma para cada refeição, na ordem falada. Uma refeição NOVA só começa quando o coach: (a) diz o nome da refeição (café da manhã, lanche da manhã, almoço, lanche da tarde, pré-treino, pós-treino, jantar, ceia...) ou o número dela ("refeição 2", "primeira refeição"); (b) diz "próxima refeição", "outra refeição" ou "depois"; (c) muda o horário; (d) o texto separa grupos de alimentos com ponto e vírgula ou quebra de linha. Sem nenhum desses sinais, TODOS os alimentos ficam na MESMA refeição.
2. "nome": o nome da refeição como foi dito. Omita se não disseram. "horario": HH:MM em 24h se disseram ("às 7" = 07:00, "sete e meia" = 07:30). Omita se não disseram.
3. "alimentos": um item para cada alimento, na ordem falada. "nome_falado" = SÓ o alimento ("pão integral", "ovos", "frango", "arroz"), sem quantidade e sem modo de preparo. Nunca junte dois alimentos num item e nunca invente alimentos.
4. "quantidade" (número) e "unidade":
   - "70 gramas" ou "70g" -> 70 e g; "200 ml" -> 200 e ml;
   - "2 fatias de pão" -> 2 e fatia; "3 ovos" -> 3 e unidade; "uma banana" -> 1 e unidade;
   - "duas colheres de sopa" -> 2 e colher_sopa; "colher de sobremesa" -> colher_sobremesa; "colher de chá" -> colher_cha; "colher de café" -> colher_cafe;
     "colher de servir" ou "colher de arroz" -> colher_servir; "meia xícara" -> 0.5 e xicara;
   - "uma escumadeira de feijão" -> 1 e escumadeira; "uma concha" -> 1 e concha;
   - "um bife pequeno/médio/grande" -> 1 e bife_p/bife_m/bife_g; "um bife" (sem tamanho) -> 1 e bife; "um pedaço" -> 1 e pedaco;
   - "um copo" -> 1 e copo; "um scoop de whey" -> 1 e scoop; "um punhado" -> 1 e punhado; "uma porção" -> porcao.
   - "meio/meia" = 0.5; "uma e meia" = 1.5; números por extenso viram dígitos.
   - Se NÃO disseram a quantidade, omita "quantidade" e "unidade". Não chute.
5. "preparo": o modo de preparo dito para AQUELE alimento (mexido, cozido, grelhado, assado, frito, cru, refogado...). Omita se não disseram. Não repita o preparo em "nome_falado".
6. "ou_anterior": true quando o alimento é uma OPÇÃO no lugar do alimento imediatamente anterior ("arroz ou batata doce", "ou então", "pode trocar por", "alternativa"). Alimentos ligados por "com", "e" ou vírgula SOMAM na refeição: nesses, omita "ou_anterior".
7. Alimentos "à vontade" (salada, folhas) e instruções gerais da refeição (temperar, modo de preparo, "bater no liquidificador") vão em "observacao" da REFEIÇÃO, não em "alimentos".
8. Ignore o que não for dieta (nome do aluno, "beleza", hesitações).
9. "avisos": só dúvidas relevantes (trecho ininteligível). Curtos. Lista vazia se não houver.`;

export const TOOL = {
  name: TOOL_NAME,
  description: 'Registra a dieta descrita pelo coach: refeições na ordem falada, cada uma com seus alimentos.',
  input_schema: {
    type: 'object' as const,
    properties: {
      refeicoes: {
        type: 'array',
        maxItems: 12,
        items: {
          type: 'object',
          properties: {
            nome: { type: 'string' },
            horario: { type: 'string', description: 'HH:MM em 24h.' },
            observacao: { type: 'string' },
            alimentos: {
              type: 'array',
              maxItems: 30,
              items: {
                type: 'object',
                properties: {
                  nome_falado: { type: 'string' },
                  preparo: { type: 'string' },
                  quantidade: { type: 'number', minimum: 0 },
                  unidade: { type: 'string', enum: [...SPOKEN_UNITS] },
                  ou_anterior: { type: 'boolean' },
                  observacao: { type: 'string' },
                },
                required: ['nome_falado'],
              },
            },
          },
        },
      },
      avisos: { type: 'array', items: { type: 'string' } },
    },
    required: ['refeicoes'],
  },
};

export type ExtractUsage = { model: string; inputTokens: number; outputTokens: number; ms: number; usedFallback: boolean };
export type ExtractResult = { parsed: NonNullable<ReturnType<typeof normalizeDiet>>; usage: ExtractUsage };
export type ExtractOptions = { native?: boolean };

const isHaikuModel = (model: string) => model.startsWith('claude-haiku');

async function callModel(client: Anthropic, model: string, text: string, forced: boolean) {
  const t0 = Date.now();
  const isHaiku = isHaikuModel(model);
  const resp = await client.messages.create({
    model,
    max_tokens: isHaiku ? 4000 : 8000,
    ...(isHaiku ? { temperature: 0 } : {}),
    system: forced ? SYSTEM_PROMPT : `${SYSTEM_PROMPT}\n\nResponda chamando a ferramenta ${TOOL_NAME}.`,
    tools: [TOOL],
    // Haiku 4.5 aceita forçar a ferramenta; o Sonnet 5.5 não (400) -- lá fica em auto.
    tool_choice: forced ? { type: 'tool', name: TOOL_NAME } : { type: 'auto' },
    messages: [{ role: 'user', content: text }],
  } as any);

  const block: any = (resp.content as any[]).find((b) => b.type === 'tool_use' && b.name === TOOL_NAME);
  return {
    input: (block?.input ?? null) as RawDiet | null,
    inputTokens: resp.usage?.input_tokens ?? 0,
    outputTokens: resp.usage?.output_tokens ?? 0,
    ms: Date.now() - t0,
  };
}

function makeClient() {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY não configurada no servidor.');
  return new Anthropic({ apiKey, timeout: 50_000, maxRetries: 1 });
}

/** Uma chamada só, com o modelo pedido, sem tentativa reserva (avaliação). */
export async function extractOnce(text: string, model: string) {
  return callModel(makeClient(), model, text, isHaikuModel(model));
}

export async function extractDiet(text: string, opts: ExtractOptions = {}): Promise<ExtractResult> {
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
      const parsed = normalizeDiet(r.input, opts);
      if (parsed && parsed.meals.length > 0) {
        return { parsed, usage: { model, inputTokens: r.inputTokens, outputTokens: r.outputTokens, ms: r.ms, usedFallback: i > 0 } };
      }
      lastError = new Error('A IA não devolveu nenhuma refeição reconhecível.');
    } catch (e) {
      lastError = e;
    }
  }
  throw lastError instanceof Error ? lastError : new Error('Falha ao interpretar a dieta.');
}
