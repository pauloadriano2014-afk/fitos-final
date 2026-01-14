import { NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');

export async function POST(req: Request) {
  try {
    const formData = await req.formData();
    const file = formData.get('video') as Blob;
    const exercise = formData.get('exerciseName') || 'Exercício';

    if (!file) return NextResponse.json({ error: "Vídeo não recebido" }, { status: 400 });

    // MUDANÇA TOTAL: Usando a versão experimental estável que aceita vídeo sem erro 404
    const model = genAI.getGenerativeModel({ 
      model: "gemini-1.5-flash-latest" 
    });

    const arrayBuffer = await file.arrayBuffer();
    const base64Data = Buffer.from(arrayBuffer).toString('base64');

    console.log("🚀 Tentativa com gemini-1.5-flash-latest...");

    const result = await model.generateContent([
      {
        inlineData: {
          data: base64Data,
          mimeType: "video/mp4",
        },
      },
      `Feedback biomecânico curto para o exercício ${exercise}.`,
    ]);

    const response = await result.response;
    return NextResponse.json({ feedback: response.text() });

  } catch (error: any) {
    console.error("❌ ERRO NA RENDER:", error.message);
    
    // Se falhar o flash-latest, tentaremos um fallback automático para o pro no próximo passo, 
    // mas o flash-latest com a biblioteca atualizada deve matar o 404.
    return NextResponse.json({ 
      error: "Erro na IA", 
      details: error.message 
    }, { status: 500 });
  }
}

export const dynamic = 'force-dynamic';