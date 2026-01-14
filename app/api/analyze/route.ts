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
      return NextResponse.json({ error: "Arquivo não enviado" }, { status: 400 });
    }

    if (!apiKey) {
      console.error("ERRO: GEMINI_API_KEY ausente na Render.");
      return NextResponse.json({ error: "Configuração de API ausente" }, { status: 500 });
    }

    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

    // Converter Blob para Buffer para o Gemini
    const arrayBuffer = await file.arrayBuffer();
    const base64Data = Buffer.from(arrayBuffer).toString('base64');

    console.log(`🚀 Analisando biomecânica: ${exerciseName} para nível ${userLevel}`);

    const result = await model.generateContent([
      `Você é um Coach de musculação. Analise este vídeo de execução do exercício ${exerciseName}. 
       O aluno é nível ${userLevel}. Dê um feedback curto, motivador e focado em 1 ponto de melhoria biomecânica.`,
      {
        inlineData: {
          data: base64Data,
          mimeType: file.type || "video/mp4",
        },
      },
    ]);

    const response = await result.response;
    const text = response.text();

    return NextResponse.json({ feedback: text });

  } catch (error: any) {
    console.error("❌ ERRO NO BACKEND:", error.message || error);
    return NextResponse.json({ 
      error: "Erro na análise da IA", 
      details: error.message 
    }, { status: 500 });
  }
}

export const dynamic = 'force-dynamic';