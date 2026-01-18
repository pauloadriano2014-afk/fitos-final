import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  try {
    const users = await prisma.user.findMany({
      where: { role: 'USER' },
      select: { id: true, name: true, email: true, plan: true }, // <--- ADICIONE PLAN: TRUE
      orderBy: { createdAt: 'desc' }
    });

    // Busca biblioteca de exercícios para você escolher
    const exercises = await prisma.exercise.findMany({
      orderBy: { name: 'asc' }
    });

    return NextResponse.json({ users, exercises });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}