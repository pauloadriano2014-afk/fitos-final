// app/api/admin/weekly-feedback/route.ts
// GET ?adminId=&weekStart=  -> painel "Feedback da semana" do coach (quem respondeu, alertas, o que falta responder, auto-avaliação do coach)
import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuth, canActAsCoach } from '@/lib/auth';
import { loadWeeklyBoard } from '@/lib/weeklyBoard';
import { evaluatedWeekStart, isWeekStart, isMissingTable } from '@/lib/weeklyFeedback';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const adminId = searchParams.get('adminId');
    if (!adminId) return NextResponse.json({ error: 'ID do admin não fornecido' }, { status: 400 });

    const auth = requireAuth(req);
    if ('response' in auth) return auth.response;
    if (!canActAsCoach(auth.user, adminId)) return NextResponse.json({ error: 'Acesso não autorizado' }, { status: 403 });

    const requester: any = await prisma.user.findUnique({ where: { id: adminId }, select: { role: true, accountStatus: true } });
    if (!requester || !['ADMIN', 'COACH'].includes(requester.role) || (requester.role === 'COACH' && requester.accountStatus !== 'ACTIVE')) {
      return NextResponse.json({ error: 'Acesso não autorizado' }, { status: 403 });
    }

    const now = new Date();
    const current = evaluatedWeekStart(now);
    const asked = searchParams.get('weekStart');
    const weekStart = asked && isWeekStart(asked) && asked <= current ? asked : current;

    try {
      return NextResponse.json({ available: true, ...(await loadWeeklyBoard(prisma, { adminId, weekStart, now })) });
    } catch (e) {
      if (isMissingTable(e)) return NextResponse.json({ available: false, weekStart });
      throw e;
    }
  } catch (error) {
    console.error('Erro GET admin weekly-feedback:', error);
    return NextResponse.json({ error: 'Erro ao carregar o feedback da semana.' }, { status: 500 });
  }
}
