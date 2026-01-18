import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { GoogleGenerativeAI } from '@google/generative-ai';

const prisma = new PrismaClient();
const apiKey = process.env.GEMINI_API_KEY;
const genAI = apiKey ? new GoogleGenerativeAI(apiKey) : null;

export const maxDuration = 60; 
export const dynamic = 'force-dynamic';

function determinarDivisao(dias: number, nivel: string) {
  const n = nivel?.toLowerCase() || 'iniciante';
  if (dias <= 2) return `FULLBODY (Corpo todo no mesmo dia).`;
  if (dias === 3) return `ABC (A: Pernas, B: Empurrar, C: Puxar).`;
  if (dias === 4) return `ABCD (A: Quads, B: Costas/Bíceps, C: Posterior/Glúteo, D: Peito/Ombros/Tríceps).`;
  if (dias >= 5) return n.includes('iniciante') ? `ABC Sequencial (A-B-C-A-B...).` : `ABCDE Isolado.`;
  return "Adaptativo";
}

export async function POST(req: Request) {
  try {
    if (!genAI) throw new Error("API Key inválida.");
    const { userId } = await req.json();

    // 1. Busca Dados do Aluno
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { anamneses: { orderBy: { createdAt: 'desc' }, take: 1 } }
    });

    if (!user || user.anamneses.length === 0) return NextResponse.json({ error: "Anamnese 404" }, { status: 404 });
    const anamnese = user.anamneses[0];

    // 2. Busca IDs reais dos exercícios para não quebrar o banco
    const allExercises = await prisma.exercise.findMany({
      select: { id: true, name: true, category: true }
    });
    // Cria mapa para busca rápida (Nome -> ID)
    const exerciseMap = new Map(allExercises.map(e => [e.name.toLowerCase().trim(), e.id]));
    const listString = allExercises.map(e => `- ${e.name} (${e.category})`).join('\n');

    // 3. Prompt
    const prompt = `
      Crie um treino JSON para: ${anamnese.nivel}, ${anamnese.objetivo}, ${anamnese.diasTreino} dias.
      Lesões: ${anamnese.limitacoes}.
      Divisão: ${determinarDivisao(anamnese.diasTreino, anamnese.nivel)}
      
      USE APENAS ESTES EXERCÍCIOS:
      ${listString}

      JSON OUTPUT:
      {
        "name": "Nome do Treino",
        "exercises": [
          { "day": "A", "name": "Nome da Lista", "sets": 3, "reps": "12", "technique": "Normal" }
        ]
      }
    `;

    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
    const result = await model.generateContent(prompt);
    const text = result.response.text().replace(/```json/g, '').replace(/```/g, '').trim();
    const cleanJson = text.substring(text.indexOf('{'), text.lastIndexOf('}') + 1);
    const plan = JSON.parse(cleanJson);

    // 4. Salvar (Vinculando com IDs reais e salvando o DIA)
    await prisma.workout.deleteMany({ where: { userId } });

    const newWorkout = await prisma.workout.create({
      data: {
        userId,
        name: plan.name,
        goal: anamnese.objetivo,
        level: anamnese.nivel,
        exercises: {
          create: plan.exercises.map((ex: any) => {
            // Tenta achar o ID. Se a IA errar o nome por pouco, pega o primeiro da lista como fallback de segurança.
            const realId = exerciseMap.get(ex.name.toLowerCase().trim()) || allExercises[0].id;
            
            return {
              exerciseId: realId,
              day: ex.day || "A", // 👇 AQUI O SEGREDO: Salvando o dia gerado pela IA
              sets: Number(ex.sets),
              reps: String(ex.reps),
              notes: ex.technique
            };
          })
        }
      }
    });

    return NextResponse.json({ success: true, workoutId: newWorkout.id });

  } catch (error: any) {
    console.error("Erro IA:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}