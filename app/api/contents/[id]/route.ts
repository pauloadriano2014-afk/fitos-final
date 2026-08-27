import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuth, canActAsCoach, isMasterId } from '@/lib/auth';


// 🔥 PATCH: Atualiza um conteúdo existente (Editar)
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  try {
    const contentId = params.id;
    const body = await req.json();

    const auth = requireAuth(req);
    if ('response' in auth) return auth.response;
    const existingContent = await prisma.content.findUnique({ where: { id: contentId }, select: { coachId: true } });
    if (!existingContent) {
      return NextResponse.json({ error: "Conteúdo não encontrado" }, { status: 404 });
    }
    if (!isMasterId(auth.user.id) && !canActAsCoach(auth.user, existingContent.coachId)) {
      return NextResponse.json({ error: "Acesso negado." }, { status: 403 });
    }

    const updatedContent = await prisma.content.update({
      where: { id: contentId },
      data: {
        title: body.title,
        subtitle: body.subtitle,
        category: body.category,
        type: body.type,
        isVIP: body.isVIP,
        valor: (body.isVIP && body.valor) ? parseFloat(body.valor) : null,
        videoUrl: body.videoUrl,
        pdfUrl: body.pdfUrl,
        audioUrl: body.audioUrl,
        thumbUrl: body.thumbUrl,
        duration: body.duration,
      }
    });

    return NextResponse.json(updatedContent);
  } catch (error) {
    console.error("Erro PATCH Content:", error);
    return NextResponse.json({ error: "Erro ao atualizar conteúdo" }, { status: 500 });
  }
}

// 🔥 DELETE: Exclui um conteúdo do banco de dados (Deletar testes velhos)
export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  try {
    const contentId = params.id;

    const auth = requireAuth(req);
    if ('response' in auth) return auth.response;
    const existingContent = await prisma.content.findUnique({ where: { id: contentId }, select: { coachId: true } });
    if (!existingContent) {
      return NextResponse.json({ error: "Conteúdo não encontrado" }, { status: 404 });
    }
    if (!isMasterId(auth.user.id) && !canActAsCoach(auth.user, existingContent.coachId)) {
      return NextResponse.json({ error: "Acesso negado." }, { status: 403 });
    }

    await prisma.content.delete({
      where: { id: contentId }
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Erro DELETE Content:", error);
    return NextResponse.json({ error: "Erro ao excluir conteúdo" }, { status: 500 });
  }
}