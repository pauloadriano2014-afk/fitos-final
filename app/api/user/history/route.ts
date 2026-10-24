import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuth, canAccessStudent } from '@/lib/auth';
import { planPositions, orderHistoryDetails } from '@/lib/historyOrder';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const userId = searchParams.get('userId');

    if (!userId) return NextResponse.json({ error: "UserId required" }, { status: 400 });

    const auth = requireAuth(req);
    if ('response' in auth) return auth.response;
    const targetForAuth = await prisma.user.findUnique({ where: { id: userId }, select: { coachId: true } });
    if (!canAccessStudent(auth.user, userId, targetForAuth?.coachId)) {
      return NextResponse.json({ error: 'Acesso negado.' }, { status: 403 });
    }

    // Busca histórico de treinos FINALIZADOS
    const history = await prisma.workoutHistory.findMany({
      where: { userId },
      orderBy: { date: 'desc' },
      take: 50,
      include: {
        details: true // Traz os exercícios e cargas usadas
      }
    });

    // 🧭 (25 out 2026) Sem ordem garantida no banco, as séries podiam chegar embaralhadas (3ª antes da 2ª). Devolve na ordem que o coach montou: exercícios como na ficha
    // (do dia daquele treino) e séries por número. Se a ficha foi apagada ou a consulta falhar, ainda ordena as séries por número.
    const ids = Array.from(new Set(history.map((h: any) => h.workoutId).filter(Boolean))) as string[];
    let plan: any[] = [];
    if (ids.length) { try { plan = await prisma.workoutExercise.findMany({ where: { workoutId: { in: ids } }, select: { workoutId: true, exerciseId: true, day: true, order: true } }); } catch { plan = []; } }
    const ordered = history.map((h: any) => ({ ...h, details: orderHistoryDetails(h.details, h.workoutId ? planPositions(plan.filter((p: any) => p.workoutId === h.workoutId), h.day) : null) }));

    return NextResponse.json(ordered);

  } catch (error) {
    return NextResponse.json({ error: "Erro ao buscar histórico" }, { status: 500 });
  }
}