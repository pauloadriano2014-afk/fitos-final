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

    // Lógica do Funil: Identifica se é o Check-in FINAL (Momento do Upsell / Dia 56)
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

    // 🔥 LOGICA DE PROMPT REFORMULADA (DIDÁTICA 360º + TRAVA DE UPSELL) 🔥
    const prompt = `
      Você é o Coach Paulo Adriano, campeão de fisiculturismo natural e treinador de elite. 
      Analise as fotos do aluno ${user.name} com um olhar técnico, detalhista e didático.

      ESTRUTURA OBRIGATÓRIA DA ANÁLISE TÉCNICA:
      1. FRENTE: Explique como está a linha de cintura, a simetria entre os lados e o tônus do abdômen/quadríceps.
      2. LADO: Detalhe a profundidade do shape, a separação entre ombro e braço, e o encaixe da postura.
      3. COSTAS: Avalie a largura e densidade do dorsal e a maturidade muscular da região lombar/posterior.

      DIRETRIZES DE CONTEXTO:
      ${isFirstCheckIn ? `
      🚨 ESTE É O PONTO DE PARTIDA (DIA 01). 🚨
      - NÃO fale em evolução ou "melhora". O aluno está começando hoje.
      - Faça um Raio-X realista do shape cru.
      - Use uma didática de mestre para explicar quais pontos vamos atacar primeiro para construir a base.` 
      : `
      🚨 ISTO É UM COMPARATIVO DE EVOLUÇÃO. 🚨
      - Compare as fotos atuais com as fotos anteriores de forma minuciosa.
      - Aponte onde a pele "colou", onde o músculo ganhou maturidade e a evolução da densidade.`}

      REGRAS DE UPSELL E RECOMPENSA:
      ${isFinalCheckIn ? `
      ⚠️ MOMENTO CRUCIAL: O aluno finalizou o ciclo do plano ${user.plan}.
      - Parabenize efusivamente pela disciplina de chegar ao fim.
      - Explique que para não estagnar agora, ele precisa de ajustes finos e individuais que só a Consultoria Premium oferece.
      - Ofereça a migração para a CONSULTORIA PREMIUM (Acompanhamento 1:1) com um DESCONTO ESPECIAL de encerramento.
      - Peça para ele responder "PREMIUM" aqui no WhatsApp para resgatar.` 
      : `
      ⚠️ NÃO faça ofertas de venda ou descontos agora. Foque 100% na evolução técnica e didática do shape.`}

      DADOS DO PERFIL:
      - Objetivo: ${user.goal || anamnese?.objetivo || "Estética Geral"}
      - Peso: ${checkIn.weight ? checkIn.weight + 'kg' : 'Não informado'} ${oldCheckIn ? `(Anterior: ${oldCheckIn.weight}kg)` : ''}
      ${contextoAdicional}
      - Feedback do Aluno: "${checkIn.feedback || "Sem comentários"}"

      Voz: Técnico, direto, didático e motivador. Texto pronto para WhatsApp. Parágrafos curtos. Use 🔥, 👊, 🏆, 🚀.
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