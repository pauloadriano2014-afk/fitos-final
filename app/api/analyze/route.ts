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

    // GEMINI 2.0 FLASH - MANTENDO O MOTOR DO FUTURO
    const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash-exp" });

    const arrayBuffer = await file.arrayBuffer();
    const base64Data = Buffer.from(arrayBuffer).toString('base64');

    // PROMPT REFINADO: Agora ele espera que o aluno esteja no ângulo correto
    const prompt = `Você é um Especialista em Biomecânica de Musculação. 
    Analise o exercício: ${exercise}.
    Nível do Aluno: ${level}.

    REGRAS DE ANÁLISE:
    1. VALIDAÇÃO: Se o vídeo não mostrar o exercício ${exercise}, diga: "Este exercício não parece ser ${exercise}. Verifique o movimento."
    2. FOCO BIOMECÂNICO:
       - Se Iniciante: Foque em segurança (coluna, base dos pés, pegada).
       - Se Intermediário: Foque em controle (cadência da descida, balanço excessivo).
       - Se Avançado: Foque em detalhes técnicos (amplitude máxima, torque, estabilização escapular).
    3. RIGOR: Seja direto, técnico e firme. Sem elogios ou frases motivacionais.
    4. LIMITE: Máximo 35 palavras.`;

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