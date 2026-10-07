// app/api/admin/indicacoes/[id]/route.ts
// 🤝 Pausar / reativar o código de indicação de um aluno (o id é o do código, o mesmo que a lista devolve). Só o coach dono ou o time master.
//   PATCH { ativo: boolean }
import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuth, canActAsCoach } from '@/lib/auth';
import { ORIGEM_CODIGO } from '@/lib/indicacao';

export const dynamic = 'force-dynamic';

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
    try {
        const auth = requireAuth(request);
        if ('response' in auth) return auth.response;
        const codigo = await prisma.cupomDesconto.findUnique({ where: { id: params.id }, select: { id: true, coachId: true, origem: true } });
        if (!codigo || codigo.origem !== ORIGEM_CODIGO) return NextResponse.json({ error: 'Código de indicação não encontrado.' }, { status: 404 });
        if (!canActAsCoach(auth.user, codigo.coachId)) return NextResponse.json({ error: 'Acesso negado.' }, { status: 403 });

        const body = await request.json().catch(() => ({}));
        if (typeof body?.ativo !== 'boolean') return NextResponse.json({ error: 'Informe se o código fica ativo ou pausado.' }, { status: 400 });
        const atualizado = await prisma.cupomDesconto.update({ where: { id: params.id }, data: { ativo: body.ativo } });
        return NextResponse.json({ ok: true, ativo: atualizado.ativo !== false });
    } catch (error: any) {
        console.error('[admin/indicacoes/[id]][PATCH]', error?.message || error);
        return NextResponse.json({ error: 'Erro ao atualizar o código.' }, { status: 500 });
    }
}
