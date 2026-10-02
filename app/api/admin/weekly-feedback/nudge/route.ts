// app/api/admin/weekly-feedback/nudge/route.ts
// POST { studentId } -> o coach COBRA o feedback de um aluno que ainda não respondeu (push "seu coach está esperando").
// Limite: uma cobrança a cada 12 h por aluno. A cobrança fica registrada (StudentAlert WEEKLY_NUDGE, já lida) pro painel mostrar "cobrado há X".
import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuth, canAccessStudent } from '@/lib/auth';
import { sendPushToUser } from '@/app/utils/sendNotification';
import { evaluatedWeekStart, isDueStudent, isMissingTable } from '@/lib/weeklyFeedback';
import { NUDGE_TYPE, NUDGE_COOLDOWN_MS } from '@/lib/weeklyBoard';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const studentId = body.studentId as string | undefined;
    if (!studentId) return NextResponse.json({ error: 'Aluno não informado.' }, { status: 400 });

    const auth = requireAuth(req);
    if ('response' in auth) return auth.response;
    const student: any = await prisma.user.findUnique({ where: { id: studentId }, select: { id: true, name: true, coachId: true, pushToken: true, createdAt: true, active: true, accountStatus: true, role: true } });
    if (!student) return NextResponse.json({ error: 'Aluno não encontrado.' }, { status: 404 });
    if (auth.user.id === studentId || !canAccessStudent(auth.user, studentId, student.coachId)) return NextResponse.json({ error: 'Acesso negado.' }, { status: 403 });

    const now = new Date();
    if (!isDueStudent(student, now)) return NextResponse.json({ error: 'Esse aluno não tem feedback pendente.' }, { status: 400 });
    const weekStart = evaluatedWeekStart(now);
    try {
      const done = await prisma.weeklyFeedback.findUnique({ where: { userId_weekStart: { userId: studentId, weekStart } }, select: { id: true } });
      if (done) return NextResponse.json({ error: 'Esse aluno já respondeu.' }, { status: 409 });
    } catch (e) {
      if (isMissingTable(e)) return NextResponse.json({ error: 'Recurso ainda não disponível.' }, { status: 503 });
      throw e;
    }

    const last = await prisma.studentAlert.findFirst({ where: { userId: studentId, type: NUDGE_TYPE, createdAt: { gte: new Date(now.getTime() - NUDGE_COOLDOWN_MS) } }, select: { createdAt: true } });
    if (last) return NextResponse.json({ error: 'Você já cobrou esse aluno nas últimas 12 horas.' }, { status: 429 });

    await prisma.studentAlert.create({
      data: { userId: studentId, coachId: student.coachId || undefined, type: NUDGE_TYPE, title: 'Cobrança de feedback da semana', message: '', isRead: true },
    });
    sendPushToUser(student, 'Seu coach está esperando seu feedback', 'Leva 1 minuto: conta como foi sua semana de treino.', { type: 'weekly_feedback_due' }).catch(() => {});
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Erro POST nudge weekly-feedback:', error);
    return NextResponse.json({ error: 'Erro ao cobrar.' }, { status: 500 });
  }
}
