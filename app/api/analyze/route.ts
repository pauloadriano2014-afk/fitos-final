import { NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';

const apiKey = process.env.GEMINI_API_KEY;
const genAI = new GoogleGenerativeAI(apiKey || '');

export async function POST(req: Request) {
  try {
    const { image } = await req.json();

    if (!image) {
      return NextResponse.json({ error: "Imagem não fornecida" }, { status: 400 });
    }

    if (!apiKey) {
      console.error("ERRO: GEMINI_API_KEY não encontrada no ambiente.");
      return NextResponse.json({ error: "Configuração de API ausente" }, { status: 500 });
    }

    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

    // Detecta o tipo da imagem ou assume jpeg por padrão
    const mimeType = image.match(/data:([^;]+);/)?.[1] || "image/jpeg";
    const base64Data = image.includes(',') ? image.split(',')[1] : image;

    console.log(`🚀 Tentando análise com tipo: ${mimeType}`);

    const result = await model.generateContent([
      "Analise este rótulo de produto. Liste os ingredientes e faça uma breve análise de saúde.",
      {
        inlineData: {
          data: base64Data,
          mimeType: mimeType,
        },
      },
    ]);

    const response = await result.response;
    const text = response.text();

    return NextResponse.json({ analysis: text });

  } catch (error: any) {
    console.error("❌ ERRO NO BACKEND:", error.message || error);
    // Retorna o erro real para o seu log do celular ver
    return NextResponse.json({ 
      error: "Erro na IA", 
      details: error.message 
    }, { status: 500 });
  }
}

export const dynamic = 'force-dynamic';