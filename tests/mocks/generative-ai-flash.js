// @google/generative-ai (SDK antigo, usado pelo Flash/Pro da avaliação): registra o modelo pedido em globalThis.__FLASH_CALLS
class GoogleGenerativeAI { constructor(k){ this.k = k; } getGenerativeModel({ model }) { return { generateContent: async () => { (globalThis.__FLASH_CALLS = globalThis.__FLASH_CALLS || []).push(model); return { response: { text: () => 'ANALISE ' + model } }; } }; } }
module.exports = { GoogleGenerativeAI };
