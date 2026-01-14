export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { GoogleGenerativeAI } from "@google/generative-ai";

export const maxDuration = 60;

export async function POST(req: Request) {
  try {
    const apiKey = process.env.GOOGLE_GEMINI_KEY;
    if (!apiKey) return NextResponse.json({ error: "API Key ausente" }, { status: 500 });

    const genAI = new GoogleGenerativeAI(apiKey);
    // Usando o Flash que é mais rápido e barato
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

    const formData = await req.formData();
    const videoFile = formData.get('video') as File;
    const exerciseName = formData.get('exerciseName') || "Exercício";
    const userLevel = formData.get('userLevel') || "Iniciante";

    if (!videoFile) return NextResponse.json({ error: "Vídeo não recebido" }, { status: 400 });

    const bytes = await videoFile.arrayBuffer();
    const base64Video = Buffer.from(bytes).toString('base64');

    const prompt = `Você é o Coach FIT OS. Analise o vídeo de ${exerciseName} para um aluno ${userLevel}. Seja didático e direto. Máximo 25 palavras.`;

    // No método oficial, o envio de vídeo é feito assim:
    const result = await model.generateContent([
      prompt,
      {
        inlineData: {
          mimeType: "video/mp4",
          data: base64Video
        }
      }
    ]);

    const response = await result.response;
    const text = response.text();

    if (text) {
      return NextResponse.json({ feedback: text });
    }

    return NextResponse.json({ error: "IA não retornou texto." }, { status: 500 });

  } catch (error: any) {
    console.error("❌ ERRO NO SERVIDOR:", error.message);
    // Se o erro for de região (403), nós saberemos agora
    return NextResponse.json({ error: `Erro na IA: ${error.message}` }, { status: 500 });
  }
}