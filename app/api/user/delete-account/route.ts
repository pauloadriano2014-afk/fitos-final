// app/api/user/delete-account/route.ts
// 🗑️ Exclusão de conta pelo próprio usuário (aluno ou coach) — exigida pela
// Apple (App Store Guideline 5.1.1(v)) e pelo Google Play pra qualquer app
// que permita criar conta.
//
// Não é um hard delete: apagar a linha do usuário de verdade derrubaria em
// cascata TODAS as Subscription/Payment dele (onDelete: Cascade em
// finance.prisma), o que destruiria histórico financeiro que a gente é
// obrigado a manter por obrigação fiscal (Asaas, PIX, NF). Em vez disso,
// isso aqui ANONIMIZA os dados pessoais e marca a conta como excluída
// (accountStatus = "DELETED", active = false) — os registros financeiros
// continuam intactos, vinculados ao mesmo id, mas sem nenhum dado pessoal
// identificável. Isso satisfaz tanto a LGPD (direito ao esquecimento) quanto
// a obrigação de manter registro fiscal.
//
// Login: com password trocado por um hash aleatório e accountStatus
// "DELETED", o usuário não consegue mais entrar (auth/login precisa checar
// accountStatus !== "DELETED" — ver nota abaixo).
import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { randomUUID } from 'crypto';
import prisma from '@/lib/prisma';
import { requireAuth, isMasterId } from '@/lib/auth';

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
      select: { id: true, accountStatus: true },
    });

    if (!existing) {
      return corsResponse({ error: 'Usuário não encontrado.' }, 404);
    }

    if (existing.accountStatus === 'DELETED') {
      // Idempotente — já estava excluída, não faz nada de novo.
      return corsResponse({ success: true, alreadyDeleted: true });
    }

    // Hash aleatório e descartável — invalida qualquer senha antiga, ninguém
    // (nem o próprio usuário) consegue mais logar com ela.
    const deadPassword = await bcrypt.hash(randomUUID(), 10);

    await prisma.user.update({
      where: { id: authUser.id },
      data: {
        // Identidade / contato
        name: 'Usuário removido',
        email: `deleted-${authUser.id}@removed.elitefit.local`,
        password: deadPassword,
        phone: null,
        cpf: null,
        birthDate: null,
        gender: null,
        photoUrl: null,
        evaluationUrl: null,

        // Endereço (exigido pelo checkout Asaas, sem uso depois de excluída)
        address: null,
        addressNumber: null,
        complement: null,
        province: null,
        postalCode: null,

        // Segredos / integrações pessoais
        pushToken: null,
        resetToken: null,
        resetTokenExpiry: null,
        coachAsaasApiKey: null,
        brandLogoUrl: null,
        brandColor: null,
        coachRequestInfo: null,
        inviteCode: null,

        // Anotações que o coach fez sobre esse aluno — dado pessoal dele.
        strategyNotes: null,

        // Estado da conta
        accountStatus: 'DELETED',
        active: false,
        isFinanceActive: false,
      },
    });

    return corsResponse({ success: true });
  } catch (error) {
    console.error('[delete-account] erro:', error);
    return corsResponse({ error: 'Erro ao excluir conta.' }, 500);
  }
}
