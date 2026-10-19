// @google/genai simulado para o Argon: o teste define globalThis.__ARGON(args) -> resposta (ou lança erro); cada chamada fica em globalThis.__ARGON_CALLS
class GoogleGenAI { constructor(o){ this.o = o; globalThis.__ARGON_KEYS = (globalThis.__ARGON_KEYS || []).concat([o && o.apiKey]); this.models = { generateContent: async (args) => { (globalThis.__ARGON_CALLS = globalThis.__ARGON_CALLS || []).push(args); return globalThis.__ARGON(args); } }; } }
module.exports = { GoogleGenAI };
