// app/api/user/route.ts
import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { MASTER_IDS } from '@/lib/masterIds';
import { requireAuth, requireMaster, canActAsCoach } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const adminId = searchParams.get('adminId');

    const auth = requireAuth(req);
    if ('response' in auth) return auth.response;
    if (adminId) {
        if (!canActAsCoach(auth.user, adminId)) {
            return NextResponse.json({ error: "Acesso Negado." }, { status: 403 });
        }
    } else {
        // Sem adminId, a listagem seria irrestrita — só o time master pode pedir isso.
        const masterAuth = requireMaster(req);
        if ('response' in masterAuth) return masterAuth.response;
    }

    // 🔥 BLOQUEIO TOTAL DA LISTA GLOBAL
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
    } else {
       // Se chamarem a rota sem dizer quem é, bloqueia vazamento devolvendo vazio ou erro.
       return NextResponse.json({ error: "Acesso Negado. Credenciais ausentes." }, { status: 403 });
    }

    const users = await prisma.user.findMany({
      where: whereClause,
      orderBy: { createdAt: 'desc' },
      include: {
        anamneses: { orderBy: { createdAt: 'desc' }, take: 1 },
        workouts: true 
      }
    });
    return NextResponse.json(users);
  } catch (error) {
    console.error("Erro ao listar usuários:", error);
    return NextResponse.json({ error: "Erro ao listar usuários" }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  try {
    const body = await req.json();
    const { userId, goal, level } = body;

    // 🔥 LOG DE VERIFICAÇÃO: Veja isso no painel do Render!
    console.log(`🚀 RECEBENDO SETUP - User: ${userId} | Objetivo: ${goal} | Nível: ${level}`);

    if (!userId) {
      return NextResponse.json({ error: "ID do usuário não fornecido" }, { status: 400 });
    }

    const auth = requireAuth(req);
    if ('response' in auth) return auth.response;
    if (auth.user.id !== userId && !MASTER_IDS.includes(auth.user.id)) {
      return NextResponse.json({ error: "Acesso Negado." }, { status: 403 });
    }

    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: {
        goal: goal,
        level: level
      }
    });

    console.log(`✅ SETUP SALVO COM SUCESSO PARA: ${updatedUser.email}`);
    return NextResponse.json(updatedUser);

  } catch (error) {
    console.error("❌ ERRO AO SALVAR SETUP NO BANCO:", error);
    return NextResponse.json({ error: "Erro ao salvar setup no banco" }, { status: 500 });
  }
}