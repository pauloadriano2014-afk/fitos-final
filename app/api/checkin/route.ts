import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// POST: Aluno envia Check-in
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { userId, weight, feedback, photoFront, photoBack, photoSide } = body;

    if (!userId) return NextResponse.json({ error: "User ID required" }, { status: 400 });

    // 1. Salva o Check-in no banco
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

    // 2. Pega os dados do aluno para notificar o Coach
    const userToUpdate = await prisma.user.findUnique({
        where: { id: userId },
        select: { coachId: true, name: true }
    });

    // 3. Zera a data de cobrança manual (para desligar o pulso) e atualiza o peso
    const updateData: any = { nextCheckInDate: null };
    if (weight) updateData.currentWeight = parseFloat(weight);

    await prisma.user.update({
        where: { id: userId },
        data: updateData
    }).catch(e => console.log("Erro ao atualizar peso e data do user:", e));

    // 4. 🔥 NOTIFICAÇÃO PUSH PARA O COACH
    if (userToUpdate?.coachId) {
         const coach = await prisma.user.findUnique({
             where: { id: userToUpdate.coachId },
             select: { pushToken: true }
         });
         
         if (coach?.pushToken) {
             await fetch('https://exp.host/--/api/v2/push/send', {
                 method: 'POST',
                 headers: {
                     Accept: 'application/json',
                     'Accept-encoding': 'application/json',
                     'Content-Type': 'application/json',
                 },
                 body: JSON.stringify({
                     to: coach.pushToken,
                     sound: 'default',
                     title: '📸 Novo Check-in Recebido!',
                     body: `O aluno ${userToUpdate.name || 'Atleta'} acabou de enviar as fotos de evolução. Vá conferir!`,
                 }),
             }).catch(err => console.log("Erro ao enviar push pro coach:", err));
         }
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
    const adminId = searchParams.get('adminId'); 

    try {
        const whereClause: any = {};
        
        if (userId) {
            whereClause.userId = userId; 
        } else if (adminId) {
            whereClause.user = { coachId: adminId }; 
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

// 🔥 NOVO: DELETE EXCLUI O CHECK-IN ESPECÍFICO E AS FOTOS VINCULADAS
export async function DELETE(req: Request) {
    try {
        const { searchParams } = new URL(req.url);
        const id = searchParams.get('id');
        
        if (!id) return NextResponse.json({ error: "ID não fornecido" }, { status: 400 });

        await prisma.checkIn.delete({
            where: { id }
        });

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error("Erro Checkin DELETE:", error);
        return NextResponse.json({ error: "Erro ao excluir check-in" }, { status: 500 });
    }
}