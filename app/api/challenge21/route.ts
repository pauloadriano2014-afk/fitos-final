// app/api/challenge21/route.ts
// 🔥 (3 out 2026) Desafio de 21 dias: resumo do dia e do desafio (missões de hoje, calendário, sequência, pontos). Ver lib/challenge21.ts.
//   GET ?userId=  (padrão: o próprio aluno; coach/master podem consultar um aluno)
import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuth, canAccessStudent } from '@/lib/auth';
import { loadChallenge, isMissingTable } from '@/lib/challenge21Data';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  try {
    const auth = requireAuth(req);
    if ('response' in auth) return auth.response;
    const userId = new URL(req.url).searchParams.get('userId') || auth.user.id;

    const target = await prisma.user.findUnique({ where: { id: userId }, select: { coachId: true } });
    if (!target) return NextResponse.json({ error: 'Aluno não encontrado.' }, { status: 404 });
    if (!canAccessStudent(auth.user, userId, target.coachId)) return NextResponse.json({ error: 'Acesso negado.' }, { status: 403 });

    return NextResponse.json(await loadChallenge(prisma, userId));
  } catch (error: any) {
    if (isMissingTable(error)) return NextResponse.json({ error: 'Tabela do desafio ainda não existe: rode "npx prisma db push".' }, { status: 503 });
    console.error('[GET /api/challenge21]', error);
    return NextResponse.json({ error: 'Erro ao carregar o desafio.' }, { status: 500 });
  }
}
