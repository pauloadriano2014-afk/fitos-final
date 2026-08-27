// app/api/admin/diet-feedbacks/route.ts
// 🔒 AGORA COM ISOLAMENTO: coach só vê feedbacks de dieta dos alunos dele

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, canAccessStudent, isMasterId } from "@/lib/auth";

// ─── LISTAR FEEDBACKS (PARA O PAINEL) ────────────────────────────
export async function GET(req: Request) {
  try {
    const auth = requireAuth(req);
    if ('response' in auth) return auth.response;

    // 🔒 Define o filtro pelo papel de quem chamou (do token, nunca do
    //    adminId do query string, que qualquer cliente podia forjar)
    // - Master (Paulo/Adri): tudo
    // - COACH: só feedbacks de alunos amarrados a ele
    let where: any = undefined;

    if (!isMasterId(auth.user.id)) {
      if (auth.user.role !== "COACH") {
        return NextResponse.json({ error: "Acesso não autorizado" }, { status: 403 });
      }

      const requester = await prisma.user.findUnique({
        where: { id: auth.user.id },
        select: { accountStatus: true },
      });

      if (requester?.accountStatus !== "ACTIVE") {
        return NextResponse.json({ error: "Conta aguardando aprovação" }, { status: 403 });
      }
      where = {
        user: {
          OR: [
            { coachId: auth.user.id },
            { nutritionistId: auth.user.id },
          ],
        },
      };
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
    const auth = requireAuth(req);
    if ('response' in auth) return auth.response;

    const { id, read } = await req.json();

    if (!id) {
      return NextResponse.json({ error: "ID não fornecido" }, { status: 400 });
    }

    const feedback = await prisma.dietFeedback.findUnique({
      where: { id },
      select: { userId: true },
    });
    if (!feedback) {
      return NextResponse.json({ error: "Feedback não encontrado" }, { status: 404 });
    }
    const targetUser = await prisma.user.findUnique({
      where: { id: feedback.userId },
      select: { coachId: true },
    });
    if (!canAccessStudent(auth.user, feedback.userId, targetUser?.coachId)) {
      return NextResponse.json({ error: 'Acesso negado.' }, { status: 403 });
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
  try {
    const auth = requireAuth(req);
    if ('response' in auth) return auth.response;

    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");

    if (!id) return NextResponse.json({ error: "ID missing" }, { status: 400 });

    const feedback = await prisma.dietFeedback.findUnique({
      where: { id },
      select: { userId: true },
    });
    if (!feedback) {
      return NextResponse.json({ error: "Feedback não encontrado" }, { status: 404 });
    }
    const targetUser = await prisma.user.findUnique({
      where: { id: feedback.userId },
      select: { coachId: true },
    });
    if (!canAccessStudent(auth.user, feedback.userId, targetUser?.coachId)) {
      return NextResponse.json({ error: 'Acesso negado.' }, { status: 403 });
    }

    await prisma.dietFeedback.delete({ where: { id } });
    return NextResponse.json({ message: "Deletado com sucesso" });
  } catch (error) {
    return NextResponse.json({ error: "Erro ao deletar" }, { status: 500 });
  }
}