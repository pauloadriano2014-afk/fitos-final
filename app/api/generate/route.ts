import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { GoogleGenerativeAI } from '@google/generative-ai';

const prisma = new PrismaClient();

// Inicia a IA de forma segura
const apiKey = process.env.GEMINI_API_KEY;
const genAI = apiKey ? new GoogleGenerativeAI(apiKey) : null;

// Aumenta o tempo limite de execução (importante para IA)
export const maxDuration = 60; 
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  try {
    if (!genAI) {
      console.error("CRÍTICO: GEMINI_API_KEY ausente.");
      return NextResponse.json({ error: "Configuração de servidor inválida." }, { status: 500 });
    }

    const { userId } = await req.json();

    // 1. Busca dados do Aluno
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { anamneses: { orderBy: { createdAt: 'desc' }, take: 1 } }
    });

    if (!user || user.anamneses.length === 0) {
      return NextResponse.json({ error: "Anamnese não encontrada." }, { status: 404 });
    }

    const anamnese = user.anamneses[0];

    // 2. Busca Exercícios (Apenas Nomes para economizar tokens)
    const allExercises = await prisma.exercise.findMany({
      select: { name: true, category: true }
    });

    // Agrupa por categoria para a IA entender melhor o contexto
    const exercisesList = allExercises.map(e => `- ${e.name} (${e.category})`).join('\n');

    // 3. Prompt (Mantive suas regras de negócio)
    const prompt = `
      Você é a FITO AI. Crie um treino JSON usando APENAS os exercícios da lista abaixo.
      
      ALUNO:
      - Nível: ${anamnese.experiencia}
      - Objetivo: ${anamnese.objetivo}
      - Dias: ${anamnese.diasTreino}/semana
      - Tempo: ${anamnese.tempoDisponivel}min
      - Limitações: ${anamnese.limitacoes || "Nenhuma"}

      LISTA MESTRA DE EXERCÍCIOS (USE APENAS ESTES NOMES EXATOS):
      ${exercisesList}

      REGRAS:
      - 3 dias: A (Perna), B (Peito/Ombro/Tri), C (Costa/Bi/Abs).
      - 4 dias: A (Perna Quads), B (Superior 1), C (Perna Post), D (Superior 2).
      - 5 dias: ABC Sequencial (Iniciante) ou ABCDE (Avançado).
      - Respeite as lesões citadas.

      FORMATO DE RESPOSTA OBRIGATÓRIO (JSON PURO):
      {
        "name": "Nome do Protocolo",
        "goal": "${anamnese.objetivo}",
        "level": "${anamnese.experiencia}",
        "exercises": [
          {
            "name": "Nome Exato da Lista Mestra",
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

    console.log("Enviando prompt para IA...");
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
    
    const result = await model.generateContent(prompt);
    const response = await result.response;
    const rawText = response.text();

    console.log("Resposta IA recebida. Tamanho:", rawText.length);

    // 4. Limpeza Cirúrgica do JSON
    const jsonStartIndex = rawText.indexOf('{');
    const jsonEndIndex = rawText.lastIndexOf('}') + 1;

    if (jsonStartIndex === -1 || jsonEndIndex === -1) {
        throw new Error("IA não retornou um JSON válido.");
    }

    const cleanJson = rawText.substring(jsonStartIndex, jsonEndIndex);
    const workoutPlan = JSON.parse(cleanJson);

    // 5. Salvar no Banco
    // Limpa treino anterior para evitar duplicidade
    await prisma.workout.deleteMany({ where: { userId } });

    const newWorkout = await prisma.workout.create({
      data: {
        userId: userId,
        name: workoutPlan.name || "Treino Personalizado",
        goal: workoutPlan.goal,
        level: workoutPlan.level,
        exercises: {
          create: workoutPlan.exercises.map((ex: any) => ({
            name: ex.name, // Nome vindo da IA
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

    console.log("Treino salvo com ID:", newWorkout.id);
    return NextResponse.json({ success: true, workoutId: newWorkout.id });

  } catch (error: any) {
    console.error("ERRO NO BACKEND:", error);
    // Retorna JSON de erro, nunca HTML, para o App não crashar com "<"
    return NextResponse.json({ error: error.message || "Erro interno." }, { status: 500 });
  }
}