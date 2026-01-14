import { NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';

const apiKey = process.env.GEMINI_API_KEY;
const genAI = new GoogleGenerativeAI(apiKey || '');

export async function POST(req: Request) {
  try {
    const formData = await req.formData();
    const file = formData.get('video') as Blob;
    const exerciseName = formData.get('exerciseName') || 'Exercício';
    const userLevel = formData.get('userLevel') || 'Iniciante';

    if (!file) {
      return NextResponse.json({ error: "Arquivo de vídeo não recebido" }, { status: 400 });
    }

    if (!apiKey) {
      return NextResponse.json({ error: "Configuração de API (Chave) ausente na Render" }, { status: 500 });
    }

    // MUDANÇA AQUI: Usando o modelo PRO que é mais robusto para vídeos diretos
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-pro" });

    const arrayBuffer = await file.arrayBuffer();
    const base64Data = Buffer.from(arrayBuffer).toString('base64');

    console.log(`🚀 Analisando vídeo de ${exerciseName} no modelo PRO...`);

    const result = await model.generateContent([
      {
        inlineData: {
          data: base64Data,
          mimeType: "video/mp4",
        },
      },
      `Você é um Personal Trainer especialista em biomecânica. 
       Analise a execução do exercício ${exerciseName} neste vídeo. 
       O aluno é nível ${userLevel}. 
       Dê um feedback direto, curto (máximo 3 frases) e motivador sobre a técnica.`,
    ]);

    const response = await result.response;
    const text = response.text();

    return NextResponse.json({ feedback: text });

  } catch (error: any) {
    console.error("❌ ERRO NO BACKEND:", error.message);
    return NextResponse.json({ 
      error: "Erro na análise", 
      details: error.message 
    }, { status: 500 });
  }
}

export const dynamic = 'force-dynamic';