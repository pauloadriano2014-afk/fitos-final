// Banco em memória da SUGESTÃO DE CARGA: usuários (com loadSuggestOff/loadStep), exercícios, treinos e o histórico de treinos com os detalhes por série.
const state = { users: new Map(), exercises: [], workouts: [], histories: [] };
const clone = (o) => JSON.parse(JSON.stringify(o), (k, v) => (typeof v === 'string' && /^\d{4}-\d\d-\d\dT/.test(v) ? new Date(v) : v));
const pick = (row, select) => { if (!select) return clone(row); const o = {}; Object.keys(select).forEach((k) => { if (select[k]) o[k] = row[k] === undefined ? null : row[k]; }); return clone(o); };
const userApi = {
  async findUnique({ where, select }) { const u = state.users.get(where.id); return u ? pick(u, select) : null; },
  async update({ where, data }) {
    const u = state.users.get(where.id); if (!u) throw new Error('user not found');
    Object.keys(data).forEach((k) => {
      if (!['name', 'phone', 'photoUrl', 'gender', 'goal', 'currentWeight', 'isMenstruating', 'menstruationStartDate', 'onboardingCompleted', 'onboardingStep', 'brandLogoUrl', 'brandLogoSize', 'brandColor', 'loadSuggestOff', 'loadStep', 'monthlyReportOn'].includes(k)) throw new Error('Unknown arg `' + k + '` in data');
    });
    Object.assign(u, data); return clone(u);
  },
};
const exerciseApi = { async findMany() { return state.exercises.map(clone); } };
const workoutApi = { async findUnique({ where }) { const w = state.workouts.find((x) => x.id === where.id); return w ? clone(w) : null; } };
// filtro e escolha de campos das linhas aninhadas (details): OR, { campo: { not: null } } e igualdade, como o Prisma
const dmatch = (d, w) => !w || (w.OR ? w.OR.some((x) => dmatch(d, x)) : Object.entries(w).every(([k, v]) => (v && typeof v === 'object' && 'not' in v ? d[k] !== null && d[k] !== undefined : d[k] === v)));
const pickSel = (d, sel) => { const o = {}; Object.keys(sel).forEach((k) => { if (sel[k]) o[k] = d[k] === undefined ? null : d[k]; }); return o; };
const shape = (h, select) => {
  if (!select) return clone(h);
  const o = {};
  Object.keys(select).forEach((k) => {
    if (k === 'details') { let ds = (h.details || []).filter((d) => dmatch(d, select.details.where)); if (select.details.orderBy && select.details.orderBy.setNumber === 'asc') ds = ds.slice().sort((a, b) => a.setNumber - b.setNumber); o.details = ds.map((d) => (select.details.select ? pickSel(d, select.details.select) : d)); }
    else if (select[k]) o[k] = h[k] === undefined ? null : h[k];
  });
  return clone(o);
};
const historyApi = {
  async findMany({ where, orderBy, take, select }) {
    let rows = state.histories.filter((h) => !where || !where.userId || h.userId === where.userId);
    if (orderBy && orderBy.date === 'desc') rows = rows.slice().sort((a, b) => new Date(b.date) - new Date(a.date));
    if (take) rows = rows.slice(0, take);
    return rows.map((h) => shape(h, select));
  },
};
const checkInApi = { async findMany() { return []; } };
const base = { user: userApi, exercise: exerciseApi, workout: workoutApi, workoutHistory: historyApi, checkIn: checkInApi };
module.exports = base; module.exports.default = base; module.exports.__state = state;
module.exports.__reset = () => { state.users.clear(); state.exercises.length = 0; state.workouts.length = 0; state.histories.length = 0; };
module.exports.__addUser = (u) => { state.users.set(u.id, { role: 'USER', coachId: null, nutritionistId: null, loadSuggestOff: false, loadStep: null, monthlyReportOn: false, ...u }); };
