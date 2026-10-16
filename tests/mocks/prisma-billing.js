// Banco em memória para os testes da cobrança do coach. Imita a TRAVA DE LINHA: dentro de $transaction, o 1º platformConfig.update segura a linha
// até o fim da transação (as outras transações esperam) -- por isso o teste de concorrência prova que a trava é necessária.
const tick = () => new Promise((r) => setTimeout(r, 0));
const state = { users: new Map(), config: null, subs: new Map(), lock: Promise.resolve(), nextId: 1 };
const clone = (o) => (o ? JSON.parse(JSON.stringify(o), (k, v) => (typeof v === 'string' && /^\d{4}-\d\d-\d\dT/.test(v) ? new Date(v) : v)) : o);
const matches = (u, w) => {
  if (!w) return true;
  if (w.OR) return w.OR.some((x) => matches(u, x));
  return Object.entries(w).every(([k, v]) => {
    if (v && typeof v === 'object' && !(v instanceof Date)) { if ('gt' in v) return u[k] && new Date(u[k]) > new Date(v.gt); if ('not' in v) return u[k] !== v.not; }
    return (u[k] ?? null) === v || (v === false && !u[k]);
  });
};
const userApi = (db) => ({
  async findUnique({ where }) { await tick(); const u = state.users.get(where.id) || [...state.users.values()].find((x) => where.email && x.email === where.email); return clone(u) || null; },
  async findFirst({ where }) { await tick(); return clone([...state.users.values()].find((u) => matches(u, where))) || null; },
  async findMany({ where }) { await tick(); return [...state.users.values()].filter((u) => matches(u, where)).map(clone); },
  async count({ where }) { await tick(); return [...state.users.values()].filter((u) => matches(u, where)).length; },
  async update({ where, data }) { await tick(); const u = state.users.get(where.id); if (!u) throw new Error('user not found ' + where.id); Object.assign(u, data); return clone(u); },
  async updateMany({ where, data }) { await tick(); let n = 0; for (const u of state.users.values()) if (matches(u, where)) { Object.assign(u, data); n++; } return { count: n }; },
});
const configApi = (txLock) => ({
  async upsert({ create, update }) { await tick(); if (!state.config) state.config = { ...create }; else Object.assign(state.config, update || {}); return clone(state.config); },
  async update({ data }) { await tick(); if (txLock) await txLock(); Object.assign(state.config, data); return clone(state.config); },
});
const subApi = () => ({
  async findUnique({ where }) { await tick(); return clone([...state.subs.values()].find((s) => (where.asaasCheckoutId && s.asaasCheckoutId === where.asaasCheckoutId) || (where.id && s.id === where.id))) || null; },
  async findFirst({ where }) { await tick(); return clone([...state.subs.values()].find((s) => Object.entries(where).every(([k, v]) => s[k] === v))) || null; },
  async update({ where, data }) { await tick(); const s = state.subs.get(where.id); Object.assign(s, data); return clone(s); },
});
const base = { user: userApi(), platformConfig: configApi(null), subscription: subApi(),
  async $transaction(cb) {
    let release; let held = false; const prev = state.lock; state.lock = new Promise((r) => (release = r));
    const acquire = async () => { if (held) return; await prev; held = true; };
    const tx = { user: userApi(), platformConfig: configApi(acquire), subscription: subApi() };
    try { return await cb(tx); } finally { if (!held) { /* nunca pegou a trava */ } release(); }
  },
};
module.exports = base; module.exports.default = base;
module.exports.__state = state;
module.exports.__reset = () => { state.users.clear(); state.subs.clear(); state.config = null; state.lock = Promise.resolve(); state.nextId = 1; };
module.exports.__addUser = (u) => { state.users.set(u.id, { role: 'COACH', coachBillingStatus: 'TRIAL', isLaunchPromo: false, cpf: '52998224725', email: u.id + '@x.com', name: u.id, ...u }); };
