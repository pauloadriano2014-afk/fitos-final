// app/api/assessment/[id]/generate-ai-report/route.ts
import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export const dynamic = 'force-dynamic';

// 🔥 DETECTA O FORMATO REAL DA IMAGEM PELOS BYTES — não confia no Content-Type do R2 🔥
function detectImageMediaType(buffer: Buffer): string {
    if (buffer.length >= 8 && buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4E && buffer[3] === 0x47) {
        return 'image/png';
    }
    if (buffer.length >= 3 && buffer[0] === 0xFF && buffer[1] === 0xD8 && buffer[2] === 0xFF) {
        return 'image/jpeg';
    }
    if (buffer.length >= 6 && buffer.toString('ascii', 0, 3) === 'GIF') {
        return 'image/gif';
    }
    if (buffer.length >= 12 && buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP') {
        return 'image/webp';
    }
    return 'image/jpeg';
}

async function fetchImageAsBase64(url: string): Promise<{ data: string; mediaType: string } | null> {
    if (!url) return null;
    try {
        const res = await fetch(url);
        if (!res.ok) return null;
        const arrayBuffer = await res.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        const mediaType = detectImageMediaType(buffer);
        return { data: buffer.toString('base64'), mediaType };
    } catch (e) {
        console.error('Erro ao baixar foto para análise IA:', e);
        return null;
    }
}

// 🔥 PROMPT ATUALIZADO: sem ancoragem em "fisiculturismo/elite" + sem meta-comentário de classificação 🔥
const SYSTEM_PROMPT = `Você é um especialista em avaliação física e composição corporal, prestando serviço para um personal trainer que atende alunos de perfis variados (desde iniciantes recreativos até, eventualmente, atletas avançados).

Você recebe fotos reais (frente, lado, costas) de um aluno junto com dados biométricos (peso, % de gordura, dobras cutâneas, idade, gênero). Sua tarefa é escrever uma análise técnica ALTAMENTE ESPECÍFICA e HONESTA sobre o físico DESSA pessoa.

⚠️ MUITO IMPORTANTE — QUEM VAI LER ESTE TEXTO: todo o conteúdo que você gerar será lido DIRETAMENTE PELO(A) PRÓPRIO(A) ALUNO(A) no laudo final, nunca por um coach ou terceiro. Escreva como um relatório profissional dirigido a essa pessoa — nunca como uma anotação interna explicando para um colega como/por que você classificou o físico dela.

Isso significa, na prática:
- NUNCA escreva frases que justifiquem ou expliquem sua classificação (ex.: "não há indicadores de preparação competitiva", "trata-se de aluno(a) com perfil X", "isso sugere um biótipo Y"). Fale sobre a pessoa e o caminho dela, não sobre a categoria em que você a encaixou.
- NUNCA compare a pessoa a categorias, rótulos ou benchmarks de forma clínica ("nível recreativo", "nível competitivo", "iniciante estruturado" etc.) — descreva o físico e o momento dela em linguagem natural, sem rotular tecnicamente o "nível".
- Escreva como se estivesse falando COM ela (ou SOBRE ela em tom de relatório pessoal), sempre no registro de quem está entregando um resultado a alguém que se importa com ele — acolhedor, honesto, tecnicamente sólido, motivador.

Regras adicionais obrigatórias:
- Julgue o desenvolvimento muscular e o contexto provável (iniciante, intermediário, avançado) SOMENTE pelo que você vê nas fotos e pelos números fornecidos, mas mantenha esse julgamento IMPLÍCITO na forma como você descreve o físico — nunca EXPLÍCITO como uma declaração de categoria.
- NÃO assuma que a pessoa é atleta, competidora ou fisiculturista a menos que o físico nas fotos deixe isso claramente evidente (volume muscular muito alto, definição muito baixa de gordura, simetria de padrão competitivo). A maioria dos alunos de um personal trainer são praticantes comuns buscando saúde, estética ou hipertrofia moderada — trate isso como o cenário padrão.
- Baseie-se no que você REALMENTE VÊ nas fotos (volume muscular por grupo, proporções, simetria, definição) cruzado com os números fornecidos.
- Se o aluno já tem volume/massa considerável, isso deve aparecer explicitamente no texto. Se é magro, iniciante ou mediano, descreva como tal — sem inflar nem diminuir o nível.
- Evite frases genéricas que serviriam para qualquer avaliação (ex.: "excelente potencial estético" sem justificativa concreta baseada no que você vê).
- Tom: profissional, técnico, direto, encorajador — como um laudo premium que a pessoa vai guardar e reler.
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

        const nomeAluno = (assessment.user as any)?.name || 'Aluno';

        const dadosTexto = `
