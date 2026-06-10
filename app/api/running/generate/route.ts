import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// POST /api/running/generate
// Body: { userId: string }
// Admin chama isso após anamnese preenchida para gerar o protocolo via IA
export async function POST(req: NextRequest) {
  try {
    const { userId } = await req.json();

    const anamnese = await prisma.runningAnamnese.findUnique({
      where: { userId },
      include: { user: { select: { name: true, gender: true } } },
    });

    if (!anamnese || !anamnese.filled) {
      return NextResponse.json(
        { error: 'Anamnese de corrida não preenchida' },
        { status: 400 }
      );
    }

    const prompt = buildPrompt(anamnese);

    const response = await client.messages.create({
      model: 'claude-opus-4-6',
      max_tokens: 1024,
      messages: [{ role: 'user', content: prompt }],
    });

    const raw = response.content[0].type === 'text' ? response.content[0].text : '';

    // Remove blocos de código markdown se existirem
    const clean = raw.replace(/```json|```/g, '').trim();
    const result = JSON.parse(clean);

    return NextResponse.json({
      suggestion: result,
      promptSnapshot: prompt,
    });

  } catch (error) {
    console.error('[running-generate]', error);
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
  }
}

function buildPrompt(anamnese: any): string {
  return `Você é um especialista em corrida e prescrição de treinamento aeróbico.
Com base na anamnese abaixo, defina o protocolo de corrida ideal para este aluno.

ANAMNESE:
- Nome: ${anamnese.user.name}
- Gênero: ${anamnese.user.gender ?? 'Não informado'}
- Experiência com corrida: ${anamnese.runningExperience} ${anamnese.timeStopped ? `(parado há ${anamnese.timeStopped})` : ''}
- Distância máxima anterior: ${anamnese.maxDistanceBefore ?? 'Não informado'}
- Frequência atual de treino: ${anamnese.weeklyFrequencyNow}x/semana
- Consegue caminhar 30min: ${anamnese.canWalk30min ? 'Sim' : 'Não'}
- Consegue trotar 5min: ${anamnese.canJog5min ? 'Sim' : 'Não'}
- Dificuldade respiratória: ${anamnese.breathingDifficulty}
- Autoavaliação condicionamento (1-5): ${anamnese.fitnessLevel}
- Lesões: ${anamnese.injuries?.join(', ') || 'Nenhuma'}
- Condição cardíaca: ${anamnese.heartCondition ? 'Sim' : 'Não'}
- Problema articular: ${anamnese.jointIssues ? 'Sim' : 'Não'}
- Liberação médica: ${anamnese.medicalClearance}
- Objetivo: ${anamnese.runningGoal}
- Prazo: ${anamnese.goalDeadline ?? 'Não informado'}
- Dias disponíveis: ${anamnese.availableDays?.join(', ')}
- Horário preferido: ${anamnese.preferredTime}
- Local de treino: ${anamnese.trainingLocation}
- Tem tênis adequado: ${anamnese.hasProperShoes}
- Qualidade do sono: ${anamnese.sleepQuality}
- Dores durante caminhada: ${anamnese.bodyPainDuringWalk ?? 'Nenhuma'}

O protocolo base tem 5 blocos:
- Bloco 1 (Semanas 1-2): Adaptação
- Bloco 2 (Semanas 3-4): Resistência base
- Bloco 3 (Semanas 5-6): Sustentar ritmo
- Bloco 4 (Semana 7): Pré-performance
- Bloco 5 (Semana 8): O 5K

Responda APENAS com um JSON válido, sem nenhum texto adicional, sem markdown:
{
  "startBlock": <número 1 a 5>,
  "startWeek": <número 1 a 8>,
  "customSpeeds": {
    "z2": <velocidade esteira km/h>,
    "z3": <velocidade esteira km/h>,
    "z4": <velocidade esteira km/h>,
    "z5": <velocidade esteira km/h>
  },
  "adaptations": "<string com adaptações específicas ou null>",
  "customNotes": "<string com observações personalizadas para o coach revisar>"
}`;
}