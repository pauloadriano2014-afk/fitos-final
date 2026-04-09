import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

// 🔥 DETONADOR DE CACHE: Obriga o servidor a processar na hora
export const dynamic = 'force-dynamic';
export const revalidate = 0;

const prisma = new PrismaClient();

export async function POST(req: Request) {
    try {
        const { checkinId, coachFeedback } = await req.json();

        if (!checkinId || !coachFeedback) {
            return NextResponse.json({ error: "checkinId e coachFeedback são obrigatórios." }, { status: 400 });
        }

        // Salva o feedback no check-in
        const checkIn = await prisma.checkIn.update({
            where: { id: checkinId },
            data: { coachFeedback },
            include: {
                user: { select: { name: true, pushToken: true } }
            }
        });

        // Envia push notification pro aluno
        if (checkIn.user?.pushToken) {
            fetch('https://exp.host/--/api/v2/push/send', {
                method: 'POST',
                headers: {
                    Accept: 'application/json',
                    'Accept-encoding': 'application/json',
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    to: checkIn.user.pushToken,
                    sound: 'default',
                    title: '📋 Avaliação do Coach Disponível!',
                    body: 'Seu Coach analisou suas fotos e enviou o feedback. Toque para ver!',
                }),
            }).catch(err => console.log("Erro ao enviar push pro aluno:", err));
        }

        return NextResponse.json({ success: true });

    } catch (error) {
        console.error("Erro checkin/evaluate:", error);
        return NextResponse.json({ error: "Erro ao salvar avaliação." }, { status: 500 });
    }
}
