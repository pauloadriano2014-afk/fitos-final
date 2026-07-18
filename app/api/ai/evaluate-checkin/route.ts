// app/api/ai/evaluate-checkin/route.ts — v2
// v2: isolamento multi-tenant, lock 1 avaliação/checkin,
//     prompt customizável por coach (adicionar | substituir),
//     assinatura dinâmica, só Gemini 2.5 Flash (retry com delay)

import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { GoogleGenerativeAI } from '@google/generative-ai';

export const maxDuration = 60;
export const dynamic = 'force-dynamic';

const prisma = new PrismaClient();

// ─── CONSTANTS ────────────────────────────────────────────────────────────────
const MASTER_IDS = [
    '3c82f763-66b4-48da-836e-16817d4f57c0', // Paulo
    'b7c0c181-41fd-4156-b8fe-963a267759a3', // Adri
];

const ADRI_ID = 'b7c0c181-41fd-4156-b8fe-963a267759a3';

const delay = (ms: number) => new Promise(r => setTimeout(r, ms));

// ─── HELPERS ─────────────────────────────────────────────────────────────────
async function imageUrlToBase64(url: string): Promise<{ inlineData: { data: string; mimeType: string } } | null> {
    try {
        if (url.startsWith('data:image')) {
            const base64Data = url.replace(/^data:image\/\w+;base64,/, '');
            return { inlineData: { data: base64Data, mimeType: 'image/jpeg' } };
        }
        const response = await fetch(url);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const buffer = await response.arrayBuffer();
        return { inlineData: { data: Buffer.from(buffer).toString('base64'), mimeType: 'image/jpeg' } };
    } catch (e: any) {
        console.error(`❌ Erro ao processar imagem ${url}:`, e.message);
        return null;
    }
}

