// app/api/student-messages/[id]/route.ts
// PATCH { read: true } -> o aluno marca a mensagem do coach como lida ("ENTENDI"). Só o dono da mensagem.
import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuth } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  try {
    const auth = requireAuth(req);
    if ('response' in auth) return auth.response;
    const msg: any = await prisma.studentCoachMessage.findUnique({ where: { id: params.id }, select: { id: true, userId: true, readAt: true } });
    if (!msg) return NextResponse.json({ error: 'Mensagem não encontrada.' }, { status: 404 });
    if (msg.userId !== auth.user.id) return NextResponse.json({ error: 'Acesso negado.' }, { status: 403 });
    if (!msg.readAt) await prisma.studentCoachMessage.update({ where: { id: params.id }, data: { readAt: new Date() } });
    return NextResponse.json({ success: true });
  } catch (e: any) {
    console.error('[PATCH /api/student-messages/[id]]', e);
    return NextResponse.json({ error: 'Erro ao marcar como lida.' }, { status: 500 });
  }
}
