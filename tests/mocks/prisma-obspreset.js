// Banco em memória só do ObservationPreset (findMany/create/update/delete por id).
const state = { rows: [], nextId: 1, fail: null };
const clone = (x) => JSON.parse(JSON.stringify(x));
const api = {
  async findMany({ orderBy } = {}) { if (state.fail) throw new Error(state.fail); let r = state.rows.slice(); if (orderBy && orderBy.createdAt === 'desc') r = r.sort((a, b) => b.createdAt - a.createdAt); return r.map(clone); },
  async create({ data }) { if (state.fail) throw new Error(state.fail); const row = { id: 'op' + state.nextId, createdAt: new Date(Date.now() + state.nextId), category: null, ...data }; state.nextId++; state.rows.push(row); return clone(row); },
  async update({ where, data }) { const row = state.rows.find((x) => x.id === where.id); if (!row) throw new Error('não existe'); Object.assign(row, data); return clone(row); },
  async delete({ where }) { const i = state.rows.findIndex((x) => x.id === where.id); if (i < 0) throw new Error('não existe'); return clone(state.rows.splice(i, 1)[0]); },
};
const base = { observationPreset: api };
module.exports = base; module.exports.default = base; module.exports.__state = state;
module.exports.__reset = () => { state.rows.length = 0; state.nextId = 1; state.fail = null; };
