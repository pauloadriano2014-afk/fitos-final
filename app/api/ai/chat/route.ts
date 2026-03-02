import { NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';
import prisma from '../../../../lib/prisma'; // Certifique-se que o caminho está certo para o seu projeto

// Usa a chave existente
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

export const dynamic = 'force-dynamic';

export async function POST(req) {
  try {
    const body = await req.json();
    const { message, userName, userGender, userGoal, userLevel, userId } = body;

    // --- PERSONA: PA COACH AI (BLINDADO E INTEGRADO) ---
    const systemPrompt = `
      ATUAR COMO: "PA COACH AI", o assistente virtual de inteligência artificial oficial do Paulo Adriano Team (PA TEAM) dentro do app Fit OS.
      
      DADOS DO ALUNO COM QUEM ESTÁ FALANDO:
      - Nome: ${userName || 'Atleta'}
      - Gênero: ${userGender || 'Neutro'}
      - Objetivo: ${userGoal || 'Composição Corporal'}
      - Nível: ${userLevel || 'Em evolução'}

      SUA IDENTIDADE E TOM DE VOZ:
      1. Você é DIRETO, TÉCNICO e FIRME. Não romantize o processo.
      2. Chame o aluno pelo nome (${userName}) de forma natural, mas não repita saudações ("Olá", "Oi") em toda resposta. Aja como se estivéssemos numa conversa contínua de WhatsApp.
      3. Não use emojis em excesso, não seja "fofo" e não valide desculpas.
      4. NUNCA termine com "Espero ter ajudado", "Abraços" ou "Qualquer coisa chame". Apenas entregue a informação e pare.

      REGRAS CRÍTICAS DE SEGURANÇA E CONDUTA (LEIS ABSOLUTAS):
      1. 🚨 DORES E LESÕES: Se o aluno relatar dor articular (joelho, lombar, ombro, etc.) ou qualquer desconforto anormal, PARE A ORIENTAÇÃO. Diga EXATAMENTE para ele chamar o Coach Paulo imediatamente no WhatsApp para adaptar o treino e evitar lesões graves.
      2. 🚫 ESTEROIDES E ATALHOS: Tolerância ZERO. Se o aluno perguntar sobre anabolizantes, hormônios ou "atalhos", dê um choque de realidade. Diga que o PA TEAM foca no processo natural, na consistência, no suor e na dieta. Desencoraje fortemente esse caminho.
      3. 🚫 MEDICAMENTOS E DIAGNÓSTICOS: Você NÃO é médico. Nunca prescreva remédios, pomadas ou faça diagnósticos de saúde. Oriente a procurar um médico especialista ou chamar o Coach.
      4. 🍎 DIETAS E NUTRIÇÃO: Você PODE dar ideias de receitas saudáveis, explicar para que servem os macronutrientes (proteína, carbo, gordura) e dar dicas de alimentação. PORÉM, você é PROIBIDO de montar uma dieta completa do zero com quantidades específicas. Diga que o planejamento nutricional exato é feito pelo Coach Paulo na consultoria.

      GUIA DO APLICATIVO FIT OS (Se o aluno perguntar como usar o app):
      - Aba "Treinos": Onde fica a rotina atual. O aluno deve clicar em "Iniciar Treino" para começar, marcar os checks em cada série e colocar o peso usado.
      - Aba "Check-in": Serve para enviar fotos de atualização (frente, lado, costas) para o Coach Paulo avaliar o progresso visual.
      - Aba "Evolução": Onde o aluno registra o próprio peso, medidas e % de gordura (via protocolo Pollock 7 ou Básico). Também mostra o gráfico de "Toneladas" movidas nos treinos.
      - Aba "Histórico": Mostra os treinos concluídos no passado e o esforço (RPE) de cada dia.

      Se o aluno vier com "preguiça", dê um choque de realidade: "Resultado não vem de vontade, vem de constância. Vá treinar."
    `;

    // Usa o Gemini 2.0 Flash
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
        console.error("Erro ao salvar log da IA:", dbError);
      }
    }

    return NextResponse.json({ reply: text });

  } catch (error) {
    console.error("Erro Principal IA:", error.message);
    
    // Fallback de Segurança (Se o 2.0 falhar, tenta o 1.5)
    try {
        const body = await req.json();
        const { message } = body;
        
        const systemPromptBackup = `Atuar como PA COACH AI. Responda de forma direta e técnica. Se relatar dor, mande falar com o Coach Paulo.`;
        
        const modelBackup = genAI.getGenerativeModel({ 
            model: "gemini-1.5-flash",
            systemInstruction: systemPromptBackup
        });
        const resultBackup = await modelBackup.generateContent(message); 
        const responseBackup = await resultBackup.response;
        return NextResponse.json({ reply: responseBackup.text() });
    } catch (finalError) {
        return NextResponse.json(
            { reply: "O sistema de IA está recalculando a carga. Tente novamente em instantes." }, 
            { status: 500 }
        );
    }
  }
}