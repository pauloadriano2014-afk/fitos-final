// app/api/ai/evaluate-checkin/route.ts — v3
// v3: multi-model (Gemini Flash, Gemini Pro, Claude Haiku, GPT-4o mini),
//     contextText funcionando em TODOS os modos (initial + comparison),
//     seletor restrito a masters, retry mantido no Gemini

import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { GoogleGenerativeAI } from '@google/generative-ai';
import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';

export const maxDuration = 60;
export const dynamic = 'force-dynamic';

const prisma = new PrismaClient();

// ─── CONSTANTS ────────────────────────────────────────────────────────────────
const MASTER_IDS = [
    '3c82f763-66b4-48da-836e-16817d4f57c0', // Paulo
    'b7c0c181-41fd-4156-b8fe-963a267759a3', // Adri
];

const ADRI_ID = 'b7c0c181-41fd-4156-b8fe-963a267759a3';

export type AIModelKey = 'gemini-flash' | 'gemini-pro' | 'claude-haiku' | 'gpt-4o-mini';

const MODEL_LABELS: Record<AIModelKey, string> = {
    'gemini-flash': 'Gemini 2.5 Flash',
    'gemini-pro':   'Gemini 2.5 Pro',
    'claude-haiku': 'Claude Haiku 4.5',
    'gpt-4o-mini':  'GPT-4o mini',
};

const delay = (ms: number) => new Promise(r => setTimeout(r, ms));

// ─── HELPERS ─────────────────────────────────────────────────────────────────
async function imageUrlToBase64(url: string) {
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
        console.error(`Erro ao processar imagem ${url}:`, e.message);
        return null;
    }
}

async function imageUrlToRawBase64(url: string) {
    try {
        if (url.startsWith('data:image')) {
            const mimeMatch = url.match(/^data:(image\/\w+);base64,/);
            const mimeType  = mimeMatch?.[1] ?? 'image/jpeg';
            const data      = url.replace(/^data:image\/\w+;base64,/, '');
            return { data, mimeType };
        }
        const response = await fetch(url);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const buffer = await response.arrayBuffer();
        return { data: Buffer.from(buffer).toString('base64'), mimeType: 'image/jpeg' };
    } catch (e: any) {
        console.error(`Erro ao processar imagem ${url}:`, e.message);
        return null;
    }
}

// ─── PROVIDERS ────────────────────────────────────────────────────────────────
async function callGemini(modelId: string, prompt: string, imageParts: any[]): Promise<string> {
    const apiKey = process.env.GOOGLE_AI_KEY || process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error('GOOGLE_AI_KEY não configurada.');
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: modelId });
    try {
        console.log(`🔥 Chamando ${modelId}...`);
        const result = await model.generateContent([prompt, ...imageParts]);
        console.log(`✅ ${modelId} respondeu.`);
        return result.response.text();
    } catch (err: any) {
        console.warn(`⚠️ ${modelId} falhou (1ª tentativa):`, err.message);
        await delay(4000);
        console.log(`🔁 Retry ${modelId}...`);
        const result2 = await model.generateContent([prompt, ...imageParts]);
        console.log(`✅ ${modelId} respondeu no retry.`);
        return result2.response.text();
    }
}

async function callClaude(prompt: string, rawImages: Array<{ data: string; mimeType: string }>): Promise<string> {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new Error('ANTHROPIC_API_KEY não configurada.');
    const anthropic = new Anthropic({ apiKey });

    const imageBlocks: Anthropic.ImageBlockParam[] = rawImages.map(img => ({
        type:   'image' as const,
        source: {
            type:       'base64' as const,
            media_type: img.mimeType as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp',
            data:       img.data,
        },
    }));

    console.log('🔥 Chamando Claude Haiku 4.5...');
    const response = await anthropic.messages.create({
        model:      'claude-haiku-4-5',
        max_tokens: 1500,
        messages: [{
            role:    'user',
            content: [...imageBlocks, { type: 'text' as const, text: prompt }],
        }],
    });

    const block = response.content.find(b => b.type === 'text');
    if (!block || block.type !== 'text') throw new Error('Resposta vazia do Claude.');
    console.log('✅ Claude Haiku respondeu.');
    return block.text;
}

