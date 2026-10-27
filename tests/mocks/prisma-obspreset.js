// Banco em memória só do ObservationPreset e do ObservationCategory (findMany/create/update/updateMany/delete por id + $transaction em sequência).
const state = { rows: [], cats: [], nextId: 1, nextCat: 1, fail: null };
const clone = (x) => JSON.parse(JSON.stringify(x));
const api = {
  async findMany({ orderBy } = {}) { if (state.fail) throw new Error(state.fail); let r = state.rows.slice(); if (orderBy && orderBy.createdAt === 'desc') r = r.sort((a, b) => b.createdAt - a.createdAt); return r.map(clone); },
  async create({ data }) { if (state.fail) throw new Error(state.fail); const row = { id: 'op' + state.nextId, createdAt: new Date(Date.now() + state.nextId), category: null, ...data }; state.nextId++; state.rows.push(row); return clone(row); },
  async update({ where, data }) { const row = state.rows.find((x) => x.id === where.id); if (!row) throw new Error('não existe'); Object.assign(row, data); return clone(row); },
  async updateMany({ where, data }) { const hit = state.rows.filter((x) => Object.entries(where || {}).every(([k, v]) => x[k] === v)); hit.forEach((x) => Object.assign(x, data)); return { count: hit.length }; },
  async delete({ where }) { const i = state.rows.findIndex((x) => x.id === where.id); if (i < 0) throw new Error('não existe'); return clone(state.rows.splice(i, 1)[0]); },
};
const cats = {
  async findMany({ orderBy } = {}) { if (state.fail) throw new Error(state.fail); return state.cats.map(clone); },
  async create({ data }) { const row = { id: 'oc' + state.nextCat, createdAt: new Date(Date.now() + state.nextCat), color: null, ...data }; state.nextCat++; state.cats.push(row); return clone(row); },
  async update({ where, data }) { const row = state.cats.find((x) => x.id === where.id); if (!row) throw new Error('não existe'); Object.assign(row, data); return clone(row); },
  async delete({ where }) { const i = state.cats.findIndex((x) => x.id === where.id); if (i < 0) throw new Error('não existe'); return clone(state.cats.splice(i, 1)[0]); },
};
const base = { observationPreset: api, observationCategory: cats, async $transaction(ops) { const out = []; for (const o of ops) out.push(await o); return out; } };
module.exports = base; module.exports.default = base; module.exports.__state = state;
module.exports.__reset = () => { state.rows.length = 0; state.cats.length = 0; state.nextId = 1; state.nextCat = 1; state.fail = null; };
