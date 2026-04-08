// app/api/ai/evaluate-checkin/route.ts
import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { GoogleGenerativeAI } from "@google/generative-ai";

const prisma = new PrismaClient();
const genAI = new GoogleGenerativeAI(process.env.GOOGLE_AI_KEY as string);

export async function POST(req: Request) {
  try {
    const { checkInId } = await req.json();

    // 1. Busca Check-in + Usuário + A ÚLTIMA ANAMNESE COMPLETA
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

    const user = checkIn.user;
    const anamnese = user.anamneses[0]; // Pega a anamnese detalhada se existir
    
    // Identificação dos Planos
    const isChallenge = user.plan === 'CHALLENGE_21';
    const isFichas = user.plan === 'FICHAS'; // Ajuste caso a tag no banco seja diferente
    const isBasico = user.plan === 'PERFORMANCE' || user.plan === 'standard';
    const isPremium = !isChallenge && !isFichas && !isBasico && anamnese; // Premium tem a anamnese completa

    // 2. Lógica do Funil: Identifica se é o Check-in FINAL (Momento do Upsell)
    const checkInCount = await prisma.checkIn.count({ where: { userId: user.id } });
    const isFinalCheckIn = (isChallenge && checkInCount >= 2) || (isFichas && checkInCount >= 2);

    // 3. Coleta TODAS as fotos (Base + Extras)
    const allPhotoUrls = [
        checkIn.photoFront, 
        checkIn.photoSide, 
        checkIn.photoBack, 
        ...(checkIn.extraPhotos || [])
    ].filter(Boolean) as string[];
    
    const imageParts = await Promise.all(allPhotoUrls.map(async (url) => {
        const response = await fetch(url);
        const buffer = await response.arrayBuffer();
        return { inlineData: { data: Buffer.from(buffer).toString("base64"), mimeType: "image/jpeg" } };
    }));

    // 4. Montagem do Contexto Adicional (Premium)
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

    // 5. Configuração do Gemini
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

    const prompt = `
      Você é o Coach Paulo Adriano, campeão de fisiculturismo natural e treinador de elite. 
      Analise as fotos de check-in (frente, lado, costas e detalhes extras) e gere um feedback de mestre.

      PERFIL DO ALUNO:
      - Nome: ${user.name}
      - Plano Atual: ${user.plan}
      - Objetivo: ${isChallenge ? "Emagrecimento Acelerado 21 Dias" : (user.goal || anamnese?.objetivo || "Não definido")}
      - Nível: ${isChallenge ? "Desafio" : (user.level || anamnese?.nivel || "Não definido")}
      - Peso Atual: ${checkIn.weight ? checkIn.weight + 'kg' : 'Não informado'}
      - Momento: ${isFinalCheckIn ? "CHECK-IN FINAL DO PROTOCOLO (HORA DE VENDER)" : "Acompanhamento de rotina"}
      ${contextoAdicional}
      - Feedback do Aluno: "${checkIn.feedback || "Sem comentários"}"

      REGRAS DE OURO PARA O FEEDBACK:
      1. ANALISE VISUAL PROFUNDA: Olhe todas as fotos. Foque em evolução de densidade, linha de cintura e cortes musculares.
      2. VOZ DO COACH: Seja direto, técnico e motivador. Use termos como "maturação muscular", "corte", "fibra", "retenção hídrica", "encaixe", "pele colando".
      3. COMPORTAMENTO POR PLANO:
         - PREMIUM: Seja extremamente detalhista. Se mencionou dores/cirurgias, leve isso em conta.
         - BÁSICO/FICHAS: Foco em resultados, constância e alinhamento do peso.
         - DESAFIO 21 DIAS: Foco absoluto em queima de gordura e disciplina.

      4. LÓGICA DE UPSELL E RECOMPENSA (MUITO IMPORTANTE):
      ${isFinalCheckIn ? `
         - O aluno ACABOU de finalizar o protocolo do plano (${user.plan}).
         - Parabenize efusivamente pela vitória e conclusão do ciclo.
         - Faça a oferta de UPSELL: Diga que para não estagnar e buscar o próximo nível, o corpo precisa de um novo estímulo.
         ${isChallenge ? "- Sugira a migração para o Plano Básico, Fichas de 8 Semanas ou Consultoria Premium." : "- Sugira fortemente a migração para a Consultoria Premium (Acompanhamento 1:1) para lapidação individual."}
         - Termine orientando o aluno a resgatar a recompensa clicando no botão de desconto abaixo ou chamando no WhatsApp.` 
      : `
         - O aluno ainda está no meio do processo. Reconheça a evolução, aponte um ponto de melhoria técnica e dê o comando para a próxima fase. Não faça vendas neste momento.`}

      Escreva um texto pronto para copiar e colar no WhatsApp. Sem emojis infantis (use 🔥, 👊, 🏆, 🚀), papo de campeão. Parágrafos curtos.
    `;

    const result = await model.generateContent([prompt, ...imageParts]);
    const text = result.response.text();

    return NextResponse.json({ 
        analysis: text,
        isFinal: isFinalCheckIn // 🔥 Gatilho de front-end para exibir o botão de desconto
    });

  } catch (error) {
    console.error("Erro na análise IA:", error);
    return NextResponse.json({ error: "Erro no motor" }, { status: 500 });
  }
}