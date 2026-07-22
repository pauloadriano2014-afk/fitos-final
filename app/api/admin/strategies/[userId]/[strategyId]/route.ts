// app/api/admin/strategies/[userId]/[strategyId]/route.ts
// Ações em uma estratégia específica: ativar, desativar, editar datas, deletar
import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

export const dynamic = 'force-dynamic';

const prisma = new PrismaClient();

// ─── PATCH — ativar/desativar/editar estratégia ──────────────────────────────
export async function PATCH(
  req: Request,
  { params }: { params: { userId: string; strategyId: string } }
) {
  try {
    const { userId, strategyId } = params;
    const body = await req.json();

    const {
      action,             // 'activate' | 'deactivate' | 'update'
      strategyName,
      strategyStartDate,
      strategyEndDate,
      goal,
      waterIntake,
      generalNotes,
    } = body;

    // Confirma que a estratégia pertence ao aluno
    const strategy = await prisma.diet.findFirst({
      where: { id: strategyId, userId, isStrategy: true },
    });

    if (!strategy) {
      return NextResponse.json({ error: 'Estratégia não encontrada' }, { status: 404 });
    }

    if (action === 'activate') {
      // Desativa qualquer outra estratégia ativa do aluno primeiro
      await prisma.diet.updateMany({
        where: { userId, isStrategy: true, strategyActive: true, id: { not: strategyId } },
        data:  { strategyActive: false },
      });

      const updated = await prisma.diet.update({
        where: { id: strategyId },
        data:  { strategyActive: true },
      });

      return NextResponse.json(updated);
    }

    if (action === 'deactivate') {
      const updated = await prisma.diet.update({
        where: { id: strategyId },
        data:  { strategyActive: false },
      });

      return NextResponse.json(updated);
    }

    if (action === 'update') {
      const updated = await prisma.diet.update({
        where: { id: strategyId },
        data: {
          ...(strategyName      !== undefined && { strategyName, name: `Estratégia: ${strategyName}` }),
          ...(strategyStartDate !== undefined && { strategyStartDate: strategyStartDate ? new Date(strategyStartDate) : null }),
          ...(strategyEndDate   !== undefined && { strategyEndDate:   strategyEndDate   ? new Date(strategyEndDate)   : null }),
          ...(goal              !== undefined && { goal }),
          ...(waterIntake       !== undefined && { waterIntake }),
          ...(generalNotes      !== undefined && { generalNotes }),
        },
      });

      return NextResponse.json(updated);
    }

    return NextResponse.json({ error: 'Ação inválida. Use: activate | deactivate | update' }, { status: 400 });

  } catch (error: any) {
    console.error('PATCH strategy error:', error);
    return NextResponse.json({ error: 'Erro ao atualizar estratégia', details: error.message }, { status: 500 });
  }
}

// ─── DELETE — remove a estratégia permanentemente ────────────────────────────
export async function DELETE(
  req: Request,
  { params }: { params: { userId: string; strategyId: string } }
) {
  try {
    const { userId, strategyId } = params;

    const strategy = await prisma.diet.findFirst({
      where: { id: strategyId, userId, isStrategy: true },
    });

    if (!strategy) {
      return NextResponse.json({ error: 'Estratégia não encontrada' }, { status: 404 });
    }

    await prisma.diet.delete({ where: { id: strategyId } });

    return NextResponse.json({ success: true });

  } catch (error: any) {
    console.error('DELETE strategy error:', error);
    return NextResponse.json({ error: 'Erro ao deletar estratégia', details: error.message }, { status: 500 });
  }
}