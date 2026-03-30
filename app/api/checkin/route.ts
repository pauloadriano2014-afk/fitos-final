import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// POST: Aluno envia Check-in
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { userId, weight, feedback, photoFront, photoBack, photoSide } = body;

    if (!userId) return NextResponse.json({ error: "User ID required" }, { status: 400 });

    const checkIn = await prisma.checkIn.create({
      data: {
        userId,
        weight: parseFloat(weight) || null,
        feedback,
        photoFront,
        photoBack,
        photoSide,
        date: new Date()
      }
    });

    if (weight) {
        await prisma.user.update({
            where: { id: userId },
            data: { currentWeight: parseFloat(weight) }
        }).catch(e => console.log("Erro ao atualizar peso user:", e));
    }

    return NextResponse.json({ success: true, id: checkIn.id });

  } catch (error) {
    console.error("Erro Checkin POST:", error);
    return NextResponse.json({ error: "Erro ao enviar check-in" }, { status: 500 });
  }
}

// GET: Flexível (Histórico do Aluno OU Lista Geral pro Admin)
export async function GET(req: Request) {
    const { searchParams } = new URL(req.url);
    const userId = searchParams.get('userId');
    const adminId = searchParams.get('adminId'); // 🔥 O CRACHÁ DE SEGURANÇA

    try {
        const whereClause: any = {};
        
        if (userId) {
            whereClause.userId = userId; // Se for o aluno pedindo os próprios dados
        } else if (adminId) {
            whereClause.user = { coachId: adminId }; // 🔥 BLINDAGEM: Só check-ins dos alunos DESTE admin
        }

        const checkins = await prisma.checkIn.findMany({
            where: whereClause,
            orderBy: { date: 'desc' },
            include: {
                user: {
                    select: { name: true, email: true }
                }
            },
            take: 50 
        });

        return NextResponse.json(checkins);
    } catch (error) {
        console.error("Erro Checkin GET:", error);
        return NextResponse.json({ error: "Erro ao buscar check-ins" }, { status: 500 });
    }
}