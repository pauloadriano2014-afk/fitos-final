import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { sendNotificationToAll } from '../../utils/sendNotification'; // <--- Importe aqui

const prisma = new PrismaClient();

// 1. GET: Busca os vídeos para o App (Feed)
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId');

    // Busca todos os vídeos
    const allContent = await prisma.content.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        _count: { select: { likes: true, comments: true } }
      }
    });

    // Se tiver userId, verifica quais ele curtiu
    let userLikes: string[] = [];
    if (userId) {
      const likes = await prisma.contentLike.findMany({
        where: { userId },
        select: { contentId: true }
      });
      userLikes = likes.map((l) => l.contentId);
    }

    // Agrupa por Categoria
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
    console.error("Erro PA FLIX (GET):", error);
    return NextResponse.json({ error: "Erro ao buscar conteúdos" }, { status: 500 });
  }
}

// 2. POST: Cria novos vídeos e NOTIFICA
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { title, subtitle, category, videoUrl, thumbUrl, duration, description } = body;

    // Validação básica
    if (!title || !videoUrl || !category) {
        return NextResponse.json({ error: "Campos obrigatórios faltando" }, { status: 400 });
    }

    const newContent = await prisma.content.create({
      data: {
        title,
        subtitle,
        category, // Ex: 'TECNICA', 'MINDSET'
        videoUrl,
        thumbUrl,
        duration,
        description: description || "" // Opcional
      }
    });

    // 🔥 AQUI ESTÁ A MÁGICA: ENVIA NOTIFICAÇÃO
    // Não usamos 'await' para liberar a resposta pro admin rápido.
    // O servidor processa o envio em background.
    sendNotificationToAll(
        "🎬 Nova Aula no PA FLIX!",
        `Corre pra ver: "${title}" acabou de sair na categoria ${category}.`,
        { screen: 'PA FLIX', videoId: newContent.id }
    );

    return NextResponse.json(newContent);

  } catch (error) {
    console.error("Erro PA FLIX (POST):", error);
    return NextResponse.json({ error: "Erro ao criar conteúdo" }, { status: 500 });
  }
}