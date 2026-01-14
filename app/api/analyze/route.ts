import { NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');

export async function POST(req: Request) {
  try {
    const formData = await req.formData();
    const file = formData.get('video') as Blob;
    const exercise = formData.get('exerciseName') || 'Exercício';
    const level = formData.get('userLevel') || 'Iniciante';

    if (!file) return NextResponse.json({ error: "Vídeo não recebido" }, { status: 400 });

    // GEMINI 2.0 FLASH - O MODELO QUE DEU CERTO!
    const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash-exp" });

    const arrayBuffer = await file.arrayBuffer();
    const base64Data = Buffer.from(arrayBuffer).toString('base64');

    const prompt = `Você é um Personal Trainer de elite. Analise a biomecânica deste vídeo de ${exercise}. 
    O aluno é nível ${level}. 
    IMPORTANTE: Se o vídeo estiver escuro, cortado ou não mostrar o corpo todo, peça para gravar novamente.
    Se estiver visível, dê 2 dicas técnicas específicas sobre ângulo, cadência ou postura. 
    Seja direto e motivador. Máximo 40 palavras.`;

    const result = await model.generateContent([
      { inlineData: { data: base64Data, mimeType: "video/mp4" } },
      prompt,
    ]);

    const response = await result.response;
    return NextResponse.json({ feedback: response.text() });

  } catch (error: any) {
    console.error("❌ ERRO NA RENDER:", error.message);
    return NextResponse.json({ error: "Erro na IA", details: error.message }, { status: 500 });
  }
}

export const dynamic = 'force-dynamic';