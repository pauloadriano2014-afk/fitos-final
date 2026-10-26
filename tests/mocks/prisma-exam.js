// Banco em memória da AGENDA: um mini motor de consulta (igual, in, not, gt/gte/lt/lte, OR/AND/NOT, null) + únicos (P2002) + createMany/updateMany/upsert.
// Semântica SQL onde importa: `not: valor` NÃO devolve linhas com NULL.
const clone = (o) => (o == null ? o : JSON.parse(JSON.stringify(o), (k, v) => (typeof v === 'string' && /^\d{4}-\d\d-\d\dT[\d:.]+Z$/.test(v) ? new Date(v) : v)));
const MODELS = ['insightMemory', 'agendaEvent', 'agendaSeries', 'agendaSettings', 'agendaTaskSnooze', 'agendaTaskNote', 'user', 'offlineClient', 'weeklyFeedback', 'studentAlert', 'checkIn', 'workout', 'workoutShare', 'runningAnamnese', 'runningProtocol', 'workoutSession', 'workoutHistory', 'agendaTaskResolved', 'studentCoachMessage', 'equipmentReport', 'workoutExercise', 'exercise', 'anamnese', 'exerciseHistory', 'executionVideo', 'videoFeedback', 'videoRequest', 'videoPolicy', 'videoQuickReply', 'tutorialVideo', 'coachFeature', 'featureGlobal', 'examSubmission', 'examFile', 'examReply', 'diet', 'dietFeedback', 'platformConfig', 'aiLog', 'coachNote', 'coachTask', 'content', 'contentAccess', 'contentLike'];
const state = { nextId: 1, failOn: {}, calls: {}, override: {} };
MODELS.forEach((m) => { state[m] = []; });
const DEFAULTS = {
  aiLog: () => ({ createdAt: new Date() }),
  examSubmission: () => ({ createdAt: new Date(), status: 'NEW', coachViewedAt: null, coachId: null, nutritionistId: null, examDate: null, note: null }),
  examFile: () => ({ createdAt: new Date(), pageNo: 1 }),
  examReply: () => ({ createdAt: new Date(), studentReadAt: null }),
  content: () => ({ createdAt: new Date(), subtitle: null, description: '', type: 'video', isVIP: false, valor: null, audience: null, videoUrl: null, pdfUrl: null, audioUrl: null, thumbUrl: null, duration: null, coachId: null }),
  coachFeature: () => ({ grantedAt: new Date(), revokedAt: null, revokedReason: null, reason: null, grantedBy: null }),
  featureGlobal: () => ({ enabled: false, updatedBy: null }),
  executionVideo: () => ({ createdAt: new Date(), status: 'UPLOADING', coachViewedAt: null, deletedAt: null, durationSec: null, priority: false, requestId: null, studentNote: null, setNumber: null, day: null, workoutId: null, workoutExerciseId: null, exerciseId: null, coachId: null }),
  videoFeedback: () => ({ createdAt: new Date(), studentReadAt: null, body: null, atSec: null, drawing: null, replyCfUid: null, referenceExerciseId: null, referenceName: null }),
  videoRequest: () => ({ createdAt: new Date(), status: 'OPEN', videoId: null, fulfilledAt: null, exerciseId: null, workoutId: null, workoutExerciseId: null, day: null, note: null }),
  videoPolicy: () => ({ updatedAt: new Date(), enabled: false, monthlyLimit: null }),
  videoQuickReply: () => ({ createdAt: new Date() }),
  agendaEvent: () => ({ status: 'SCHEDULED', kind: 'PRESENCIAL', statusAt: null, studentResponse: null, studentRespondedAt: null, coachRemindedAt: null, studentRemindedAt: null, seriesId: null, title: null, studentId: null, offlineClientId: null, location: null, meetProvider: null, meetUrl: null, notes: null, createdAt: new Date(), updatedAt: new Date() }),
  agendaSeries: () => ({ active: true, kind: 'PRESENCIAL', durationMin: 60, endDate: null, title: null, studentId: null, offlineClientId: null, location: null, meetProvider: null, meetUrl: null, notes: null, createdAt: new Date(), updatedAt: new Date() }),
  agendaSettings: () => ({ meetProvider: 'MEET', meetUrl: null, remindCoachMin: 30, remindStudentMin: 120, dailySummary: true, summaryHour: 7, summarySentOn: null, workStart: '06:00', workEnd: '21:00', updatedAt: new Date() }),
  agendaTaskSnooze: () => ({ createdAt: new Date() }),
  agendaTaskNote: () => ({ createdAt: new Date(), updatedAt: new Date() }),
  agendaTaskResolved: () => ({ resolvedAt: new Date(), subtitle: null, personKind: null, personId: null, personName: null, snapshot: null, note: null, messageId: null }),
  studentCoachMessage: () => ({ createdAt: new Date(), readAt: null, outcome: null, outcomeAt: null, changes: null, workoutId: null, day: null, sourceTaskKey: null, followUp: false }),
  equipmentReport: () => ({ createdAt: new Date(), lastReportedAt: new Date(), count: 1, status: 'OPEN', resolution: null, replacedWithId: null, resolvedAt: null, note: null, workoutId: null, workoutExerciseId: null, day: null, coachId: null }),
};
const UNIQUES = { examFile: [['key']], coachFeature: [['coachId', 'feature']], featureGlobal: [['feature']], videoPolicy: [['coachId', 'studentId']], executionVideo: [['cfUid']], agendaEvent: [['seriesId', 'slotAt']], agendaSettings: [['coachId']], agendaTaskSnooze: [['coachId', 'taskKey']], agendaTaskNote: [['coachId', 'taskKey']], agendaTaskResolved: [['coachId', 'taskKey']] };
const norm = (v) => (v instanceof Date ? v.getTime() : v === undefined ? null : v);
const isOp = (v) => v && typeof v === 'object' && !(v instanceof Date) && !Array.isArray(v);
function cond(val, c) {
  const v = norm(val);
  if (!isOp(c)) return v === norm(c);
  return Object.entries(c).every(([op, arg]) => {
    const a = norm(arg);
    switch (op) {
      case 'equals': return v === a;
      case 'in': return arg.map(norm).includes(v);
      case 'notIn': return !arg.map(norm).includes(v);
      case 'not': return a === null ? v !== null : (v !== null && v !== a);   // SQL: NULL <> x não passa
      case 'gt': return v !== null && v > a; case 'gte': return v !== null && v >= a;
      case 'lt': return v !== null && v < a; case 'lte': return v !== null && v <= a;
      case 'startsWith': return typeof v === 'string' && v.startsWith(String(arg));
      case 'contains': return typeof v === 'string' && v.toLowerCase().includes(String(arg).toLowerCase());
      default: throw new Error('operador não suportado no mock: ' + op);
    }
  });
}
function match(row, where) {
  if (!where) return true;
  return Object.entries(where).every(([k, c]) => {
    if (c === undefined) return true;   // como o Prisma: filtro undefined é ignorado
    if (k === 'OR') return c.some((w) => match(row, w));
    if (k === 'AND') return (Array.isArray(c) ? c : [c]).every((w) => match(row, w));
    if (k === 'NOT') return !(Array.isArray(c) ? c : [c]).some((w) => match(row, w));
    if (k.includes('_') && isOp(c) && !('in' in c) && Object.keys(c).every((x) => x in row || true) && k.split('_').every((p) => p in c)) return Object.entries(c).every(([kk, vv]) => cond(row[kk], vv));
    return cond(row[k], c);
  });
}
const proj = (row, select) => { if (!select) return clone(row); const o = {}; Object.keys(select).forEach((k) => { if (select[k]) o[k] = row[k]; }); return clone(o); };
function sortRows(rows, orderBy) {
  if (!orderBy) return rows;
  const list = Array.isArray(orderBy) ? orderBy : [orderBy];
  return rows.slice().sort((a, b) => { for (const o of list) { const [k, d] = Object.entries(o)[0]; const x = norm(a[k]), y = norm(b[k]); if (x === y) continue; return (x > y ? 1 : -1) * (d === 'desc' ? -1 : 1); } return 0; });
}
const dupErr = () => Object.assign(new Error('Unique constraint failed'), { code: 'P2002' });
function uniqueClash(model, rows, row, ignore) {
  return (UNIQUES[model] || []).some((cols) => cols.every((c) => row[c] != null) && rows.some((r) => r !== ignore && cols.every((c) => norm(r[c]) === norm(row[c]))));
}
function make(model) {
  const rows = () => state[model];
  const guard = (op) => { state.calls[model + '.' + op] = (state.calls[model + '.' + op] || 0) + 1; const f = state.failOn[model]; if (f) throw Object.assign(new Error(f.message || 'falha simulada'), { code: f.code }); };
  const build = (data) => ({ id: 'id' + state.nextId++, ...(DEFAULTS[model] ? DEFAULTS[model]() : {}), ...clone(data) });
  const api = {
    async findMany({ where, orderBy, take, select } = {}) { guard('findMany'); let r = sortRows(rows().filter((x) => match(x, where)), orderBy); if (take) r = r.slice(0, take); return r.map((x) => proj(x, select)); },
    async findFirst({ where, orderBy, select } = {}) { guard('findFirst'); const r = sortRows(rows().filter((x) => match(x, where)), orderBy)[0]; return r ? proj(r, select) : null; },
    async findUnique({ where, select }) { guard('findUnique'); const r = rows().find((x) => match(x, where)); return r ? proj(r, select) : null; },
    async groupBy({ by, where, _max, _min, _count } = {}) { guard('groupBy'); const groups = new Map(); rows().filter((x) => match(x, where)).forEach((x) => { const k = JSON.stringify(by.map((b) => norm(x[b]))); if (!groups.has(k)) groups.set(k, []); groups.get(k).push(x); }); return [...groups.values()].map((g) => { const o = {}; by.forEach((b) => { o[b] = g[0][b]; }); if (_max) { o._max = {}; Object.keys(_max).forEach((f) => { o._max[f] = g.reduce((m, r) => (r[f] != null && (m == null || norm(r[f]) > norm(m)) ? r[f] : m), null); }); } if (_min) { o._min = {}; Object.keys(_min).forEach((f) => { o._min[f] = g.reduce((m, r) => (r[f] != null && (m == null || norm(r[f]) < norm(m)) ? r[f] : m), null); }); } if (_count) o._count = (typeof _count === 'object') ? { _all: g.length } : g.length; return o; }); },
    async count({ where } = {}) { guard('count'); return rows().filter((x) => match(x, where)).length; },
    async create({ data }) { guard('create'); const row = build(data); if (uniqueClash(model, rows(), row)) throw dupErr(); rows().push(row); return clone(row); },
    async createMany({ data, skipDuplicates }) { guard('createMany'); let count = 0; for (const d of data) { const row = build(d); if (uniqueClash(model, rows(), row)) { if (skipDuplicates) continue; throw dupErr(); } rows().push(row); count++; } return { count }; },
    async update({ where, data }) { guard('update'); const r = rows().find((x) => match(x, where)); if (!r) throw Object.assign(new Error('Record not found'), { code: 'P2025' }); Object.assign(r, clone(data), { updatedAt: new Date() }); return clone(r); },
    async updateMany({ where, data }) { guard('updateMany'); const hit = rows().filter((x) => match(x, where)); hit.forEach((r) => Object.assign(r, clone(data), { updatedAt: new Date() })); return { count: hit.length }; },
    async upsert({ where, update, create }) { guard('upsert'); const r = rows().find((x) => match(x, where)); if (r) { Object.assign(r, clone(update), { updatedAt: new Date() }); return clone(r); } const row = build(create); rows().push(row); return clone(row); },
    async delete({ where }) { guard('delete'); const i = rows().findIndex((x) => match(x, where)); if (i < 0) throw Object.assign(new Error('Record not found'), { code: 'P2025' }); return clone(rows().splice(i, 1)[0]); },
    async deleteMany({ where } = {}) { guard('deleteMany'); const keep = rows().filter((x) => !match(x, where)); const count = rows().length - keep.length; state[model] = keep; return { count }; },
  };
  return api;
}
const prisma = { __state: state, __reset() { MODELS.forEach((m) => { state[m] = []; }); state.nextId = 1; state.failOn = {}; state.calls = {}; state.override = {}; } };
MODELS.forEach((m) => { Object.defineProperty(prisma, m, { get() { const api = make(m); return state.override[m] ? Object.assign(api, state.override[m]) : api; } }); });
prisma.default = prisma;
module.exports = prisma;
