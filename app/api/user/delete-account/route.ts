// app/api/user/delete-account/route.ts
// 🗑️ Exclusão de conta pelo próprio usuário (aluno ou coach) — exigida pela
// Apple (App Store Guideline 5.1.1(v)) e pelo Google Play pra qualquer app
// que permita criar conta. A política do Google não abre exceção pra contas
// "profissionais"/parceiro — vale pra aluno E pra coach igualmente.
//
// Não é um hard delete — ver nota detalhada em lib/accountDeletion.ts sobre
// por que isso ANONIMIZA em vez de apagar a linha.
//
// 🔥 (17 set 2026) Coach parceiro com aluno(s) ATIVO(s) não pode sumir na
// hora — os alunos dele ficariam com o coachId apontando pra uma conta já
// anonimizada (biblioteca, PA FLIX, técnicas etc. quebrariam pra eles). Nesse
// caso a exclusão vira um PEDIDO (deletionRequestedAt) em vez de acontecer na
// hora: o coach continua ativo/logado normalmente, o master é avisado por
// push e vê o pedido pendente no painel, e só quando ele decidir o que fazer
// com os alunos e confirmar (ver app/api/admin/deletion-requests) é que a
// conta do coach é de fato anonimizada. Aluno nunca passa por essa etapa —
// continua excluindo na hora, igual sempre foi.
import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuth, isMasterId } from '@/lib/auth';
import { anonymizeUserAccount, countActiveStudents } from '@/lib/accountDeletion';
import { sendPushToUsers } from '@/app/utils/sendNotification';
import { MASTER_IDS } from '@/lib/masterIds';

function corsResponse(body: any, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  });
}

export async function OPTIONS() {
  return corsResponse({});
}

export async function DELETE(req: Request) {
  try {
    const auth = requireAuth(req);
    if ('response' in auth) return auth.response;
    const { user: authUser } = auth;

    // 🔒 Contas master (Paulo/Adri) não se auto-excluem por aqui — elas são
    // donas do sistema inteiro. Se um dia precisar, isso é feito manualmente.
    if (isMasterId(authUser.id)) {
      return corsResponse(
        { error: 'Contas master não podem ser excluídas por essa rota.' },
        403
      );
    }

    const existing = await prisma.user.findUnique({
      where: { id: authUser.id },
      select: { id: true, name: true, role: true, accountStatus: true, deletionRequestedAt: true },
    });

    if (!existing) {
      return corsResponse({ error: 'Usuário não encontrado.' }, 404);
    }

    if (existing.accountStatus === 'DELETED') {
      // Idempotente — já estava excluída, não faz nada de novo.
      return corsResponse({ success: true, alreadyDeleted: true });
    }

    // 🔒 Coach com aluno ativo -> vira pedido pendente, não anonimiza na hora.
    if (existing.role === 'COACH') {
      const activeStudents = await countActiveStudents(existing.id);
      if (activeStudents > 0) {
        if (!existing.deletionRequestedAt) {
          await prisma.user.update({
            where: { id: existing.id },
            data: { deletionRequestedAt: new Date() },
          });

          try {
            const masters = await prisma.user.findMany({
              where: { id: { in: MASTER_IDS } },
              select: { id: true, pushToken: true, webPushSubscription: true },
            });
            await sendPushToUsers(
              masters,
              '⚠️ Pedido de exclusão de conta',
              `${existing.name || 'Um coach parceiro'} pediu pra excluir a conta e ainda tem ${activeStudents} aluno${activeStudents === 1 ? '' : 's'} ativo${activeStudents === 1 ? '' : 's'}. Revise antes de confirmar.`
            );
          } catch (e) { /* não-crítico */ }
        }

        return corsResponse({
          success: true,
          pending: true,
          activeStudents,
          message: 'Seu pedido de exclusão foi enviado. Como você ainda tem aluno(s) ativo(s), o time responsável vai revisar antes de concluir — você continua com acesso normal até lá.',
        });
      }
    }

    await anonymizeUserAccount(existing.id);
    return corsResponse({ success: true });
  } catch (error: any) {
    console.error('[delete-account] erro:', error?.message || error);
    return corsResponse({ error: 'Erro ao excluir conta.' }, 500);
  }
}
