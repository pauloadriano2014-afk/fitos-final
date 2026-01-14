import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

// Configuração atualizada para o Prisma 7 aceitar a URL da Render no build
const prisma = new PrismaClient({
  datasources: {
    db: {
      url: process.env.DATABASE_URL,
    },
  },
});

export async function POST(req: Request) {
  try {
    const { userId, nivel } = await req.json();

    let exerciciosParaSalvar: any[] = [];

    if (nivel === 'Iniciante') {
      exerciciosParaSalvar = [
        { title: "Leg Press 45", reps: "3x15", notes: "Foco na amplitude", category: "Pernas" },
        { title: "Cadeira Extensora", reps: "3x15", notes: "Execução controlada", category: "Pernas" },
        { title: "Cadeira Flexora", reps: "3x15", notes: "Descanso de 60s", category: "Pernas" }
      ];
    } else if (nivel === 'Intermediário') {
      exerciciosParaSalvar = [
        { title: "Agachamento Livre", reps: "4x10", notes: "Coluna selada", category: "Pernas" },
        { title: "Leg Press 45", reps: "4x12", notes: "Carga moderada", category: "Pernas" },
        { title: "Cadeira Extensora", reps: "3x12", notes: "Pico de contração 2s", category: "Pernas" },
        { title: "Mesa Flexora", reps: "4x10", notes: "Controlar a descida", category: "Pernas" }
      ];
    } else {
      exerciciosParaSalvar = [
        { title: "Agachamento Livre", reps: "4x8-12", notes: "Falha concêntrica", category: "Pernas" },
        { title: "Leg Press 45", reps: "4x12", notes: "Drop-set na última", category: "Pernas" },
        { title: "Cadeira Extensora", reps: "4x12", notes: "Sem descanso entre pernas", category: "Pernas" },
        { title: "Stiff Barra", reps: "4x10", notes: "Máximo alongamento", category: "Pernas" },
        { title: "Panturrilha em Pé", reps: "4x15", notes: "Até queimar", category: "Pernas" }
      ];
    }

    // 1. Limpa treinos antigos
    await prisma.workout.deleteMany({ where: { userId: userId } });

    // 2. Mapeia e garante que o exercício exista na biblioteca
    const exerciciosCriados = [];
    for (const ex of exerciciosParaSalvar) {
      const dbEx = await prisma.exercise.upsert({
        where: { name: ex.title },
        update: {},
        create: {
          name: ex.title,
          category: ex.category || "Geral",
        }
      });

      exerciciosCriados.push({
        title: ex.title,
        reps: ex.reps,
        notes: ex.notes,
        exerciseId: dbEx.id 
      });
    }

    // 3. Cria o treino novo com os exercícios vinculados
    const treinoCriado = await prisma.workout.create({
      data: {
        userId: userId,
        name: `Treino de Pernas - ${nivel}`,
        exercises: {
          create: exerciciosCriados.map(ex => ({
            title: ex.title,
            reps: ex.reps,
            notes: ex.notes,
            exercise: { connect: { id: ex.exerciseId } }
          }))
        }
      }
    });

    return NextResponse.json({ message: "Treino gerado!", treino: treinoCriado });

  } catch (error) {
    console.error("ERRO CRÍTICO NA API:", error);
    return NextResponse.json({ error: "Erro ao salvar no banco" }, { status: 500 });
  }
}

// Força a rota a ser dinâmica para evitar erro de coleta de dados no build da Render
export const dynamic = 'force-dynamic';
