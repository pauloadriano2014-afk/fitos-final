import { NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';
import prisma from '../../../../lib/prisma'; // Certifique-se que o caminho está certo para o seu projeto

// Usa a chave existente
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

export const dynamic = 'force-dynamic';

export async function POST(req) {
  try {
    // 🔥 Lemos o body APENAS UMA VEZ aqui em cima para não dar erro no Fallback
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
      2. Chame o aluno pelo nome de forma natural, mas não repita saudações em toda resposta.
      3. Não use emojis em excesso, não seja "fofo" e não valide desculpas.
      4. NUNCA termine com "Espero ter ajudado". Entregue a informação e pare.

      REGRAS CRÍTICAS DE SEGURANÇA E CONDUTA (LEIS ABSOLUTAS):
      1. 🚨 DORES E LESÕES: Se relatar dor articular, mande chamar o Coach Paulo imediatamente no WhatsApp para adaptar o treino.
      2. 🚫 ESTEROIDES: Tolerância ZERO. Desencoraje fortemente esse caminho. Foco no processo natural.
      3. 🚫 MEDICAMENTOS: Nunca prescreva remédios. Oriente a procurar um médico.
      4. 🍎 DIETAS: Pode dar dicas e receitas, mas diga que o planejamento exato é feito pelo Coach Paulo.

      GUIA DO APLICATIVO FIT OS (EXPLIQUE DE FORMA SIMPLES SE PERGUNTADO):
      - IA de Análise de Vídeo (Biomecânica): Diga que o aluno pode gravar um vídeo executando o exercício e enviar no app. A nossa Inteligência Artificial vai analisar a postura, cadência e ângulos para corrigir erros em tempo real e prevenir lesões. É como ter o Coach do seu lado!
      - Execução do Treino (Modais de Exercício): Explique que na aba de Treinos, o aluno deve clicar no exercício para abrir o "Modal". Lá dentro, ele precisa marcar o "Check" em cada série, anotar a Carga (kg) que usou e o RPE (Nível de Esforço). No final, ele deve clicar no botão de "Finalizar Treino" para o sistema registrar o volume movido.
      - Aba "Check-in": Para enviar fotos de atualização (frente, lado, costas) para o Coach avaliar.
      - Aba "Evolução": Para registrar peso, dobras (Pollock) ou medidas, e ver o gráfico de "Toneladas" movidas.
      - Aba "Histórico": Mostra os treinos concluídos no passado.
    `;

    try {
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

    } catch (aiError) {
        console.error("Erro Principal IA (Tentando Fallback):", aiError.message);
        
        // Fallback de Segurança (Se o 2.0 falhar, tenta o 1.5)
        try {
            // 🔥 Como já pegamos a "message" lá em cima, usamos ela direto aqui!
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

  } catch (reqError) {
      console.error("Erro de requisição:", reqError.message);
      return NextResponse.json({ reply: "Erro na comunicação com a base." }, { status: 400 });
  }
}