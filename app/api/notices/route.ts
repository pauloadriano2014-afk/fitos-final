import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// POST: Criar um novo aviso (Admin)
export async function POST(req: Request) {
  try {
    const { title, content } = await req.json();

    if (!title || !content) return NextResponse.json({ error: "Dados incompletos" }, { status: 400 });

    // (Opcional) Desativar avisos anteriores para manter apenas 1 ativo
    // await prisma.notice.updateMany({ data: { active: false } });

    const notice = await prisma.notice.create({
      data: {
        title,
        content,
        date: new Date(),
        active: true
      }
    });

    return NextResponse.json(notice);
  } catch (error) {
    return NextResponse.json({ error: "Erro ao criar aviso" }, { status: 500 });
  }
}

// GET: Pegar o último aviso (App do Aluno)
export async function GET() {
  try {
    const notice = await prisma.notice.findFirst({
      where: { active: true },
      orderBy: { date: 'desc' }
    });
    return NextResponse.json(notice || null);
  } catch (error) {
    return NextResponse.json(null);
  }
}