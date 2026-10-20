// Troca lib/ai/dietGen nos testes: não chama IA, só anota com que motor foi chamado.
const calls = [];
module.exports = {
  __calls: calls,
  async generateDietDay(input) { calls.push(input); return { meals: [], reasoning: 'stub', usageAndCost: { cost: 0.01 }, meta: { dayType: input.dayType, provider: input.provider, modelUsed: 'stub-model' } }; },
};
