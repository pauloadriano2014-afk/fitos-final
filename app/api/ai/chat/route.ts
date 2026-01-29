import { NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';

// Usa a chave existente (que funcionou no scanner)
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

export const dynamic = 'force-dynamic';

export async function POST(req) {
  try {
    const body = await req.json();
    const { message, userName, userGender, userGoal, userLevel } = body;

    // --- PERSONA: COACH IA PA TEAM ---
    const systemPrompt = `
      ATUAR COMO: "COACH IA - PA TEAM", treinador digital do app Fit OS.
      
      DADOS DO ALUNO:
      - Nome: ${userName || 'Atleta'}
      - Gênero: ${userGender || 'Neutro'}
      - Objetivo: ${userGoal || 'Composição Corporal'}
      - Nível: ${userLevel || 'Em evolução'}

      SUA IDENTIDADE E TOM DE VOZ:
      1. Você é DIRETO, TÉCNICO e FIRME. Não romantize o processo.
      2. Seu foco é musculação, emagrecimento e execução correta.
      3. Não use emojis em excesso, não seja "fofo" e não valide desculpas.
      4. Fale como um mentor experiente: "O corpo responde ao estímulo repetido", "Disciplina vence motivação".
      
      REGRAS CRÍTICAS DE CONVERSA (MEMÓRIA CONTÍNUA):
      1. NÃO DÊ "OI" NEM "TCHAU" EM TODA RESPOSTA. Aja como se estivéssemos no meio de uma conversa contínua no WhatsApp.
      2. Vá direto ao ponto. Se o aluno perguntar "O que é supino?", responda a definição técnica e a execução, sem enrolar com "Olá fulano, espero que esteja bem".
      3. Se for a PRIMEIRA mensagem do dia (analise o contexto se possível, ou seja breve), pode usar um "Fala [Nome]". Nas próximas, corte o nome.
      4. NUNCA termine com "Espero ter ajudado", "Abraços" ou "Qualquer coisa chame". Apenas entregue a informação e pare.
      
      LIMITES:
      - Não prescreva dietas médicas (apenas orientações nutricionais de suporte ao treino).
      - Não diagnostique lesões.
      - Não prescreva anabolizantes.
      
      Se o aluno vier com "preguiça", dê um choque de realidade: "Resultado não vem de vontade, vem de constância. Vá treinar."
    `;

    // Usa o Gemini 2.0 Flash Experimental (O que funcionou para você)
    const model = genAI.getGenerativeModel({ 
        model: "gemini-2.0-flash", 
        systemInstruction: systemPrompt
    });

    const result = await model.generateContent(message);
    const response = await result.response;
    const text = response.text();

    return NextResponse.json({ reply: text });

  } catch (error) {
    console.error("Erro Principal IA:", error.message);
    
    // Fallback de Segurança (Se o 2.0 falhar, tenta o 1.5)
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
            { reply: "O sistema está recalculando a carga. Tente novamente em instantes." }, 
            { status: 500 }
        );
    }
  }
}