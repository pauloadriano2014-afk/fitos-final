// app/api/auth/login/route.ts
import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

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

    if (!user) {
      return NextResponse.json({ error: 'E-mail ou senha incorretos' }, { status: 401 });
    }

    // 🔐 VERIFICAÇÃO COM UPGRADE-ON-LOGIN
    // Senhas novas são hash bcrypt (começam com "$2").
    // Senhas antigas estão em texto puro: se baterem, fazemos o upgrade
    // para hash na hora, de forma transparente. O banco se migra sozinho.
    let passwordOk = false;

    if (user.password?.startsWith('$2')) {
      // Já é hash bcrypt
      passwordOk = await bcrypt.compare(password, user.password);
    } else {
      // Legado: texto puro
      passwordOk = user.password === password;

      if (passwordOk) {
        // 🔥 UPGRADE: regrava com hash (não bloqueia o login se falhar)
        try {
          const hashed = await bcrypt.hash(password, 10);
          await prisma.user.update({
            where: { id: user.id },
            data: { password: hashed },
          });
        } catch (e) {
          console.error('Falha no upgrade de senha (login segue normal):', e);
        }
      }
    }

    if (passwordOk) {
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