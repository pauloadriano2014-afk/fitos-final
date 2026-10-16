const store = {}; module.exports = { getItem: async (k) => store[k] ?? null, setItem: async (k, v) => { store[k] = v; } }; module.exports.default = module.exports;
