// app/api/admin/deletion-requests/route.ts
// 🔒 Lista pedidos de exclusão de conta pendentes de revisão — hoje só
// acontece com coach parceiro que tinha aluno(s) ativo(s) na hora do pedido
// (ver app/api/user/delete-account e lib/accountDeletion.ts). Só master.
import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireMaster } from '@/lib/auth';

export async function GET(req: NextRequest) {
  try {
    const auth = requireMaster(req);
    if ('response' in auth) return auth.response;

    const requests = await prisma.user.findMany({
      where: {
        deletionRequestedAt: { not: null },
        accountStatus: { not: 'DELETED' },
      } as any,
      select: {
        id: true, name: true, email: true, phone: true, role: true,
        coachPlan: true, deletionRequestedAt: true,
      } as any,
      orderBy: { deletionRequestedAt: 'asc' } as any,
    });

    // Conta os alunos ATIVOS de cada um separadamente — o número pode ter
    // mudado desde o pedido (ex: aluno cancelou nesse meio tempo).
    const withCounts = await Promise.all(
      requests.map(async (r: any) => ({
        ...r,
        activeStudents: await prisma.user.count({
          where: { coachId: r.id, accountStatus: { not: 'DELETED' } },
        }),
      }))
    );

    return NextResponse.json(withCounts);
  } catch (error: any) {
    console.error('[deletion-requests GET]', error?.message);
    return NextResponse.json({ error: 'Erro ao listar pedidos de exclusão.' }, { status: 500 });
  }
}
