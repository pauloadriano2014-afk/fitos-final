// lib/coachNotesAI.ts
// 🎙️ (12 out 2026) A chamada à IA das NOTAS DO COACH: texto falado -> { aluno_falado, resumo, tipo, etiqueta, prazo }. Só EXTRAI (quem é o aluno é decidido em lib/coachNotes.ts, comparando com a
// lista dele: a lista de alunos nunca vai para a IA). Modelo: Claude Haiku 5.5 (barato e rápido; ~R$ 0,002 por nota). Ferramenta forçada = sem "pensar", só preencher.
// Haiku 5.5 não aceita temperature/top_p/top_k (400): nada disso é enviado; o esforço fica em `low`.
import Anthropic from '@anthropic-ai/sdk';
import { TAGS } from '@/lib/coachNotes';

export const NOTES_MODEL = 'claude-haiku-5-5';
const TOOL_NAME = 'registrar_nota';
const WEEKDAY_PT = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'];

export const systemPrompt = (todayKey: string) => `Você organiza anotações FALADAS por um coach (personal trainer ou nutricionista) sobre seus alunos, em português do Brasil. Chame a ferramenta ${TOOL_NAME} com o que foi dito.

REGRAS
1. "aluno_falado": o nome do aluno como foi dito (nome ou apelido, nada mais), ou null se nenhum aluno foi citado.
2. "resumo": a anotação reescrita curta e objetiva, mantendo TODOS os fatos (exercício, aparelho, lado do corpo, intensidade, remédio, datas, o que o aluno pediu). Sem repetir o nome do aluno sem necessidade. Até 280 caracteres. Nunca invente nada e não dê conselho.
3. "tipo": TAREFA quando o coach precisa FAZER algo depois (ajustar treino ou dieta, responder, ligar, avisar, verificar numa data, pedido do aluno que depende dele). NOTA quando é só um registro. Dor, lesão, desconforto ou aparelho quebrado contam como TAREFA com prazo hoje, a menos que o coach diga que já resolveu.
4. "etiqueta": uma de ${TAGS.join(', ')}. DOR = dor, lesão ou desconforto; APARELHO = equipamento que falta ou quebrou; TREINO = ajuste de ficha, dias, exercício; DIETA = alimentação, suplemento, remédio que afeta a dieta; PEDIDO = pedido do aluno que não cabe nas outras; OUTRO = o resto.
5. "prazo": AAAA-MM-DD apenas se o coach disse QUANDO (hoje, amanhã, sexta, "em novembro" = dia 1º do mês, "semana que vem"). Hoje é ${todayKey} (${WEEKDAY_PT[new Date(todayKey + 'T00:00:00Z').getUTCDay()]}). Sem prazo dito, use null.
6. Ignore hesitações ("é", "né", "tipo") e comandos ao aplicativo ("anota aí").`;

export const TOOL: any = {
  name: TOOL_NAME,
  description: 'Registra a anotação do coach sobre um aluno.',
  input_schema: {
    type: 'object',
    properties: {
      aluno_falado: { type: ['string', 'null'], description: 'Nome do aluno como foi dito, ou null.' },
      resumo: { type: 'string', description: 'A anotação, curta e objetiva (até 280 caracteres).' },
      tipo: { type: 'string', enum: ['NOTA', 'TAREFA'] },
      etiqueta: { type: 'string', enum: [...TAGS] },
      prazo: { type: ['string', 'null'], description: 'AAAA-MM-DD ou null.' },
    },
    required: ['resumo', 'tipo', 'etiqueta'],
  },
};

export type ExtractUsage = { model: string; inputTokens: number; outputTokens: number; ms: number };

/** Uma chamada. Lança erro se a IA não estiver configurada, recusar ou não devolver a ferramenta: quem chama cai no rascunho por regras. */
export async function extractNote(text: string, todayKey: string, o: { client?: any } = {}): Promise<{ input: any; usage: ExtractUsage }> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!o.client && !apiKey) throw new Error('ANTHROPIC_API_KEY não configurada no servidor.');
  const client = o.client || new Anthropic({ apiKey, timeout: 25_000, maxRetries: 1 });
  const t0 = Date.now();
  const resp: any = await client.messages.create({
    model: NOTES_MODEL,
    max_tokens: 700,
    system: systemPrompt(todayKey),
    tools: [TOOL],
    tool_choice: { type: 'tool', name: TOOL_NAME },
    output_config: { effort: 'low' },
    messages: [{ role: 'user', content: text }],
  });
  if (resp?.stop_reason === 'refusal') throw new Error('A IA recusou interpretar esse texto.');
  const block = (resp?.content || []).find((b: any) => b.type === 'tool_use' && b.name === TOOL_NAME);
  if (!block?.input) throw new Error('A IA não devolveu a anotação.');
  return { input: block.input, usage: { model: NOTES_MODEL, inputTokens: resp?.usage?.input_tokens ?? 0, outputTokens: resp?.usage?.output_tokens ?? 0, ms: Date.now() - t0 } };
}
