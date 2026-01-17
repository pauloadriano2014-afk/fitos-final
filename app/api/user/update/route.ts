import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export async function PUT(req: Request) {
  try {
    const body = await req.json();
    const { userId, name, phone, password } = body;

    if (!userId) {
      return NextResponse.json({ error: "ID do usuário obrigatório" }, { status: 400 });
    }

    // Prepara o objeto de atualização
    const updateData: any = {};
    if (name) updateData.name = name;
    if (phone) updateData.phone = phone;
    // Se quiser permitir troca de senha simples (sem hash por enquanto, ou adicione bcrypt aqui se já usar)
    if (password) updateData.password = password;

    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: updateData,
    });

    return NextResponse.json({ success: true, user: updatedUser });

  } catch (error) {
    console.error("Erro ao atualizar perfil:", error);
    return NextResponse.json({ error: "Erro ao atualizar dados." }, { status: 500 });
  }
}