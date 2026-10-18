// Banco em memória do "finalizar treino": WorkoutHistory com ÍNDICE ÚNICO (userId, clientKey) como no Postgres (null não conflita),
// $transaction([...]) com desfazer se algum item falhar, e operações "preguiçosas" (só rodam dentro da transação, como no Prisma de verdade).
const tick = () => new Promise((r) => setTimeout(r, 0));
const state = { users: new Map(), histories: [], sessions: [], workouts: [], workoutFail: false, nextId: 1, failUserUpdateOnce: false, sessionFail: null };
const clone = (o) => JSON.parse(JSON.stringify(o), (k, v) => (typeof v === 'string' && /^\d{4}-\d\d-\d\dT/.test(v) ? new Date(v) : v));
const lazy = (fn) => ({ __run: (ctx) => fn(ctx || { undo: [] }), then: (a, b) => fn({ undo: [] }).then(a, b), catch: (b) => fn({ undo: [] }).catch(b) });
const matches = (row, w) => Object.entries(w || {}).every(([k, v]) => {
  if (v && typeof v === 'object' && !(v instanceof Date)) { if ('gte' in v) return row[k] && new Date(row[k]) >= new Date(v.gte); if ('in' in v) return v.in.includes(row[k]); }
  return (row[k] ?? null) === v;
});
const pick = (row, select) => { if (!select) return clone(row); const o = {}; Object.keys(select).forEach((k) => { if (select[k]) o[k] = row[k]; }); return clone(o); };
const userApi = {
  async findUnique({ where, select }) { await tick(); const u = state.users.get(where.id); return u ? pick(u, select) : null; },
  update({ where, data, include }) {
    return lazy(async (ctx) => {
      await tick();
      if (state.failUserUpdateOnce) { state.failUserUpdateOnce = false; throw new Error('falha simulada ao somar o XP'); }
      const u = state.users.get(where.id); if (!u) throw new Error('user not found');
      if (data.currentXP && data.currentXP.increment) { const inc = data.currentXP.increment; u.currentXP = (u.currentXP || 0) + inc; ctx.undo.push(() => { u.currentXP -= inc; }); }
      const out = clone(u);
      if (include && include.coach) { const c = u.coachId ? state.users.get(u.coachId) : null; out.coach = c ? { id: c.id, pushToken: c.pushToken || null, webPushSubscription: null } : null; }
      return out;
    });
  },
};
const historyApi = {
  async findFirst({ where, select, orderBy }) {
    await tick();
    let rows = state.histories.filter((h) => matches(h, where));
    if (orderBy && orderBy.date === 'desc') rows = rows.sort((a, b) => new Date(b.date) - new Date(a.date));
    return rows[0] ? pick(rows[0], select) : null;
  },
  async findMany({ where }) { await tick(); return state.histories.filter((h) => matches(h, where)).map(clone); },
  create({ data }) {
    return lazy(async (ctx) => {
      await tick();
      if (data.clientKey != null && state.histories.some((h) => h.userId === data.userId && h.clientKey === data.clientKey)) {
        throw Object.assign(new Error('Unique constraint failed on the fields: (`userId`,`clientKey`)'), { code: 'P2002' });
      }
      const id = 'wh' + state.nextId++;
      const details = ((data.details && data.details.create) || []).map((d, i) => ({ id: `${id}-d${i}`, workoutHistoryId: id, ...d }));
      const row = { id, date: new Date(), progressions: 0, workoutName: null, feedbackResolvedAt: null, coachReply: null, coachReplyAt: null, clientKey: null, day: null, workoutId: null, rpe: null, feedback: null, ...data, details };
      state.histories.push(row); ctx.undo.push(() => { const i = state.histories.indexOf(row); if (i >= 0) state.histories.splice(i, 1); });
      return clone(row);
    });
  },
};

