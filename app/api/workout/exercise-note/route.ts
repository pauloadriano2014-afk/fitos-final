// app/api/workout/exercise-note/route.ts
// 🔥 (17 set 2026) Paulo notou que a observação do aluno num exercício
// ("Deixar observação pro coach") só era enviada de fato lá no FINAL do
// treino inteiro (dentro de /api/workout/finish), e só se o exercício tivesse
// pelo menos uma série já preenchida -- se o aluno escrevesse a observação e
// fechasse o app antes de terminar o treino, ela se perdia sem avisar
// ninguém. Pediu um botão de "enviar" ali na hora + confirmação pro aluno de
// que o coach foi avisado.
//
// Esta rota é esse envio imediato, independente de finalizar o treino:
// grava um StudentAlert (mesmo modelo já usado pelos alertas de estagnação
// da IA, com type diferente pra não misturar) e dispara push pro coach na
// hora. O registro definitivo ligado às séries/pesos continua sendo salvo
// em /api/workout/finish como já era -- esta rota é só o aviso "ao vivo".
//
// Body: { userId, exerciseName, note, workoutName? }
import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuth, canAccessStudent } from '@/lib/auth';
import { sendPushToUser } from '@/app/utils/sendNotification';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const { userId, exerciseName, note, workoutName } = body as {
      userId?: string; exerciseName?: string; note?: string; workoutName?: string;
    };

    if (!userId) return NextResponse.json({ error: 'User ID ausente.' }, { status: 400 });
    const noteClean = (note || '').trim();
    if (!noteClean) return NextResponse.json({ error: 'Escreva algo antes de enviar.' }, { status: 400 });

    const auth = requireAuth(req);
    if ('response' in auth) return auth.response;

    const student = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, name: true, coachId: true },
    });
    if (!student) return NextResponse.json({ error: 'Aluno não encontrado.' }, { status: 404 });
    if (!canAccessStudent(auth.user, userId, student.coachId)) {
      return NextResponse.json({ error: 'Acesso negado.' }, { status: 403 });
    }

    const alert = await prisma.studentAlert.create({
      data: {
        userId: student.id,
        coachId: student.coachId || undefined,
        type: 'EXERCISE_NOTE',
        title: exerciseName ? `📝 Observação em "${exerciseName}"` : '📝 Observação do aluno',
        message: noteClean.slice(0, 500),
        exerciseName: exerciseName || null,
      },
    });

    if (student.coachId) {
      const coach = await prisma.user.findUnique({
        where: { id: student.coachId },
        select: { pushToken: true, webPushSubscription: true },
      });
      if (coach) {
        const pushTitle = exerciseName ? `📝 ${student.name || 'Aluno'} comentou em "${exerciseName}"` : `📝 ${student.name || 'Aluno'} deixou uma observação`;
        const pushBody = noteClean.slice(0, 120);
        sendPushToUser(coach, pushTitle, pushBody, {
          type: 'exercise_note_alert',
          studentId: student.id,
          alertId: alert.id,
          workoutName: workoutName || null,
        }).catch(() => {});
      }
    }

    return NextResponse.json({ success: true, notifiedCoach: !!student.coachId });
  } catch (error: any) {
    console.error('Erro ao enviar observação de exercício:', error);
    return NextResponse.json({ error: error.message || 'Erro interno.' }, { status: 500 });
  }
}
