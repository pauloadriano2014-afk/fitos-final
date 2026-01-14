import { NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';

// Inicializa a IA
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');

export async function POST(req: Request) {
  try {
    const { image } = await req.json();

    if (!image) {
      return NextResponse.json({ error: "Imagem não fornecida" }, { status: 400 });
    }

    // O NOME DO MODELO DEVE SER EXATAMENTE ESTE PARA A VERSÃO ESTÁVEL
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

    const prompt = "Analise esta foto de um rótulo de suplemento/alimento e extraia os ingredientes e tabela nutricional. Identifique se há substâncias nocivas ou excesso de açúcares.";

    // Ajuste na estrutura da chamada para evitar o erro de v1beta
    const result = await model.generateContent([
      prompt,
      {
        inlineData: {
          data: image.split(',')[1], // Remove o prefixo data:image/jpeg;base64,
          mimeType: "image/jpeg",
        },
      },
    ]);

    const response = await result.response;
    const text = response.text();

    return NextResponse.json({ analysis: text });

  } catch (error: any) {
    console.error("Erro na IA:", error);
    return NextResponse.json({ 
      error: "Erro na análise", 
      details: error.message 
    }, { status: 500 });
  }
}

export const dynamic = 'force-dynamic';