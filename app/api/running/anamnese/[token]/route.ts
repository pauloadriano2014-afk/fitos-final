import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

// GET — Formulário público busca os dados pelo token (para pré-popular se já preencheu)
export async function GET(
  req: NextRequest,
  { params }: { params: { token: string } }
) {
  try {
    const anamnese = await prisma.runningAnamnese.findUnique({
      where: { token: params.token },
      include: { user: { select: { name: true } } },
    });

    if (!anamnese) {
      return NextResponse.json({ error: 'Link inválido ou expirado' }, { status: 404 });
    }

    return NextResponse.json(anamnese);

  } catch (error) {
    console.error('[running-anamnese-get]', error);
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
  }
}

// POST — Aluno submete o formulário
export async function POST(
  req: NextRequest,
  { params }: { params: { token: string } }
) {
  try {
    const body = await req.json();

    const anamnese = await prisma.runningAnamnese.findUnique({
      where: { token: params.token },
    });

    if (!anamnese) {
      return NextResponse.json({ error: 'Link inválido ou expirado' }, { status: 404 });
    }

    const updated = await prisma.runningAnamnese.update({
      where: { token: params.token },
      data: {
        // 1. Experiência
        runningExperience:  body.runningExperience  ?? anamnese.runningExperience,
        timeStopped:        body.timeStopped        ?? anamnese.timeStopped,
        maxDistanceBefore:  body.maxDistanceBefore  ?? anamnese.maxDistanceBefore,
        weeklyFrequencyNow: body.weeklyFrequencyNow ?? anamnese.weeklyFrequencyNow,
        completedRaces:     body.completedRaces     ?? anamnese.completedRaces,
        racesDescription:   body.racesDescription   ?? anamnese.racesDescription,

        // 2. Condicionamento
        canWalk30min:        body.canWalk30min        ?? anamnese.canWalk30min,
        canJog5min:          body.canJog5min          ?? anamnese.canJog5min,
        breathingDifficulty: body.breathingDifficulty ?? anamnese.breathingDifficulty,
        fitnessLevel:        body.fitnessLevel        ?? anamnese.fitnessLevel,

        // 3. Saúde
        injuries:         body.injuries         ?? anamnese.injuries,
        heartCondition:   body.heartCondition   ?? anamnese.heartCondition,
        jointIssues:      body.jointIssues      ?? anamnese.jointIssues,
        medications:      body.medications      ?? anamnese.medications,
        medicalClearance: body.medicalClearance ?? anamnese.medicalClearance,

        // 4. Objetivo
        runningGoal:      body.runningGoal      ?? anamnese.runningGoal,
        goalDeadline:     body.goalDeadline     ?? anamnese.goalDeadline,
        previousFailures: body.previousFailures ?? anamnese.previousFailures,

        // 5. Rotina
        availableDays:    body.availableDays    ?? anamnese.availableDays,
        preferredTime:    body.preferredTime    ?? anamnese.preferredTime,
        trainingLocation: body.trainingLocation ?? anamnese.trainingLocation,
        hasProperShoes:   body.hasProperShoes   ?? anamnese.hasProperShoes,

        // 6. Físico
        weight:             body.weight             ?? anamnese.weight,
        height:             body.height             ?? anamnese.height,
        bodyPainDuringWalk: body.bodyPainDuringWalk ?? anamnese.bodyPainDuringWalk,
        sleepQuality:       body.sleepQuality       ?? anamnese.sleepQuality,

        // Controle
        filled:   true,
        filledAt: new Date(),
      },
    });

    return NextResponse.json({ success: true, anamneseId: updated.id });

  } catch (error) {
    console.error('[running-anamnese-post]', error);
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
  }
}