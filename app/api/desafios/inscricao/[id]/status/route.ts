// fitos-api-nova/app/api/desafios/inscricao/[id]/status/route.ts
//
// GET /api/desafios/inscricao/{id}/status
//
// Rota PÚBLICA — a tela de inscrição consulta essa rota periodicamente
// (a cada poucos segundos) enquanto aguarda a confirmação do PIX.
// Só quando status === 'PAGO' o linkGrupoWhats é incluído na resposta —
// esse é o "gatilho" que libera o link automaticamente pro aluno,
// sem precisar de nenhuma ação manual do coach.
//
// ⚠️ AJUSTE O IMPORT ABAIXO para o caminho real do seu singleton Prisma

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET(
    request: NextRequest,
    { params }: { params: { id: string } }
) {
    try {
        const { id } = params;

        const inscricao = await prisma.desafioInscricao.findUnique({
            where: { id },
            include: { desafio: { select: { nome: true, linkGrupoWhats: true } } },
        });

        if (!inscricao) {
            return NextResponse.json({ error: 'Inscrição não encontrada' }, { status: 404 });
        }

        const response: Record<string, any> = {
            status: inscricao.status,
            nome: inscricao.nome,
        };

        if (inscricao.status === 'PAGO') {
            response.linkGrupoWhats = inscricao.desafio.linkGrupoWhats;
            response.desafioNome = inscricao.desafio.nome;
        }

        return NextResponse.json(response);
    } catch (error) {
        console.error('[desafios/inscricao/id/status][GET]', error);
        return NextResponse.json({ error: 'Erro ao consultar status' }, { status: 500 });
    }
}
