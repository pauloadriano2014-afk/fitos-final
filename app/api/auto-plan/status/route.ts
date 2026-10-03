// app/api/auto-plan/status/route.ts
// 🤖 (3 out 2026) Estado da montagem automática do plano (treino + dieta) de um aluno de FICHA_8S / CHALLENGE_21.
// O app do aluno consulta isto enquanto espera o plano ficar pronto. A consulta também retoma o que ficou pra trás
// (servidor reiniciou no meio, IA falhou) -- ver getAutoPlanStatus em lib/autoPlan.ts.
import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuth, canAccessStudent } from '@/lib/auth';
import { getAutoPlanStatus } from '@/lib/autoPlan';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  try {
    const auth = requireAuth(req);
    if ('response' in auth) return auth.response;

    const { searchParams } = new URL(req.url);
    const userId = searchParams.get('userId') || auth.user.id;

    const target = await prisma.user.findUnique({ where: { id: userId }, select: { coachId: true } });
    if (!target) return NextResponse.json({ error: 'Aluno não encontrado.' }, { status: 404 });
    if (!canAccessStudent(auth.user, userId, target.coachId)) {
      return NextResponse.json({ error: 'Acesso negado.' }, { status: 403 });
    }

    // o aluno vê só o andamento; quem é coach/master também vê o resumo (pontos de atenção, custo) e o erro
    const status = await getAutoPlanStatus(userId, { detail: auth.user.id !== userId });
    return NextResponse.json(status);
  } catch (error: any) {
    console.error('[GET /api/auto-plan/status]', error);
    return NextResponse.json({ error: 'Erro ao consultar o plano automático.' }, { status: 500 });
  }
}
