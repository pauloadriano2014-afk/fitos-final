import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';


export async function POST(req: Request) {
  try {
    const { userId, token } = await req.json();

    if (!userId || !token) {
      return NextResponse.json({ error: "Dados incompletos" }, { status: 400 });
    }

    // Atualiza o token no cadastro do usuário
    await prisma.user.update({
      where: { id: userId },
      data: { pushToken: token }
    });

    return NextResponse.json({ success: true });

  } catch (error) {
    console.error("Erro ao salvar token:", error);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}