import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, canAccessStudent } from "@/lib/auth";

export async function POST(req: Request) {
  try {
    const auth = requireAuth(req);
    if ('response' in auth) return auth.response;

    const body = await req.json();
    const { userId, satiety, difficulty, requestedChanges } = body;

    const targetUser = await prisma.user.findUnique({
      where: { id: userId },
      select: { coachId: true },
    });
    if (!canAccessStudent(auth.user, userId, targetUser?.coachId)) {
      return NextResponse.json({ error: 'Acesso negado.' }, { status: 403 });
    }

    const feedback = await prisma.dietFeedback.create({
      data: {
        userId,
        satiety,
        difficulty,
        requestedChanges
      }
    });

    return NextResponse.json({ message: "Feedback registrado!", feedback }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: "Failed to create feedback" }, { status: 500 });
  }
}