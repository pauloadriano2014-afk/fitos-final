// app/api/auth/register/route.ts
import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { email, password, name, birthDate, phone, gender, inviteCode } = body;

    if (!email || !password || !name || !inviteCode) {
      return NextResponse.json(
        { error: "E-mail, senha, nome e código de convite são obrigatórios." },
        { status: 400 }
      );
    }

    const existingUser = await prisma.user.findUnique({
      where: { email: email }
    });

    if (existingUser) {
      return NextResponse.json(
        { error: "Este e-mail já está cadastrado." },
        { status: 400 }
      );
    }

    // 🔥 O ROTEADOR MULTI-COACH: Descobre de quem é o aluno pelo código
    let coachId = null;
    const code = inviteCode.trim().toUpperCase();

    if (code === 'PATEAM') {
        const paulo = await prisma.user.findUnique({ where: { email: 'paulo_adriano2014@live.com' } });
        if (paulo) coachId = paulo.id;
    } else if (code === 'CURVAS') {
        const adri = await prisma.user.findUnique({ where: { email: 'adri.personal@hotmail.com' } });
        if (adri) coachId = adri.id;
    }

    if (!coachId) {
         return NextResponse.json(
            { error: "Código de convite inválido ou treinador não encontrado." },
            { status: 400 }
         );
    }

    // Cria o usuário já carimbado com o dono certo
    const user = await prisma.user.create({
      data: {
        email,
        password, 
        name,
        birthDate,
        phone,
        gender,
        role: "USER",
        coachId: coachId // 🔥 ATRIBUI O ALUNO AO TREINADOR CERTO!
      }
    });

    // 🔥 DISPARO DE NOTIFICAÇÃO PARA O COACH
    try {
        const coach = await prisma.user.findUnique({
            where: { id: coachId },
            select: { pushToken: true }
        });

        if (coach?.pushToken) {
            await fetch('https://exp.host/--/api/v2/push/send', {
                method: 'POST',
                headers: {
                    Accept: 'application/json',
                    'Accept-encoding': 'application/json',
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    to: coach.pushToken,
                    sound: 'default',
                    title: '🚀 Novo Aluno na Área!',
                    body: `${name} acabou de se cadastrar no seu time. Vai pra cima!`,
                }),
            });
        }
    } catch (pushError) {
        console.error("Erro ao enviar push de novo registro:", pushError);
    }

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
