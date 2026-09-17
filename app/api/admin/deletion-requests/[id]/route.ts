// app/api/admin/deletion-requests/[id]/route.ts
// 🔒 Master resolve um pedido de exclusão pendente (coach com aluno ativo
// que pediu pra excluir a conta — ver app/api/user/delete-account):
//  - COMPLETE: confirma a exclusão de verdade (anonimiza a conta do coach).
//    Use só DEPOIS de já ter decidido o que fazer com os alunos dele
//    (reatribuir pra você/Adri/outro parceiro, ou orientar a migrarem) —
//    essa rota não mexe no coachId dos alunos, só na conta do coach.
//  - DISMISS: cancela o pedido, a conta do coach continua ativa normalmente
//    (ex: você conversou com ele e decidiu não excluir).
import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireMaster } from '@/lib/auth';
import { anonymizeUserAccount } from '@/lib/accountDeletion';

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const auth = requireMaster(req);
    if ('response' in auth) return auth.response;

    const { id } = params;
    const body = await req.json().catch(() => ({}));
    const { action } = body;

    if (!id || !['COMPLETE', 'DISMISS'].includes(action)) {
      return NextResponse.json({ error: 'id e action (COMPLETE ou DISMISS) são obrigatórios.' }, { status: 400 });
    }

    const target = await prisma.user.findUnique({
      where: { id },
      select: { id: true, name: true, deletionRequestedAt: true },
    });

    if (!target || !target.deletionRequestedAt) {
      return NextResponse.json({ error: 'Pedido de exclusão não encontrado.' }, { status: 404 });
    }

    if (action === 'DISMISS') {
      await prisma.user.update({ where: { id }, data: { deletionRequestedAt: null } });
      return NextResponse.json({ success: true, status: 'DISMISSED' });
    }

    // COMPLETE
    const result = await anonymizeUserAccount(id);
    return NextResponse.json({ success: true, status: 'DELETED', ...result });
  } catch (error: any) {
    console.error('[deletion-requests POST]', error?.message);
    return NextResponse.json({ error: error?.message || 'Erro ao processar pedido.' }, { status: 500 });
  }
}
