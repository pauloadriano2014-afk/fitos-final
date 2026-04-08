// app/api/ai/evaluate-checkin/route.ts
import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { GoogleGenerativeAI } from "@google/generative-ai";

const prisma = new PrismaClient();
const genAI = new GoogleGenerativeAI(process.env.GOOGLE_AI_KEY as string);

export async function POST(req: Request) {
  try {
    const { checkInId } = await req.json();

    if (!checkInId) {
        return NextResponse.json({ error: "Check-in ID não fornecido" }, { status: 400 });
    }

    // 1. Busca os dados do Check-in e o perfil do Aluno (incluindo o PLANO)
    const checkIn = await prisma.checkIn.findUnique({
      where: { id: checkInId },
      include: { 
        user: { 
          select: { 
            name: true, 
            goal: true, 
            level: true, 
            plan: true // 🔥 Essencial para a lógica de diferenciação
          } 
        } 
      }
    });

    if (!checkIn) return NextResponse.json({ error: "Check-in não encontrado" }, { status: 404 });

    // 2. Lógica de Diferenciação de Planos (Desafio 21D vs Outros)
    const isChallenge = checkIn.user.plan === 'CHALLENGE_21';
    
    // Para o desafio, ignoramos o que está no banco e forçamos o contexto de emagrecimento
    const displayGoal = isChallenge ? "Emagrecimento Acelerado (Protocolo Geral de 21 Dias)" : (checkIn.user.goal || "Não definido");
    const displayLevel = isChallenge ? "Geral (Participante do Desafio)" : (checkIn.user.level || "Não definido");

    // 3. Prepara as imagens para o Gemini (URLs do R2 -> Base64)
    const imageUrls = [checkIn.photoFront, checkIn.photoSide, checkIn.photoBack].filter(Boolean) as string[];
    
    const imageParts = await Promise.all(imageUrls.map(async (url) => {
        const response = await fetch(url);
        const buffer = await response.arrayBuffer();
        return {
            inlineData: {
                data: Buffer.from(buffer).toString("base64"),
                mimeType: "image/jpeg"
            }
        };
    }));

    // 4. Configuração do Modelo e Prompt com a Voz do Paulo Adriano
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

    const prompt = `
      Você é o Coach Paulo Adriano, treinador de elite e campeão de fisiculturismo natural. 
      Sua missão é analisar as fotos de check-in do seu aluno e escrever um feedback técnico, motivador e direto ao ponto.

      DADOS DO CONTEXTO:
      - Aluno: ${checkIn.user.name}
      - Plano: ${checkIn.user.plan} ${isChallenge ? "🔥 (FOCO TOTAL EM DERRETER GORDURA)" : ""}
      - Objetivo: ${displayGoal}
      - Nível: ${displayLevel}
      - Peso Atual: ${checkIn.weight}kg
      - Feedback do Aluno: "${checkIn.feedback || "Sem comentários"}"

      DIRETRIZES PARA O SEU FEEDBACK:
      1. TONE DE VOZ: Use a linguagem "Maromba Técnico". Termos como: densidade, linha de cintura, volume, retenção hídrica, pele colando, encaixe. Seja um mentor que cobra mas encoraja.
      2. ANÁLISE VISUAL: Procure nas fotos sinais de melhora. ${isChallenge ? "No Desafio 21D, foque na diminuição da linha de cintura e na urgência de manter o protocolo 100%." : "No plano de treinos, foque na evolução da musculatura e constância."}
      3. RESPOSTA AO ALUNO: Se o aluno disse que falhou, dê um puxão de orelha técnico (ex: explicando o impacto do sódio/lixo na foto). Se ele foi bem, reforce o comando.
      4. AÇÃO: Finalize com uma frase de comando (Ex: "Pra cima!", "Foco na missão!", "O jogo é nosso!").

      IMPORTANTE: Escreva o texto pronto para ser enviado por WhatsApp. Parágrafos curtos, sem negritos exagerados e sem emojis infantis. Use a voz de um campeão.
    `;

    // 5. Gera a análise
    const result = await model.generateContent([prompt, ...imageParts]);
    const response = await result.response;
    const text = response.text();

    return NextResponse.json({ analysis: text });

  } catch (error) {
    console.error("Erro na análise IA:", error);
    return NextResponse.json({ error: "Falha ao gerar análise automática" }, { status: 500 });
  }
}