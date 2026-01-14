import { NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');

export async function POST(req: Request) {
  try {
    const formData = await req.formData();
    const file = formData.get('video') as Blob;
    const exercise = formData.get('exerciseName') || 'Exercício';
    const level = formData.get('userLevel') || 'Iniciante'; // Pega o nível do mobile

    if (!file) return NextResponse.json({ error: "Vídeo não recebido" }, { status: 400 });

    const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash-exp" });

    const arrayBuffer = await file.arrayBuffer();
    const base64Data = Buffer.from(arrayBuffer).toString('base64');

    // PROMPT QUE UNE O RIGOR COM A DIDÁTICA POR NÍVEL
    const prompt = `Você é um Personal Trainer de elite. Analise o vídeo de ${exercise}.
    O aluno selecionou o nível: ${level}.

    REGRAS DE ANÁLISE:
    1. VALIDAÇÃO: Se o exercício no vídeo NÃO FOR ${exercise}, diga apenas: "Exercício incorreto. Isso não parece ser ${exercise}."
    2. DIDÁTICA POR NÍVEL:
       - Se Iniciante: Use termos simples (ex: 'Dobre mais os joelhos', 'Mantenha as costas retas'). Seja muito didático.
       - Se Intermediário: Use termos práticos e ajuste de cadência (ex: 'Controle mais a descida', 'Mantenha o core contraído').
       - Se Avançado: Use termos técnicos e biomecânicos (ex: 'Aumente a amplitude na fase excêntrica', 'Ajuste o tilt pélvico').
    3. RIGOR: Proibido elogios, parabéns ou frases motivacionais. Vá direto ao ponto técnico.
    4. LIMITE: Máximo 30 palavras.`;

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