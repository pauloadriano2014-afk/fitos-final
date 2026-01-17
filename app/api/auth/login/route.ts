import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
export const dynamic = 'force-dynamic'; // Garante verificação em tempo real

export async function POST(req: Request) {
  try {
    const { email, password } = await req.json();
    console.log(`Tentativa de login para: ${email}`);

    // AQUI ESTÁ A CORREÇÃO MÁGICA 👇
    const user = await prisma.user.findUnique({ 
      where: { email },
      include: { 
        anamneses: true // Traz o histórico para o App saber que ele já é aluno!
      }
    });

    if (user && user.password === password) {
      // Remove a senha por segurança antes de enviar
      const { password: _, ...userWithoutPassword } = user;
      
      return NextResponse.json({ user: userWithoutPassword });
    }

    return NextResponse.json({ error: 'E-mail ou senha incorretos' }, { status: 401 });
  } catch (error) {
    console.error("Erro na rota de login:", error);
    return NextResponse.json({ error: 'Erro interno no servidor' }, { status: 500 });
  }
}