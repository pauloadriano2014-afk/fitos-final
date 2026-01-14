import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { email, password, name, birthDate, phone, gender } = body;

    // 1. Validação básica (evita criar conta sem os dados principais)
    if (!email || !password || !name) {
      return NextResponse.json(
        { error: "E-mail, senha e nome são obrigatórios." },
        { status: 400 }
      );
    }

    // 2. Verifica se o e-mail já existe para não dar erro de servidor
    const existingUser = await prisma.user.findUnique({
      where: { email: email }
    });

    if (existingUser) {
      return NextResponse.json(
        { error: "Este e-mail já está cadastrado." },
        { status: 400 }
      );
    }

    // 3. Cria o usuário com todos os novos campos profissionais
    const user = await prisma.user.create({
      data: {
        email,
        password, // Nota: No futuro, usaremos bcrypt para criptografar
        name,
        birthDate,
        phone,
        gender,
        role: "USER" // Padrão para novos cadastros
      }
    });

    // Retorna o usuário criado (sem a senha por segurança)
    const { password: _, ...userWithoutPassword } = user;
    
    return NextResponse.json({ 
      message: "Usuário criado com sucesso!",
      user: userWithoutPassword 
    }, { status: 201 });

  } catch (error) {
    console.error("ERRO NO REGISTRO:", error);
    return NextResponse.json(
      { error: "Erro interno ao criar conta." },
      { status: 500 }
    );
  }
}