// app/api/anamnese/route.ts — VERSÃO 2.0
// Suporta todos os campos da AnamneseScreen v4 (11 etapas) e destranca o User
import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export async function POST(req: Request) {
  try {
    const body = await req.json();

    const {
      // ── OBRIGATÓRIOS ──────────────────────────────────────────────────────
      userId, peso, altura, imc, aguaIdeal,
      objetivo, nivel, frequencia, tempoDisponivel,
      limitacoes, cirurgias, equipamentos,

      // ── TREINO ────────────────────────────────────────────────────────────
      trainFasted,

      // ── SAÚDE METABÓLICA ──────────────────────────────────────────────────
      healthConditions, healthConditionsObs,
      bariatric, bariatricType, bariatricTime, bariatricIntolerances,
      medications, medicationsObs,

      // ── DIGESTIVO + SONO + STRESS ─────────────────────────────────────────
      digestiveIssues, digestiveObs,
      sleepHours, sleepQuality, wakeHungry,
      stressLevel, stressEating,

      // ── CICLO MENSTRUAL ───────────────────────────────────────────────────
      cycleRegular, pmsSymptoms, pmsObs,

      // ── ROTINA ALIMENTAR ──────────────────────────────────────────────────
      mealsPerDay, wakeUpTime, sleepTime, workTime, trainTime,
      eatsOutPerWeek, budget, freeDays, freeWakeUpTime, freeSleepTime, freeTrainTime,

      // ── HÁBITOS ───────────────────────────────────────────────────────────
      waterIntake, alcoholFreq, coffeePerDay,
      smoker, eatSpeed, nightBinge,

      // ── HISTÓRICO DE DIETAS ───────────────────────────────────────────────
      triedDiets, dietWorked, dietHated, biggestChallenge,

      // ── PREFERÊNCIAS ─────────────────────────────────────────────────────
      allergies, foodPreferences, foodAversions, supplements, extraNotes,

    } = body;

    // Validação mínima
    if (!userId || !peso || !altura) {
      return NextResponse.json({ error: "Dados obrigatórios faltando (userId, peso, altura)." }, { status: 400 });
    }

    const novaAnamnese = await prisma.anamnese.create({
      data: {
        // ── OBRIGATÓRIOS ────────────────────────────────────────────────────
        userId,
        peso:           parseFloat(peso),
        altura:         parseFloat(altura),
        imc:            imc            ? parseFloat(imc)     : null,
        aguaIdeal:      aguaIdeal      ? parseFloat(aguaIdeal): null,
        objetivo:       objetivo       || 'Não informado',
        nivel:          nivel          || 'Iniciante',
        frequencia:     Number(frequencia)     || 3,
        tempoDisponivel:Number(tempoDisponivel) || 60,
        limitacoes:     Array.isArray(limitacoes)  ? limitacoes  : [],
        cirurgias:      Array.isArray(cirurgias)   ? cirurgias   : [],
        equipamentos:   Array.isArray(equipamentos)? equipamentos : [],

        // ── TREINO ──────────────────────────────────────────────────────────
        trainFasted: typeof trainFasted === 'boolean' ? trainFasted : null,

        // ── SAÚDE METABÓLICA ────────────────────────────────────────────────
        healthConditions:     Array.isArray(healthConditions)     ? healthConditions     : [],
        healthConditionsObs:  healthConditionsObs  || null,
        bariatric:            typeof bariatric === 'boolean'       ? bariatric            : null,
        bariatricType:        bariatricType        || null,
        bariatricTime:        bariatricTime        || null,
        bariatricIntolerances:Array.isArray(bariatricIntolerances) ? bariatricIntolerances: [],
        medications:          Array.isArray(medications)           ? medications          : [],
        medicationsObs:       medicationsObs       || null,

        // ── DIGESTIVO + SONO + STRESS ────────────────────────────────────────
        digestiveIssues: Array.isArray(digestiveIssues) ? digestiveIssues : [],
        digestiveObs:    digestiveObs  || null,
        sleepHours:      sleepHours    || null,
        sleepQuality:    sleepQuality  || null,
        wakeHungry:      typeof wakeHungry  === 'boolean' ? wakeHungry  : null,
        stressLevel:     stressLevel   ? Number(stressLevel) : null,
        stressEating:    typeof stressEating === 'boolean' ? stressEating : null,

        // ── CICLO MENSTRUAL ──────────────────────────────────────────────────
        cycleRegular: cycleRegular || null,
        pmsSymptoms:  Array.isArray(pmsSymptoms) ? pmsSymptoms : [],
        pmsObs:       pmsObs || null,

        // ── ROTINA ALIMENTAR ─────────────────────────────────────────────────
        mealsPerDay:    mealsPerDay ? Number(mealsPerDay) : null,
        wakeUpTime:     wakeUpTime  || null,
        sleepTime:      sleepTime   || null,
        workTime:       workTime    || null,
        trainTime:      trainTime   || null,
        eatsOutPerWeek: eatsOutPerWeek || null,
        budget:         budget         || null,
        freeDays:       Array.isArray(freeDays) ? freeDays : [],
        freeWakeUpTime: freeWakeUpTime || null,
        freeSleepTime:  freeSleepTime  || null,
        freeTrainTime:  freeTrainTime  || null,

        // ── HÁBITOS ──────────────────────────────────────────────────────────
        waterIntake:  waterIntake  || null,
        alcoholFreq:  alcoholFreq  || null,
        coffeePerDay: coffeePerDay || null,
        smoker:       typeof smoker === 'boolean' ? smoker : null,
        eatSpeed:     eatSpeed     || null,
        nightBinge:   nightBinge   || null,

        // ── HISTÓRICO DE DIETAS ──────────────────────────────────────────────
        triedDiets:       Array.isArray(triedDiets) ? triedDiets : [],
        dietWorked:       dietWorked       || null,
        dietHated:        dietHated        || null,
        biggestChallenge: biggestChallenge || null,

        // ── PREFERÊNCIAS ─────────────────────────────────────────────────────
        allergies:       allergies       || null,
        foodPreferences: foodPreferences || null,
        foodAversions:   foodAversions   || null,
        supplements:     supplements     || null,
        extraNotes:      extraNotes      || null,
      },
    });

    // 🔥 DESTRAVAMENTO DE ELITE: Tira a restrição do aluno assim que salva
    await prisma.user.update({
      where: { id: userId },
      data: { anamnesePendente: false }
    });

    return NextResponse.json(novaAnamnese);

  } catch (error: any) {
    console.error('[POST /api/anamnese]', error);
    return NextResponse.json({ error: 'Erro ao salvar: ' + error.message }, { status: 500 });
  }
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const userId = searchParams.get('userId');

  if (!userId) return NextResponse.json({ error: 'UserId necessário' }, { status: 400 });

  try {
    const anamnese = await prisma.anamnese.findFirst({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
    return NextResponse.json(anamnese);
  } catch (error) {
    console.error('[GET /api/anamnese]', error);
    return NextResponse.json({ error: 'Erro ao buscar anamnese' }, { status: 500 });
  }
}