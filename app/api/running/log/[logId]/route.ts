// app/api/running/log/[logId]/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function DELETE(
  req: NextRequest,
  { params }: { params: { logId: string } }
) {
  try {
    const logId = params.logId;

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