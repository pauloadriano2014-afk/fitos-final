// app/api/admin/user/route.ts
import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { MASTER_IDS } from '@/lib/masterIds';
import { requireAuth, requireMaster, canAccessStudent, canActAsCoach } from '@/lib/auth';

export const dynamic = 'force-dynamic';
export const revalidate = 0; // 🔥 Força o Next.js a NUNCA usar cache nesta rota


// Cabeçalhos agressivos anti-cache para garantir que o F5 traga os dados reais
const noCacheHeaders = {
    'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
    'Pragma': 'no-cache',
    'Expires': '0',
};

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const userId = searchParams.get('userId');
    const adminId = searchParams.get('adminId');

    const auth = requireAuth(req);
    if ('response' in auth) return auth.response;

    // Se vier um ID de aluno na URL, retorna apenas ele
    if (userId) {
        const checkOwner = await prisma.user.findUnique({ where: { id: userId }, select: { coachId: true } });
        if (!canAccessStudent(auth.user, userId, checkOwner?.coachId)) {
             return NextResponse.json({ error: "Acesso Negado" }, { status: 403, headers: noCacheHeaders });
        }
        if (adminId && !canActAsCoach(auth.user, adminId)) {
             return NextResponse.json({ error: "Acesso Negado" }, { status: 403, headers: noCacheHeaders });
        }

        const user = await prisma.user.findUnique({
            where: { id: userId }
        });
        if (!user) return NextResponse.json({ error: "Usuário não encontrado" }, { status: 404, headers: noCacheHeaders });
        return NextResponse.json(user, { headers: noCacheHeaders });
    }

    // BLOQUEIO TOTAL DA LISTA GLOBAL: Só Master vê tudo, parceiro vê os seus.
    if (adminId) {
        if (!canActAsCoach(auth.user, adminId)) {
            return NextResponse.json({ error: "Acesso Negado" }, { status: 403, headers: noCacheHeaders });
        }
    } else {
        // Sem adminId a lista seria irrestrita — só o time master pode pedir isso.
        const masterAuth = requireMaster(req);
        if ('response' in masterAuth) return masterAuth.response;
    }

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

    return NextResponse.json(users, { headers: noCacheHeaders });
  } catch (error) {
    console.error("Erro na rota Admin User:", error);
    return NextResponse.json({ error: "Erro ao buscar lista" }, { status: 500, headers: noCacheHeaders });
  }
}

// NOVA ROTA: Atualiza os dados base do Aluno (Registro e Nascimento) vindo da aba de Anamnese
export async function PUT(req: Request) {
    try {
        const body = await req.json();
        const { id, birthDate, name, email, phone, gender, adminId } = body;

        if (!id) {
            return NextResponse.json({ error: "UserId não fornecido para edição" }, { status: 400 });
        }

        const auth = requireAuth(req);
        if ('response' in auth) return auth.response;

        // TRAVA: só o próprio aluno, o Coach dono dele, ou o time master pode alterar.
        const checkOwner = await prisma.user.findUnique({ where: { id }, select: { coachId: true } });
        if (!canAccessStudent(auth.user, id, checkOwner?.coachId)) {
            return NextResponse.json({ error: "Apenas o Coach do aluno pode alterar estes dados." }, { status: 403 });
        }
        if (adminId && !canActAsCoach(auth.user, adminId)) {
            return NextResponse.json({ error: "Apenas o Coach do aluno pode alterar estes dados." }, { status: 403 });
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