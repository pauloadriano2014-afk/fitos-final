// app/api/admin/alerts/[id]/route.ts
import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
    try {
        const id = params.id;
        const body = await req.json();

        if (!id) {
            return NextResponse.json({ error: "Alert ID is required" }, { status: 400 });
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