// app/api/user/coach-replies/route.ts
// GET /api/user/coach-replies?userId=  -> respostas do coach a feedbacks/observações do aluno (ver lib/coachReplies.ts).
// O app do aluno junta isso aos avisos do sininho. Só leitura; o "lido/removido" fica no aparelho.
import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuth, canAccessStudent } from '@/lib/auth';
import { loadCoachReplies } from '@/lib/coachReplies';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const userId = searchParams.get('userId');
    if (!userId) return NextResponse.json([]);

    const auth = requireAuth(req);
    if ('response' in auth) return auth.response;

    const student = await prisma.user.findUnique({ where: { id: userId }, select: { coachId: true } });
    if (!canAccessStudent(auth.user, userId, student?.coachId)) {
      return NextResponse.json({ error: 'Acesso negado.' }, { status: 403 });
    }

    return NextResponse.json(await loadCoachReplies(prisma, userId));
  } catch (error) {
    console.error('Erro GET coach-replies:', error);
    return NextResponse.json([]);
  }
}
