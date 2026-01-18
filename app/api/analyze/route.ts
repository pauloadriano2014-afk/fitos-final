import { NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');

export async function POST(req: Request) {
  try {
    const formData = await req.formData();
    const file = formData.get('video');
    const exercise = formData.get('exerciseName') || 'Exercício';
    const level = formData.get('userLevel') || 'Iniciante';

    if (!file || !(file instanceof Blob)) {
        return NextResponse.json({ error: "Vídeo inválido ou não recebido" }, { status: 400 });
    }

    console.log(`🎥 Recebido vídeo de ${file.size} bytes para ${exercise}`);

    // GEMINI 2.0 FLASH
    const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash-exp" });

    // Conversão segura do Blob para Base64
    const arrayBuffer = await file.arrayBuffer();
    const base64Data = Buffer.from(arrayBuffer).toString('base64');

    const prompt = `Atue como um Treinador de Elite. Analise este vídeo do exercício ${exercise}.
    Nível do Aluno: ${level}.
    Seja curto e grosso (máximo 2 frases).
    1. Se a técnica estiver perigosa, ALERTE.
    2. Se estiver boa, dê uma dica de refinamento.
    3. Se não for o exercício ${exercise}, avise.`;

    const result = await model.generateContent([
      { inlineData: { data: base64Data, mimeType: "video/mp4" } },
      prompt,
    ]);

    const response = await result.response;
    const text = response.text();
    
    console.log("✅ Análise concluída:", text);
    return NextResponse.json({ feedback: text });

  } catch (error: any) {
    console.error("❌ ERRO SCANNER:", error.message);
    return NextResponse.json({ error: "Erro na análise de IA", details: error.message }, { status: 500 });
  }
}

export const dynamic = 'force-dynamic';