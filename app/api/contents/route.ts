// app/api/contents/route.ts
import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { sendNotificationToAll } from '../../utils/sendNotification'; 

const prisma = new PrismaClient();
export const dynamic = 'force-dynamic';

// 1. GET: Busca os conteúdos blindados
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId'); // Se for Aluno pedindo
    const adminId = searchParams.get('adminId'); // Se for o Painel Admin pedindo
    const format = searchParams.get('format'); 

    // 🔥 INTELIGÊNCIA DE ROTEAMENTO: Descobre de qual Coach puxar o conteúdo
    let targetCoachId = null;

    if (adminId) {
        targetCoachId = adminId;
    } else if (userId) {
        const user = await prisma.user.findUnique({ where: { id: userId } });
        if (user && user.coachId) targetCoachId = user.coachId;
    }

    // Busca apenas os conteúdos daquele Coach
    const allContent = await prisma.content.findMany({
      where: targetCoachId ? { coachId: targetCoachId } : {},
      orderBy: { createdAt: 'desc' },
      include: {
        _count: { select: { likes: true, comments: true } }
      }
    });

    // MANTÉM A COMPATIBILIDADE SE VOCÊ REATIVAR O PAFLIX ANTIGO
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

    // FORMATO NOVO PARA A BIBLIOTECA (Lista Plana)
    return NextResponse.json(allContent);

  } catch (error) {
    console.error("Erro PA FLIX (GET):", error);
    return NextResponse.json({ error: "Erro ao buscar conteúdos" }, { status: 500 });
  }
}

// 2. POST: Cria novos vídeos/ebooks/audios COM O CARIMBO DO DONO
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { 
      title, subtitle, category, videoUrl, thumbUrl, duration, description, 
      type, isVIP, pdfUrl, audioUrl, adminId // 🔥 Agora ele recebe QUEM está criando
    } = body;

    if (!title || !category) {
        return NextResponse.json({ error: "Campos obrigatórios faltando" }, { status: 400 });
    }

    const newContent = await prisma.content.create({
      data: {
        title,
        subtitle: subtitle || null,
        category, 
        type: type || 'video',
        isVIP: isVIP || false,
        videoUrl: videoUrl || null,
        pdfUrl: pdfUrl || null,
        audioUrl: audioUrl || null,
        thumbUrl: thumbUrl || null,
        duration: duration || null,
        description: description || "",
        coachId: adminId || null // 🔥 CARIMBA A ETIQUETA DO DONO (Paulo ou Adri)
      }
    });

    let notifTitle = "🎬 Nova Aula no PA FLIX!";
    let notifMsg = `Corre pra ver: "${title}" acabou de sair na categoria ${category}.`;

    if (newContent.type === 'ebook') {
        notifTitle = "📚 Novo E-book Liberado!";
        notifMsg = `O e-book "${title}" já está disponível na sua Biblioteca${newContent.isVIP ? ' VIP' : ''}.`;
    } else if (newContent.type === 'audio') {
        notifTitle = "🎧 Novo Audiobook / Podcast!";
        notifMsg = `Dê o play em: "${title}" na sua Biblioteca.`;
    }

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