import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId');

    // 1. Busca todos os vídeos
    const allContent = await prisma.content.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        _count: { select: { likes: true, comments: true } }
      }
    });

    // 2. Se tiver userId, verifica quais ele curtiu
    let userLikes: string[] = [];
    if (userId) {
      const likes = await prisma.contentLike.findMany({
        where: { userId },
        select: { contentId: true }
      });
      userLikes = likes.map((l) => l.contentId);
    }

    // 3. Agrupa por Categoria
    // Definindo o tipo para o mapa
    type CategoryGroup = {
      id: string;
      title: string;
      videos: any[];
    };

    const categoriesMap: Record<string, CategoryGroup> = {};

    allContent.forEach((video) => {
      if (!categoriesMap[video.category]) {
        categoriesMap[video.category] = {
          id: video.category,
          title: video.category, // Ex: 'MINDSET'
          videos: []
        };
      }

      categoriesMap[video.category].videos.push({
        ...video,
        likedByMe: userLikes.includes(video.id),
        likesCount: video._count.likes,
        commentsCount: video._count.comments
      });
    });

    const responseData = Object.values(categoriesMap);

    return NextResponse.json(responseData);

  } catch (error) {
    console.error("Erro PA FLIX:", error);
    return NextResponse.json({ error: "Erro ao buscar conteúdos" }, { status: 500 });
  }
}