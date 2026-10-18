// lib/aiTool.ts
// 🤖 (18 out 2026) Chamada de IA que devolve UM resultado estruturado (uma "ferramenta"), do jeito que o claude-sonnet-5-5 aceita.
// Esse modelo NÃO aceita forçar a ferramenta (`tool_choice` do tipo "tool"/"any" dá erro 400: "tool_choice: type "tool" and "any" are not supported for this model"),
// que foi o que derrubou a análise e a visão geral em produção. Então: `tool_choice` fica em "auto", o pedido para chamar a ferramenta vai por escrito no
// sistema, e se mesmo assim a IA responder só com texto tentamos UMA vez de novo pedindo a ferramenta (desde que ainda sobre tempo: o Render corta a
// requisição em ~100 s). Também dá mais espaço de saída (`maxTokens`): o modelo "pensa" antes de responder e isso gasta parte do limite.
// Mesmo padrão já usado em lib/voiceWorkout/extract.ts e lib/voiceDiet/extract.ts.
export type ToolDef = { name: string; description?: string; input_schema: any; [k: string]: any };
export type ToolCallUsage = { inputTokens: number; outputTokens: number };

/** Só tenta de novo se a 1ª chamada foi rápida (o total precisa caber no limite do Render). */
export const RETRY_ONLY_IF_UNDER_MS = 35_000;

export async function callTool(
  client: any,
  o: { model: string; system: string; tool: ToolDef; user: string; maxTokens?: number; effort?: 'low' | 'medium' | 'high'; refusalMsg: string; missingMsg: string; now?: () => number },
): Promise<{ input: any; usage: ToolCallUsage }> {
  const now = o.now || Date.now;
  const system = `${o.system}\n\nResponda chamando a ferramenta ${o.tool.name}.`;
  const base = { model: o.model, max_tokens: o.maxTokens ?? 6000, system, tools: [o.tool], tool_choice: { type: 'auto' }, output_config: { effort: o.effort || 'medium' } };
  const usage: ToolCallUsage = { inputTokens: 0, outputTokens: 0 };
  const find = (resp: any) => (resp?.content || []).find((b: any) => b.type === 'tool_use' && b.name === o.tool.name && b.input);
  const add = (resp: any) => { usage.inputTokens += resp?.usage?.input_tokens ?? 0; usage.outputTokens += resp?.usage?.output_tokens ?? 0; };

  const t0 = now();
  const first: any = await client.messages.create({ ...base, messages: [{ role: 'user', content: o.user }] });
  add(first);
  if (first?.stop_reason === 'refusal') throw new Error(o.refusalMsg);
  let block = find(first);
  if (!block && first?.stop_reason !== 'max_tokens' && now() - t0 < RETRY_ONLY_IF_UNDER_MS) {
    const second: any = await client.messages.create({
      ...base,
      messages: [
        { role: 'user', content: o.user },
        { role: 'assistant', content: first?.content || [] },
        { role: 'user', content: `Responda agora chamando a ferramenta ${o.tool.name}, sem escrever texto.` },
      ],
    });
    add(second);
    if (second?.stop_reason === 'refusal') throw new Error(o.refusalMsg);
    block = find(second);
  }
  if (!block) throw new Error(o.missingMsg);
  return { input: block.input, usage };
}
