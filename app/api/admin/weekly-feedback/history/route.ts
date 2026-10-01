// app/api/admin/weekly-feedback/history/route.ts
// GET ?adminId=&weeks=8 -> adesão do feedback da semana nas últimas semanas (quantos deviam responder x quantos responderam)
import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuth, canActAsCoach } from '@/lib/auth';
import { loadAdherenceHistory } from '@/lib/weeklyHistory';
import { isMissingTable } from '@/lib/weeklyFeedback';

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

    try {
      return NextResponse.json({ available: true, ...(await loadAdherenceHistory(prisma, { adminId, now: new Date(), weeks: searchParams.get('weeks') })) });
    } catch (e) {
      if (isMissingTable(e)) return NextResponse.json({ available: false, weeks: [] });
      throw e;
    }
  } catch (error) {
    console.error('Erro GET admin weekly-feedback/history:', error);
    return NextResponse.json({ error: 'Erro ao carregar o histórico.' }, { status: 500 });
  }
}
