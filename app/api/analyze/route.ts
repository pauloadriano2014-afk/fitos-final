import { NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';

// Força a inicialização limpa
const apiKey = process.env.GEMINI_API_KEY;
const genAI = new GoogleGenerativeAI(apiKey || '');

export async function POST(req: Request) {
  try {
    const formData = await req.formData();
    const file = formData.get('video') as Blob;
    
    if (!file) {
      return NextResponse.json({ error: "Vídeo não recebido" }, { status: 400 });
    }

    if (!apiKey) {
      return NextResponse.json({ error: "Falta GEMINI_API_KEY na Render" }, { status: 500 });
    }

    // Usando a versão estável que o Google recomenda para evitar o erro 404
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

    const arrayBuffer = await file.arrayBuffer();
    const base64Data = Buffer.from(arrayBuffer).toString('base64');

    const result = await model.generateContent([
      {
        inlineData: {
          data: base64Data,
          mimeType: "video/mp4",
        },
      },
      "Analise a execução técnica deste exercício de musculação e dê um feedback curto.",
    ]);

    const response = await result.response;
    return NextResponse.json({ feedback: response.text() });

  } catch (error: any) {
    console.error("ERRO:", error.message);
    return NextResponse.json({ error: "Erro na IA", details: error.message }, { status: 500 });
  }
}

export const dynamic = 'force-dynamic';