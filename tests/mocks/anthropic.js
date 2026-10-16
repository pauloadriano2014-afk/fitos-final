// IA simulada: o teste define globalThis.__LLM = async ({model, forced, text}) => resposta
class Anthropic {
  constructor(opts){ this.opts = opts; this.messages = { create: async (args) => {
    const r = await globalThis.__LLM({ model: args.model, forced: args.tool_choice?.type === 'tool', args });
    if (r instanceof Error) throw r;
    return { content: r.content, usage: { input_tokens: 1500, output_tokens: 700 } };
  } }; }
}
module.exports = Anthropic; module.exports.default = Anthropic;
