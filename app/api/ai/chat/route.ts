import { NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';
import prisma from '../../../../lib/prisma'; // Certifique-se que o caminho está certo para o seu projeto

// Usa a chave existente
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

export const dynamic = 'force-dynamic';

export async function POST(req) {
  try {
    const body = await req.json();
    // Adicionamos userId aqui para saber quem perguntou
    const { message, userName, userGender, userGoal, userLevel, userId } = body;

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

    // Usa o Gemini 2.0 Flash (Versão que funcionou para você)
    const model = genAI.getGenerativeModel({ 
        model: "gemini-2.0-flash", 
        systemInstruction: systemPrompt
    });

    const result = await model.generateContent(message);
    const response = await result.response;
    const text = response.text();

    // --- SALVAR NO BANCO DE DADOS (Espionagem do Bem 🕵️‍♂️) ---
    if (userId) {
      try {
        await prisma.aiLog.create({
          data: {
            userId: userId,
            question: message,
            answer: text
          }
        });
      } catch (dbError) {
        // Se der erro ao salvar, apenas loga no console, mas NÃO trava a resposta pro aluno
        console.error("Erro ao salvar log da IA:", dbError);
      }
    }

    return NextResponse.json({ reply: text });

  } catch (error) {
    console.error("Erro Principal IA:", error.message);
    
    // Fallback de Segurança (Se o 2.0 falhar, tenta o 1.5)
    // Precisamos redefinir o systemPrompt aqui ou torná-lo acessível, 
    // mas para simplificar, em caso de erro fatal, retornamos mensagem de erro amigável
    // ou tentamos o backup simples.
    
    try {
        // Redefinindo brevemente para o fallback não quebrar
        const systemPromptBackup = `Atuar como Coach de Musculação PA TEAM. Seja direto e técnico.`;
        
        const modelBackup = genAI.getGenerativeModel({ 
            model: "gemini-1.5-flash",
            systemInstruction: systemPromptBackup
        });
        const resultBackup = await modelBackup.generateContent(message); // message vem do escopo acima
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