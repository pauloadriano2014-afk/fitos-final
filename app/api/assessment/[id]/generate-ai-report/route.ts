import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import Anthropic from '@anthropic-ai/sdk';

const prisma = new PrismaClient();
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export const dynamic = 'force-dynamic';

async function fetchImageAsBase64(url: string): Promise<{ data: string; mediaType: string } | null> {
    if (!url) return null;
    try {
        const res = await fetch(url);
        if (!res.ok) return null;
        const arrayBuffer = await res.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        const contentType = res.headers.get('content-type') || 'image/jpeg';
        return { data: buffer.toString('base64'), mediaType: contentType };
    } catch (e) {
        console.error('Erro ao baixar foto para análise IA:', e);
        return null;
    }
}

const SYSTEM_PROMPT = `Você é um especialista em avaliação física e composição corporal, trabalhando para a PA ELITE TEAM, uma equipe de personal trainers e fisiculturismo natural no Brasil.

Você recebe fotos reais (frente, lado, costas) de um aluno junto com dados biométricos (peso, % de gordura, dobras cutâneas, idade, gênero). Sua tarefa é escrever uma análise técnica ALTAMENTE ESPECÍFICA para essa pessoa — nunca um texto genérico que serviria para qualquer aluno.

Regras obrigatórias:
- Baseie-se no que você REALMENTE VÊ nas fotos (volume muscular por grupo, proporções, simetria, definição) cruzado com os números fornecidos.
- Se o aluno já tem volume/massa considerável, isso deve aparecer explicitamente no texto (nada de tratá-lo como iniciante).
- Se o aluno é magro/iniciante, não invente volume que não existe nas fotos.
- Evite frases que serviriam para qualquer avaliação (ex: "excelente potencial estético" sem justificativa concreta baseada no que você vê).
- Tom: profissional, técnico, direto, mas motivador — como um laudo de avaliação física premium.
- Responda em português do Brasil.
- Responda APENAS com um JSON válido, sem markdown, sem texto antes ou depois, seguindo EXATAMENTE este schema:

{
  "diagnosticoEstetico": {
    "pontosFortes": ["string", "string", "string"],
    "pontosAtencao": ["string", "string"]
  },
  "prioridadesTreino": ["string", "string", "string"],
  "mapaDesenvolvimento": {
    "ombros": 0, "costas": 0, "bracos": 0, "gluteos": 0, "coxas": 0, "panturrilhas": 0
  },
  "analiseVisual": {
    "frontal": "string",
    "lateral": "string",
    "posterior": "string"
  },
  "objetivosEstrategicos": {
    "objetivoPrincipal": "string",
    "objetivosSecundarios": ["string", "string", "string"]
  },
  "conclusaoTecnica": "string"
}

"mapaDesenvolvimento" é uma nota de 0 a 10 para o nível de desenvolvimento visual de cada grupo muscular, baseada nas fotos.`;

