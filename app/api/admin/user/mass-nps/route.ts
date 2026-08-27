// app/api/admin/user/mass-nps/route.ts
import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuth, isMasterId } from '@/lib/auth';


// 🔒 Disparo em massa: cada coach só pode mandar NPS pros PRÓPRIOS alunos.
// Master (Paulo/Adri) pode mandar pra qualquer lista.
export async function PATCH(req: Request) {
    try {
        const { studentIds } = await req.json();

        if (!studentIds || !Array.isArray(studentIds)) {
            return NextResponse.json({ error: "Lista de alunos inválida" }, { status: 400 });
        }

        const auth = requireAuth(req);
        if ('response' in auth) return auth.response;

        if (!isMasterId(auth.user.id)) {
            const ownedCount = await prisma.user.count({
                where: { id: { in: studentIds }, coachId: auth.user.id }
            });
            if (ownedCount !== studentIds.length) {
                return NextResponse.json({ error: "Você só pode disparar NPS para os seus próprios alunos." }, { status: 403 });
            }
        }

        await prisma.user.updateMany({
            where: { id: { in: studentIds } },
            data: { npsRequested: true }
        });

        return NextResponse.json({ message: "Pesquisa enviada para a fila de processamento!" });
    } catch (error) {
        console.error("Erro ao disparar NPS:", error);
        return NextResponse.json({ error: "Erro ao disparar pesquisas" }, { status: 500 });
    }
}