// app/api/admin/workout-history/[id]/resolve/route.ts
// 🔥 (17 set 2026) Fecha o loop do comentário do aluno: o coach vê a
// observação (de um exercício específico ou do feedback final do treino,
// destacados no push de "Treino Concluído" — ver workout/finish/route.ts),
// marca como resolvido e, se quiser, responde. O aluno recebe um push de
// volta e a resposta fica salva pra aparecer na tela de histórico dele
// também (não é só a notificação — o texto persiste no banco).
//
// Body: { exerciseHistoryId?: string, reply?: string }
//  - Com exerciseHistoryId: resolve o comentário DAQUELE exercício.
//  - Sem exerciseHistoryId: resolve o feedback final do treino (RPE/comentário
//    geral que o aluno deixou ao finalizar).
import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuth, canAccessStudent } from '@/lib/auth';
import { sendPushToUser } from '@/app/utils/sendNotification';

export const dynamic = 'force-dynamic';

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  try {
    const workoutHistoryId = params.id;
    const body = await req.json().catch(() => ({}));
    const { exerciseHistoryId, reply } = body as { exerciseHistoryId?: string; reply?: string };

    const auth = requireAuth(req);
    if ('response' in auth) return auth.response;

    const workoutHistory = await prisma.workoutHistory.findUnique({
      where: { id: workoutHistoryId },
      include: {
        user: { select: { id: true, name: true, coachId: true, pushToken: true, webPushSubscription: true } },
      },
    });
    if (!workoutHistory) {
      return NextResponse.json({ error: 'Histórico de treino não encontrado.' }, { status: 404 });
    }
    if (!canAccessStudent(auth.user, workoutHistory.userId, workoutHistory.user.coachId)) {
      return NextResponse.json({ error: 'Acesso negado.' }, { status: 403 });
    }

    const replyClean = reply ? String(reply).trim().slice(0, 1000) : null;
    const now = new Date();

    let pushTitle: string;
    let pushBody: string;
    let pushData: any;

    if (exerciseHistoryId) {
      const exerciseHistory = await prisma.exerciseHistory.findFirst({
        where: { id: exerciseHistoryId, workoutHistoryId },
      });
      if (!exerciseHistory) {
        return NextResponse.json({ error: 'Observação de exercício não encontrada.' }, { status: 404 });
      }

      await prisma.exerciseHistory.update({
        where: { id: exerciseHistoryId },
        data: {
          resolvedAt: now,
          ...(replyClean ? { coachReply: replyClean, coachReplyAt: now } : {}),
        },
      });

      pushTitle = replyClean ? `💬 Seu coach respondeu sobre "${exerciseHistory.exerciseName}"` : `✅ Observação resolvida`;
      pushBody = replyClean
        ? replyClean.slice(0, 120)
        : `Seu coach viu seu comentário sobre "${exerciseHistory.exerciseName}" e já era o que precisava.`;
      pushData = { type: 'exercise_comment_resolved', workoutHistoryId, exerciseHistoryId };
    } else {
      await prisma.workoutHistory.update({
        where: { id: workoutHistoryId },
        data: {
          feedbackResolvedAt: now,
          ...(replyClean ? { coachReply: replyClean, coachReplyAt: now } : {}),
        },
      });

      pushTitle = replyClean ? '💬 Seu coach respondeu seu feedback' : '✅ Feedback do treino resolvido';
      pushBody = replyClean ? replyClean.slice(0, 120) : 'Seu coach viu seu comentário sobre o treino.';
      pushData = { type: 'workout_feedback_replied', workoutHistoryId };
    }

    sendPushToUser(workoutHistory.user, pushTitle, pushBody, pushData).catch(() => {});

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Erro ao resolver comentário:', error);
    return NextResponse.json({ error: error.message || 'Erro interno.' }, { status: 500 });
  }
}
