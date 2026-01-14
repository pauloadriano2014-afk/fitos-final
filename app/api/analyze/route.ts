import { NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';

// Forçamos a versão 'v1' (estável) para evitar o erro do v1beta
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');

export async function POST(req: Request) {
  try {
    const formData = await req.formData();
    const file = formData.get('video') as Blob;
    const exercise = formData.get('exerciseName') || 'Exercício';

    if (!file) {
      return NextResponse.json({ error: "Vídeo não recebido" }, { status: 400 });
    }

    // A mágica está aqui: apiVersion: 'v1'
    const model = genAI.getGenerativeModel(
      { model: "gemini-1.5-flash" },
      { apiVersion: 'v1' } 
    );

    const arrayBuffer = await file.arrayBuffer();
    const base64Data = Buffer.from(arrayBuffer).toString('base64');

    console.log("🚀 Enviando vídeo para análise estável (v1)...");

    const result = await model.generateContent([
      {
        inlineData: {
          data: base64Data,
          mimeType: "video/mp4",
        },
      },
      `Analise a biomecânica do exercício ${exercise} e dê um feedback curto e motivador.`,
    ]);

    const response = await result.response;
    const text = response.text();

    return NextResponse.json({ feedback: text });

  } catch (error: any) {
    console.error("❌ ERRO NA RENDER:", error.message);
    return NextResponse.json({ 
      error: "Erro na IA", 
      details: error.message 
    }, { status: 500 });
  }
}

export const dynamic = 'force-dynamic';