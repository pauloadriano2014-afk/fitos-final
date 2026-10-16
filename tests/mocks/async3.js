const store = {};
const api = {
  __store: store,
  getItem: async (k) => (k in store ? store[k] : null),
  setItem: async (k, v) => { store[k] = String(v); },
  removeItem: async (k) => { delete store[k]; },
  multiRemove: async (ks) => { ks.forEach((k) => delete store[k]); },
  getAllKeys: async () => Object.keys(store),
  multiGet: async (ks) => ks.map((k) => [k, k in store ? store[k] : null]),
};
module.exports = api; module.exports.default = api;
