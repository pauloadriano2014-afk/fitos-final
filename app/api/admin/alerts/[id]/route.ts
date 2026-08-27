// app/api/admin/alerts/[id]/route.ts
import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuth, canAccessStudent } from '@/lib/auth';


export async function PATCH(req: Request, { params }: { params: { id: string } }) {
    try {
        const id = params.id;
        const body = await req.json();

        if (!id) {
            return NextResponse.json({ error: "Alert ID is required" }, { status: 400 });
        }

        const auth = requireAuth(req);
        if ('response' in auth) return auth.response;
        const existingAlert = await prisma.studentAlert.findUnique({
            where: { id },
            select: { userId: true, coachId: true }
        });
        if (!existingAlert) {
            return NextResponse.json({ error: "Alert not found" }, { status: 404 });
        }
        if (!canAccessStudent(auth.user, existingAlert.userId, existingAlert.coachId)) {
            return NextResponse.json({ error: 'Acesso negado.' }, { status: 403 });
        }

        // Atualiza o alerta no banco mudando a flag isRead para true
        const updatedAlert = await prisma.studentAlert.update({
            where: { id: id },
            data: {
                isRead: body.isRead
            }
        });

        return NextResponse.json(updatedAlert);
    } catch (error: any) {
        console.error("Erro ao dispensar alerta:", error);
        return NextResponse.json({ error: "Failed to dismiss alert" }, { status: 500 });
    }
}