// app/api/running/log/[logId]/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth, canAccessStudent } from '@/lib/auth';

export async function DELETE(
  req: NextRequest,
  { params }: { params: { logId: string } }
) {
  try {
    const logId = params.logId;

    // 🔒 Só o próprio aluno dono do registro, o coach dele, ou o time master.
    const auth = requireAuth(req);
    if ('response' in auth) return auth.response;
    const existingLog = await prisma.runningLog.findUnique({ where: { id: logId }, select: { userId: true } });
    if (!existingLog) {
      return NextResponse.json({ error: 'Registro não encontrado.' }, { status: 404 });
    }
    const targetUser = await prisma.user.findUnique({ where: { id: existingLog.userId }, select: { coachId: true } });
    if (!canAccessStudent(auth.user, existingLog.userId, targetUser?.coachId)) {
      return NextResponse.json({ error: 'Acesso negado.' }, { status: 403 });
    }

    // 🔥 A execução da exclusão no banco de dados
    await prisma.runningLog.delete({
      where: { id: logId }
    });

    return NextResponse.json({ success: true, message: 'Treino excluído com sucesso.' });
  } catch (error) {
    console.error('[running-log-delete]', error);
    return NextResponse.json({ error: 'Erro ao excluir o registro.' }, { status: 500 });
  }
}