import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuth, canActAsCoach, isMasterId } from '@/lib/auth';


// 🔥 GET: Busca a lista de IDs de alunos que têm acesso a este conteúdo
export async function GET(req: Request, { params }: { params: { id: string } }) {
  try {
    const auth = requireAuth(req);
    if ('response' in auth) return auth.response;
    const content = await prisma.content.findUnique({ where: { id: params.id }, select: { coachId: true } });
    if (!content) {
      return NextResponse.json({ error: "Conteúdo não encontrado" }, { status: 404 });
    }
    if (!isMasterId(auth.user.id) && !canActAsCoach(auth.user, content.coachId)) {
      return NextResponse.json({ error: "Acesso negado." }, { status: 403 });
    }

    const accessList = await prisma.contentAccess.findMany({
      where: { contentId: params.id },
      select: { userId: true }
    });
    
    // Devolve apenas um array simples com os IDs [ "user1", "user2" ]
    const userIds = accessList.map(a => a.userId);
    return NextResponse.json(userIds);
  } catch (error) {
    console.error("Erro GET Content Access:", error);
    return NextResponse.json({ error: "Erro ao buscar acessos" }, { status: 500 });
  }
}

// 🔥 POST: Liga ou desliga o acesso de um aluno específico a este conteúdo
export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const { userId, hasAccess } = await req.json();
    const contentId = params.id;

    if (!userId) {
        return NextResponse.json({ error: "ID do usuário obrigatório" }, { status: 400 });
    }

    const auth = requireAuth(req);
    if ('response' in auth) return auth.response;
    const content = await prisma.content.findUnique({ where: { id: contentId }, select: { coachId: true } });
    if (!content) {
      return NextResponse.json({ error: "Conteúdo não encontrado" }, { status: 404 });
    }
    if (!isMasterId(auth.user.id) && !canActAsCoach(auth.user, content.coachId)) {
      return NextResponse.json({ error: "Acesso negado." }, { status: 403 });
    }

    const existingAccess = await prisma.contentAccess.findFirst({
        where: { userId, contentId }
    });

    if (hasAccess && !existingAccess) {
      // Concede o acesso (Cria a chave)
      await prisma.contentAccess.create({
        data: { userId, contentId }
      });
    } else if (!hasAccess && existingAccess) {
      // Revoga o acesso (Destrói a chave)
      await prisma.contentAccess.deleteMany({
        where: { userId, contentId }
      });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Erro POST Content Access:", error);
    return NextResponse.json({ error: "Erro ao atualizar acesso" }, { status: 500 });
  }
}