// Banco em memória do ObservationPreset, ObservationCategory e ObservationSeed (findMany/findUnique/create/createMany/update/updateMany/delete + $transaction em lista).
// As chamadas só rodam quando alguém espera por elas (como no Prisma): dentro do $transaction a primeira que falhar impede as seguintes.
const S = { rows: [], cats: [], seeds: [], nextId: 1, nextCat: 1, fail: null, tx: 0 };
const clone = (x) => JSON.parse(JSON.stringify(x), (k, v) => (typeof v === 'string' && /^\d{4}-\d\d-\d\dT[\d:.]+Z$/.test(v) ? new Date(v) : v));
const lazy = (fn) => ({ then: (ok, bad) => Promise.resolve().then(fn).then(ok, bad), catch(bad) { return this.then(undefined, bad); } });
const match = (x, w) => Object.entries(w || {}).every(([k, v]) => (v === null ? x[k] == null : x[k] === v));
const sorter = (orderBy) => { const o = [].concat(orderBy || []); return (a, b) => { for (const t of o) for (const [k, dir] of Object.entries(t)) { const d = a[k] < b[k] ? -1 : a[k] > b[k] ? 1 : 0; if (d) return dir === 'desc' ? -d : d; } return 0; }; };
const table = (rows, prefix, nextKey, defaults) => ({
  findMany: ({ where, orderBy } = {}) => lazy(() => { if (S.fail) throw new Error(S.fail); return rows.filter((x) => match(x, where)).sort(sorter(orderBy)).map(clone); }),
  create: ({ data }) => lazy(() => { if (S.fail) throw new Error(S.fail); const n = S[nextKey]++; const row = { id: prefix + n, createdAt: new Date(Date.now() + n), ...defaults, ...data }; rows.push(row); return clone(row); }),
  createMany: ({ data }) => lazy(() => { if (S.fail) throw new Error(S.fail); data.forEach((d) => { const n = S[nextKey]++; rows.push({ id: prefix + n, createdAt: new Date(Date.now() + n), ...defaults, ...d }); }); return { count: data.length }; }),
  update: ({ where, data }) => lazy(() => { const row = rows.find((x) => x.id === where.id); if (!row) throw new Error('não existe'); Object.assign(row, data); return clone(row); }),
  updateMany: ({ where, data }) => lazy(() => { const hit = rows.filter((x) => match(x, where)); hit.forEach((x) => Object.assign(x, data)); return { count: hit.length }; }),
  delete: ({ where }) => lazy(() => { const i = rows.findIndex((x) => x.id === where.id); if (i < 0) throw new Error('não existe'); return clone(rows.splice(i, 1)[0]); }),
});
const seeds = {
  findUnique: ({ where }) => lazy(() => clone(S.seeds.find((x) => x.coachId === where.coachId) || null)),
  create: ({ data }) => lazy(async () => { await new Promise((r) => setTimeout(r, 1)); if (S.seeds.some((x) => x.coachId === data.coachId)) throw new Error('Unique constraint failed'); const row = { coachId: data.coachId, seededAt: new Date() }; S.seeds.push(row); return clone(row); }),
};
let chain = Promise.resolve();
const base = {
  observationPreset: table(S.rows, 'op', 'nextId', { category: null, coachId: null }),
  observationCategory: table(S.cats, 'oc', 'nextCat', { color: null, position: 0, coachId: null }),
  observationSeed: seeds,
  // Uma transação por vez (como o banco faz ao esperar a marca única): a que perde a corrida só roda depois que a vencedora terminou e então esbarra na marca.
  $transaction(ops) { S.tx++; const run = chain.then(async () => { const out = []; for (const o of ops) out.push(await o); return out; }); chain = run.catch(() => {}); return run; },
};
module.exports = base; module.exports.default = base; module.exports.__state = S;
module.exports.__reset = () => { S.rows.length = 0; S.cats.length = 0; S.seeds.length = 0; S.nextId = 1; S.nextCat = 1; S.fail = null; S.tx = 0; };
