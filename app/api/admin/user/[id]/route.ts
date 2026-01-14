import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export async function GET(req: Request, { params }: { params: { id: string } }) {
  const { id } = params;
  try {
    const user = await prisma.user.findUnique({
      where: { id },
      include: {
        anamneses: {
          orderBy: { createdAt: 'desc' }
        },
        workouts: {
          orderBy: { createdAt: 'desc' },
          include: {
            exercises: {
              include: {
                exercise: true // Isso aqui traz o vídeo e as instruções para o seu Scanner
              }
            }
          }
        }
      }
    });

    if (!user) return NextResponse.json({ error: "Aluno não encontrado" }, { status: 404 });

    return NextResponse.json(user);
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Erro ao buscar detalhes" }, { status: 500 });
  }
}