Dados do aluno:
- Nome: ${nomeAluno}
- Gênero: ${isFemale ? 'Feminino' : 'Masculino'}
- Idade: ${assessment.age || 'não informada'}
- Peso: ${assessment.weight}kg
- % de Gordura: ${assessment.bodyFat ?? 'não calculado'}
- Massa magra estimada: ${leanMass}kg
- Dobras (mm): peitoral ${assessment.foldChest ?? '-'}, axilar ${assessment.foldAxillary ?? '-'}, tríceps ${assessment.foldTriceps ?? '-'}, subescapular ${assessment.foldSubscapular ?? '-'}, abdominal ${assessment.foldAbdominal ?? '-'}, supra-ilíaca ${assessment.foldSuprailiac ?? '-'}, coxa ${assessment.foldThigh ?? '-'}
- Fotos anexadas: ${photos.length}

Lembre-se: ${nomeAluno} vai ler este laudo diretamente. Escreva para ela(e), não sobre um "caso" que você está classificando para outro profissional.
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

// 🔥 Edição manual dos campos gerados, sem chamar a IA de novo 🔥
export async function PUT(req: Request, { params }: { params: { id: string } }) {
    try {
        const assessmentId = params.id;
        const body = await req.json();

        const toArray = (v: any) => Array.isArray(v) ? v.filter((x) => typeof x === 'string' && x.trim() !== '') : [];
        const toIntOrNull = (v: any) => {
            if (v === null || v === undefined || v === '') return null;
            const n = parseInt(String(v), 10);
            if (isNaN(n)) return null;
            return Math.max(0, Math.min(10, n));
        };

        const updated = await prisma.assessment.update({
            where: { id: assessmentId },
            data: {
                aiPontosFortes: toArray(body.aiPontosFortes),
                aiPontosAtencao: toArray(body.aiPontosAtencao),
                aiPrioridades: toArray(body.aiPrioridades),
                aiMapaOmbros: toIntOrNull(body.aiMapaOmbros),
                aiMapaCostas: toIntOrNull(body.aiMapaCostas),
                aiMapaBracos: toIntOrNull(body.aiMapaBracos),
                aiMapaGluteos: toIntOrNull(body.aiMapaGluteos),
                aiMapaCoxas: toIntOrNull(body.aiMapaCoxas),
                aiMapaPanturrilhas: toIntOrNull(body.aiMapaPanturrilhas),
                aiAnaliseFrontal: body.aiAnaliseFrontal || null,
                aiAnaliseLateral: body.aiAnaliseLateral || null,
                aiAnalisePosterior: body.aiAnalisePosterior || null,
                aiObjetivoPrincipal: body.aiObjetivoPrincipal || null,
                aiObjetivosSecundarios: toArray(body.aiObjetivosSecundarios),
                aiConclusaoTecnica: body.aiConclusaoTecnica || null,
                aiGeneratedAt: new Date()
            }
        });

        return NextResponse.json({ success: true, assessment: updated });
    } catch (error: any) {
        console.error('Erro ao salvar edição manual do diagnóstico IA:', error);
        return NextResponse.json({ error: error.message || 'Erro ao salvar edição' }, { status: 500 });
    }
}