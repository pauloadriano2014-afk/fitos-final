// app/api/admin/diet-feedbacks/route.ts
// 🔒 AGORA COM ISOLAMENTO: coach só vê feedbacks de dieta dos alunos dele

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// ─── LISTAR FEEDBACKS (PARA O PAINEL) ────────────────────────────
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const adminId = searchParams.get("adminId");

    // 🔒 Define o filtro pelo papel do solicitante
    // - ADMIN (Paulo/Adri): tudo (comportamento original)
    // - COACH: só feedbacks de alunos amarrados a ele
    // - adminId ausente (frontend antigo em cache): mantém comportamento original
    let where: any = undefined;

    if (adminId) {
      const requester = await prisma.user.findUnique({
        where: { id: adminId },
        select: { id: true, role: true, accountStatus: true },
      });

      if (!requester || !["ADMIN", "COACH"].includes(requester.role)) {
        return NextResponse.json({ error: "Acesso não autorizado" }, { status: 403 });
      }

      if (requester.role === "COACH") {
        if (requester.accountStatus !== "ACTIVE") {
          return NextResponse.json({ error: "Conta aguardando aprovação" }, { status: 403 });
        }
        where = {
          user: {
            OR: [
              { coachId: adminId },
              { nutritionistId: adminId },
            ],
          },
        };
      }
    }

    // Busca os feedbacks trazendo o nome e e-mail do aluno junto
    const feedbacks = await prisma.dietFeedback.findMany({
      where,
      include: {
        user: {
          select: {
            name: true,
            email: true,
            photoUrl: true,
          },
        },
      },
      orderBy: {
        createdAt: "desc", // Os mais recentes primeiro
      },
    });

    return NextResponse.json(feedbacks);
  } catch (error) {
    console.error("Erro ao buscar feedbacks:", error);
    return NextResponse.json({ error: "Erro interno no servidor" }, { status: 500 });
  }
}

// ─── MARCAR COMO LIDO (PATCH) ───────────────────────────────────
export async function PATCH(req: Request) {
  try {
    const { id, read } = await req.json();

    if (!id) {
      return NextResponse.json({ error: "ID não fornecido" }, { status: 400 });
    }

    const updatedFeedback = await prisma.dietFeedback.update({
      where: { id },
      data: { read: read ?? true },
    });

    return NextResponse.json(updatedFeedback);
  } catch (error) {
    return NextResponse.json({ error: "Erro ao atualizar feedback" }, { status: 500 });
  }
}

// ─── DELETAR FEEDBACK (OPCIONAL) ────────────────────────────────
export async function DELETE(req: Request) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");

  if (!id) return NextResponse.json({ error: "ID missing" }, { status: 400 });

  try {
    await prisma.dietFeedback.delete({ where: { id } });
    return NextResponse.json({ message: "Deletado com sucesso" });
  } catch (error) {
    return NextResponse.json({ error: "Erro ao deletar" }, { status: 500 });
  }
}