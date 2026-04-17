import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { userId, satiety, difficulty, requestedChanges } = body;

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