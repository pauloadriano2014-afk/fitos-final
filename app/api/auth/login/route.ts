// app/api/auth/login/route.ts
import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  try {
    const { email, password } = await req.json();

    const user = await prisma.user.findUnique({ 
      where: { email },
      include: { 
        anamneses: true 
      }
    });

    if (user && user.password === password) {
      const { password: _, ...userWithoutPassword } = user;
      
      // 🔥 O Servidor agora devolve o usuário com a role ('ADMIN' ou 'USER')
      return NextResponse.json({ user: userWithoutPassword });
    }

    return NextResponse.json({ error: 'E-mail ou senha incorretos' }, { status: 401 });
  } catch (error) {
    console.error("Erro na rota de login:", error);
    return NextResponse.json({ error: 'Erro interno no servidor' }, { status: 500 });
  }
}