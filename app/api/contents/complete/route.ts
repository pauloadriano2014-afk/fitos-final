export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';


const prisma = new PrismaClient();

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId');

    const contents = await prisma.content.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        likes: true,
        comments: true,
        completions: userId
          ? { where: { userId } }
          : false
      }
    });

    const formatted = contents.map(content => ({
      id: content.id,
      title: content.title,
      subtitle: content.subtitle,
      description: content.description,
      category: content.category,
      videoUrl: content.videoUrl,
      thumbUrl: content.thumbUrl,
      duration: content.duration,

      // 🔥 ESSA LINHA MUDA TUDO
      completedByUser: content.completions?.length > 0,

      likesCount: content.likes.length
    }));

    // Agrupa por categoria (como você já usa no front)
    const grouped = formatted.reduce((acc: any[], video) => {
      let cat = acc.find(c => c.title === video.category);
      if (!cat) {
        cat = { title: video.category, videos: [] };
        acc.push(cat);
      }
      cat.videos.push(video);
      return acc;
    }, []);

    return NextResponse.json(grouped);

  } catch (e) {
    console.error('Erro contents:', e);
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
  }
}
