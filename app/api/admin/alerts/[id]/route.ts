// app/api/admin/alerts/[id]/route.ts
import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuth, canAccessStudent } from '@/lib/auth';
import { sendPushToUser } from '@/app/utils/sendNotification';
import { COACH_REPLY_TYPE, registerCoachContact } from '@/lib/coachReplies';


export async function PATCH(req: Request, { params }: { params: { id: string } }) {
    try {
        const id = params.id;
        const body = await req.json();

        if (!id) {
            return NextResponse.json({ error: "Alert ID is required" }, { status: 400 });
        }

        const auth = requireAuth(req);
        if ('response' in auth) return auth.response;
        const existingAlert = await prisma.studentAlert.findUnique({
            where: { id },
            select: { userId: true, coachId: true, type: true, exerciseName: true, workoutId: true, day: true, workoutExerciseId: true }
        });
        if (!existingAlert) {
            return NextResponse.json({ error: "Alert not found" }, { status: 404 });
        }
        if (!canAccessStudent(auth.user, existingAlert.userId, existingAlert.coachId)) {
            return NextResponse.json({ error: 'Acesso negado.' }, { status: 403 });
        }

        // 💬 (1 out 2026) RESPONDER uma observação enviada na hora pelo aluno (antes o coach só conseguia marcar como vista e o aluno nunca
        // sabia). A resposta vira uma linha StudentAlert type COACH_REPLY DO ALUNO (aparece no sininho dele -- ver lib/coachReplies.ts),
        // a observação original é marcada como resolvida e o aluno recebe o push. Só vale pra observação de exercício.
        const reply = typeof body.reply === 'string' ? body.reply.trim().slice(0, 1000) : '';
        if (reply) {
            if (existingAlert.type !== 'EXERCISE_NOTE') {
                return NextResponse.json({ error: 'Só observações de exercício podem ser respondidas.' }, { status: 400 });
            }
            const title = existingAlert.exerciseName
                ? `💬 Seu coach respondeu sobre "${existingAlert.exerciseName}"`
                : '💬 Seu coach respondeu sua observação';
            const replyRow = await prisma.studentAlert.create({
                data: {
                    userId: existingAlert.userId,
                    coachId: existingAlert.coachId || undefined,
                    type: COACH_REPLY_TYPE,
                    title,
                    message: reply,
                    exerciseName: existingAlert.exerciseName,
                    workoutId: existingAlert.workoutId,
                    day: existingAlert.day,
                    workoutExerciseId: existingAlert.workoutExerciseId,
                    isRead: false,
                },
            });
            const updatedAlert = await prisma.studentAlert.update({ where: { id }, data: { isRead: true } });
            const student = await prisma.user.findUnique({ where: { id: existingAlert.userId }, select: { id: true, pushToken: true } });
            if (student) {
                sendPushToUser(student, title, reply.slice(0, 120), { type: 'coach_reply', replyId: replyRow.id }).catch(() => {});
            }
            await registerCoachContact(prisma, existingAlert.userId);   // responder = falar com o aluno
            return NextResponse.json({ ...updatedAlert, replied: true });
        }

        // Atualiza o alerta no banco mudando a flag isRead para true
        const updatedAlert = await prisma.studentAlert.update({
            where: { id: id },
            data: {
                isRead: body.isRead
            }
        });

        return NextResponse.json(updatedAlert);
    } catch (error: any) {
        console.error("Erro ao dispensar alerta:", error);
        return NextResponse.json({ error: "Failed to dismiss alert" }, { status: 500 });
    }
}