export async function POST(req: Request, { params }: { params: { id: string } }) {
    try {
        const assessmentId = params.id;

        const assessment = await prisma.assessment.findUnique({
            where: { id: assessmentId },
            include: { user: true }
        });

        if (!assessment) {
            return NextResponse.json({ error: 'Avaliação não encontrada' }, { status: 404 });
        }

        const photos = Array.isArray(assessment.photos) ? assessment.photos.filter(p => p && p.trim() !== '') : [];
        if (photos.length === 0) {
            return NextResponse.json({ error: 'Esta avaliação não possui fotos para análise' }, { status: 400 });
        }

        const [frontImg, sideImg, backImg] = await Promise.all([
            fetchImageAsBase64(photos[0]),
            fetchImageAsBase64(photos[1]),
            fetchImageAsBase64(photos[2])
        ]);

        const gender = String((assessment.user as any)?.gender || (assessment.user as any)?.sexo || '').toUpperCase();
        const isFemale = gender.startsWith('F');

        const leanMass = assessment.bodyFat ? (assessment.weight * (1 - assessment.bodyFat / 100)).toFixed(1) : '--';

        const dadosTexto = `
Dados do aluno:
- Nome: ${(assessment.user as any)?.name || 'Aluno'}
- Gênero: ${isFemale ? 'Feminino' : 'Masculino'}
- Idade: ${assessment.age || 'não informada'}
- Peso: ${assessment.weight}kg
- % de Gordura: ${assessment.bodyFat ?? 'não calculado'}
- Massa magra estimada: ${leanMass}kg
- Dobras (mm): peitoral ${assessment.foldChest ?? '-'}, axilar ${assessment.foldAxillary ?? '-'}, tríceps ${assessment.foldTriceps ?? '-'}, subescapular ${assessment.foldSubscapular ?? '-'}, abdominal ${assessment.foldAbdominal ?? '-'}, supra-ilíaca ${assessment.foldSuprailiac ?? '-'}, coxa ${assessment.foldThigh ?? '-'}
- Fotos anexadas: ${photos.length}
`.trim();

        const imageBlocks: any[] = [];
        if (frontImg) imageBlocks.push({ type: 'image', source: { type: 'base64', media_type: frontImg.mediaType, data: frontImg.data } }, { type: 'text', text: '(foto acima: FRENTE)' });
        if (sideImg) imageBlocks.push({ type: 'image', source: { type: 'base64', media_type: sideImg.mediaType, data: sideImg.data } }, { type: 'text', text: '(foto acima: LADO)' });
        if (backImg) imageBlocks.push({ type: 'image', source: { type: 'base64', media_type: backImg.mediaType, data: backImg.data } }, { type: 'text', text: '(foto acima: COSTAS)' });

        const response = await anthropic.messages.create({
            model: 'claude-haiku-4-5',
            max_tokens: 1800,
            temperature: 0.3,
            system: SYSTEM_PROMPT,
            messages: [
                {
                    role: 'user',
                    content: [
                        { type: 'text', text: dadosTexto },
                        ...imageBlocks
                    ]
                }
            ]
        });

        const textBlock = response.content.find((b: any) => b.type === 'text') as any;
        if (!textBlock?.text) {
            return NextResponse.json({ error: 'Resposta da IA vazia' }, { status: 500 });
        }

        const cleanText = textBlock.text.replace(/```json|```/g, '').trim();
        let parsed: any;
        try {
            parsed = JSON.parse(cleanText);
        } catch (e) {
            console.error('Falha ao parsear JSON da IA:', cleanText);
            return NextResponse.json({ error: 'A IA retornou um formato inválido, tente novamente' }, { status: 500 });
        }

        const updated = await prisma.assessment.update({
            where: { id: assessmentId },
            data: {
                aiPontosFortes: parsed.diagnosticoEstetico?.pontosFortes || [],
                aiPontosAtencao: parsed.diagnosticoEstetico?.pontosAtencao || [],
                aiPrioridades: parsed.prioridadesTreino || [],
                aiMapaOmbros: parsed.mapaDesenvolvimento?.ombros ?? null,
                aiMapaCostas: parsed.mapaDesenvolvimento?.costas ?? null,
                aiMapaBracos: parsed.mapaDesenvolvimento?.bracos ?? null,
                aiMapaGluteos: parsed.mapaDesenvolvimento?.gluteos ?? null,
                aiMapaCoxas: parsed.mapaDesenvolvimento?.coxas ?? null,
                aiMapaPanturrilhas: parsed.mapaDesenvolvimento?.panturrilhas ?? null,
                aiAnaliseFrontal: parsed.analiseVisual?.frontal || null,
                aiAnaliseLateral: parsed.analiseVisual?.lateral || null,
                aiAnalisePosterior: parsed.analiseVisual?.posterior || null,
                aiObjetivoPrincipal: parsed.objetivosEstrategicos?.objetivoPrincipal || null,
                aiObjetivosSecundarios: parsed.objetivosEstrategicos?.objetivosSecundarios || [],
                aiConclusaoTecnica: parsed.conclusaoTecnica || null,
                aiGeneratedAt: new Date()
            }
        });

        return NextResponse.json({ success: true, assessment: updated });

    } catch (error: any) {
        console.error('Erro ao gerar laudo com IA:', error);
        return NextResponse.json({ error: error.message || 'Erro interno ao gerar laudo com IA' }, { status: 500 });
    }
}