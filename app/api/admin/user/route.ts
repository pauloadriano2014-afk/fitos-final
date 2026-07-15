// app/api/admin/user/route.ts
import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

export const dynamic = 'force-dynamic'; 

const prisma = new PrismaClient();

const MASTER_IDS = [
    '3c82f763-66b4-48da-836e-16817d4f57c0', // Paulo
    'b7c0c181-41fd-4156-b8fe-963a267759a3'  // Adri
];

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const userId = searchParams.get('userId');
    const adminId = searchParams.get('adminId');

    // Se vier um ID de aluno na URL, retorna apenas ele
    if (userId) {
        // 🔥 Trava: se tiver adminId na jogada, checa se é dono
        if (adminId && !MASTER_IDS.includes(adminId)) {
             const checkOwner = await prisma.user.findUnique({ where: { id: userId }, select: { coachId: true } });
             if (checkOwner?.coachId !== adminId) {
                 return NextResponse.json({ error: "Acesso Negado" }, { status: 403 });
             }
        }
        
        const user = await prisma.user.findUnique({
            where: { id: userId }
        });
        if (!user) return NextResponse.json({ error: "Usuário não encontrado" }, { status: 404 });
        return NextResponse.json(user);
    }

    // 🔥 BLOQUEIO TOTAL DA LISTA GLOBAL: Só Master vê tudo, parceiro vê os seus.
    let whereClause: any = {};
    if (adminId) {
        if (MASTER_IDS.includes(adminId)) {
            whereClause = {
                OR: [
                    { coachId: null },
                    { coachId: { in: MASTER_IDS } }
                ]
            };
        } else {
            whereClause = { coachId: adminId };
        }
    }

    const users = await prisma.user.findMany({
      where: Object.keys(whereClause).length > 0 ? whereClause : undefined,
      orderBy: { createdAt: 'desc' },
      include: { anamneses: true }
    });

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
        const { id, birthDate, name, email, phone, gender, adminId } = body;

        if (!id) {
            return NextResponse.json({ error: "UserId não fornecido para edição" }, { status: 400 });
        }

        // 🔥 TRAVA: Se for um Coach parceiro tentando alterar dados do aluno
        if (adminId && !MASTER_IDS.includes(adminId)) {
            const checkOwner = await prisma.user.findUnique({ where: { id }, select: { coachId: true } });
            if (checkOwner?.coachId !== adminId) {
                return NextResponse.json({ error: "Apenas o Coach do aluno pode alterar estes dados." }, { status: 403 });
            }
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