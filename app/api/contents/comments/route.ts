import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuth, canAccessStudent } from '@/lib/auth';


export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { userId, contentId, text, parentId } = body;

    if (!text || !userId || !contentId) {
        return NextResponse.json({ error: "Faltam dados" }, { status: 400 });
    }

    const auth = requireAuth(request);
    if ('response' in auth) return auth.response;
    const targetForAuth = await prisma.user.findUnique({ where: { id: userId }, select: { coachId: true } });
    if (!canAccessStudent(auth.user, userId, targetForAuth?.coachId)) {
      return NextResponse.json({ error: 'Acesso negado.' }, { status: 403 });
    }

    const comment = await prisma.contentComment.create({
      data: { 
          userId, 
          contentId, 
          text,
          parentId: parentId || null // 🔥 Se vier o parentId, vira uma Thread (Resposta)
      },
      include: { user: { select: { name: true, role: true } } }
    });

    return NextResponse.json(comment);

  } catch (error) {
    return NextResponse.json({ error: "Erro ao comentar" }, { status: 500 });
  }
}