// app/api/running/[userId]/progress/route.ts
// 🏃 (6 out 2026) O coach manda no andamento: liberar a próxima semana agora, repetir a atual ou saltar para uma semana.
//   POST { action: 'advance' | 'repeat' | 'set-week', week? }  ->  { success, progress }
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth, canActAsCoach } from '@/lib/auth';
import { applyCoachAction } from '@/lib/runningProgress';
import { loadUserLogs, persistData, syncProgress } from '@/lib/runningStore';

export async function POST(req: NextRequest, { params }: { params: { userId: string } }) {
  try {
    const userId = params.userId;
    const auth = requireAuth(req);
    if ('response' in auth) return auth.response;
    const targetUser = await prisma.user.findUnique({ where: { id: userId }, select: { coachId: true } });
    if (!targetUser) return NextResponse.json({ error: 'Aluno não encontrado.' }, { status: 404 });
    if (!canActAsCoach(auth.user, targetUser.coachId)) return NextResponse.json({ error: 'Acesso negado.' }, { status: 403 });

    const body = await req.json().catch(() => null);
    const action = body && body.action;
    if (!['advance', 'repeat', 'set-week'].includes(action)) return NextResponse.json({ error: 'action deve ser advance, repeat ou set-week.' }, { status: 400 });

    const protocol = await prisma.runningProtocol.findFirst({ where: { userId, isActive: true }, orderBy: { createdAt: 'desc' } });
    if (!protocol) return NextResponse.json({ error: 'O aluno não tem protocolo ativo.' }, { status: 404 });

    // antes de aplicar, põe o andamento em dia (uma semana que já fechou sozinha não pode ser contada duas vezes)
    const synced = await syncProgress(prisma, protocol, await loadUserLogs(prisma, userId));
    const next = applyCoachAction(synced.protocol, { action, week: body.week });
    if (!next) return NextResponse.json({ error: action === 'set-week' ? 'Semana inválida para esse protocolo.' : 'O protocolo já foi concluído.' }, { status: 400 });
    await prisma.runningProtocol.update({ where: { id: protocol.id }, data: persistData(next) });

    const after = await syncProgress(prisma, { ...synced.protocol, ...persistData(next) }, await loadUserLogs(prisma, userId));
    return NextResponse.json({ success: true, progress: after.view });

  } catch (error) {
    console.error('[running-progress-post]', error);
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
  }
}
