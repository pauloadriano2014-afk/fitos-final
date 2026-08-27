// app/api/running/log/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth, canAccessStudent } from '@/lib/auth';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { userId, protocolId, week, block, sessionDay, durationMinutes, distanceKm, avgPace, notes, rpe } = body;

    // 🔥 BLINDAGEM: Removemos a obrigatoriedade do protocolId
    if (!userId || !sessionDay) {
      return NextResponse.json({ error: 'userId e sessionDay são obrigatórios' }, { status: 400 });
    }

    // 🔒 Só o próprio aluno pode logar a corrida dele (ou o coach/master).
    const auth = requireAuth(req);
    if ('response' in auth) return auth.response;
    const targetUser = await prisma.user.findUnique({ where: { id: userId }, select: { coachId: true } });
    if (!canAccessStudent(auth.user, userId, targetUser?.coachId)) {
      return NextResponse.json({ error: 'Acesso negado.' }, { status: 403 });
    }

    const log = await prisma.runningLog.create({
      data: {
        userId,
        // Se não tiver protocolId, o Prisma insere null (permite salvar corridas livres)
        protocolId: protocolId || null, 
        week: week ?? 1,
        block: block ?? 1,
        sessionDay,
        durationMinutes: durationMinutes ? parseInt(durationMinutes) : null,
        distanceKm: distanceKm ? parseFloat(String(distanceKm).replace(',', '.')) : null,
        avgPace: avgPace || null,
        notes: notes || null,
        rpe: rpe ? parseInt(rpe) : null,
      },
    });

    return NextResponse.json({ success: true, log });

  } catch (error) {
    console.error('[running-log-post]', error);
    return NextResponse.json({ error: 'Erro interno no servidor' }, { status: 500 });
  }
}