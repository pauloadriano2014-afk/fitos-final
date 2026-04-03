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

    // 🔥 BLINDAGEM MÁXIMA: Selecionando DEDO A DEDO apenas os textos.
    // Qualquer coluna pesada (como profilePic, avatar, base64) será ignorada.
    const rawUsers = await prisma.user.findMany({
      where: { 
          role: 'USER',
          coachId: adminId 
      },
      orderBy: { name: 'asc' },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        plan_tier: true,
        currentWeight: true,
        nextCheckInDate: true,
        pushToken: true,
        coachId: true,
        active: true, // 🔥 ESSA É A PALAVRA MÁGICA QUE EU TINHA ESQUECIDO
        anamneses: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: { id: true, createdAt: true }
        },
        assessments: {
            orderBy: { date: 'desc' },
            take: 1,
            select: { id: true, date: true, weight: true }
        }
      }
    });

    const users = rawUsers.map((u: any) => ({
        ...u, 
        anamneses: u.anamneses, 
        anamnese: u.anamneses.length > 0 ? u.anamneses[0] : null,
        assessments: u.assessments,
        assessment: u.assessments.length > 0 ? u.assessments[0] : null
    }));

    // Limitado a apenas 5 históricos para não engasgar a tela inicial
    const recentLogs = await prisma.workoutHistory.findMany({
      where: {
          user: { coachId: adminId } 
      },
      take: 5,
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