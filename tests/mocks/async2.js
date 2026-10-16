const store = {};
const api = {
  __store: store,
  getItem: async (k) => (k in store ? store[k] : null),
  setItem: async (k, v) => { store[k] = v; },
  multiGet: async (keys) => keys.map((k) => [k, k in store ? store[k] : null]),
};
module.exports = api; module.exports.default = api;