async function callGPT(prompt: string, rawImages: Array<{ data: string; mimeType: string }>): Promise<string> {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) throw new Error('OPENAI_API_KEY não configurada.');
    const openai = new OpenAI({ apiKey });

    const imageMessages: OpenAI.Chat.ChatCompletionContentPart[] = rawImages.map(img => ({
        type:      'image_url' as const,
        image_url: { url: `data:${img.mimeType};base64,${img.data}`, detail: 'high' as const },
    }));

    console.log('🔥 Chamando GPT-4o mini...');
    const response = await openai.chat.completions.create({
        model:      'gpt-4o-mini',
        max_tokens: 1500,
        messages: [{
            role:    'user',
            content: [...imageMessages, { type: 'text', text: prompt }],
        }],
    });

    const text = response.choices[0]?.message?.content;
    if (!text) throw new Error('Resposta vazia do GPT.');
    console.log('✅ GPT-4o mini respondeu.');
    return text;
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
            coachId,
            forceRetry,
            aiModel = 'gemini-flash',
        } = await req.json();

        // Masters podem escolher o modelo; parceiros ficam sempre no flash
        const isMasterRequest = MASTER_IDS.includes(coachId ?? '');
        const selectedModel: AIModelKey = isMasterRequest
            ? (aiModel as AIModelKey)
            : 'gemini-flash';

        console.log(`🤖 Modelo: ${MODEL_LABELS[selectedModel]} | master: ${isMasterRequest}`);

        // ── 1. ISOLAMENTO ────────────────────────────────────────────────────
        if (checkInId && coachId) {
            const checkinOwner = await prisma.checkIn.findUnique({
                where:  { id: checkInId },
                select: { user: { select: { coachId: true } } },
            });
            if (!checkinOwner) return NextResponse.json({ error: 'Check-in não encontrado' }, { status: 404 });
            const studentCoachId  = checkinOwner.user?.coachId;
            const isOwner         = studentCoachId === coachId;
            const isMasterStudent = isMasterRequest && (studentCoachId === null || MASTER_IDS.includes(studentCoachId ?? ''));
            if (!isMasterRequest && !isOwner && !isMasterStudent) {
                return NextResponse.json({ error: 'Acesso negado' }, { status: 403 });
            }
        }

        // ── 2. LOCK ──────────────────────────────────────────────────────────
        if (checkInId && !forceRetry) {
            const existing = await prisma.checkIn.findUnique({
                where:  { id: checkInId },
                select: { aiEvaluatedAt: true },
            });
            if (existing?.aiEvaluatedAt) {
                return NextResponse.json({ error: 'already_evaluated', evaluatedAt: existing.aiEvaluatedAt }, { status: 409 });
            }
        }

        // ── 3. COLETA DE DADOS ───────────────────────────────────────────────
        let user: any = null, anamnese: any = null, checkIn: any = null, oldCheckIn: any = null;
        let currentWeight: number | null = null;
        let oldWeight: number | null     = customOldWeight ? parseFloat(customOldWeight) : null;
        let userFeedback = '';

        if (checkInId) {
            checkIn = await prisma.checkIn.findUnique({
                where:   { id: checkInId },
                include: { user: { include: { anamneses: { orderBy: { createdAt: 'desc' }, take: 1 } } } },
            });
            if (!checkIn) return NextResponse.json({ error: 'Check-in não encontrado' }, { status: 404 });
            user          = checkIn.user;
            anamnese      = user.anamneses[0];
            currentWeight = checkIn.weight;
            userFeedback  = checkIn.feedback || '';
            if (oldCheckInId) {
                oldCheckIn = await prisma.checkIn.findUnique({ where: { id: oldCheckInId } });
                if (oldCheckIn && !customOldWeight) oldWeight = oldCheckIn.weight;
            }
        } else if (isFromLab && labUserId) {
            user = await prisma.user.findUnique({
                where:   { id: labUserId },
                include: { anamneses: { orderBy: { createdAt: 'desc' }, take: 1 } },
            });
            if (user) anamnese = user.anamneses[0];
        }

        // ── 4. DADOS DO COACH ────────────────────────────────────────────────
        let requestingCoach: any = null;
        if (coachId) {
            requestingCoach = await prisma.user.findUnique({
                where:  { id: coachId },
                select: { id: true, name: true, aiCheckinPrompt: true, aiPromptMode: true },
            });
        }
        const coachDisplayName = requestingCoach?.name ?? 'Seu Coach';
        const signatureBlock   = `Seu Coach,\n${coachDisplayName}`;

        // ── 5. IDENTIDADE ────────────────────────────────────────────────────
        const isAdri    = coachId === ADRI_ID;
        const isPartner = !!coachId && !isMasterRequest;
        let coachIdentity: string;
        let coachTone: string;

        if (isPartner) {
            coachIdentity = `${coachDisplayName} — Personal Trainer e Consultor(a) de Elite.`;
            coachTone = `- Tom profissional, motivacional e empático.\n- Elogie a constância e os resultados com genuinidade.\n- Quando o resultado for bom: comemore com o aluno.\n- Quando não houver mudança ou houver piora: seja honesto mas construtivo. Nunca desanime.\n- SEMPRE transmita que o plano está sendo monitorado e ajustado.`;
        } else if (isAdri) {
            coachIdentity = 'Coach Adri Kern — Personal Trainer especializada em estética feminina e saúde.';
            coachTone = `- Tom feminino, empático, altamente motivacional e acolhedor. Use expressões de incentivo vibrantes ('maravilhosa', 'arrasou', 'orgulho da sua dedicação', 'bora pra cima').\n- Quando o resultado for ruim ou estagnado, acolha a dificuldade, mas cobre constância.\n- Quando for bom: comemore muito como se fosse parceira de treino dela.\n- SEMPRE transmita acolhimento e força.`;
        } else {
            coachIdentity = 'Coach Paulo Adriano — Fisiculturista natural e Personal Trainer de Elite.';
            coachTone = `- Você é um PROFESSOR com didática afiada. Explica de um jeito que qualquer pessoa entende.\n- Quando o resultado é ruim ou estagnado: não se mostra satisfeito, mas entende o momento. Ajusta a rota e mantém o aluno motivado.\n- Quando o resultado é bom: se empolga DE VERDADE. Fica informal, celebra.\n- SEMPRE transmita motivação. Mesmo nos feedbacks mais duros, o aluno precisa sair querendo treinar amanhã.`;
        }

        // ── 6. PLANO E MOMENTO ───────────────────────────────────────────────
        let isChallenge = false, isFichas = false, isBasico = false, isPremium = true, isFinalCheckIn = false;
        const isFirstCheckIn = !oldCheckInId && (!customOldPhotos?.length) && (!customCurrentPhotos?.length);

        if (user) {
            isChallenge = user.plan === 'CHALLENGE_21';
            isFichas    = ['FICHA_8S', 'FICHAS'].includes(user.plan);
            isBasico    = ['PERFORMANCE', 'standard', 'LOW_COST'].includes(user.plan);
            isPremium   = !isChallenge && !isFichas && !isBasico;
            const count = await prisma.checkIn.count({ where: { userId: user.id } });
            isFinalCheckIn = (isChallenge || isFichas) && count >= 2;
        }

        let planoLabel = 'CONSULTORIA PREMIUM', planoContexto = 'Acompanhamento individualizado 1 a 1. Check-ins a cada 15 dias. Análise completa e personalizada.';
        if (isChallenge) { planoLabel = 'DESAFIO 21 DIAS';            planoContexto = 'Ciclo curto de emagrecimento. Foque em mudanças visíveis de composição.'; }
        if (isFichas)    { planoLabel = 'FICHAS DE TREINO 8 SEMANAS'; planoContexto = 'Ciclo de 56 dias. Cobrar mudanças reais de corpo.'; }
        if (isBasico)    { planoLabel = 'PLANO BÁSICO';               planoContexto = 'Acompanhamento mensal. Análise objetiva e direta.'; }

        const blocoAnamnese = (isPremium && anamnese) ? `\n── ANAMNESE COMPLETA (PREMIUM) ──\n- Frequência: ${anamnese.frequencia}x/sem | Tempo: ${anamnese.tempoDisponivel}min\n- Limitações: ${anamnese.limitacoes?.join(', ') || 'Nenhuma'}\n- Objetivo: ${anamnese.objetivo || user?.goal || 'Estética Geral'}\n- Equipamentos: ${anamnese.equipamentos?.join(', ') || 'Academia completa'}\nCruze esses dados com o que você vê nas fotos de forma natural.` : '';

        // ✅ CORREÇÃO: contextText agora entra em AMBOS os modos
        const blocoContexto = contextText?.trim()
            ? `\n── DIRECIONAMENTO DO COACH (PRIORIDADE ALTA) ──\n"${contextText.trim()}"\nPriorize isso na análise. Adapte o texto para que esse ponto fique em destaque.`
            : '';

        const blocoMomento = isFirstCheckIn ? `
── MOMENTO: PONTO DE PARTIDA (DIA 01) ──
Primeiro registro visual. Não existe "antes" para comparar.
- Faça um raio-X honesto do corpo atual.
- Aponte pontos fortes e o que vamos atacar primeiro.
- Dê expectativas realistas.
- NÃO fale em "evolução" ou "melhora".
${blocoContexto}` : `
── MOMENTO: COMPARATIVO DE EVOLUÇÃO ──
Fotos ATUAIS e ANTERIORES do mesmo aluno (atuais primeiro).
- Compare ângulo por ângulo com linguagem acessível.
- Se houve evolução: celebre e seja específico.
- Se não houve mudança: seja honesto e construtivo.
- Se houve piora: aborde com empatia. Nunca desanime.
- NÃO invente evolução que não existe.
${blocoContexto}`;

        const blocoUpsell = (isFinalCheckIn && (isChallenge || isFichas)) ? `\n── TRANSIÇÃO (UPSELL NATURAL) ──\nAluno finalizou o ciclo "${planoLabel}".\n- Parabenize genuinamente.\n- Aponte 2-3 pontos que precisam de acompanhamento mais próximo.\n- Conecte naturalmente com a Consultoria Premium.\n- Tom de oportunidade, nunca de vendedor.` : `\n── SEM UPSELL ──\nNÃO faça nenhuma oferta ou menção a outros planos.`;

        // ── 7. PROMPT BASE ───────────────────────────────────────────────────
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

        // ── 8. PROMPT FINAL ──────────────────────────────────────────────────
        const customPrompt = requestingCoach?.aiCheckinPrompt?.trim() ?? '';
        const promptMode   = requestingCoach?.aiPromptMode ?? 'ADD';
        let finalPrompt: string;

        if (customPrompt && promptMode === 'REPLACE') {
            finalPrompt = `${customPrompt}\n\n═══════════════════════════════════════════════════\nDADOS DO ALUNO (INJETADOS AUTOMATICAMENTE)\n═══════════════════════════════════════════════════\n- Nome: ${user?.name || 'Aluno'}\n- Peso atual: ${currentWeight ? currentWeight + ' kg' : 'Não informado'}\n${oldWeight ? `- Peso anterior: ${oldWeight} kg\n` : ''}- Comentário do aluno: "${userFeedback || 'Nenhum'}"\n${blocoContexto}\n\nOBRIGATÓRIO: termine assinando EXATAMENTE:\n${signatureBlock}`;
        } else if (customPrompt && promptMode === 'ADD') {
            finalPrompt = `${promptBase}\n\n═══════════════════════════════════════════════════\nDIRECIONAMENTO PERSONALIZADO DO COACH\n═══════════════════════════════════════════════════\n${customPrompt}`;
        } else {
            finalPrompt = promptBase;
        }

        // ── 9. FOTOS ─────────────────────────────────────────────────────────
        let allPhotoUrls: string[] = [];
        if (customCurrentPhotos?.length) {
            allPhotoUrls = [...customCurrentPhotos];
        } else if (checkIn) {
            allPhotoUrls = [checkIn.photoFront, checkIn.photoSide, checkIn.photoBack, ...(checkIn.extraPhotos || [])];
        }
        if (customOldPhotos?.length) {
            allPhotoUrls = [...allPhotoUrls, ...customOldPhotos];
        } else if (oldCheckIn) {
            allPhotoUrls.push(oldCheckIn.photoFront, oldCheckIn.photoSide, oldCheckIn.photoBack);
        }
        const validUrls = allPhotoUrls.filter(Boolean) as string[];
        if (!validUrls.length) throw new Error('Nenhuma imagem válida para processar.');

        // ── 10. CHAMADA AO MODELO ESCOLHIDO ─────────────────────────────────
        let analysisText = '';

        if (selectedModel === 'gemini-flash' || selectedModel === 'gemini-pro') {
            const geminiId   = selectedModel === 'gemini-flash' ? 'gemini-2.5-flash' : 'gemini-2.5-pro';
            const imageParts = (await Promise.all(validUrls.map(imageUrlToBase64))).filter(Boolean);
            if (!imageParts.length) throw new Error('Falha ao processar imagens para o Gemini.');
            analysisText = await callGemini(geminiId, finalPrompt, imageParts);
        } else if (selectedModel === 'claude-haiku') {
            const rawImages = (await Promise.all(validUrls.map(imageUrlToRawBase64))).filter(Boolean) as Array<{ data: string; mimeType: string }>;
            if (!rawImages.length) throw new Error('Falha ao processar imagens para o Claude.');
            analysisText = await callClaude(finalPrompt, rawImages);
        } else if (selectedModel === 'gpt-4o-mini') {
            const rawImages = (await Promise.all(validUrls.map(imageUrlToRawBase64))).filter(Boolean) as Array<{ data: string; mimeType: string }>;
            if (!rawImages.length) throw new Error('Falha ao processar imagens para o GPT.');
            analysisText = await callGPT(finalPrompt, rawImages);
        }

        if (!analysisText) {
            return NextResponse.json(
                { error: 'ai_unavailable', message: 'Motor de IA indisponível. Tente novamente em alguns instantes.' },
                { status: 503 }
            );
        }

        // ── 11. LOCK ─────────────────────────────────────────────────────────
        if (checkInId) {
            await prisma.checkIn.update({
                where: { id: checkInId },
                data:  { aiEvaluatedAt: new Date() },
            }).catch(e => console.warn('⚠️ Falha ao gravar aiEvaluatedAt:', e.message));
        }

        return NextResponse.json({ analysis: analysisText, isFinal: isFinalCheckIn, modelUsed: MODEL_LABELS[selectedModel] });

    } catch (error: any) {
        console.error('❌ Erro FATAL evaluate-checkin:', error);
        return NextResponse.json({ error: 'Falha interna no servidor', details: error.message }, { status: 500 });
    }
}