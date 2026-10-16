// Banco em memória só do CardioPreset (findMany/count/create/deleteMany com where por coachId e id).
const state = { rows: [], nextId: 1, fail: null };
const match = (r, w) => Object.entries(w || {}).every(([k, v]) => r[k] === v);
const api = {
  async findMany({ where, orderBy }) { if (state.fail) throw new Error(state.fail); let r = state.rows.filter((x) => match(x, where)); if (orderBy && orderBy.createdAt === 'desc') r = r.slice().sort((a, b) => b.createdAt - a.createdAt); return r.map((x) => JSON.parse(JSON.stringify(x))); },
  async count({ where }) { return state.rows.filter((x) => match(x, where)).length; },
  async create({ data }) { if (state.fail) throw new Error(state.fail); const row = { id: 'cp' + state.nextId++, createdAt: new Date(Date.now() + state.nextId), goal: null, ...data }; state.rows.push(row); return JSON.parse(JSON.stringify(row)); },
  async deleteMany({ where }) { const keep = state.rows.filter((x) => !match(x, where)); const count = state.rows.length - keep.length; state.rows.length = 0; keep.forEach((x) => state.rows.push(x)); return { count }; },
};
const base = { cardioPreset: api };
module.exports = base; module.exports.default = base; module.exports.__state = state;
module.exports.__reset = () => { state.rows.length = 0; state.nextId = 1; state.fail = null; };
