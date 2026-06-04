// app/api/admin/user/route.ts
import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

// 👇 A LINHA MÁGICA: Obriga o Next.js a ler o banco SEMPRE, sem cache.
export const dynamic = 'force-dynamic'; 

const prisma = new PrismaClient();

export async function GET(req: Request) {
  try {
    // 🔥 MELHORIA: Lê a URL para ver se estamos buscando um aluno específico ou a lista toda
    const { searchParams } = new URL(req.url);
    const userId = searchParams.get('userId');

    // Se vier um ID na URL (?userId=...), retorna apenas aquele aluno para a Anamnese
    if (userId) {
        const user = await prisma.user.findUnique({
            where: { id: userId }
        });
        if (!user) return NextResponse.json({ error: "Usuário não encontrado" }, { status: 404 });
        return NextResponse.json(user);
    }

    // Se não vier ID, mantém SEU COMPORTAMENTO ORIGINAL (Lista todos os alunos para o Painel)
    const users = await prisma.user.findMany({
      orderBy: {
        createdAt: 'desc' // Mostra os mais recentes no topo
      },
      // DICA: O include abaixo traz a anamnese junto, útil pro Admin ver quem já preencheu
      include: {
        anamneses: true 
      }
    });

    console.log("Usuários listados para o Admin (Tempo Real):", users.length);

    return NextResponse.json(users);
  } catch (error) {
    console.error("Erro na rota Admin User:", error);
    return NextResponse.json({ error: "Erro ao buscar lista" }, { status: 500 });
  }
}

// 🔥 NOVA ROTA: Atualiza os dados base do Aluno (Registro e Nascimento) vindo da aba de Anamnese
export async function PUT(req: Request) {
    try {
        const body = await req.json();
        const { id, birthDate, name, email, phone, gender } = body;

        if (!id) {
            return NextResponse.json({ error: "UserId não fornecido para edição" }, { status: 400 });
        }

        const updateData: any = {};
        
        if (birthDate !== undefined) updateData.birthDate = birthDate;
        if (name !== undefined) updateData.name = name;
        if (email !== undefined) updateData.email = email;
        if (phone !== undefined) updateData.phone = phone;
        if (gender !== undefined) updateData.gender = gender;

        const updatedUser = await prisma.user.update({
            where: { id },
            data: updateData
        });

        return NextResponse.json({ success: true, user: updatedUser });
    } catch (error: any) {
        console.error("Erro ao atualizar o usuário:", error);
        return NextResponse.json({ error: "Falha na atualização do usuário." }, { status: 500 });
    }
}