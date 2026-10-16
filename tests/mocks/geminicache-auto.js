// geminiCache simulado: a IA responde o que o teste definir em globalThis.__GEMINI({ model, contents })
exports.geminiClient = { models: { generateContent: async (args) => { globalThis.__AI_CALLS = (globalThis.__AI_CALLS || []); globalThis.__AI_CALLS.push(args); return globalThis.__GEMINI(args); } } };
exports.getOrCreateGeminiCache = async () => null;
exports.hashForCache = (...a) => a.join('|');
