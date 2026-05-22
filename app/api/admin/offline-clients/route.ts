import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

// Rota para SALVAR ou ATUALIZAR um aluno offline
export async function POST(req: Request) {
  try {
    const data = await req.json();

    const newClient = await prisma.offlineClient.upsert({
      where: { id: data.id },
      update: {
        name: data.name,
        phone: data.phone,
        plan: data.plan,
        financeCategory: data.financeCategory,
        contractType: data.contractType,
        contractValue: data.contractValue,
        startDate: data.startDate ? new Date(data.startDate) : null,
        paymentDueDate: data.paymentDueDate ? new Date(data.paymentDueDate) : null,
        photoUrl: data.photoUrl,
        isFinanceActive: data.isFinanceActive,
        assignedCoach: data.assignedCoach,
        coachId: data.coachId
      },
      create: {
        id: data.id,
        name: data.name,
        phone: data.phone,
        plan: data.plan,
        financeCategory: data.financeCategory,
        contractType: data.contractType,
        contractValue: data.contractValue,
        startDate: data.startDate ? new Date(data.startDate) : null,
        paymentDueDate: data.paymentDueDate ? new Date(data.paymentDueDate) : null,
        photoUrl: data.photoUrl,
        isFinanceActive: data.isFinanceActive,
        assignedCoach: data.assignedCoach,
        coachId: data.coachId
      }
    });

    return NextResponse.json({ success: true, client: newClient });
  } catch (error: any) {
    console.error("Erro ao salvar aluno offline:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// Rota para BUSCAR todos os alunos offline
export async function GET() {
  try {
    const clients = await prisma.offlineClient.findMany();
    return NextResponse.json(clients);
  } catch (error: any) {
    console.error("Erro ao buscar alunos offline:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// Rota para EXCLUIR um aluno offline definitivamente
export async function DELETE(req: Request) {
  try {
    const { id } = await req.json();

    if (!id) {
      return NextResponse.json({ error: "ID não fornecido" }, { status: 400 });
    }

    await prisma.offlineClient.delete({
      where: { id }
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("Erro ao excluir aluno offline:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}