// fitos-api-nova/app/api/admin/desafios/[id]/inscricoes/[inscricaoId]/route.ts
//
// DELETE → remove uma inscrição específica. Os check-ins dela são apagados
// junto automaticamente (onDelete: Cascade já configurado no schema entre
// DesafioCheckin e DesafioInscricao) — não precisa deletar em duas etapas.
//
// Útil pra limpar inscrições de teste feitas sem usar o fluxo "criar-teste"
// (ex: quando a própria Adri/Paulo se inscreveu de verdade só pra testar
// o pagamento, e depois não deveria contar como participante real).
//
// ⚠️ AJUSTE O IMPORT ABAIXO para o caminho real do seu singleton Prisma

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function DELETE(
    request: NextRequest,
    { params }: { params: { id: string; inscricaoId: string } }
) {
    try {
        const { inscricaoId } = params;
        await prisma.desafioInscricao.delete({ where: { id: inscricaoId } });
        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('[desafios/id/inscricoes/inscricaoId][DELETE]', error);
        return NextResponse.json({ error: 'Erro ao remover inscrição' }, { status: 500 });
    }
}
