import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuth, canAccessStudent } from '@/lib/auth';


export async function GET(req: Request, { params }: { params: { id: string } }) {
  try {
    const userId = params.id;

    const auth = requireAuth(req);
    if ('response' in auth) return auth.response;
    const targetForAuth = await prisma.user.findUnique({ where: { id: userId }, select: { coachId: true } });
    if (!canAccessStudent(auth.user, userId, targetForAuth?.coachId)) {
      return NextResponse.json({ error: 'Acesso negado.' }, { status: 403 });
    }

    // 1. Busca Check-ins (Fotos e Peso)
    const checkIns = await prisma.checkIn.findMany({
      where: { userId },
      orderBy: { date: 'desc' }
    });

    // 2. Busca Histórico de Treinos (RPE, Feedback, XP)
    const workoutLogs = await prisma.workoutHistory.findMany({
      where: { userId },
      orderBy: { date: 'desc' },
      take: 30, // Limita aos últimos 30 treinos
      select: {
        id: true,
        name: true,
        date: true,
        duration: true,
        rpe: true,       // <--- Importante
        feedback: true,  // <--- Importante
        xpEarned: true
      }
    });

    return NextResponse.json({ checkIns, workoutLogs });

  } catch (error) {
    return NextResponse.json({ error: "Erro ao buscar histórico" }, { status: 500 });
  }
}