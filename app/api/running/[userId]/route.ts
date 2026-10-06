// app/api/running/[userId]/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth, canAccessStudent } from '@/lib/auth';
import { loadUserLogs, syncProgress } from '@/lib/runningStore';

// GET — App do aluno busca protocolo ativo + andamento + registros + anamnese.
// 🏃 (6 out 2026) A semana atual vem do DESEMPENHO (lib/runningProgress.ts), não mais só do calendário. `currentWeek` e `currentBlock` continuam na resposta
// (o app antigo lê esses dois); `progress` traz o resto (treinos feitos, quando a próxima semana abre, recado). `logs` agora traz TAMBÉM as corridas avulsas.
export async function GET(
  req: NextRequest,
  { params }: { params: { userId: string } }
) {
  try {
    const userId = params.userId;

    // 🔒 Só o próprio aluno, o coach dono dele, ou o time master.
    const auth = requireAuth(req);
    if ('response' in auth) return auth.response;
    const targetUser = await prisma.user.findUnique({ where: { id: userId }, select: { coachId: true } });
    if (!canAccessStudent(auth.user, userId, targetUser?.coachId)) {
      return NextResponse.json({ error: 'Acesso negado.' }, { status: 403 });
    }

    // Busca anamnese de corrida
    const anamnese = await prisma.runningAnamnese.findUnique({
      where: { userId },
      select: { token: true, filled: true, filledAt: true },
    });

    const logs = await loadUserLogs(prisma, userId);

    // Busca protocolo ativo
    const protocol = await prisma.runningProtocol.findFirst({ where: { userId, isActive: true }, orderBy: { createdAt: 'desc' } });

    if (!protocol) {
      return NextResponse.json({ protocol: null, logs, anamnese: anamnese || null });
    }

    const synced = await syncProgress(prisma, protocol, logs);

    // o texto que foi enviado à IA (com dados de saúde da anamnese) é interno: não vai para o app
    const { aiPromptSnapshot: _prompt, ...publicProtocol } = synced.protocol;

    return NextResponse.json({
      protocol: { ...publicProtocol, logs: synced.logs },
      currentWeek: synced.view.week,
      currentBlock: synced.view.block,
      progress: synced.view,
      logs,
      anamnese: anamnese || null,
    });

  } catch (error) {
    console.error('[running-userId-get]', error);
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
  }
}
