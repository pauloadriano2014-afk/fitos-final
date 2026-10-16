// prisma em memória pro feed do coach (/api/admin/data) e pro registro do token de push
const DB = (globalThis.__FDB ??= { users: [], histories: [], alerts: [], exercises: [], calls: [], seq: 0, weekly: [], anamneses: [] });
function matchRow(row, where) {
  if (!where) return true;
  return Object.entries(where).every(([k, v]) => {
    if (k === 'AND') return v.every((w) => matchRow(row, w));
    if (k === 'OR') return v.some((w) => matchRow(row, w));
    if (v && typeof v === 'object' && !(v instanceof Date)) {
      if ('in' in v) return v.in.includes(row[k]);
      if ('not' in v) return (row[k] ?? null) !== v.not;
      if ('gte' in v || 'lt' in v || 'gt' in v || 'lte' in v) { const x = new Date(row[k]).getTime(); return ('gte' in v ? x >= new Date(v.gte).getTime() : true) && ('gt' in v ? x > new Date(v.gt).getTime() : true) && ('lt' in v ? x < new Date(v.lt).getTime() : true) && ('lte' in v ? x <= new Date(v.lte).getTime() : true); }
      if (k === 'user') return matchRow(DB.users.find((u) => u.id === row.userId) || {}, v);
      return matchRow(row[k] || {}, v);
    }
    return (row[k] ?? null) === v;
  });
}
const pick = (row, select) => { if (!select) return { ...row }; const o = {}; for (const k of Object.keys(select)) if (select[k]) o[k] = row[k]; return o; };
DB.wq ??= []; DB.workouts ??= []; DB.checkins ??= []; DB.mealLogs ??= []; DB.daily ??= []; DB.aiLogs ??= [];
const missingTbl = (n) => { const e = new Error('The table `public.' + n + '` does not exist in the current database.'); e.code = 'P2021'; return e; };
const prisma = {
  __db: DB,
  weeklyQuestionSet: {
    findUnique: async ({ where }) => { if (DB.wqDown) throw missingTbl('WeeklyQuestionSet'); const k = where.userId_weekStart; const r = DB.wq.find((x) => x.userId === k.userId && x.weekStart === k.weekStart); return r ? { ...r } : null; },
    findMany: async ({ where, select }) => { if (DB.wqDown) throw missingTbl('WeeklyQuestionSet'); return DB.wq.filter((x) => matchRow(x, where)).map((x) => pick(x, select)); },
    create: async ({ data }) => {
      if (DB.wqDown) throw missingTbl('WeeklyQuestionSet');
      if (DB.wqRace) { DB.wqRace = false; if (!DB.wq.some((x) => x.userId === data.userId && x.weekStart === data.weekStart)) DB.wq.push({ id: 'wq-race-' + (++DB.seq), createdAt: new Date().toISOString(), intro: null, facts: null, model: null, ...data, source: 'RULES', questions: data.questions.slice(0, 2) }); const e = new Error('Unique constraint failed'); e.code = 'P2002'; throw e; }
      const r = { id: 'wq-' + (++DB.seq), createdAt: new Date().toISOString(), intro: null, facts: null, model: null, ...data }; DB.wq.push(r); return r;
    },
  },
  workout: { findMany: async ({ where }) => DB.workouts.filter((w) => matchRow(w, where)).map((w) => ({ ...w })) },
  checkIn: { findFirst: async ({ where }) => { if (DB.checkinDown) throw new Error('boom'); return DB.checkins.filter((c) => matchRow(c, where)).sort((a, b) => new Date(b.date) - new Date(a.date))[0] || null; } },
  dietMealLog: { findMany: async ({ where }) => DB.mealLogs.filter((x) => matchRow(x, where)).map((x) => ({ ...x })) },
  dailyCheckin: { findMany: async ({ where }) => DB.daily.filter((x) => matchRow(x, where)).map((x) => ({ ...x })) },
  aiLog: { create: async ({ data }) => { DB.aiLogs.push({ id: 'ai-' + (++DB.seq), ...data }); return data; } },
  user: {
    findUnique: async ({ where, select }) => { const u = DB.users.find((x) => x.id === where.id); return u ? pick(u, select) : null; },
    findMany: async ({ where }) => DB.users.filter((u) => matchRow(u, where)).map((u) => ({ ...u, workouts: [], _count: { checkIns: 0 } })),
    findFirst: async () => null,
    update: async ({ where, data }) => { const u = DB.users.find((x) => x.id === where.id); Object.assign(u, data); DB.calls.push(['user.update', where.id, data]); return u; },
  },
  exercise: { findMany: async () => [] },
  webPushSubscription: { findMany: async () => [], delete: async () => ({}) },
  anamnese: {
    findFirst: async ({ where }) => DB.anamneses.filter((a) => matchRow(a, where)).sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0))[0] || null,
    findMany: async ({ where }) => DB.anamneses.filter((a) => matchRow(a, where)).sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0)),
  },
  weeklyFeedback: {
    findUnique: async ({ where, select }) => {
      if (DB.weeklyDown) { const e = new Error('The table `public.WeeklyFeedback` does not exist in the current database.'); e.code = 'P2021'; throw e; }
      const w = where.userId_weekStart ? DB.weekly.find((x) => x.userId === where.userId_weekStart.userId && x.weekStart === where.userId_weekStart.weekStart) : DB.weekly.find((x) => x.id === where.id);
      return w ? pick(w, select) : null;
    },
    findMany: async ({ where, orderBy, take, select }) => {
      if (DB.weeklyDown) { const e = new Error('does not exist'); e.code = 'P2021'; throw e; }
      let r = DB.weekly.filter((w) => matchRow(w, where)).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)); if (take) r = r.slice(0, take);
      return r.map((w) => { const o = pick(w, select); if (select && select.user) o.user = pick(DB.users.find((u) => u.id === w.userId), select.user.select); return o; });
    },
    create: async ({ data }) => {
      if (DB.nextCreateP2002) { DB.nextCreateP2002 = false; if (!DB.weekly.some((x) => x.userId === data.userId && x.weekStart === data.weekStart)) DB.weekly.push({ id: 'race-' + (++DB.seq), createdAt: new Date().toISOString(), coachSeenAt: null, coachReply: null, coachReplyAt: null, ...data, answers: { effort: 1 } }); const e = new Error('Unique constraint failed'); e.code = 'P2002'; throw e; }
      const w = { id: 'wf-' + (++DB.seq), createdAt: new Date().toISOString(), coachSeenAt: null, coachReply: null, coachReplyAt: null, ...data }; DB.weekly.push(w); return w;
    },
    update: async ({ where, data }) => { const w = DB.weekly.find((x) => x.id === where.id); Object.entries(data).forEach(([k, v]) => { if (v !== undefined) w[k] = v; }); return w; },
  },
  workoutHistory: {
    findMany: async function ({ where, take, orderBy, include }) {
      let r = DB.histories.filter((h) => matchRow(h, where)).sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, take);
      if (arguments[0].select) {
        const sel = arguments[0].select;
        return r.map((h) => { const o = pick(h, sel); if (sel.details) o.details = (h.details || []).filter((d) => matchRow(d, sel.details.where)).map((d) => pick(d, sel.details.select)); return o; });
      }
      return r.map((h) => {
        const out = { ...h };
        if (include && include.user) out.user = pick(DB.users.find((u) => u.id === h.userId), include.user.select);
        if (include && include.details) {
          const w = include.details.where; out.details = (h.details || []).filter((d) => matchRow(d, w)).sort((a, b) => a.setNumber - b.setNumber).map((d) => pick(d, include.details.select));
        } else delete out.details;
        return out;
      });
    },
  },
  studentAlert: {
    findUnique: async ({ where, select }) => { const a = DB.alerts.find((x) => x.id === where.id); return a ? pick(a, select) : null; },
    findFirst: async ({ where, select }) => { const a = DB.alerts.filter((x) => matchRow(x, where)).sort((p, q) => new Date(q.createdAt) - new Date(p.createdAt))[0]; return a ? pick(a, select) : null; },
    create: async ({ data }) => { const a = { id: 'new-' + (++DB.seq), isRead: false, createdAt: new Date().toISOString(), ...data }; DB.alerts.push(a); return a; },
    update: async ({ where, data }) => { const a = DB.alerts.find((x) => x.id === where.id); Object.entries(data).forEach(([k, v]) => { if (v !== undefined) a[k] = v; }); return a; }, // (Prisma ignora undefined)
    findMany: async ({ where, orderBy, take, include }) => {
      if (DB.alertsDown) throw new Error('relation "StudentAlert" does not exist');
      let r = DB.alerts.filter((a) => matchRow(a, where)).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).slice(0, take);
      return r.map((a) => ({ ...a, ...(include && include.user ? { user: pick(DB.users.find((u) => u.id === a.userId), include.user.select) } : {}) }));
    },
  },
};
module.exports = prisma; module.exports.default = prisma;
