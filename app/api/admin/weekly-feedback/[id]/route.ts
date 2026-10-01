// app/api/admin/weekly-feedback/[id]/route.ts
// PATCH { seen?: true, reply?: string } -> o coach marca o feedback como visto e/ou responde.
// A resposta vira um aviso no sino do aluno (StudentAlert COACH_REPLY, ver lib/coachReplies.ts) + push, igual às demais respostas do coach.
import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuth, canAccessStudent } from '@/lib/auth';
import { sendPushToUser } from '@/app/utils/sendNotification';
import { COACH_REPLY_TYPE, registerCoachContact } from '@/lib/coachReplies';
import { weekLabel } from '@/lib/weeklyFeedback';

export const dynamic = 'force-dynamic';

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  try {
    const body = await req.json().catch(() => ({}));
    const reply = typeof body.reply === 'string' ? body.reply.trim().slice(0, 1000) : '';
    const seen = body.seen === true;
    if (!reply && !seen) return NextResponse.json({ error: 'Nada para atualizar.' }, { status: 400 });

    const auth = requireAuth(req);
    if ('response' in auth) return auth.response;

    const fb: any = await prisma.weeklyFeedback.findUnique({ where: { id: params.id }, select: { id: true, userId: true, coachId: true, weekStart: true, coachSeenAt: true } });
    if (!fb) return NextResponse.json({ error: 'Feedback não encontrado.' }, { status: 404 });
    const student: any = await prisma.user.findUnique({ where: { id: fb.userId }, select: { id: true, coachId: true, pushToken: true } });
    if (!canAccessStudent(auth.user, fb.userId, student?.coachId || fb.coachId)) return NextResponse.json({ error: 'Acesso negado.' }, { status: 403 });
    if (auth.user.id === fb.userId) return NextResponse.json({ error: 'Acesso negado.' }, { status: 403 });   // o próprio aluno não "responde" o feedback dele

    const now = new Date();
    const data: any = { coachSeenAt: fb.coachSeenAt || now };
    if (reply) { data.coachReply = reply; data.coachReplyAt = now; }
    const updated = await prisma.weeklyFeedback.update({ where: { id: fb.id }, data, select: { coachSeenAt: true, coachReplyAt: true } });

    if (reply && student) {
      const title = '💬 Seu coach respondeu seu feedback da semana';
      await prisma.studentAlert.create({
        data: {
          userId: fb.userId, coachId: student.coachId || undefined, type: COACH_REPLY_TYPE,
          title: `${title} (${weekLabel(fb.weekStart)})`, message: reply, isRead: false,
        },
      });
      sendPushToUser(student, title, reply.slice(0, 120), { type: 'coach_reply' }).catch(() => {});
      await registerCoachContact(prisma, fb.userId, now);   // responder = falar com o aluno
    }
    return NextResponse.json({ success: true, coachSeenAt: updated.coachSeenAt, coachReplyAt: updated.coachReplyAt ?? null });
  } catch (error) {
    console.error('Erro PATCH weekly-feedback:', error);
    return NextResponse.json({ error: 'Erro ao atualizar.' }, { status: 500 });
  }
}
