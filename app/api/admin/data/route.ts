// app/api/admin/data/route.ts
import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const adminId = searchParams.get('adminId'); // 🔥 Agora ele recebe QUEM é o admin

    // Se não mandar adminId, retorna erro ou lista vazia (segurança)
    if (!adminId) {
        return NextResponse.json({ error: "ID do admin não fornecido" }, { status: 400 });
    }

    const rawUsers = await prisma.user.findMany({
      where: { 
          role: 'USER',
          coachId: adminId // 🔥 O FILTRO MÁGICO: Só traz aluno deste coach!
      },
      orderBy: { name: 'asc' },
      include: {
        anamneses: {
          orderBy: { createdAt: 'desc' },
          take: 1
        },
        assessments: {
            orderBy: { date: 'desc' },
            take: 1
        }
      }
    });

    const users = rawUsers.map(u => ({
        ...u, 
        anamneses: u.anamneses, 
        anamnese: u.anamneses.length > 0 ? u.anamneses[0] : null,
        assessments: u.assessments,
        assessment: u.assessments.length > 0 ? u.assessments[0] : null
    }));

    const recentLogs = await prisma.workoutHistory.findMany({
      where: {
          user: { coachId: adminId } // 🔥 Só traz log de treino se o aluno for deste coach!
      },
      take: 15,
      orderBy: { date: 'desc' },
      include: {
        user: { select: { name: true, email: true } } 
      }
    });

    const exercises = await prisma.exercise.findMany({
        where: { coachId: adminId }, // 🔥 Só traz a lista de exercícios deste coach!
        orderBy: { name: 'asc' }
    });

    return NextResponse.json({ 
        users, 
        recentLogs, 
        exercises 
    });

  } catch (error) {
    console.error("ERRO ADMIN:", error);
    return NextResponse.json({ error: "Erro ao carregar dados admin" }, { status: 500 });
  }
}