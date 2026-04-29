// app/api/ai/evaluate-checkin/route.ts
import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { GoogleGenerativeAI } from "@google/generative-ai";

// 🔥 AUMENTA O TEMPO LIMITE SE AS FOTOS FOREM PESADAS 🔥
export const maxDuration = 60; 

const prisma = new PrismaClient();

export async function POST(req: Request) {
  try {
    // 🔥 AGORA PUXAMOS O labUserId E O coachName (PARA IDENTIDADE DINÂMICA)
    const { checkInId, oldCheckInId, customOldPhotos, customOldWeight, isFromLab, customCurrentPhotos, contextText, labUserId, coachName } = await req.json();

    let user: any = null;
    let anamnese: any = null;
    let checkIn: any = null;
    let oldCheckIn: any = null;

    let currentWeight = null;
    let oldWeight = customOldWeight ? parseFloat(customOldWeight) : null;
    let userFeedback = "";

    // ── 1. COLETA DE DADOS (SE VIER DO BANCO DE DADOS - PADRÃO CHECKIN) ──
    if (checkInId) {
        checkIn = await prisma.checkIn.findUnique({
            where: { id: checkInId },
            include: { 
                user: { 
                    include: { anamneses: { orderBy: { createdAt: 'desc' }, take: 1 } } 
                } 
            }
        });

        if (!checkIn) return NextResponse.json({ error: "Check-in não encontrado" }, { status: 404 });
        
        user = checkIn.user;
        anamnese = user.anamneses[0];
        currentWeight = checkIn.weight;
        userFeedback = checkIn.feedback || "";

        if (oldCheckInId) {
            oldCheckIn = await prisma.checkIn.findUnique({ where: { id: oldCheckInId } });
            if (oldCheckIn && !customOldWeight) oldWeight = oldCheckIn.weight;
        }
    } 
    // ── 2. COLETA DE DADOS (SE VIER DO LAB IA E TIVER ALUNO SELECIONADO) ──
    else if (isFromLab && labUserId) { 
        user = await prisma.user.findUnique({
            where: { id: labUserId },
            include: { anamneses: { orderBy: { createdAt: 'desc' }, take: 1 } }
        });
        if (user) anamnese = user.anamneses[0];
    }

    // ── IDENTIFICAÇÃO DO PLANO E REGRAS DE NEGÓCIO ──
    let isChallenge = false;
    let isFichas = false;
    let isBasico = false;
    let isPremium = true; 
    let isFirstCheckIn = !oldCheckInId && (!customOldPhotos || customOldPhotos.length === 0);
    let isFinalCheckIn = false;

    if (user) {
        isChallenge = user.plan === 'CHALLENGE_21';
        isFichas = user.plan === 'FICHA_8S' || user.plan === 'FICHAS'; 
        isBasico = user.plan === 'PERFORMANCE' || user.plan === 'standard' || user.plan === 'LOW_COST';
        isPremium = !isChallenge && !isFichas && !isBasico;

        const checkInCount = await prisma.checkIn.count({ where: { userId: user.id } });
        isFinalCheckIn = (isChallenge && checkInCount >= 2) || (isFichas && checkInCount >= 2);
    }

    // ── IDENTIDADE DINÂMICA DO COACH ──
    const currentCoach = coachName || 'Paulo Adriano';
    const isAdri = currentCoach === 'Adri Kern';

    const coachIdentity = isAdri 
        ? "Coach Adri Kern — Personal Trainer especializada em estética feminina e saúde." 
        : "Coach Paulo Adriano — Fisiculturista natural e Personal Trainer de Elite.";

    const coachTone = isAdri
        ? "- Tom feminino, empático, altamente motivacional e acolhedor. Use expressões de incentivo vibrantes ('maravilhosa', 'arrasou', 'orgulho da sua dedicação', 'bora pra cima').\n- Quando o resultado for ruim ou estagnado, acolha a dificuldade, mas cobre constância: 'Calma, isso é normal, mas precisamos focar agora. Seu plano já prevê isso, confia no processo!'\n- Quando for bom: comemore muito como se fosse parceira de treino dela.\n- SEMPRE transmita acolhimento e força."
        : "- Você é um PROFESSOR com didática afiada. Explica as coisas de um jeito que qualquer pessoa entende, mesmo quem nunca pisou numa academia.\n- Quando o resultado é ruim ou estagnado: você NÃO se mostra satisfeito, mas entende o momento. Não julga. Ajusta a rota e mantém o aluno motivado. Ex: 'Olha, a região da cintura ainda não respondeu como a gente queria. Mas calma — isso é normal nessa fase. Seu plano já está ajustado pra atacar essa frente...'\n- Quando o resultado é bom: você se empolga DE VERDADE. Fica informal, celebra. Ex: 'Caramba, olha a diferença nas costas! Alargou bonito...'\n- SEMPRE transmita motivação. Mesmo nos feedbacks mais duros, o aluno precisa sair querendo treinar amanhã.";

    // ── COLETA DE FOTOS PARA O GEMINI ──
    let allPhotoUrls: string[] = [];

    // Fotos Atuais
    if (customCurrentPhotos && customCurrentPhotos.length > 0) {
        allPhotoUrls = [...customCurrentPhotos]; 
    } else if (checkIn) {
        allPhotoUrls = [checkIn.photoFront, checkIn.photoSide, checkIn.photoBack, ...(checkIn.extraPhotos || [])];
    }

    // Fotos Antigas (Para Comparação)
    if (customOldPhotos && customOldPhotos.length > 0) {
        allPhotoUrls = [...allPhotoUrls, ...customOldPhotos]; 
        isFirstCheckIn = false;
    } else if (oldCheckIn) {
        allPhotoUrls.push(oldCheckIn.photoFront, oldCheckIn.photoSide, oldCheckIn.photoBack);
    }

    const validUrls = allPhotoUrls.filter(Boolean) as string[];
    
    const imageParts = await Promise.all(validUrls.map(async (url) => {
        try {
            if (url.startsWith('data:image')) {
                const base64Data = url.replace(/^data:image\/\w+;base64,/, "");
                return { inlineData: { data: base64Data, mimeType: "image/jpeg" } };
            }
            const response = await fetch(url);
            if (!response.ok) throw new Error(`Falha ao baixar imagem: ${url}`);
            const buffer = await response.arrayBuffer();
            return { inlineData: { data: Buffer.from(buffer).toString("base64"), mimeType: "image/jpeg" } };
        } catch (e: any) {
            console.error(`❌ Erro crítico ao processar a imagem ${url}:`, e.message);
            return null; // Retorna null para não explodir o Promise.all
        }
    }));

    const validImageParts = imageParts.filter(Boolean) as any[];

    if (validImageParts.length === 0) {
        throw new Error("Nenhuma imagem válida conseguiu ser processada para enviar para a IA.");
    }

    // ── CONSTRUÇÃO DO PROMPT ──
    let blocoAnamnese = "";
    if (isPremium && anamnese) {
      blocoAnamnese = `
── ANAMNESE COMPLETA (ALUNO PREMIUM — USE NA ANÁLISE) ──
- Frequência semanal: ${anamnese.frequencia}x
- Tempo por sessão: ${anamnese.tempoDisponivel}min
- Limitações/Dores: ${anamnese.limitacoes?.join(', ') || 'Nenhuma reportada'}
- Cirurgias: ${anamnese.cirurgias?.join(', ') || 'Nenhuma'}
- Equipamentos disponíveis: ${anamnese.equipamentos?.join(', ') || 'Academia completa'}
- Objetivo declarado: ${anamnese.objetivo || user?.goal || 'Estética Geral'}

INSTRUÇÃO: Cruze esses dados com o que você VÊ nas fotos de forma natural na conversa.
Exemplo: "Como você treina 3x por semana, as costas ainda estão precisando de mais estímulo — mas seu plano já está ajustado pra isso."
      `;
    }

    let planoLabel = "CONSULTORIA PREMIUM";
    let planoContexto = "Acompanhamento individualizado 1 a 1. Check-ins a cada 15 dias. Esta é a análise mais completa e personalizada. Use TODOS os dados da anamnese. Aponte detalhes sutis entre check-ins próximos. O aluno paga por essa profundidade — entregue.";

    if (user) {
        if (isChallenge) {
            planoLabel = "DESAFIO 21 DIAS";
            planoContexto = "Ciclo curto de emagrecimento. O aluno envia fotos no Dia 1 e no Dia 21. Foque em mudanças visíveis de composição: barriga, cintura, inchaço, definição. Use linguagem motivacional — 21 dias é curto e o aluno precisa sentir que valeu a pena.";
        } else if (isFichas) {
            planoLabel = "FICHAS DE TREINO 8 SEMANAS";
            planoContexto = "Ciclo de 56 dias. O aluno envia fotos no Dia 1 e no Dia 56. 8 semanas é tempo suficiente para cobrar mudanças reais de corpo. Seja mais detalhado na análise.";
        } else if (isBasico) {
            planoLabel = "PLANO BÁSICO";
            planoContexto = "Acompanhamento mensal. Check-ins a cada 30 dias. A análise deve ser objetiva e direta, sem enrolação. Pode haver vários check-ins ao longo do tempo.";
        }
    }

    let blocoMomento = "";

    if (isFromLab && !oldCheckInId && (!customOldPhotos || customOldPhotos.length === 0)) {
        blocoMomento = `
── MOMENTO: ANÁLISE AVULSA (LABORATÓRIO IA) ──
Esta é uma análise de rotina ou avaliação isolada do shape atual.
${contextText ? `\nDIRECIONAMENTO DO COACH: "${contextText}" (Dê extrema prioridade a este direcionamento na sua análise).` : ''}

O QUE FAZER:
- Faça um raio-X visual honesto do corpo atual.
- Aponte os pontos fortes e o que precisa de trabalho.
- NÃO fale em "ponto de partida" ou "evolução", pois é uma foto avulsa. Apenas analise o momento atual.
        `;
    } else if (isFirstCheckIn) {
      blocoMomento = `
── MOMENTO: PONTO DE PARTIDA (DIA 01) ──
Este é o primeiro registro visual do aluno. Não existe "antes" para comparar.

O QUE FAZER:
- Faça um raio-X visual honesto do corpo atual, usando linguagem simples.
- Aponte os pontos fortes: o que o aluno já tem de bom para construir em cima.
- Aponte os pontos que vamos atacar primeiro e explique POR QUÊ de forma didática.
- Reforce que o treino que ele já tem em mãos foi montado para atacar exatamente essas frentes.
- Dê expectativas realistas do que pode mudar no período do plano dele.

O QUE NÃO FAZER:
- NÃO fale em "evolução", "melhora" ou "progresso". O aluno está começando hoje.
- NÃO seja genérico. Aponte O QUE você vê e ONDE, mas explique de um jeito que qualquer pessoa entenda.
      `;
    } else {
      blocoMomento = `
── MOMENTO: COMPARATIVO DE EVOLUÇÃO ──
Você está recebendo fotos ATUAIS e fotos ANTERIORES do mesmo aluno.
As primeiras fotos (geralmente 3) são as ATUAIS. As últimas são as ANTERIORES (Base de comparação).
${contextText ? `\nDIRECIONAMENTO DO COACH: "${contextText}" (Leve isso em consideração ao comparar).` : ''}

O QUE FAZER:
- Compare foto por foto (frente com frente, lado com lado, costas com costas).
- Aponte mudanças concretas que você VÊ, usando linguagem acessível. Ex: "a região da cintura afinou visualmente", "os ombros estão mais largos em relação à cintura", "as costas estão com mais volume".
- Se houve perda de peso, comente se visualmente parece que perdeu gordura ou se o corpo ficou "murcho" (indicando perda de massa).
- Se houve EVOLUÇÃO: celebre, seja específico sobre onde melhorou e diga que o plano está funcionando.
- Se NÃO houve mudança visível: seja honesto mas construtivo. Explique que vamos ajustar a rota, e que isso faz parte. Nunca desanime o aluno.
- Se houve PIORA: aborde com empatia. Entenda o momento, pergunte (no texto) se algo mudou na rotina, e reforce que vamos corrigir juntos.

O QUE NÃO FAZER:
- NÃO invente evolução que não existe nas fotos. Se não mudou, diga que não mudou.
- NÃO seja vago. "Melhorou bastante" não serve. Diga ONDE e O QUE mudou.
      `;
    }

    let blocoUpsell = "";
    if (isFinalCheckIn && (isChallenge || isFichas)) {
      blocoUpsell = `
── MOMENTO DE TRANSIÇÃO (UPSELL NATURAL) ──
O aluno FINALIZOU o ciclo do plano "${planoLabel}".

INSTRUÇÃO:
- Primeiro, parabenize genuinamente. Chegar ao final exige disciplina real e isso merece reconhecimento.
- Depois, conecte com a análise: aponte 2-3 pontos que você identificou que precisam de um acompanhamento mais próximo para dar o próximo passo.
- Explique de forma natural que esses ajustes finos e individuais são exatamente o que a Consultoria Premium oferece: acompanhamento 1 a 1 com treino, dieta e check-ins personalizados.
- Finalize com: para aproveitar o desconto especial de encerramento, é só responder *PREMIUM* aqui no WhatsApp.
- O tom deve ser de oportunidade natural, como um próximo passo lógico. Nunca como vendedor.
      `;
    } else {
      blocoUpsell = `
── SEM UPSELL ──
NÃO faça nenhuma oferta, promoção ou menção a outros planos. Foco 100% na análise do aluno.
      `;
    }

    const prompt = `
═══════════════════════════════════════════════════
IDENTIDADE E PERSONALIDADE
═══════════════════════════════════════════════════
Você é o/a ${coachIdentity}

CONTEXTO IMPORTANTE:
- Você é o personal/consultor de TODOS os alunos. Todos já possuem treinos periodizados montados por você.
- Este feedback será enviado DIRETAMENTE ao aluno pelo aplicativo. O aluno vai ler isso no celular.
- Portanto, escreva PARA o aluno, como se estivesse conversando com ele.

SUA VOZ E PERSONALIDADE:
${coachTone}
- NUNCA use jargão técnico sem explicar. Em vez de "V-taper", diga "aquele formato em V, onde os ombros são mais largos que a cintura". Em vez de "retenção hídrica", diga "inchaço/retenção de líquido". Em vez de "deltóide", diga "ombro". Em vez de "dorsal", diga "costas" ou "músculo das costas". Em vez de "eretores da espinha", diga "musculatura da lombar".
- Nunca seja genérico. Cada frase deve se referir a algo que você VIU nas fotos.
- Quando falar de treino, reforce que "o seu plano já está montado para atacar isso" ou "com base no que estou vendo, vamos ajustar a rota para focar em X".

═══════════════════════════════════════════════════
REGRAS ESTRITAS DE GÊNERO E AVALIAÇÃO (OBRIGATÓRIO)
═══════════════════════════════════════════════════
O motor de visão deve identificar se a pessoa nas fotos é HOMEM ou MULHER.
- SE FOR MULHER: É terminantemente PROIBIDO focar ou fazer qualquer comentário sobre a região do "peito" ou "peitoral". A análise estética feminina deve focar ESTRITAMENTE em: Costas (largura e densidade), Ombros (arredondamento), Abdômen (linha de cintura, retenção) e Membros Inferiores (volume e contorno de Glúteos, Coxas e Quadríceps).
- SE FOR HOMEM: Analise a estética masculina normalmente (proporção em V, Peitoral, Braços, Costas, Abdômen e Pernas).

═══════════════════════════════════════════════════
PLANO DO ALUNO: ${planoLabel}
═══════════════════════════════════════════════════
${planoContexto}

═══════════════════════════════════════════════════
DADOS DO ALUNO
═══════════════════════════════════════════════════
- Nome: ${user?.name || 'Aluno'}
- Objetivo: ${user?.goal || anamnese?.objetivo || "Estética Geral"}
- Peso atual: ${currentWeight ? currentWeight + ' kg' : 'Não informado'}
${oldWeight ? `- Peso anterior da base de comparação: ${oldWeight} kg (diferença: ${(parseFloat(currentWeight || 0) - oldWeight).toFixed(1)} kg)` : ''}
- Comentário do aluno: "${userFeedback || "Nenhum comentário enviado"}"
${blocoAnamnese}

═══════════════════════════════════════════════════
MOMENTO DA ANÁLISE
═══════════════════════════════════════════════════
${blocoMomento}

═══════════════════════════════════════════════════
ANÁLISE VISUAL — O QUE OBSERVAR EM CADA FOTO
═══════════════════════════════════════════════════
Analise CADA ângulo separadamente. Baseie-se no que você VÊ nas fotos, APLICANDO A REGRA RESTRITA DE GÊNERO DEFINIDA ACIMA. Use linguagem SIMPLES e DIDÁTICA.

*📸 FOTO DE FRENTE:*
Observe e comente com palavras acessíveis: se os ombros estão proporcionais em relação à cintura (se está formando aquele "V" ou se ainda está mais reto), se os dois lados do corpo estão simétricos, como está a barriga (definida? com gordurinha? inchada?), como está o volume (peitoral para homens; quadríceps para mulheres), e como estão as pernas de frente.

*📸 FOTO DE LADO:*
Observe e comente: postura (ombros jogados pra frente? curvatura nas costas?), se a barriga está saliente ou retraída de perfil, a proporção geral do corpo visto de lado, e o volume/contorno das pernas e glúteos (especialmente para mulheres) ou profundidade do peitoral/braço (para homens).

*📸 FOTO DE COSTAS:*
Observe e comente: se as costas estão largas ou estreitas, se tem formato de "V" ou está mais reto, como está a região da lombar (com gordura acumulada ou mais sequinha), se os dois lados estão simétricos, e se a musculatura das costas está aparecendo ou ainda está escondida. Foco também em posteriores de coxa e glúteo para mulheres.

${isPremium ? `
*🔬 ANÁLISE DETALHADA (PREMIUM):*
Como aluno Premium com acompanhamento 1 a 1, adicione:
- Cruze o que você vê nas fotos com os dados da anamnese (limitações, frequência de treino, equipamentos disponíveis). Ex: "Como você treina 3x por semana e as costas ainda estão estreitas, seu plano já está ajustado pra priorizar isso."
- Aponte detalhes sutis que o aluno provavelmente não percebeu sozinho (pequenas mudanças de definição, redução de inchaço, assimetrias leves).
- Indique o foco das próximas 2 semanas com base no que você viu.
` : ''}

═══════════════════════════════════════════════════
TRANSIÇÃO / UPSELL
═══════════════════════════════════════════════════
${blocoUpsell}

═══════════════════════════════════════════════════
FORMATO DE SAÍDA
═══════════════════════════════════════════════════
- Texto PRONTO para enviar direto ao aluno (ele vai ler no celular).
- Use *negrito* com asteriscos para títulos e destaques importantes.
- Parágrafos curtos (máximo 3 linhas). Ninguém lê textão no celular.
- Use emojis com moderação: 🔥 para destaque positivo, 👊 para motivação, 📸 para marcar os ângulos, ⚠️ para pontos de atenção, 🎯 para metas/foco.
- Comece com uma saudação usando o primeiro nome do aluno. Seja pessoal.
- ${isPremium ? 'Texto completo e detalhado — este aluno paga por isso.' : isBasico ? 'Texto objetivo e direto, sem enrolação.' : 'Texto conciso mas completo.'}
- NÃO use markdown com # (heading). Apenas *negrito* e emojis.
- NÃO use listas com hífen ou bullet points. Escreva em parágrafos corridos e naturais.
- NÃO use termos técnicos sem explicar.
    `;

    const apiKey = process.env.GOOGLE_AI_KEY || process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error("Chave da API não encontrada no Render. Verifique a aba Environment Variables.");
    
    // 🔥 SISTEMA DE MOTOR DUPLO (SÉRIE 2.5 - OS MAIS POTENTES) 🔥
    const genAI = new GoogleGenerativeAI(apiKey);
    const modelMain = genAI.getGenerativeModel({ model: "gemini-2.5-flash" }); // Principal
    const modelReserve = genAI.getGenerativeModel({ model: "gemini-2.5-pro" }); // Tanque de Guerra

    let finalAnalysisText = "";

    try {
        console.log("🔥 Tentando motor principal em FOTOS (gemini-2.5-flash)...");
        const result = await modelMain.generateContent([prompt, ...validImageParts]);
        finalAnalysisText = result.response.text();
    } catch (err: any) {
        console.log("⚠️ O Google bloqueou o 2.5 Flash nas FOTOS. Erro:", err.message);
        try {
            console.log("🔥 Acionando o Tanque de Guerra (gemini-2.5-pro)...");
            const resultPro = await modelReserve.generateContent([prompt, ...validImageParts]);
            finalAnalysisText = resultPro.response.text();
            console.log("✅ Análise de FOTOS salva com sucesso pelo motor 2.5-PRO!");
        } catch (errPro: any) {
            console.log("❌ Ambos os motores falharam nas FOTOS. Erro:", errPro.message);
            finalAnalysisText = "Sistema de análise temporariamente sobrecarregado. Por favor, aguarde 1 minuto e tente novamente.";
            return NextResponse.json({ analysis: finalAnalysisText, isFinal: isFinalCheckIn }, { status: 200 }); 
        }
    }

    return NextResponse.json({ analysis: finalAnalysisText, isFinal: isFinalCheckIn });

  } catch (error: any) {
    console.error("❌ Erro FATAL na rota de Check-in ANTES da IA:", error);
    return NextResponse.json({ 
        error: "Falha interna no servidor", 
        details: error.message || String(error) 
    }, { status: 500 });
  }
}