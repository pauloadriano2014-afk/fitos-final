import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { MASTER_IDS } from '@/lib/masterIds';
import { requireAuth, canActAsCoach, isMasterId } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const auth = requireAuth(req);
  if ('response' in auth) return auth.response;

  const { searchParams } = new URL(req.url);
  const goal = searchParams.get('goal');
  const level = searchParams.get('level');
  const adminId = searchParams.get('adminId'); // 🔥 O CRACHÁ DE SEGURANÇA — agora verificado contra o token

  if (adminId && !canActAsCoach(auth.user, adminId)) {
    return NextResponse.json({ error: 'Acesso negado.' }, { status: 403 });
  }

  const where: any = {};
  if (goal && goal !== 'TODOS') where.goal = goal;
  if (level && level !== 'TODOS') where.level = level;

  // 🔥 ISOLAMENTO TOTAL DA MURALHA (TEMPLATES):
  const isMaster = isMasterId(auth.user.id);

  if (isMaster) {
      // Paulo e Adri não veem templates de parceiros. 
      where.OR = [
          { coachId: null },
          { coachId: { in: MASTER_IDS } }
      ];
  } else if (adminId) {
      // Parceiro vê ESTRITAMENTE os templates criados por ele.
      where.coachId = adminId;
  } else {
      // Bloqueio de segurança se a rota for chamada sem adminId
      where.coachId = 'BLOQUEADO';
  }

  try {
    const templates = await prisma.workoutTemplate.findMany({
      where,
      orderBy: { name: 'asc' }
    });
    return NextResponse.json(templates);
  } catch (error) {
    return NextResponse.json({ error: "Erro ao buscar templates" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const auth = requireAuth(req);
    if ('response' in auth) return auth.response;

    const body = await req.json();
    // 🔥 AGORA O BACKEND ENXERGA O ID DA PASTA (collectionId)
    const { id, name, goal, level, data, adminId, collectionId } = body;

    if (!name || !data) {
        return NextResponse.json({ error: "Dados incompletos" }, { status: 400 });
    }

    // 🔥 TRAVA DE SEGURANÇA BLINDADA 🔥
    // Se o ID for o bug "[object Object]" do JS ou não for uma string válida, derruba a requisição na hora!
    if (id && (typeof id !== 'string' || id.includes('[object'))) {
        return NextResponse.json({ error: "ID inválido/corrompido detectado. Atualização bloqueada." }, { status: 400 });
    }

    // adminId vem do corpo (forjável) — confirma que quem chamou É esse coach
    // (ou master) antes de deixar criar/gravar um template com esse carimbo.
    if (adminId && !canActAsCoach(auth.user, adminId)) {
        return NextResponse.json({ error: "Acesso negado." }, { status: 403 });
    }
    if (!adminId && !isMasterId(auth.user.id)) {
        return NextResponse.json({ error: "Acesso negado." }, { status: 403 });
    }

    if (id) {
        // 🔥 Confirma que quem chamou é dono do template existente (ou master)
        // antes de permitir a atualização — o update não tocava nisso antes.
        const existing = await prisma.workoutTemplate.findUnique({ where: { id }, select: { coachId: true } });
        if (!existing) {
            return NextResponse.json({ error: "Template não encontrado." }, { status: 404 });
        }
        const canEdit = existing.coachId ? canActAsCoach(auth.user, existing.coachId) : isMasterId(auth.user.id);
        if (!canEdit) {
            return NextResponse.json({ error: "Acesso negado." }, { status: 403 });
        }

        // 🔥 ATUALIZA O TEMPLATE E PERMITE MOVER DE PASTA
        await prisma.workoutTemplate.update({
            where: { id },
            data: { 
                name, 
                goal, 
                level, 
                data,
                collectionId: collectionId !== undefined ? collectionId : undefined 
            }
        });
    } else {
        // 🔥 CRIA O TEMPLATE JÁ DENTRO DA PASTA COM O CARIMBO DO COACH
        await prisma.workoutTemplate.create({
            data: { 
                name, 
                goal, 
                level, 
                data, 
                coachId: adminId || null,
                collectionId: collectionId || null
            }
        });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Erro ao salvar template" }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
    const auth = requireAuth(req);
    if ('response' in auth) return auth.response;

    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');

    // 🔥 TRAVA DE SEGURANÇA NA EXCLUSÃO TAMBÉM 🔥
    if (!id || id.includes('[object')) return NextResponse.json({ error: "ID inválido ou corrompido" }, { status: 400 });

    try {
        // Confirma que quem chamou é dono do template (ou master) antes de apagar —
        // antes não havia nenhuma verificação de propriedade aqui.
        const existing = await prisma.workoutTemplate.findUnique({ where: { id }, select: { coachId: true } });
        if (!existing) {
            return NextResponse.json({ error: "Erro ao deletar" }, { status: 404 });
        }
        const canDelete = existing.coachId ? canActAsCoach(auth.user, existing.coachId) : isMasterId(auth.user.id);
        if (!canDelete) {
            return NextResponse.json({ error: "Acesso negado." }, { status: 403 });
        }

        await prisma.workoutTemplate.delete({ where: { id } });
        return NextResponse.json({ success: true });
    } catch (error) {
        return NextResponse.json({ error: "Erro ao deletar" }, { status: 500 });
    }
}