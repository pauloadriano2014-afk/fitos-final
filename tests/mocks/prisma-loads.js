// prisma-finish (finalizar treino) + o que a rota GET /api/workout precisa: exercícios, a ficha e o histórico ordenado/limitado.
const base = require('./prisma-finish.js');
const state = base.__state;
const clone = (o) => JSON.parse(JSON.stringify(o), (k, v) => (typeof v === 'string' && /^\d{4}-\d\d-\d\dT/.test(v) ? new Date(v) : v));
state.workout = null;
base.exercise = { async findMany() { return []; } };
base.workout = { async findUnique({ where }) { return state.workout && state.workout.id === where.id ? clone(state.workout) : null; } };
const origFindMany = base.workoutHistory.findMany;
base.workoutHistory.findMany = async ({ where, orderBy, take } = {}) => {
  let rows = await origFindMany({ where });
  if (orderBy && orderBy.date === 'desc') rows = rows.sort((a, b) => new Date(b.date) - new Date(a.date));
  return typeof take === 'number' ? rows.slice(0, take) : rows;
};
const origReset = base.__reset;
base.__reset = () => { origReset(); state.workout = null; };
module.exports = base; module.exports.default = base;
