// lib/accountDeletion.ts
// 🗑️ Lógica de anonimização de conta, compartilhada entre:
//  - app/api/user/delete-account (auto-exclusão do próprio usuário: aluno
//    sempre na hora; coach na hora também, SE não tiver aluno ativo)
//  - app/api/admin/deletion-requests/[id] (master conclui uma exclusão de
//    coach que ficou pendente por ter aluno(s) ativo(s) no momento do pedido)
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
import bcrypt from 'bcryptjs';
import { randomUUID } from 'crypto';
import prisma from '@/lib/prisma';
import { isMasterId } from '@/lib/auth';

export async function anonymizeUserAccount(userId: string): Promise<{ alreadyDeleted: boolean }> {
  // 🔒 Segunda trava (a primeira é em cada rota que chama isso) — contas
  // master nunca passam por aqui, nem por engano.
  if (isMasterId(userId)) {
    throw new Error('Contas master não podem ser excluídas por essa rota.');
  }

  const existing = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, accountStatus: true },
  });

  if (!existing) {
    throw new Error('Usuário não encontrado.');
  }

  if (existing.accountStatus === 'DELETED') {
    // Idempotente — já estava excluída, não faz nada de novo.
    return { alreadyDeleted: true };
  }

  // Hash aleatório e descartável — invalida qualquer senha antiga, ninguém
  // (nem o próprio usuário) consegue mais logar com ela.
  const deadPassword = await bcrypt.hash(randomUUID(), 10);

  await prisma.user.update({
    where: { id: userId },
    data: {
      // Identidade / contato
      name: 'Usuário removido',
      email: `deleted-${userId}@removed.elitefit.local`,
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

      // Segredos / integrações pessoais (inclui os campos específicos de
      // coach — essa mesma função anonimiza tanto aluno quanto coach)
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
      deletionRequestedAt: null,
    },
  });

  return { alreadyDeleted: false };
}

// 🔍 Conta quantos alunos ATIVOS (não excluídos) um coach ainda tem — usado
// pra decidir se a auto-exclusão dele pode ser imediata ou vira um pedido
// pendente de revisão do master (ver app/api/user/delete-account).
export async function countActiveStudents(coachId: string): Promise<number> {
  return prisma.user.count({
    where: { coachId, accountStatus: { not: 'DELETED' } },
  });
}
