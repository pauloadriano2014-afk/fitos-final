import { NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';

// 1. Verificação da Chave
const apiKey = process.env.GEMINI_API_KEY;
const genAI = new GoogleGenerativeAI(apiKey || '');

export async function POST(req: Request) {
  try {
    const { image } = await req.json();

    if (!image) {
      console.error("ERRO: Nenhuma imagem recebida no backend.");
      return NextResponse.json({ error: "Imagem não fornecida" }, { status: 400 });
    }

    if (!apiKey) {
      console.error("ERRO: GEMINI_API_KEY não configurada na Render!");
      return NextResponse.json({ error: "Chave de API ausente" }, { status: 500 });
    }

    // 2. Modelo Estável
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

    // 3. Limpeza da imagem base64
    const base64Data = image.includes(',') ? image.split(',')[1] : image;

    console.log("🚀 Iniciando chamada ao Gemini...");

    const result = await model.generateContent([
      "Analise este rótulo e extraia os ingredientes principais e se há algo nocivo.",
      {
        inlineData: {
          data: base64Data,
          mimeType: "image/jpeg",
        },
      },
    ]);

    const response = await result.response;
    const text = response.text();

    console.log("✅ Análise concluída com sucesso!");
    return NextResponse.json({ analysis: text });

  } catch (error: any) {
    // ESTE LOG VAI APARECER NA RENDER DIZENDO O MOTIVO REAL
    console.error("❌ ERRO DETALHADO NA IA:", error.message || error);
    return NextResponse.json({ 
      error: "Erro na análise", 
      details: error.message 
    }, { status: 500 });
  }
}

export const dynamic = 'force-dynamic';