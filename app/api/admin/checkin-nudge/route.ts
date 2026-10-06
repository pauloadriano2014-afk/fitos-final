// app/api/admin/checkin-nudge/route.ts
// POST { studentId } -> o coach NOTIFICA o aluno que está com a avaliação (check-in: fotos e medidas) atrasada: push no celular/navegador dele
// ("sua avaliação está esperando você"). Ao abrir o app, a Início do aluno já mostra o aviso "Seu check-in está atrasado!" com o botão para enviar.
// Limite: um aviso a cada 12 h por aluno (fica registrado como StudentAlert CHECKIN_NUDGE, já lido, só para controlar o intervalo).
// Sem canal de notificação (aluno que nunca ativou o push) a rota recusa com 409 e NÃO conta o intervalo: o caminho é o WhatsApp.
import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuth, canAccessStudent } from '@/lib/auth';
import { sendPushToUser } from '@/app/utils/sendNotification';

export const dynamic = 'force-dynamic';

const NUDGE_TYPE = 'CHECKIN_NUDGE';
const COOLDOWN_MS = 12 * 60 * 60 * 1000;

export async function POST(req: Request) {
  try {
    const body: any = await req.json().catch(() => ({}));
    const studentId = typeof body.studentId === 'string' ? body.studentId : '';
    if (!studentId) return NextResponse.json({ error: 'Aluno não informado.' }, { status: 400 });

    const auth = requireAuth(req);
    if ('response' in auth) return auth.response;

    const student: any = await prisma.user.findUnique({
      where: { id: studentId },
      select: { id: true, name: true, role: true, coachId: true, nutritionistId: true, pushToken: true, active: true, accountStatus: true, disableCheckIn: true, nextCheckInDate: true },
    });
    if (!student || student.role !== 'USER') return NextResponse.json({ error: 'Aluno não encontrado.' }, { status: 404 });
    const allowed = auth.user.id !== studentId && (canAccessStudent(auth.user, studentId, student.coachId) || student.nutritionistId === auth.user.id);
    if (!allowed) return NextResponse.json({ error: 'Acesso negado.' }, { status: 403 });

    // só quem está com a avaliação atrasada (a mesma regra da pendência na agenda do coach)
    const now = new Date();
    if (student.active === false || student.disableCheckIn === true || !student.nextCheckInDate || new Date(student.nextCheckInDate) > now) {
      return NextResponse.json({ error: 'Esse aluno não está com avaliação atrasada.' }, { status: 400 });
    }

    const last = await prisma.studentAlert.findFirst({
      where: { userId: studentId, type: NUDGE_TYPE, createdAt: { gte: new Date(now.getTime() - COOLDOWN_MS) } },
      orderBy: { createdAt: 'desc' }, select: { createdAt: true },
    });
    if (last) {
      const hours = Math.max(1, Math.ceil((COOLDOWN_MS - (now.getTime() - new Date(last.createdAt).getTime())) / 3600000));
      return NextResponse.json({ error: `Esse aluno já foi notificado há pouco. Dá para avisar de novo em cerca de ${hours} h.` }, { status: 429 });
    }

    // tem para onde mandar? (app nativo ou navegador com notificação ativada)
    const hasExpo = typeof student.pushToken === 'string' && student.pushToken.startsWith('ExponentPushToken');
    const webCount = hasExpo ? 0 : await prisma.webPushSubscription.count({ where: { userId: studentId } });
    if (!hasExpo && webCount === 0) {
      return NextResponse.json({ error: 'Esse aluno ainda não ativou as notificações no app. Chame pelo WhatsApp.', noChannel: true }, { status: 409 });
    }

    await prisma.studentAlert.create({
      data: { userId: studentId, coachId: student.coachId || undefined, type: NUDGE_TYPE, title: 'Aviso de avaliação atrasada', message: '', isRead: true },
    });
    const first = String(student.name || '').trim().split(/\s+/)[0];
    sendPushToUser(student, 'Sua avaliação está esperando você', `${first ? first + ', leva' : 'Leva'} 2 minutos: envie suas fotos e medidas para eu ajustar o seu plano.`, { type: 'checkin_due' }).catch(() => {});
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Erro POST admin/checkin-nudge:', error);
    return NextResponse.json({ error: 'Erro ao notificar o aluno.' }, { status: 500 });
  }
}
