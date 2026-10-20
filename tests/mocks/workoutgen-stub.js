// Troca lib/ai/workoutGen nos testes: não chama IA, só anota com que dados foi chamado.
const calls = [];
module.exports = {
  __calls: calls,
  async generateWorkoutPlan(input) { calls.push(input); return { status: 200, body: { workoutName: 'stub', exercisesByDay: {} } }; },
};
