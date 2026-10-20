// Banco em memória do "link do treino": users, workouts (+ exercícios com o exercício junto), exercises, techniques, systemTechniqueVideo e workoutShare
// (code único como no Postgres: criar repetido dá P2002).
const clone = (o) => (o == null ? o : JSON.parse(JSON.stringify(o), (k, v) => (typeof v === 'string' && /^\d{4}-\d\d-\d\dT[\d:.]+Z$/.test(v) ? new Date(v) : v)));
const dropShares = (pred) => { const gone = new Set(state.shares.filter(pred).map((s) => s.id)); state.shares = state.shares.filter((s) => !gone.has(s.id)); state.dones = state.dones.filter((d) => !gone.has(d.shareId)); };
const state = { dones: [], users: new Map(), workouts: new Map(), rows: [], exercises: new Map(), techniques: new Map(), sysVideos: [], shares: [], quicks: [], updates: 0, nextId: 1 };
const matches = (row, w) => Object.entries(w || {}).every(([k, v]) => {
  if (v && typeof v === 'object' && !(v instanceof Date)) { if ('in' in v) return v.in.includes(row[k]); return true; }
  return (row[k] ?? null) === v;
});
const pick = (row, select) => { if (!select) return clone(row); const o = {}; Object.keys(select).forEach((k) => { if (select[k]) o[k] = row[k]; }); return clone(o); };
const prisma = {
  user: {
    async findUnique({ where, select }) { const u = state.users.get(where.id); return u ? pick(u, select) : null; },
    async update({ where, data }) { const u = state.users.get(where.id); if (!u) throw new Error('not found'); Object.assign(u, clone(data)); return clone(u); },
  },
  workoutShareDone: {
    async count({ where }) { return state.dones.filter((d) => matches(d, where)).length; },
    async findMany({ where, orderBy, take }) { let rows = state.dones.filter((d) => matches(d, where)); if (orderBy && orderBy.createdAt === 'asc') rows = rows.slice().sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt)); if (take) rows = rows.slice(0, take); return rows.map(clone); },
    async create({ data }) { if (state.dones.some((d) => d.shareId === data.shareId && d.vid === data.vid && d.day === data.day)) throw Object.assign(new Error('Unique constraint failed'), { code: 'P2002' }); const row = { id: 'dn' + state.nextId++, createdAt: new Date(), ...clone(data) }; state.dones.push(row); return clone(row); },
  },
  workout: {
    async findUnique({ where, select, include }) {
      const w = state.workouts.get(where.id); if (!w) return null;
      if (include && include.exercises) {
        let rows0 = state.rows.filter((r) => r.workoutId === w.id); if (include.exercises.orderBy && include.exercises.orderBy.order === 'asc') rows0 = rows0.sort((a, b) => a.order - b.order);
        const rows = rows0.map((r) => ({ ...clone(r), exercise: clone(state.exercises.get(r.exerciseId)) }));
        return { ...clone(w), exercises: rows };
      }
      return pick(w, select);
    },
  },
  workoutExercise: { async findMany({ where, select, orderBy }) { let rows = state.rows.filter((r) => matches(r, where)); if (orderBy && orderBy.order === 'asc') rows = rows.slice().sort((a, b) => a.order - b.order); return rows.map((r) => pick(r, select)); } },
  exercise: { async findMany({ where, select }) { return [...state.exercises.values()].filter((e) => matches(e, where)).map((e) => pick(e, select)); } },
  technique: { async findMany({ where, select }) { return [...state.techniques.values()].filter((e) => matches(e, where)).map((e) => pick(e, select)); } },
  systemTechniqueVideo: { async findMany({ where }) { return state.sysVideos.filter((v) => matches(v, where)).map(clone); } },
  quickWorkout: {
    async findUnique({ where, select }) { const q = state.quicks.find((x) => x.id === where.id); return q ? pick(q, select) : null; },
    async findMany({ where, orderBy, take, include }) {
      let rows = state.quicks.filter((q) => matches(q, where)); if (orderBy && orderBy.updatedAt === 'desc') rows = rows.slice().sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt)); if (take) rows = rows.slice(0, take);
      return rows.map((q) => { const o = clone(q); if (include && include.shares) o.shares = state.shares.filter((s) => s.quickWorkoutId === q.id).map((s) => pick(s, include.shares.select)); return o; });
    },
    async count({ where }) { return state.quicks.filter((q) => matches(q, where)).length; },
    async create({ data }) { const row = { id: 'q' + state.nextId++, createdAt: new Date(), updatedAt: new Date(Date.now() + state.nextId), ...clone(data) }; state.quicks.push(row); return clone(row); },
    async update({ where, data }) { const q = state.quicks.find((x) => x.id === where.id); if (!q) throw new Error('not found'); Object.assign(q, clone(data)); q.updatedAt = new Date(Date.now() + state.nextId); state.nextId++; return clone(q); },
    async delete({ where }) { const i = state.quicks.findIndex((x) => x.id === where.id); if (i < 0) throw new Error('not found'); state.quicks.splice(i, 1); dropShares((s) => s.quickWorkoutId === where.id); return {}; },
    async deleteMany({ where }) { const ids = where.id.in.filter((id) => { const q = state.quicks.find((x) => x.id === id); return q && (!where.coachId || q.coachId === where.coachId); }); ids.forEach((id) => { state.quicks.splice(state.quicks.findIndex((x) => x.id === id), 1); dropShares((s) => s.quickWorkoutId === id); }); return { count: ids.length }; },
  },
  workoutShare: {
    async count({ where }) { return state.shares.filter((s) => matches(s, where)).length; },
    async create({ data }) {
      if (state.shares.some((s) => s.code === data.code)) throw Object.assign(new Error('Unique constraint failed on the fields: (`code`)'), { code: 'P2002' });
      const row = { id: 'sh' + state.nextId++, viewCount: 0, lastViewedAt: null, revokedAt: null, createdAt: new Date(), showName: false, days: [], expiresAt: null, createdById: null, notifyOpen: false, notifyDone: false, doneCount: 0, lastDoneAt: null, ...clone(data) };
      state.shares.push(row); return clone(row);
    },
    async findMany({ where, orderBy, take }) {
      let rows = state.shares.filter((s) => matches(s, where)); if (orderBy && orderBy.createdAt === 'desc') rows = rows.slice().sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)); if (take) rows = rows.slice(0, take);
      return rows.map(clone);
    },
    async findUnique({ where }) { const s = state.shares.find((x) => x.code === where.code); return s ? clone(s) : null; },
    update({ where, data }) {
      const s = state.shares.find((x) => x.code === where.code);
      const p = (async () => { if (!s) throw new Error('not found'); state.updates++; if (data.viewCount && data.viewCount.increment) s.viewCount += data.viewCount.increment; if (data.doneCount && data.doneCount.increment) s.doneCount += data.doneCount.increment; for (const k of ['revokedAt', 'lastViewedAt', 'lastDoneAt', 'expiresAt', 'progress', 'progressAt']) if (k in data) s[k] = data[k]; return clone(s); })();
      return p;
    },
  },
  // (20 out 2026) chaves por coach (treino avulso liberado pelo master): só leitura, o teste coloca as linhas em state.features
  coachFeature: { async findMany({ where }) { return (state.features || []).filter((f) => (!where || !where.coachId || f.coachId === where.coachId) && (!where || where.revokedAt !== null || true) && !f.revokedAt).map(clone); } },
  featureGlobal: { async findMany() { return []; } },
  __state: state,
  __reset() { state.features = []; state.users.clear(); state.workouts.clear(); state.rows = []; state.exercises.clear(); state.techniques.clear(); state.sysVideos = []; state.shares = []; state.dones = []; state.quicks = []; state.updates = 0; state.nextId = 1; },
};
// produtos digitais que usam um Treino Avulso (a rota de apagar recusa treino em uso)
state.produtos = state.produtos || [];
prisma.produtoDigital = {
  async findFirst({ where }) { return state.produtos.find((p) => p.treinoAvulsoId === where.treinoAvulsoId) || null; },
  async findMany({ where }) { const ids = where && where.treinoAvulsoId && where.treinoAvulsoId.in || []; return state.produtos.filter((p) => ids.includes(p.treinoAvulsoId)); },
};
prisma.__state = state;
module.exports = prisma; module.exports.default = prisma;