// 🔔 WorkoutSession (sessão iniciada no app): índice único (userId, clientKey) e consultas com OR / null / gte / lte / lt / igualdade.
const sMatch = (row, w) => Object.entries(w || {}).every(([k, v]) => {
  if (k === 'OR') return v.some((x) => sMatch(row, x));
  if (v && typeof v === 'object' && !(v instanceof Date)) {
    const cur = row[k] == null ? null : (row[k] instanceof Date ? row[k].getTime() : row[k]);
    const n = (x) => (x instanceof Date ? x.getTime() : x);
    if ('gte' in v && !(cur !== null && cur >= n(v.gte))) return false; if ('lte' in v && !(cur !== null && cur <= n(v.lte))) return false; if ('lt' in v && !(cur !== null && cur < n(v.lt))) return false;
    return true;
  }
  return (row[k] ?? null) === (v ?? null);
});
const sGuard = () => { if (state.sessionFail) throw Object.assign(new Error(state.sessionFail.message || 'falha'), { code: state.sessionFail.code }); };
const sessionApi = {
  async findFirst({ where, select }) { await tick(); sGuard(); const r = state.sessions.find((x) => sMatch(x, where)); return r ? pick(r, select) : null; },
  async findMany({ where, orderBy, take }) { await tick(); sGuard(); let r = state.sessions.filter((x) => sMatch(x, where)); if (orderBy && orderBy.startedAt) r = r.sort((a, b) => (a.startedAt - b.startedAt) * (orderBy.startedAt === 'desc' ? -1 : 1)); if (take) r = r.slice(0, take); return r.map(clone).map((x) => ({ ...x, startedAt: new Date(x.startedAt) })); },
  async create({ data }) {
    await tick(); sGuard();
    if (state.sessions.some((x) => x.userId === data.userId && x.clientKey === data.clientKey)) throw Object.assign(new Error('Unique constraint failed'), { code: 'P2002' });
    const row = { id: 'ws' + state.nextId++, workoutId: null, day: null, workoutName: null, startedAt: new Date(), finishedAt: null, remindedAt: null, reminderCount: 0, ...data };
    state.sessions.push(row); return clone(row);
  },
  async updateMany({ where, data }) { await tick(); sGuard(); const hit = state.sessions.filter((x) => sMatch(x, where)); hit.forEach((x) => Object.assign(x, data)); return { count: hit.length }; },
  async deleteMany({ where }) { await tick(); sGuard(); const keep = state.sessions.filter((x) => !sMatch(x, where)); const count = state.sessions.length - keep.length; state.sessions.length = 0; keep.forEach((x) => state.sessions.push(x)); return { count }; },
};
// 🏷️ Workout: só a leitura da ficha (multiplicador de intensidade) que o finalizar usa para gravar a fase da carga (deload/choque/normal)
const workoutApi = { async findUnique({ where, select }) { await tick(); if (state.workoutFail) throw new Error('banco fora'); const w = state.workouts.find((x) => x.id === where.id); return w ? pick(w, select) : null; } };
const base = {
  user: userApi, workoutHistory: historyApi, workoutSession: sessionApi, workout: workoutApi,
  async $transaction(ops) {
    const ctx = { undo: [] };   // desfaz só o que ESTA transação fez (como o banco de verdade; as outras transações seguem)
    const out = [];
    try { for (const op of ops) out.push(await op.__run(ctx)); return out; }
    catch (e) { ctx.undo.reverse().forEach((f) => f()); throw e; }
  },
};
module.exports = base; module.exports.default = base;
module.exports.__state = state;
module.exports.__reset = () => { state.users.clear(); state.histories.length = 0; state.sessions.length = 0; state.workouts.length = 0; state.workoutFail = false; state.sessionFail = null; state.nextId = 1; state.failUserUpdateOnce = false; globalThis.__pushes = []; globalThis.__analyze = 0; };
module.exports.__addUser = (u) => { state.users.set(u.id, { role: 'USER', currentXP: 0, name: u.id, coachId: null, ...u }); };

module.exports.__addWorkout = (w) => { state.workouts.push({ intensityMultiplier: 1, intensityEndDate: null, ...w }); };
