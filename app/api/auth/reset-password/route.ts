// app/api/auth/reset-password/route.ts
// 🔑 ESQUECI MINHA SENHA — Passo 2
//
// Recebe { token, newPassword }. Valida o token (hash bate? não expirou?),
// salva a nova senha JÁ COM HASH BCRYPT e invalida o token (uso único).

import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  try {
    const { token, newPassword } = await req.json();

    if (!token || typeof token !== 'string') {
      return NextResponse.json(
        { error: 'Link inválido. Solicite uma nova redefinição.' },
        { status: 400 }
      );
    }

    if (!newPassword || typeof newPassword !== 'string' || newPassword.length < 6) {
      return NextResponse.json(
        { error: 'A nova senha precisa ter pelo menos 6 caracteres.' },
        { status: 400 }
      );
    }

    // Compara pelo hash do token (o banco nunca guarda o token cru)
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

    const user = await prisma.user.findFirst({
      where: {
        resetToken: tokenHash,
        resetTokenExpiry: { gt: new Date() }, // ainda válido
      } as any,
    });

    if (!user) {
      return NextResponse.json(
        { error: 'Este link expirou ou já foi usado. Solicite uma nova redefinição na tela de login.' },
        { status: 400 }
      );
    }

    // 🔐 Salva com bcrypt e invalida o token (uso único)
    const hashed = await bcrypt.hash(newPassword, 10);

    await prisma.user.update({
      where: { id: user.id },
      data: {
        password: hashed,
        resetToken: null,
        resetTokenExpiry: null,
      } as any,
    });

    return NextResponse.json({
      success: true,
      message: 'Senha redefinida com sucesso! Faça login com a nova senha.',
    });
  } catch (error) {
    console.error('[reset-password] Erro:', error);
    return NextResponse.json(
      { error: 'Erro interno. Tente novamente.' },
      { status: 500 }
    );
  }
}