// Banco em memória para o teste do plano automático (lib/autoPlan.ts). Implementa só o que o pipeline usa.
const { randomUUID } = require('crypto');
const T = (globalThis.__DB = {
  user: [], anamnese: [], workout: [], workoutExercise: [], diet: [], meal: [], foodItem: [], foodItemMeta: [], exercise: [], autoPlanRun: [], food: [], dietDayScheme: [], workoutHistory: [], aiLog: [], dailyCheckin: [], challengeCheckin: [], templateCollection: [], workoutTemplate: [], genPrefs: [], genPreset: [], equipmentReport: [],
});
const get = (o, k) => o?.[k];
function match(row, where) {
  if (!where) return true;
  return Object.entries(where).every(([k, v]) => {
    if (k === 'OR') return v.some((w) => match(row, w));
    if (k === 'AND') return v.every((w) => match(row, w));
    if (k === 'userId_date' || k === 'studentId_date') return Object.entries(v).every(([kk, vv]) => row[kk] === vv);   // chave composta do Prisma
    const val = row[k];
    if (v && typeof v === 'object' && !(v instanceof Date) && !Array.isArray(v)) {
      if ('gte' in v || 'lt' in v) return (!('gte' in v) || val >= v.gte) && (!('lt' in v) || val < v.lt);
      if ('in' in v) return v.in.includes(val);
      if ('not' in v) return val !== v.not;
      if ('hasSome' in v) return Array.isArray(val) && v.hasSome.some((x) => val.includes(x));
      if ('contains' in v) return String(val || '').includes(v.contains);
      return true;
    }
    return val === v;
  });
}
function sortBy(rows, orderBy) {
  if (!orderBy) return rows;
  const [[k, dir]] = Object.entries(Array.isArray(orderBy) ? orderBy[0] : orderBy);
  return [...rows].sort((a, b) => (a[k] > b[k] ? 1 : a[k] < b[k] ? -1 : 0) * (dir === 'desc' ? -1 : 1));
}
const stamp = (r) => { const now = new Date(); r.createdAt = r.createdAt || now; r.updatedAt = now; return r; };
const copy = (r) => (r ? { ...r } : r);
function table(name, defaults = () => ({})) {
  const rows = T[name];
  return {
    findFirst: async ({ where, orderBy } = {}) => copy(sortBy(rows.filter((r) => match(r, where)), orderBy)[0] ?? null),
    findUnique: async ({ where }) => copy(rows.find((r) => match(r, where)) ?? null),
    findMany: async ({ where, orderBy, take, select } = {}) => {
      let out = sortBy(rows.filter((r) => match(r, where)), orderBy);
      if (take) out = out.slice(0, take);
      if (select && select._count) out = out.map((r) => ({ ...r, _count: { exercises: T.workoutExercise.filter((e) => e.workoutId === r.id).length } }));
      return out.map(copy);
    },
    create: async ({ data }) => {
      const { meals, ...rest } = data;
      const row = stamp({ id: randomUUID(), ...defaults(), ...rest });
      rows.push(row);
      if (meals?.create) meals.create.forEach((m) => {
        const { items, ...mrest } = m;
        const meal = { id: randomUUID(), dietId: row.id, ...mrest };
        T.meal.push(meal);
        (items?.create || []).forEach((it) => T.foodItem.push({ ...it, mealId: meal.id }));
      });
      return row;
    },
    createMany: async ({ data }) => { data.forEach((d) => rows.push(stamp({ id: randomUUID(), ...d }))); return { count: data.length }; },
    update: async ({ where, data }) => {
      const row = rows.find((r) => match(r, where));
      if (!row) throw Object.assign(new Error('not found'), { code: 'P2025' });
      applyData(row, data); stamp(row); return row;
    },
    updateMany: async ({ where, data }) => { const hit = rows.filter((r) => match(r, where)); hit.forEach((r) => { applyData(r, data); stamp(r); }); return { count: hit.length }; },
    deleteMany: async ({ where } = {}) => { const hit = rows.filter((r) => match(r, where)); hit.forEach((r) => rows.splice(rows.indexOf(r), 1)); return { count: hit.length }; },
    delete: async ({ where }) => { const row = rows.find((r) => match(r, where)); if (!row) throw Object.assign(new Error('not found'), { code: 'P2025' }); rows.splice(rows.indexOf(row), 1); return row; },
    upsert: async ({ where, create, update }) => { const row = rows.find((r) => match(r, where)); if (row) { applyData(row, update); return row; } const n = stamp({ id: randomUUID(), ...create }); rows.push(n); return n; },
  };
}
function applyData(row, data) { Object.entries(data).forEach(([k, v]) => { if (v && typeof v === 'object' && 'increment' in v) row[k] = (row[k] || 0) + v.increment; else row[k] = v; }); }

const prisma = {
  __db: T,
  user: (() => {
    const base = table('user');
    return {
      ...base,
      findUnique: async (args) => {
        const u = await base.findUnique(args);
        if (!u || !args.include) return u;
        const out = { ...u };
        if (args.include.anamneses) out.anamneses = sortBy(T.anamnese.filter((a) => a.userId === u.id), { createdAt: 'desc' }).slice(0, args.include.anamneses.take || 99);
        if (args.include.workouts) out.workouts = sortBy(T.workout.filter((w) => w.userId === u.id), { createdAt: 'desc' }).slice(0, args.include.workouts.take || 99)
          .map((w) => ({ ...w, exercises: T.workoutExercise.filter((e) => e.workoutId === w.id).map((e) => ({ ...e, exercise: T.exercise.find((x) => x.id === e.exerciseId) })) }));
        return out;
      },
    };
  })(),
  anamnese: table('anamnese'),
  workout: table('workout', () => ({ archived: false })),
  workoutExercise: table('workoutExercise'),
  diet: table('diet'),
  meal: table('meal'),
  foodItem: table('foodItem'),
  foodItemMeta: table('foodItemMeta'),
  exercise: table('exercise'),
  food: table('food'),
  dietDayScheme: table('dietDayScheme'),
  workoutHistory: table('workoutHistory'),
  aiLog: table('aiLog'),
  dailyCheckin: table('dailyCheckin'),
  challengeCheckin: table('challengeCheckin', () => ({ done: [] })),
  templateCollection: table('templateCollection'),
  workoutTemplate: table('workoutTemplate'),
  genPrefs: table('genPrefs'),
  genPreset: table('genPreset'),
  equipmentReport: table('equipmentReport'),
  autoPlanRun: table('autoPlanRun', () => ({ status: 'PENDING', step: null, attempts: 0, error: null, workoutIds: [], dietId: null, summary: null, startedAt: null, finishedAt: null })),
  $transaction: async (fn) => fn(prisma),
};
module.exports = prisma; module.exports.default = prisma;
