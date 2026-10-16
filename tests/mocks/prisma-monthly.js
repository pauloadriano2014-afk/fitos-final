// Banco em memória do RELATÓRIO MENSAL: usuários, treinos feitos (com séries), exercícios, check-ins, dieta e fichas. Entende where com igualdade, gte/gt/lt/lte, in e not null.
const state = { users: new Map(), histories: [], exercises: [], checkins: [], mealLogs: [], daily: [], workouts: [], fail: {}, calls: [] };
const clone = (o) => JSON.parse(JSON.stringify(o), (k, v) => (typeof v === 'string' && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(\.\d+)?Z$/.test(v) ? new Date(v) : v));
const ok = (v, c) => {
  if (c && typeof c === 'object' && !(c instanceof Date)) {
    if ('not' in c) return v !== null && v !== undefined;
    if ('gte' in c && !(v >= c.gte)) return false; if ('gt' in c && !(v > c.gt)) return false;
    if ('lt' in c && !(v < c.lt)) return false; if ('lte' in c && !(v <= c.lte)) return false;
    if ('in' in c && !c.in.includes(v)) return false;
    return true;
  }
  return v === c;
};
const match = (row, w) => Object.entries(w || {}).every(([k, c]) => ok(row[k], c));
const guard = (name) => { state.calls.push(name); if (state.fail[name]) throw new Error('falha simulada em ' + name); };
const pick = (row, sel) => { if (!sel) return clone(row); const o = {}; Object.keys(sel).forEach((k) => { if (sel[k] === true) o[k] = row[k] === undefined ? null : row[k]; }); return o; };

const userApi = { async findUnique({ where, select }) { guard('user'); const u = state.users.get(where.id); return u ? pick(u, select) : null; } };
const histApi = {
  async findMany({ where, orderBy, select }) {
    guard('workoutHistory');
    let rows = state.histories.filter((h) => match(h, { userId: where.userId, date: where.date }));
    if (orderBy && orderBy.date) rows = rows.slice().sort((a, b) => (new Date(a.date) - new Date(b.date)) * (orderBy.date === 'desc' ? -1 : 1));
    return rows.map((h) => { const o = pick(h, select ? { ...select, details: false } : null); if (!select || select.details) o.details = (h.details || []).map((d) => (select && select.details && select.details.select ? pick(d, select.details.select) : clone(d))); return clone(o); });
  },
};
const exHistApi = {
  async groupBy({ where, _max }) {
    guard('exerciseHistory');
    const h = state.histories.filter((x) => match(x, { userId: where.workoutHistory.userId, date: where.workoutHistory.date }));
    const best = new Map();
    h.forEach((x) => (x.details || []).forEach((d) => { if (!ok(d.weight, where.weight)) return; const c = best.get(d.exerciseId); if (c === undefined || d.weight > c) best.set(d.exerciseId, d.weight); }));
    return [...best.entries()].map(([exerciseId, w]) => ({ exerciseId, _max: { weight: w } }));
  },
};
const exApi = { async findMany({ where, select }) { guard('exercise'); return state.exercises.filter((e) => match(e, where)).map((e) => pick(e, select)); } };
const ciApi = { async findMany({ where, orderBy, select }) { guard('checkIn'); let r = state.checkins.filter((c) => match(c, { userId: where.userId, date: where.date })); if (orderBy) r = r.slice().sort((a, b) => new Date(a.date) - new Date(b.date)); return r.map((c) => clone(pick(c, select))); } };
const mealApi = { async findMany({ where }) { guard('dietMealLog'); return state.mealLogs.filter((m) => match(m, where)).map(clone); } };
const dailyApi = { async findMany({ where }) { guard('dailyCheckin'); return state.daily.filter((m) => match(m, where)).map(clone); } };
const wkApi = { async findMany({ where }) { guard('workout'); return state.workouts.filter((w) => match(w, where)).map(clone); } };

const base = { user: userApi, workoutHistory: histApi, exerciseHistory: exHistApi, exercise: exApi, checkIn: ciApi, dietMealLog: mealApi, dailyCheckin: dailyApi, workout: wkApi };
module.exports = base; module.exports.default = base; module.exports.__state = state;
module.exports.__reset = () => { state.users.clear(); ['histories', 'exercises', 'checkins', 'mealLogs', 'daily', 'workouts', 'calls'].forEach((k) => { state[k].length = 0; }); state.fail = {}; };
module.exports.__addUser = (u) => { state.users.set(u.id, { role: 'USER', coachId: null, name: u.id, dietModule: false, ...u }); };
