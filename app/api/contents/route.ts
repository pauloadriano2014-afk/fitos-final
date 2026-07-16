// app/api/contents/route.ts
import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { sendNotificationToAll } from '../../utils/sendNotification'; 

const prisma = new PrismaClient();
export const dynamic = 'force-dynamic';

const MASTER_IDS = [
    '3c82f763-66b4-48da-836e-16817d4f57c0', // Paulo
    'b7c0c181-41fd-4156-b8fe-963a267759a3'  // Adri
];

// 1. GET: Busca os conteúdos blindados e devolve os crachás de acesso
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId'); 
    const adminId = searchParams.get('adminId'); 
    const format = searchParams.get('format'); 

    let targetCoachId = null;

    if (adminId && adminId !== 'null' && adminId !== 'undefined') {
        targetCoachId = adminId;
    } else if (userId && userId !== 'null' && userId !== 'undefined') {
        const user = await prisma.user.findUnique({ where: { id: userId } });
        if (user && user.coachId) targetCoachId = user.coachId;
    }

    let whereClause: any = {};

    if (!targetCoachId || MASTER_IDS.includes(targetCoachId)) {
        whereClause = {
            OR: [
                { coachId: null },
                { coachId: '' },
                { coachId: { in: MASTER_IDS } }
            ]
        };
    } else {
        whereClause = { coachId: targetCoachId };
    }

    const allContent = await prisma.content.findMany({
      where: whereClause,
      orderBy: { createdAt: 'desc' },
      include: {
        _count: { select: { likes: true, comments: true } }
      }
    });

    // 🔥 BUSCA ACESSOS PARA LIBERAR OS VÍDEOS VIP NO APP DO ALUNO
    let userAccessList: string[] = [];
    if (userId && userId !== 'null' && userId !== 'undefined') {
        const accessRecords = await prisma.contentAccess.findMany({
            where: { userId },
            select: { contentId: true }
        });
        userAccessList = accessRecords.map(a => a.contentId);
    }

    // 🔥 ADICIONA A CHAVE "hasAccess" PARA O FRONT-END NÃO OCULTAR O CONTEÚDO
    const processedContent = allContent.map(video => ({
        ...video,
        hasAccess: !video.isVIP || userAccessList.includes(video.id)
    }));

    if (format === 'grouped') {
      let userLikes: string[] = [];
      if (userId && userId !== 'null' && userId !== 'undefined') {
        const likes = await prisma.contentLike.findMany({
          where: { userId },
          select: { contentId: true }
        });
        userLikes = likes.map((l) => l.contentId);
      }

      type CategoryGroup = { id: string; title: string; videos: any[] };
      const categoriesMap: Record<string, CategoryGroup> = {};

      processedContent.forEach((video) => {
        const cat = video.category || 'GERAL';
        if (!categoriesMap[cat]) {
          categoriesMap[cat] = { id: cat, title: cat, videos: [] };
        }
        categoriesMap[cat].videos.push({
          ...video,
          likedByMe: userLikes.includes(video.id),
          likesCount: video._count.likes,
          commentsCount: video._count.comments
        });
      });

      return NextResponse.json(Object.values(categoriesMap));
    }

    return NextResponse.json(processedContent);

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
      type, isVIP, pdfUrl, audioUrl, adminId 
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
        coachId: adminId || null 
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