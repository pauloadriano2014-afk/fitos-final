// Banco de mentira só para a LISTA e o DETALHE de treinos (GET /api/workout): usuário, treinos com exercícios, histórico e biblioteca de exercícios.
// Anota cada consulta à biblioteca (`calls.exercise`) para o teste provar que ela não é mais baixada inteira.
const state = { users: [], workouts: [], histories: [], exercises: [], calls: { exercise: [] } };
const prisma = {
  __state: state,
  __reset() { state.users = []; state.workouts = []; state.histories = []; state.exercises = []; state.calls = { exercise: [] }; },
  user: { async findUnique({ where }) { return state.users.find((u) => u.id === where.id) || null; } },
  workout: {
    async findMany({ where }) { return state.workouts.filter((w) => w.userId === where.userId).slice().sort((a, b) => +b.createdAt - +a.createdAt); },
    async findUnique({ where }) { return state.workouts.find((w) => w.id === where.id) || null; },
  },
  workoutHistory: { async findMany({ where }) { return state.histories.filter((h) => h.userId === where.userId); } },
  exercise: {
    async findMany(args = {}) {
      state.calls.exercise.push(args);
      const ids = args.where && args.where.id && args.where.id.in;
      const rows = ids ? state.exercises.filter((e) => ids.includes(e.id)) : state.exercises;
      const sel = args.select; return rows.map((e) => (sel ? Object.fromEntries(Object.keys(sel).filter((k) => sel[k]).map((k) => [k, e[k]])) : { ...e }));
    },
  },
};
prisma.default = prisma;
module.exports = prisma;
