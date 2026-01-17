import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { GoogleGenerativeAI } from '@google/generative-ai';

const prisma = new PrismaClient();

// Se não tiver chave, nem tenta iniciar a IA para não crashar feio
const apiKey = process.env.GEMINI_API_KEY;
const genAI = apiKey ? new GoogleGenerativeAI(apiKey) : null;

export const maxDuration = 60; 
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  try {
    // 0. VERIFICAÇÃO DE SEGURANÇA BÁSICA
    if (!genAI) {
      console.error("CRÍTICO: GEMINI_API_KEY não configurada no servidor.");
      return NextResponse.json({ error: "Erro de configuração de servidor (API KEY)." }, { status: 500 });
    }

    const body = await req.json();
    const { userId } = body;

    if (!userId) {
      return NextResponse.json({ error: "ID do usuário obrigatório" }, { status: 400 });
    }

    console.log(`--- INICIANDO GERAÇÃO PARA: ${userId} ---`);

    // 1. BUSCA DADOS
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { anamneses: { orderBy: { createdAt: 'desc' }, take: 1 } }
    });

    if (!user || user.anamneses.length === 0) {
      return NextResponse.json({ error: "Anamnese não encontrada." }, { status: 404 });
    }

    const anamnese = user.anamneses[0];

    // 2. BUSCA EXERCÍCIOS (Limitado para não estourar token se o banco for gigante)
    // Pegamos apenas nome e categoria para economizar tokens
    const allExercises = await prisma.exercise.findMany({
      select: { name: true, category: true }
    });

    if (allExercises.length === 0) {
        return NextResponse.json({ error: "Banco de exercícios vazio. Rode o seed." }, { status: 500 });
    }

    const exercisesList = allExercises.map(e => `- ${e.name} (${e.category})`).join('\n');

    // 3. PROMPT OTIMIZADO
    const prompt = `
      Você é a FITO AI. Crie um treino periodizado JSON.
      
      ALUNO:
      - Nível: ${anamnese.experiencia}
      - Objetivo: ${anamnese.objetivo}
      - Dias: ${anamnese.diasTreino}/semana
      - Tempo: ${anamnese.tempoDisponivel}min
      - Limitações: ${anamnese.limitacoes || "Nenhuma"}

      ACERVO (USE APENAS ESTES NOMES):
      ${exercisesList}

      REGRAS:
      - 3 dias: A (Perna), B (Peito/Ombro/Tri), C (Costa/Bi/Abs).
      - 4 dias: A (Perna Quads), B (Superior 1), C (Perna Post), D (Superior 2).
      - 5 dias: ABCDE ou ABC Sequencial.
      - Lesão Joelho? Substitua agachamento por Leg Press.
      - Lesão Ombro? Evite desenvolvimento por trás.

      SAÍDA OBRIGATÓRIA (JSON PURO):
      {
        "name": "Nome do Treino",
        "goal": "${anamnese.objetivo}",
        "level": "${anamnese.experiencia}",
        "exercises": [
          {
            "name": "Nome Exato da Lista",
            "sets": 3,
            "reps": "12",
            "rest": 60,
            "technique": "Normal",
            "day": "A",
            "muscleGroup": "Peito",
            "observations": ""
          }
        ]
      }
    `;

    // 4. GERAÇÃO
    console.log("Enviando prompt para o Gemini...");
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
    
    const result = await model.generateContent(prompt);
    const response = await result.response;
    const rawText = response.text();

    console.log("Resposta recebida da IA (Primeiros 100 chars):", rawText.substring(0, 100));

    // 5. LIMPEZA CIRÚRGICA DO JSON (A CORREÇÃO DO ERRO <)
    // Encontra onde começa o primeiro '{' e onde termina o último '}'
    const jsonStartIndex = rawText.indexOf('{');
    const jsonEndIndex = rawText.lastIndexOf('}') + 1;

    if (jsonStartIndex === -1 || jsonEndIndex === -1) {
        console.error("IA não retornou um JSON válido:", rawText);
        throw new Error("Formato inválido da IA");
    }

    const cleanJson = rawText.substring(jsonStartIndex, jsonEndIndex);
    let workoutPlan;
    
    try {
        workoutPlan = JSON.parse(cleanJson);
    } catch (e) {
        console.error("Falha ao fazer parse do JSON limpo:", cleanJson);
        throw new Error("Erro de Sintaxe no JSON da IA");
    }

    // 6. SALVA NO BANCO
    // Limpa treino anterior para não acumular lixo no teste
    await prisma.workout.deleteMany({ where: { userId } });

    const newWorkout = await prisma.workout.create({
      data: {
        userId: userId,
        name: workoutPlan.name || "Treino Personalizado",
        goal: workoutPlan.goal,
        level: workoutPlan.level,
        exercises: {
          create: workoutPlan.exercises.map((ex: any) => ({
            name: ex.name, 
            sets: Number(ex.sets) || 3,
            reps: String(ex.reps) || "12",
            rest: Number(ex.rest) || 60,
            technique: ex.technique || "Normal",
            day: ex.day || "A",
            muscleGroup: ex.muscleGroup || "Geral",
            observations: ex.observations || ""
          }))
        }
      }
    });

    console.log("Treino salvo com sucesso! ID:", newWorkout.id);
    return NextResponse.json({ success: true, workoutId: newWorkout.id });

  } catch (error: any) {
    console.error("ERRO FATAL NO BACKEND:", error);
    // Retorna erro JSON legível, não HTML
    return NextResponse.json(
        { error: error.message || "Erro interno no servidor" }, 
        { status: 500 }
    );
  }
}