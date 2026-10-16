class GoogleGenAI { constructor(o){ this.o = o; this.models = { generateContent: async () => ({ text: '{}' }) }; this.caches = { create: async () => ({}), get: async () => ({}) }; } }
module.exports = { GoogleGenAI };
