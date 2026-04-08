// app/api/ai/evaluate-checkin/route.ts
import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { GoogleGenerativeAI } from "@google/generative-ai";

const prisma = new PrismaClient();

export async function POST(req: Request) {
  try {
    // 1. Recebe o ID atual e o ID antigo (se for comparação do painel)
    const { checkInId, oldCheckInId } = await req.json();

    if (!checkInId) return NextResponse.json({ error: "ID indefinido" }, { status: 400 });

    // 2. Busca Check-in Atual + Usuário + A ÚLTIMA ANAMNESE COMPLETA
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

    // 3. Busca o Check-in Antigo (se você clicou no botão "Comparar")
    let oldCheckIn = null;
    if (oldCheckInId) {
        oldCheckIn = await prisma.checkIn.findUnique({ where: { id: oldCheckInId } });
    }

    const user = checkIn.user;
    const anamnese = user.anamneses[0]; 
    
    // Identificação dos Planos e Momentos
    const isChallenge = user.plan === 'CHALLENGE_21';
    const isFichas = user.plan === 'FICHA_8S' || user.plan === 'FICHAS'; 
    const isBasico = user.plan === 'PERFORMANCE' || user.plan === 'standard' || user.plan === 'LOW_COST';
    const isPremium = !isChallenge && !isFichas && !isBasico && anamnese; 

    // Identifica se é o PONTO DE PARTIDA (Avaliação Inicial)
    const isFirstCheckIn = !oldCheckIn;

    // Lógica do Funil: Identifica se é o Check-in FINAL (Momento do Upsell)
    const checkInCount = await prisma.checkIn.count({ where: { userId: user.id } });
    const isFinalCheckIn = (isChallenge && checkInCount >= 2) || (isFichas && checkInCount >= 2);

    // 4. Coleta TODAS as fotos
    const allPhotoUrls = [
        checkIn.photoFront, 
        checkIn.photoSide, 
        checkIn.photoBack, 
        ...(checkIn.extraPhotos || [])
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

    // 5. Montagem do Contexto Adicional (Premium)
    let contextoAdicional = "";
    if (isPremium && anamnese) {
        contextoAdicional = `
        DADOS DA ANAMNESE COMPLETA (ALUNO PREMIUM):
        - Frequência: ${anamnese.frequencia}x por semana.
        - Tempo por treino: ${anamnese.tempoDisponivel}min.
        - Limitações/Dores: ${anamnese.limitacoes?.join(', ') || 'Nenhuma'}.
        - Cirurgias: ${anamnese.cirurgias?.join(', ') || 'Nenhuma'}.
        - Equipamentos: ${anamnese.equipamentos?.join(', ') || 'Academia completa'}.
        `;
    }

    // 6. Configuração do Gemini (Tempo de execução)
    const apiKey = process.env.GOOGLE_AI_KEY || process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error("Chave da API não encontrada.");
    
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

    // 🔥 LOGICA DE PROMPT REFORMULADA 🔥
    const prompt = `
      Você é o Coach Paulo Adriano, campeão de fisiculturismo natural e treinador de elite. 
      Analise as fotos do aluno ${user.name} e gere um feedback matador.

      ${isFirstCheckIn ? `
      🚨 CONTEXTO CRUCIAL: ESTE É O PONTO DE PARTIDA (DIA 01). 🚨
      DIRETRIZES PARA ESTE FEEDBACK:
      1. NÃO FALE EM EVOLUÇÃO, MELHORA OU "RESPOSTA AO PLANO". O aluno ainda não começou!
      2. Faça um RAIO-X do shape HOJE: Comente sobre BF (gordura), pontos de maior acúmulo e tônus muscular atual.
      3. Seja o Coach que traça o mapa: Diga o que vamos atacar primeiro (ex: "vamos focar em limpar essa base e melhorar a linha de cintura").
      4. O tom é de início de jornada, motivador mas puramente analítico do estado inicial.` 
      : `
      🚨 CONTEXTO: ISTO É UM COMPARATIVO DE EVOLUÇÃO (ANTES X DEPOIS). 🚨
      DIRETRIZES PARA ESTE FEEDBACK:
      1. COMPARE as fotos atuais com as de ${new Date(oldCheckIn?.date || "").toLocaleDateString('pt-BR')}.
      2. APONTE GANHOS REAIS: Melhoria na linha de cintura, cortes aparecendo, maturidade muscular ou queda no peso (${oldCheckIn?.weight}kg -> ${checkIn.weight}kg).
      3. Parabenize pelos avanços específicos que você está vendo visualmente.`}

      PERFIL DO ALUNO:
      - Plano: ${user.plan}
      - Objetivo: ${user.goal || anamnese?.objetivo || "Melhorar estética"}
      - Peso Atual: ${checkIn.weight ? checkIn.weight + 'kg' : 'Não informado'}
      ${contextoAdicional}
      - Feedback do Aluno: "${checkIn.feedback || "Sem comentários"}"

      REGRAS GERAIS:
      - Voz: Técnico, direto e motivador. Use termos de fisiculturismo (densidade, corte, pele colando).
      - UPSELL: ${isFinalCheckIn ? "O aluno finalizou o ciclo. No final, parabenize pela vitória e faça a oferta de migração para a Consultoria Premium (Acompanhamento 1:1) com desconto especial." : "Apenas reconheça o momento e dê o comando para o treino."}

      Escreva um texto pronto para o WhatsApp. Parágrafos curtos. Use 🔥, 👊, 🏆, 🚀.
    `;

    const result = await model.generateContent([prompt, ...imageParts]);
    const text = result.response.text();

    return NextResponse.json({ 
        analysis: text,
        isFinal: isFinalCheckIn 
    });

  } catch (error) {
    console.error("Erro na análise IA:", error);
    return NextResponse.json({ error: "Erro no motor" }, { status: 500 });
  }
}