// ─── MAIN ─────────────────────────────────────────────────────────────────────
export async function POST(req: Request) {
    try {
        const {
            checkInId,
            oldCheckInId,
            customOldPhotos,
            customOldWeight,
            customCurrentPhotos,
            contextText,
            isFromLab,
            labUserId,
            coachId,          // ← quem pediu a avaliação (obrigatório para isolamento)
            forceRetry,       // ← true = ignora lock (para quando a IA falhou antes)
        } = await req.json();

        // ── 1. ISOLAMENTO: valida que o coach tem acesso ao checkin ──────────
        if (checkInId && coachId) {
            const checkinOwner = await prisma.checkIn.findUnique({
                where: { id: checkInId },
                select: { user: { select: { coachId: true } } },
            });
            if (!checkinOwner) {
                return NextResponse.json({ error: 'Check-in não encontrado' }, { status: 404 });
            }
            const studentCoachId = checkinOwner.user?.coachId;
            const isMaster       = MASTER_IDS.includes(coachId);
            const isOwner        = studentCoachId === coachId;
            const isMasterStudent = isMaster && (studentCoachId === null || MASTER_IDS.includes(studentCoachId ?? ''));
            if (!isMaster && !isOwner && !isMasterStudent) {
                return NextResponse.json({ error: 'Acesso negado' }, { status: 403 });
            }
        }

        // ── 2. LOCK: 1 avaliação por checkin (salvo forceRetry) ─────────────
        if (checkInId && !forceRetry) {
            const existing = await prisma.checkIn.findUnique({
                where: { id: checkInId },
                select: { aiEvaluatedAt: true },
            });
            if (existing?.aiEvaluatedAt) {
                return NextResponse.json({ error: 'already_evaluated', evaluatedAt: existing.aiEvaluatedAt }, { status: 409 });
            }
        }

        // ── 3. COLETA DE DADOS ───────────────────────────────────────────────
        let user: any    = null;
        let anamnese: any = null;
        let checkIn: any  = null;
        let oldCheckIn: any = null;
        let currentWeight: number | null = null;
        let oldWeight: number | null = customOldWeight ? parseFloat(customOldWeight) : null;
        let userFeedback = '';

        if (checkInId) {
            checkIn = await prisma.checkIn.findUnique({
                where: { id: checkInId },
                include: {
                    user: { include: { anamneses: { orderBy: { createdAt: 'desc' }, take: 1 } } },
                },
            });
            if (!checkIn) return NextResponse.json({ error: 'Check-in não encontrado' }, { status: 404 });
            user         = checkIn.user;
            anamnese     = user.anamneses[0];
            currentWeight = checkIn.weight;
            userFeedback = checkIn.feedback || '';

            if (oldCheckInId) {
                oldCheckIn = await prisma.checkIn.findUnique({ where: { id: oldCheckInId } });
                if (oldCheckIn && !customOldWeight) oldWeight = oldCheckIn.weight;
            }
        } else if (isFromLab && labUserId) {
            user = await prisma.user.findUnique({
                where: { id: labUserId },
                include: { anamneses: { orderBy: { createdAt: 'desc' }, take: 1 } },
            });
            if (user) anamnese = user.anamneses[0];
        }

        // ── 4. DADOS DO COACH QUE PEDIU (assinatura + prompt custom) ────────
        let requestingCoach: any = null;
        if (coachId) {
            requestingCoach = await prisma.user.findUnique({
                where: { id: coachId },
                select: {
                    id:              true,
                    name:            true,
                    aiCheckinPrompt: true,       // ← prompt customizado
                    aiPromptMode:    true,       // ← 'ADD' | 'REPLACE'
                },
            });
        }

        // Assinatura dinâmica — usa o nome do coach que pediu
        const coachDisplayName = requestingCoach?.name ?? 'Seu Coach';
        const signatureBlock   = `Seu Coach,\n${coachDisplayName}`;

        // ── 5. IDENTIDADE (Paulo / Adri / Coach parceiro) ───────────────────
        const isAdri   = coachId === ADRI_ID;
        const isMaster = MASTER_IDS.includes(coachId ?? '');
        const isPartner = !!coachId && !isMaster;

        let coachIdentity: string;
        let coachTone: string;

        if (isPartner) {
            // Coach parceiro: identidade neutra baseada no nome dele
            coachIdentity = `${coachDisplayName} — Personal Trainer e Consultor(a) de Elite.`;
            coachTone = `- Tom profissional, motivacional e empático.
- Elogie a constância e os resultados com genuinidade.
- Quando o resultado for bom: comemore com o aluno.
- Quando não houver mudança ou houver piora: seja honesto mas construtivo. Nunca desanime.
- SEMPRE transmita que o plano está sendo monitorado e ajustado.`;
        } else if (isAdri) {
            coachIdentity = 'Coach Adri Kern — Personal Trainer especializada em estética feminina e saúde.';
            coachTone = `- Tom feminino, empático, altamente motivacional e acolhedor. Use expressões de incentivo vibrantes ('maravilhosa', 'arrasou', 'orgulho da sua dedicação', 'bora pra cima').
- Quando o resultado for ruim ou estagnado, acolha a dificuldade, mas cobre constância.
- Quando for bom: comemore muito como se fosse parceira de treino dela.
- SEMPRE transmita acolhimento e força.`;
        } else {
            // Paulo
            coachIdentity = 'Coach Paulo Adriano — Fisiculturista natural e Personal Trainer de Elite.';
            coachTone = `- Você é um PROFESSOR com didática afiada. Explica de um jeito que qualquer pessoa entende.
- Quando o resultado é ruim ou estagnado: não se mostra satisfeito, mas entende o momento. Ajusta a rota e mantém o aluno motivado.
- Quando o resultado é bom: se empolga DE VERDADE. Fica informal, celebra.
- SEMPRE transmita motivação. Mesmo nos feedbacks mais duros, o aluno precisa sair querendo treinar amanhã.`;
        }

        // ── 6. PLANO E MOMENTO ───────────────────────────────────────────────
        let isChallenge = false, isFichas = false, isBasico = false, isPremium = true;
        let isFinalCheckIn = false;
        const isFirstCheckIn = !oldCheckInId && (!customOldPhotos?.length) && (!customCurrentPhotos?.length);

        if (user) {
            isChallenge = user.plan === 'CHALLENGE_21';
            isFichas    = ['FICHA_8S', 'FICHAS'].includes(user.plan);
            isBasico    = ['PERFORMANCE', 'standard', 'LOW_COST'].includes(user.plan);
            isPremium   = !isChallenge && !isFichas && !isBasico;
            const checkInCount = await prisma.checkIn.count({ where: { userId: user.id } });
            isFinalCheckIn = (isChallenge || isFichas) && checkInCount >= 2;
        }

        let planoLabel    = 'CONSULTORIA PREMIUM';
        let planoContexto = 'Acompanhamento individualizado 1 a 1. Check-ins a cada 15 dias. Análise completa e personalizada.';
        if (isChallenge) { planoLabel = 'DESAFIO 21 DIAS';        planoContexto = 'Ciclo curto de emagrecimento. Foque em mudanças visíveis de composição.'; }
        if (isFichas)    { planoLabel = 'FICHAS DE TREINO 8 SEMANAS'; planoContexto = 'Ciclo de 56 dias. Cobrar mudanças reais de corpo.'; }
        if (isBasico)    { planoLabel = 'PLANO BÁSICO';            planoContexto = 'Acompanhamento mensal. Análise objetiva e direta.'; }

        const blocoAnamnese = (isPremium && anamnese) ? `
── ANAMNESE COMPLETA (PREMIUM) ──
- Frequência: ${anamnese.frequencia}x/sem | Tempo: ${anamnese.tempoDisponivel}min
- Limitações: ${anamnese.limitacoes?.join(', ') || 'Nenhuma'}
- Objetivo: ${anamnese.objetivo || user?.goal || 'Estética Geral'}
- Equipamentos: ${anamnese.equipamentos?.join(', ') || 'Academia completa'}
Cruze esses dados com o que você vê nas fotos de forma natural.` : '';

        const blocoMomento = isFirstCheckIn ? `
── MOMENTO: PONTO DE PARTIDA (DIA 01) ──
Primeiro registro visual. Não existe "antes" para comparar.
- Faça um raio-X honesto do corpo atual.
- Aponte pontos fortes e o que vamos atacar primeiro.
- Dê expectativas realistas.
- NÃO fale em "evolução" ou "melhora".` : `
── MOMENTO: COMPARATIVO DE EVOLUÇÃO ──
Fotos ATUAIS e ANTERIORES do mesmo aluno (atuais primeiro).
${contextText ? `\nDIRECIONAMENTO DO COACH: "${contextText}" (priorize isso na análise).` : ''}
- Compare ângulo por ângulo com linguagem acessível.
- Se houve evolução: celebre e seja específico.
- Se não houve mudança: seja honesto e construtivo.
- Se houve piora: aborde com empatia. Nunca desanime.
- NÃO invente evolução que não existe.`;

        const blocoUpsell = (isFinalCheckIn && (isChallenge || isFichas)) ? `
── TRANSIÇÃO (UPSELL NATURAL) ──
Aluno finalizou o ciclo "${planoLabel}".
- Parabenize genuinamente.
- Aponte 2-3 pontos que precisam de acompanhamento mais próximo.
- Conecte naturalmente com a Consultoria Premium.
- Tom de oportunidade, nunca de vendedor.` : `
── SEM UPSELL ──
NÃO faça nenhuma oferta ou menção a outros planos.`;

        // ── 7. PROMPT BASE (estrutura PA ELITE TEAM) ─────────────────────────
        const promptBase = `
═══════════════════════════════════════════════════
IDENTIDADE E PERSONALIDADE
═══════════════════════════════════════════════════
Você é o/a ${coachIdentity}

Este feedback será enviado DIRETAMENTE ao aluno pelo aplicativo. Escreva PARA o aluno.

SUA VOZ:
${coachTone}
- NUNCA use jargão técnico sem explicar. Em vez de "V-taper" → "formato em V". Em vez de "deltóide" → "ombro". Em vez de "dorsal" → "costas".
- Nunca seja genérico. Cada frase deve se referir a algo que você VIU nas fotos.

═══════════════════════════════════════════════════
REGRAS DE GÊNERO (OBRIGATÓRIO)
═══════════════════════════════════════════════════
- SE FOR MULHER: PROIBIDO comentar sobre peitoral. Foco em: Costas, Ombros, Abdômen, Glúteos, Coxas.
- SE FOR HOMEM: Analise normalmente (Peitoral, Braços, Costas, Abdômen, Pernas).

═══════════════════════════════════════════════════
PLANO: ${planoLabel}
═══════════════════════════════════════════════════
${planoContexto}

═══════════════════════════════════════════════════
DADOS DO ALUNO
═══════════════════════════════════════════════════
- Nome: ${user?.name || 'Aluno'}
- Objetivo: ${user?.goal || anamnese?.objetivo || 'Estética Geral'}
- Peso atual: ${currentWeight ? currentWeight + ' kg' : 'Não informado'}
${oldWeight ? `- Peso anterior: ${oldWeight} kg (diferença: ${(parseFloat(String(currentWeight ?? 0)) - oldWeight).toFixed(1)} kg)` : ''}
- Comentário do aluno: "${userFeedback || 'Nenhum'}"
${blocoAnamnese}

═══════════════════════════════════════════════════
MOMENTO DA ANÁLISE
═══════════════════════════════════════════════════
${blocoMomento}

═══════════════════════════════════════════════════
ANÁLISE VISUAL
═══════════════════════════════════════════════════
Analise cada ângulo separadamente com linguagem simples e didática.

*📸 FRENTE:* proporção ombro/cintura, simetria, barriga, volume.
*📸 LADO:* postura, barriga de perfil, proporção geral.
*📸 COSTAS:* largura, formato, lombar, simetria, glúteos/posteriores (mulheres).

${isPremium ? `*🔬 ANÁLISE PREMIUM:* Cruze fotos com dados da anamnese. Aponte detalhes sutis. Indique foco das próximas 2 semanas.` : ''}

═══════════════════════════════════════════════════
TRANSIÇÃO
═══════════════════════════════════════════════════
${blocoUpsell}

═══════════════════════════════════════════════════
FORMATO DE SAÍDA
═══════════════════════════════════════════════════
- Texto pronto para enviar ao aluno (leitura no celular).
- *Negrito* com asteriscos para destaques. Emojis com moderação.
- Parágrafos curtos (máx 3 linhas).
- Comece com saudação pelo primeiro nome.
- NÃO use # headings. NÃO use listas com hífen/bullet.
- NÃO use frases clichê de IA ("Em resumo", "Lembre-se que", "Espero que ajude").
- Valorize a constância antes de elogiar o corpo.
- OBRIGATÓRIO: termine assinando EXATAMENTE:

${signatureBlock}`;

        // ── 8. PROMPT FINAL (considera modo do coach) ────────────────────────
        // aiPromptMode: 'ADD' = adiciona junto ao base | 'REPLACE' = substitui o base
        const customPrompt  = requestingCoach?.aiCheckinPrompt?.trim() ?? '';
        const promptMode    = requestingCoach?.aiPromptMode ?? 'ADD';

        let finalPrompt: string;

        if (customPrompt && promptMode === 'REPLACE') {
            // Coach quer controle total — usa só o prompt dele
            // Ainda injetamos dados básicos e a assinatura para não perder contexto mínimo
            finalPrompt = `
${customPrompt}

═══════════════════════════════════════════════════
DADOS DO ALUNO (INJETADOS AUTOMATICAMENTE)
═══════════════════════════════════════════════════
- Nome: ${user?.name || 'Aluno'}
- Peso atual: ${currentWeight ? currentWeight + ' kg' : 'Não informado'}
${oldWeight ? `- Peso anterior: ${oldWeight} kg` : ''}
- Comentário do aluno: "${userFeedback || 'Nenhum'}"
${contextText ? `\nDIRECIONAMENTO ADICIONAL: "${contextText}"` : ''}

OBRIGATÓRIO: termine assinando EXATAMENTE:
${signatureBlock}`;
        } else if (customPrompt && promptMode === 'ADD') {
            // Adiciona o prompt do coach como bloco extra no prompt base
            finalPrompt = `${promptBase}

═══════════════════════════════════════════════════
DIRECIONAMENTO PERSONALIZADO DO COACH
═══════════════════════════════════════════════════
${customPrompt}
${contextText ? `\nCONTEXTO ADICIONAL DO CHECKIN: "${contextText}"` : ''}`;
        } else {
            // Sem customização — usa o base puro
            finalPrompt = promptBase;
        }

        // ── 9. COLETA E PROCESSAMENTO DAS FOTOS ─────────────────────────────
        let allPhotoUrls: string[] = [];

        if (customCurrentPhotos?.length) {
            allPhotoUrls = [...customCurrentPhotos];
        } else if (checkIn) {
            allPhotoUrls = [
                checkIn.photoFront, checkIn.photoSide, checkIn.photoBack,
                ...(checkIn.extraPhotos || []),
            ];
        }

        if (customOldPhotos?.length) {
            allPhotoUrls = [...allPhotoUrls, ...customOldPhotos];
        } else if (oldCheckIn) {
            allPhotoUrls.push(oldCheckIn.photoFront, oldCheckIn.photoSide, oldCheckIn.photoBack);
        }

        const validUrls    = allPhotoUrls.filter(Boolean) as string[];
        const imageParts   = (await Promise.all(validUrls.map(imageUrlToBase64))).filter(Boolean) as any[];

        if (!imageParts.length) {
            throw new Error('Nenhuma imagem válida para processar.');
        }

        // ── 10. CHAMADA GEMINI 2.5 FLASH (com retry) ────────────────────────
        const apiKey = process.env.GOOGLE_AI_KEY || process.env.GEMINI_API_KEY;
        if (!apiKey) throw new Error('Chave da API Gemini não configurada.');

        const genAI = new GoogleGenerativeAI(apiKey);
        const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

        let analysisText = '';

        try {
            console.log('🔥 Chamando Gemini 2.5 Flash...');
            const result = await model.generateContent([finalPrompt, ...imageParts]);
            analysisText = result.response.text();
            console.log('✅ Flash respondeu com sucesso.');
        } catch (err: any) {
            console.warn('⚠️ Flash falhou na primeira tentativa:', err.message);
            // Retry após 4s (rate limit / sobrecarga momentânea)
            await delay(4000);
            try {
                console.log('🔁 Retry Gemini 2.5 Flash...');
                const result2 = await model.generateContent([finalPrompt, ...imageParts]);
                analysisText  = result2.response.text();
                console.log('✅ Flash respondeu no retry.');
            } catch (err2: any) {
                console.error('❌ Flash falhou nos dois retry:', err2.message);
                // Retorna erro recuperável — frontend oferece "Tentar novamente"
                return NextResponse.json(
                    { error: 'ai_unavailable', message: 'Motor de IA indisponível. Tente novamente em alguns instantes.' },
                    { status: 503 }
                );
            }
        }

        // ── 11. GRAVA O LOCK no banco ────────────────────────────────────────
        if (checkInId) {
            await prisma.checkIn.update({
                where: { id: checkInId },
                data:  { aiEvaluatedAt: new Date() },
            }).catch(e => console.warn('⚠️ Falha ao gravar aiEvaluatedAt:', e.message));
        }

        return NextResponse.json({ analysis: analysisText, isFinal: isFinalCheckIn });

    } catch (error: any) {
        console.error('❌ Erro FATAL evaluate-checkin:', error);
        return NextResponse.json(
            { error: 'Falha interna no servidor', details: error.message },
            { status: 500 }
        );
    }
}