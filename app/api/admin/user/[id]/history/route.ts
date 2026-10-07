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
        xpEarned: true,
        // 🔥 (17 set 2026) Pra tela de histórico do admin poder mostrar/repetir
        // se o feedback final já foi resolvido/respondido, e mostrar quais
        // exercícios têm observação pendente (resolvedAt null = pendente).
        feedbackResolvedAt: true,
        coachReply: true,
        coachReplyAt: true,
        // 🚴 (7 out 2026) além das observações, traz as séries de CARDIO feitas de verdade (tempo e calorias) para o coach ver o que o aluno cumpriu.
        // (`exerciseId` também vem agora: a tela agrupa por exercício, e sem ele só a primeira observação do treino aparecia.)
        details: {
          // 🏋️ (7 out 2026) também traz as linhas com "como foi?" (effort) que o aluno marcou: a tela mostra FÁCIL / NA MEDIDA / PESADO de cada exercício.
          where: { OR: [{ note: { not: null } }, { cardioSeconds: { not: null } }, { cardioKcal: { not: null } }, { effort: { not: null } }] },
          orderBy: { setNumber: 'asc' },
          select: {
            id: true,
            exerciseId: true,
            exerciseName: true,
            setNumber: true,
            cardioSeconds: true,
            cardioKcal: true,
            effort: true,
            note: true,
            resolvedAt: true,
            coachReply: true,
            coachReplyAt: true,
          },
        },
      }
    });

    return NextResponse.json({ checkIns, workoutLogs });

  } catch (error) {
    return NextResponse.json({ error: "Erro ao buscar histórico" }, { status: 500 });
  }
}