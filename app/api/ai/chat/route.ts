import { NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';

// Usa a MESMA chave que funcionou no scanner
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

export const dynamic = 'force-dynamic';

export async function POST(req) {
  try {
    const body = await req.json();
    const { message, userName, userGender, userGoal, userLevel } = body;

    const systemPrompt = `
      ATUAR COMO: "PA Coach AI", personal trainer do app Fit OS.
      ALUNO: ${userName || 'Atleta'} (${userGender || 'Neutro'}), Nível ${userLevel || 'Iniciante'}, Objetivo: ${userGoal || 'Geral'}.
      
      REGRAS:
      1. Seja motivador, breve e use gírias de academia ("monstro", "foco", "pra cima").
      2. Nunca prescreva esteroides/anabolizantes.
      3. Respostas curtas (max 3 frases) e diretas.
    `;

    // 🔥 AQUI ESTÁ A CORREÇÃO: Usando o Gemini 2.0 Flash Experimental
    // Se o scanner rodou com 2.0, esse aqui vai voar!
    const model = genAI.getGenerativeModel({ 
        model: "gemini-2.0-flash", 
        systemInstruction: systemPrompt
    });

    const result = await model.generateContent(message);
    const response = await result.response;
    const text = response.text();

    return NextResponse.json({ reply: text });

  } catch (error) {
    console.error("Erro IA (Tentando fallback):", error.message);
    
    // FALLBACK DE SEGURANÇA
    // Se por acaso o 2.0 falhar (instabilidade), tenta o 1.5 Flash como reserva
    try {
        const modelBackup = genAI.getGenerativeModel({ 
            model: "gemini-1.5-flash",
            systemInstruction: systemPrompt
        });
        const resultBackup = await modelBackup.generateContent(message);
        const responseBackup = await resultBackup.response;
        return NextResponse.json({ reply: responseBackup.text() });
    } catch (finalError) {
        return NextResponse.json(
            { reply: "O servidor tá em manutenção no supino agora. Tenta já já! (Erro de Modelo)" }, 
            { status: 500 }
        );
    }
  }
}