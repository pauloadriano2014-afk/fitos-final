import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, canAccessStudent } from "@/lib/auth";
import { sendPushToUser } from "@/app/utils/sendNotification";

export async function POST(req: Request) {
  try {
    const auth = requireAuth(req);
    if ('response' in auth) return auth.response;

    const body = await req.json();
    const { userId, satiety, difficulty, requestedChanges } = body;

    const targetUser = await prisma.user.findUnique({
      where: { id: userId },
      select: { coachId: true, name: true },
    });
    if (!canAccessStudent(auth.user, userId, targetUser?.coachId)) {
      return NextResponse.json({ error: 'Acesso negado.' }, { status: 403 });
    }

    const feedback = await prisma.dietFeedback.create({
      data: {
        userId,
        satiety,
        difficulty,
        requestedChanges
      }
    });

    // 🔥 Notifica o coach (17 set 2026) — antes esse feedback só aparecia se
    // ele abrisse o painel administrativo manualmente; nenhum push avisava.
    if (targetUser?.coachId) {
      try {
        const coach = await prisma.user.findUnique({
          where: { id: targetUser.coachId },
          select: { pushToken: true, webPushSubscription: true },
        });
        if (coach) {
          const alunoNome = targetUser.name || 'Um aluno';
          sendPushToUser(
            coach,
            '🍽️ Novo feedback de dieta',
            `${alunoNome} enviou um feedback sobre a dieta. Toque para ver.`
          ).catch(() => {});
        }
      } catch (e) {
        console.error('[diet/feedback] Erro ao notificar coach:', e);
      }
    }

    return NextResponse.json({ message: "Feedback registrado!", feedback }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: "Failed to create feedback" }, { status: 500 });
  }
}