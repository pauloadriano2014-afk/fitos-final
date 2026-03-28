import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { sendNotificationToAll } from '../../utils/sendNotification'; // <--- Sua importação original mantida

const prisma = new PrismaClient();

// 1. GET: Busca os conteúdos para o App (Feed/Biblioteca)
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId');
    const format = searchParams.get('format'); 

    // Busca todos os conteúdos no banco
    const allContent = await prisma.content.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        _count: { select: { likes: true, comments: true } }
      }
    });

    // 🔥 MANTÉM A COMPATIBILIDADE SE VOCÊ REATIVAR O PAFLIX ANTIGO
    if (format === 'grouped') {
      let userLikes: string[] = [];
      if (userId) {
        const likes = await prisma.contentLike.findMany({
          where: { userId },
          select: { contentId: true }
        });
        userLikes = likes.map((l) => l.contentId);
      }

      type CategoryGroup = { id: string; title: string; videos: any[] };
      const categoriesMap: Record<string, CategoryGroup> = {};

      allContent.forEach((video) => {
        if (!categoriesMap[video.category]) {
          categoriesMap[video.category] = { id: video.category, title: video.category, videos: [] };
        }
        categoriesMap[video.category].videos.push({
          ...video,
          likedByMe: userLikes.includes(video.id),
          likesCount: video._count.likes,
          commentsCount: video._count.comments
        });
      });

      return NextResponse.json(Object.values(categoriesMap));
    }

    // 🔥 FORMATO NOVO PARA A BIBLIOTECA (Lista Plana)
    return NextResponse.json(allContent);

  } catch (error) {
    console.error("Erro PA FLIX (GET):", error);
    return NextResponse.json({ error: "Erro ao buscar conteúdos" }, { status: 500 });
  }
}

// 2. POST: Cria novos vídeos/ebooks/audios e NOTIFICA
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { 
      title, subtitle, category, videoUrl, thumbUrl, duration, description, 
      type, isVIP, pdfUrl, audioUrl 
    } = body;

    // Validação básica (O link principal depende do tipo do conteúdo)
    if (!title || !category) {
        return NextResponse.json({ error: "Campos obrigatórios faltando" }, { status: 400 });
    }

    const newContent = await prisma.content.create({
      data: {
        title,
        subtitle: subtitle || null,
        category, // Ex: 'TECNICA', 'MINDSET'
        type: type || 'video',
        isVIP: isVIP || false,
        videoUrl: videoUrl || null,
        pdfUrl: pdfUrl || null,
        audioUrl: audioUrl || null,
        thumbUrl: thumbUrl || null,
        duration: duration || null,
        description: description || "" 
      }
    });

    // 🔥 MÁGICA DA NOTIFICAÇÃO INTELIGENTE
    let notifTitle = "🎬 Nova Aula no PA FLIX!";
    let notifMsg = `Corre pra ver: "${title}" acabou de sair na categoria ${category}.`;

    if (newContent.type === 'ebook') {
        notifTitle = "📚 Novo E-book Liberado!";
        notifMsg = `O e-book "${title}" já está disponível na sua Biblioteca${newContent.isVIP ? ' VIP' : ''}.`;
    } else if (newContent.type === 'audio') {
        notifTitle = "🎧 Novo Audiobook / Podcast!";
        notifMsg = `Dê o play em: "${title}" na sua Biblioteca.`;
    }

    // Dispara a notificação sem travar o painel admin
    sendNotificationToAll(
        notifTitle,
        notifMsg,
        { screen: 'Biblioteca', contentId: newContent.id }
    );

    return NextResponse.json(newContent);

  } catch (error) {
    console.error("Erro PA FLIX (POST):", error);
    return NextResponse.json({ error: "Erro ao criar conteúdo" }, { status: 500 });
  }
}