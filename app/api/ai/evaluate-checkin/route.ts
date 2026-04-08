// app/api/ai/evaluate-checkin/route.ts
import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { GoogleGenerativeAI } from "@google/generative-ai";

const prisma = new PrismaClient();

export async function POST(req: Request) {
  try {
    const { checkInId, oldCheckInId } = await req.json();

    if (!checkInId) return NextResponse.json({ error: "ID indefinido" }, { status: 400 });

    const checkIn = await prisma.checkIn.findUnique({
      where: { id: checkInId },
      include: { 
        user: { 
          include: { 
            anamneses: { orderBy: { createdAt: 'desc' }, take: 1 } 
          } 
        } 
      }
    });

    if (!checkIn) return NextResponse.json({ error: "Check-in não encontrado" }, { status: 404 });

    let oldCheckIn = null;
    if (oldCheckInId) {
        oldCheckIn = await prisma.checkIn.findUnique({ where: { id: oldCheckInId } });
    }

    const user = checkIn.user;
    const anamnese = user.anamneses[0]; 
    
    // Identificação de Planos e Hierarquia de Análise
    const isChallenge = user.plan === 'CHALLENGE_21';
    const isFichas = user.plan === 'FICHA_8S' || user.plan === 'FICHAS'; 
    const isBasico = user.plan === 'PERFORMANCE' || user.plan === 'standard' || user.plan === 'LOW_COST';
    const isPremium = !isChallenge && !isFichas && !isBasico && anamnese; 

    const isFirstCheckIn = !oldCheckIn;
    const checkInCount = await prisma.checkIn.count({ where: { userId: user.id } });
    
    // Upsell só no final do ciclo (Dia 56 para Fichas ou Check-in 2 do Desafio)
    const isFinalCheckIn = !isFirstCheckIn && ((isChallenge && checkInCount >= 2) || (isFichas && checkInCount >= 2));

    const allPhotoUrls = [
        checkIn.photoFront, checkIn.photoSide, checkIn.photoBack, ...(checkIn.extraPhotos || [])
    ];
    if (oldCheckIn) {
        allPhotoUrls.push(oldCheckIn.photoFront, oldCheckIn.photoSide, oldCheckIn.photoBack);
    }

    const validUrls = allPhotoUrls.filter(Boolean) as string[];
    const imageParts = await Promise.all(validUrls.map(async (url) => {
        const response = await fetch(url);
        const buffer = await response.arrayBuffer();
        return { inlineData: { data: Buffer.from(buffer).toString("base64"), mimeType: "image/jpeg" } };
    }));

    // Regras de Ouro por Categoria de Plano
    let regraPlano = "";
    if (isPremium) {
        regraPlano = `
        ALUNO ELITE PREMIUM: Seja extremamente técnico e detalhista. 
        Mencione as limitações: ${anamnese?.limitacoes?.join(', ') || 'Nenhuma'}. 
        Fale de maturação muscular, linha de cintura e encaixe de poses.`;
    } else if (isChallenge) {
        regraPlano = `
        DESAFIO 21 DIAS: Foco total em queima, disciplina e agressividade metabólica. 
        Analise a perda de retenção hídrica e a velocidade da mudança.`;
    } else if (isFichas) {
        regraPlano = `
        ALUNO DE FICHAS: Foco em constância, densidade muscular e evolução progressiva do peso.`;
    } else {
        regraPlano = `
        PLANO BÁSICO: Foco em resultados visíveis e alinhamento do peso com o objetivo.`;
    }

    const apiKey = process.env.GOOGLE_AI_KEY || process.env.GEMINI_API_KEY;
    const genAI = new GoogleGenerativeAI(apiKey as string);
    const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

    const prompt = `
      Você é o Coach Paulo Adriano, campeão de fisiculturismo natural. 
      Analise as fotos do aluno ${user.name} (Plano: ${user.plan}).

      ${regraPlano}

      ESTRUTURA TÉCNICA OBRIGATÓRIA (SEJA DIDÁTICO):
      1. FRENTE: Analise linha de cintura, infra-abdominal, simetria e tônus dos quadríceps.
      2. LADO: Analise a profundidade do tronco, separação entre ombro/braço e posterior de coxa.
      3. COSTAS: Analise a largura e densidade do dorsal, maturidade da região lombar e cortes do glúteo/isquios.

      MOMENTO DA ANÁLISE:
      ${isFirstCheckIn ? 
        `🚨 PONTO DE PARTIDA (DIA 01). 
         PROIBIDO: Falar em evolução ou dizer "está respondendo bem".
         MISSÃO: Raio-X do shape cru HOJE. Diga o que falta (BF alto, falta de densidade, etc) e trace o mapa de guerra inicial.` : 
        `🚨 COMPARATIVO DE EVOLUÇÃO.
         MISSÃO: Compare visualmente com ${new Date(oldCheckIn?.date || "").toLocaleDateString('pt-BR')}.
         DETALHE: Onde a pele colou? Onde o músculo maturou? Se o peso subiu (${oldCheckIn?.weight}kg -> ${checkIn.weight}kg), avalie se foi massa magra ou retenção.`}

      LÓGICA DE UPSELL:
      ${isFinalCheckIn ? 
        `⚠️ FINAL DE PROTOCOLO.
         - Parabenize pela vitória e disciplina no plano ${user.plan}.
         - Ofereça a migração para a CONSULTORIA PREMIUM (Acompanhamento 1:1) para lapidação individual.
         - Ofereça um DESCONTO ESPECIAL por tempo limitado. Peça para responder "PREMIUM".` : 
        `⚠️ PROIBIDO: Oferecer descontos ou vender Premium agora. Foque na técnica do treino.`}

      Voz: Direta, técnica de fisiculturista, motivadora. Texto pronto para WhatsApp. Parágrafos curtos.
    `;

    const result = await model.generateContent([prompt, ...imageParts]);
    return NextResponse.json({ analysis: result.response.text(), isFinal: isFinalCheckIn });

  } catch (error) {
    console.error("Erro Motor:", error);
    return NextResponse.json({ error: "Erro no motor" }, { status: 500 });
  }
}