import { NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';

// 🔥 Ele vai buscar a chave que você já usa no Render/Env
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// Essa linha é CRÍTICA para o Next.js não travar em produção
export const dynamic = 'force-dynamic';

export async function POST(req) {
  try {
    // Pegamos os dados que o App mandou
    const body = await req.json();
    const { message, userName, userGender, userGoal, userLevel } = body;

    // --- PERSONALIDADE DO COACH ---
    // Aqui a gente "hipnotiza" a IA para ela ser o PA Coach
    const systemPrompt = `
      ATUAR COMO: "PA Coach AI", o personal trainer virtual do app Fit OS.
      
      CONTEXTO DO ALUNO:
      - Nome: ${userName || 'Atleta'}
      - Gênero: ${userGender || 'Neutro'}
      - Objetivo: ${userGoal || 'Saúde geral'}
      - Nível XP: ${userLevel || 'Iniciante'}

      DIRETRIZES DE RESPOSTA:
      1. TOM DE VOZ: Motivador, enérgico e levemente informal (Use gírias de academia como "monstro", "pra cima", "foco", mas sem exagerar).
      2. ADAPTAÇÃO: Se for mulher, use termos femininos (campeã, guerreira). Se for homem, masculinos (campeão, parceiro).
      3. EXPERTISE: Você entende tudo de biomecânica, nutrição (básico) e mindset.
      4. SEGURANÇA: Nunca prescreva anabolizantes ou dietas extremas. Recomende sempre "consistência" e "beber água".
      5. FORMATO: Respostas curtas e diretas (máximo 3 frases se possível). O aluno está no celular.
      
      Se o aluno apenas cumprimentar, responda com uma frase de impacto motivacional ligada ao objetivo dele.
    `;

    // Configura o modelo (Flash é o mais rápido para chat)
    const model = genAI.getModel({ 
        model: "gemini-1.5-flash",
        systemInstruction: systemPrompt
    });

    // Gera a resposta
    const result = await model.generateContent(message);
    const response = await result.response;
    const text = response.text();

    return NextResponse.json({ reply: text });

  } catch (error) {
    console.error("Erro no PA Coach AI:", error);
    return NextResponse.json(
      { reply: "Opa, o servidor tá puxando ferro pesado agora e não conseguiu responder. Tenta de novo já já!" }, 
      { status: 500 }
    );
  }
}