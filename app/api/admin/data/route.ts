// app/api/admin/data/route.ts
import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const adminId = searchParams.get('adminId'); 

    if (!adminId) {
        return NextResponse.json({ error: "ID do admin não fornecido" }, { status: 400 });
    }

    const rawUsers = await prisma.user.findMany({
      where: { 
          role: 'USER',
          coachId: adminId 
      },
      orderBy: { name: 'asc' },
      include: {
        anamneses: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          // 🔥 CIRURGIA ANTI-CRASH: Pega só o ID e a data, ignora campos pesados do passado
          select: { id: true, createdAt: true }
        },
        assessments: {
            orderBy: { date: 'desc' },
            take: 1,
            // 🔥 CIRURGIA ANTI-CRASH: Traz só o básico, ignora as fotos em base64 do passado na listagem principal
            select: { id: true, date: true, weight: true }
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
          user: { coachId: adminId } 
      },
      take: 15,
      orderBy: { date: 'desc' },
      include: {
        user: { select: { name: true, email: true } } 
      }
    });

    const exercises = await prisma.exercise.findMany({
        where: { coachId: adminId }, 
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