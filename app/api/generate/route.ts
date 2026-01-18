import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { GoogleGenerativeAI } from '@google/generative-ai';

const prisma = new PrismaClient();
const apiKey = process.env.GEMINI_API_KEY;
const genAI = apiKey ? new GoogleGenerativeAI(apiKey) : null;

export const maxDuration = 60; 
export const dynamic = 'force-dynamic';

// --- SUAS REGRAS DE COMBINAÇÃO TRADUZIDAS EM LÓGICA ---
function determinarDivisao(dias: number, nivel: string) {
  const n = nivel?.toLowerCase() || 'iniciante';

  if (dias <= 2) {
    return `FULLBODY: Treino único para o corpo todo. Foco em multiarticulares (Agachamento, Supino, Puxada).`;
  }
  
  if (dias === 3) {
    return `
      DIVISÃO ABC (3 Dias):
      - Treino A: Pernas Completas (Quadríceps, Posterior, Glúteo) + Panturrilha.
      - Treino B: Empurrar (Peito, Ombros, Tríceps).
      - Treino C: Puxar (Costas, Bíceps) + Abdômen.
    `;
  }

  if (dias === 4) {
    return `
      DIVISÃO ABCD (4 Dias - Não Sequencial):
      - Treino A: Pernas Foco Anterior (Quadríceps) + Glúteos.
      - Treino B: Superior 1 (Costas, Bíceps, Abdômen).
      - Treino C: Pernas Foco Posterior + Panturrilha.
      - Treino D: Superior 2 (Peito, Ombros, Tríceps).
    `;
  }

  if (dias >= 5) {
    if (n.includes('iniciante')) {
      return `
        DIVISÃO ABC SEQUENCIAL (Frequência Alta):
        - Estrutura: A-B-C-A-B... (Repetindo o ciclo).
        - Treino A: Pernas.
        - Treino B: Empurrar (Peito/Ombro/Tríceps).
        - Treino C: Puxar (Costas/Bíceps).
      `;
    } else {
      // Intermediário/Avançado
      return `
        DIVISÃO ABCDE (Isolada - Volume Alto):
        - Treino A: Quadríceps e Panturrilha.
        - Treino B: Peito e Tríceps.
        - Treino C: Costas e Bíceps.
        - Treino D: Ombros e Abdômen.
        - Treino E: Posteriores de Coxa e Glúteos.
      `;
    }
  }

  return "FULLBODY Adaptativo";
}

export async function POST(req: Request) {
  try {
    if (!genAI) throw new Error("API Key do Gemini não configurada.");

    const { userId } = await req.json();

    // 1. Busca Anamnese
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { anamneses: { orderBy: { createdAt: 'desc' }, take: 1 } }
    });

    if (!user || user.anamneses.length === 0) {
      return NextResponse.json({ error: "Preencha a anamnese primeiro." }, { status: 404 });
    }

    const anamnese = user.anamneses[0];
    
    // --- APLICAÇÃO DA LÓGICA DE DIVISÃO ---
    const diasTreino = parseInt(String(anamnese.diasTreino)) || 3;
    const estrategiaDivisao = determinarDivisao(diasTreino, anamnese.experiencia);

    // 2. Busca Exercícios (Nome e Categoria)
    const allExercises = await prisma.exercise.findMany({
      select: { name: true, category: true }
    });

    // Mapeia categorias para ajudar a IA
    const exercisesList = allExercises.map(e => `- ${e.name} (${e.category})`).join('\n');

    // 3. Prompt Direcionado
    const prompt = `
      Você é a FITO AI, especialista em periodização de musculação.
      Crie um treino em JSON para este aluno seguindo ESTRITAMENTE a estrutura definida.

      PERFIL:
      - Nível: ${anamnese.experiencia}
      - Objetivo: ${anamnese.objetivo}
      - Tempo: ${anamnese.tempoDisponivel} min
      - Lesões: ${anamnese.limitacoes || "Nenhuma"} (SE TIVER, SUBSTITUA EXERCÍCIOS PERIGOSOS).

      ACERVO DE EXERCÍCIOS (USE APENAS ESTES NOMES):
      ${exercisesList}

      ESTRUTURA DE DIVISÃO OBRIGATÓRIA (Siga exatamente isto):
      ${estrategiaDivisao}

      REGRAS DE MONTAGEM (FITO OS):
      1. MOBILIDADE: Iniciar treinos de PERNAS com 1-2 exercícios da categoria 'Mobilidade'.
      2. SEQUÊNCIA: Mobilidade (se perna) -> Base (Multiarticulares) -> Acessórios -> Isoladores.
      3. PROGRESSÃO: 
         - Iniciante: Sem técnicas avançadas.
         - Intermediário: Inserir 'Drop-set' ou 'Bi-set' em 1 exercício por treino.
         - Avançado: Uso livre de técnicas.

      SAÍDA JSON (Apenas o JSON, sem markdown):
      {
        "name": "Nome do Treino (ex: Protocolo Hipertrofia 4 Dias)",
        "goal": "${anamnese.objetivo}",
        "level": "${anamnese.experiencia}",
        "exercises": [
          {
            "day": "A", 
            "muscleGroup": "Pernas (Foco Quads)",
            "name": "Nome Exato do Acervo",
            "sets": 3,
            "reps": "10-12",
            "rest": 60,
            "technique": "Normal",
            "observations": ""
          },
          {
            "day": "B", 
            "muscleGroup": "Costas",
            "name": "Nome Exato...",
            // ... resto dos dados
          }
          // ... Liste TODOS os exercícios de TODOS os dias (A, B, C...) aqui dentro
        ]
      }
    `;

    // 4. Geração
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
    const result = await model.generateContent(prompt);
    const response = await result.response;
    const rawText = response.text();

    // 5. Limpeza e Parse
    const jsonStartIndex = rawText.indexOf('{');
    const jsonEndIndex = rawText.lastIndexOf('}') + 1;
    const cleanJson = rawText.substring(jsonStartIndex, jsonEndIndex);
    const workoutPlan = JSON.parse(cleanJson);

    // 6. Salvar
    await prisma.workout.deleteMany({ where: { userId } });

    const newWorkout = await prisma.workout.create({
      data: {
        userId: userId,
        name: workoutPlan.name,
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

    return NextResponse.json({ success: true, workoutId: newWorkout.id });

  } catch (error: any) {
    console.error("Erro Generate:", error);
    return NextResponse.json({ error: error.message || "Erro interno." }, { status: 500 });
  }
}