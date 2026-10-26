// app/api/contents/route.ts
import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { sendNotificationToAll } from '../../utils/sendNotification';
import { requireAuth, canActAsCoach, canViewCoachLibrary, isMasterId } from '@/lib/auth';
import { parseAudience, audienceToString, studentCanSee } from '@/lib/contentAudience';
import { availableRecipients } from '@/lib/exams';
import { coachHasFeature } from '@/lib/coachFeatures';

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

    // 🔒 Biblioteca é lida por alunos (userId=próprio) e coaches (adminId=próprio,
    // ou master vendo qualquer coach). Exige login sempre; se vier userId ou
    // adminId, tem que ser realmente quem está logado (ou master).
    const auth = requireAuth(request);
    if ('response' in auth) return auth.response;
    if (userId && userId !== 'null' && userId !== 'undefined' && auth.user.id !== userId && !MASTER_IDS.includes(auth.user.id)) {
        return NextResponse.json({ error: "Acesso negado." }, { status: 403 });
    }
    // 🔒 (17 set 2026) `adminId` aqui é só um filtro de LEITURA (qual biblioteca
    // mostrar) -- o app do aluno também chama assim, passando o coachId dele
    // (ver BibliotecaScreen.js). canActAsCoach exigia ser o próprio coach e
    // dava 403 pra todo aluno; canViewCoachLibrary aceita aluno lendo a
    // biblioteca do coach dele.
    if (adminId && adminId !== 'null' && adminId !== 'undefined' && !canViewCoachLibrary(auth.user, adminId)) {
        return NextResponse.json({ error: "Acesso negado." }, { status: 403 });
    }

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
        // 🌐 O aluno do coach parceiro também recebe o que o master marcou "para todos os coaches" (vídeos de como usar o app); o QUEM VÊ abaixo ainda filtra.
        if (auth.user.role === 'USER') {
            whereClause = { OR: [{ coachId: targetCoachId }, { shared: true, OR: [{ coachId: null }, { coachId: '' }, { coachId: { in: MASTER_IDS } }] }] };
        }
    }

    const allContent = await prisma.content.findMany({
      where: whereClause,
      orderBy: { createdAt: 'desc' },
      include: {
        _count: { select: { likes: true, comments: true } }
      }
    });

    // 🎯 QUEM VÊ (26 out 2026): o ALUNO que está lendo só recebe o que serve para o cadastro dele (tem treino? tem dieta? plano completo? exames ligados?).
    // Vale para qualquer tela do aluno que leia esta rota (Biblioteca, PA FLIX, Início). Coach/master veem tudo, para poder gerenciar.
    let visibleContent = allContent;
    if (auth.user.role === 'USER' && allContent.some((c: any) => c.audience)) {
        const me: any = await prisma.user.findUnique({ where: { id: auth.user.id }, select: { id: true, coachId: true, nutritionistId: true, plan: true, dietModule: true, studentModules: true, monthlyReportOn: true, loadSuggestOff: true } });
        if (me) {
            const coach: any = me.coachId ? await prisma.user.findUnique({ where: { id: me.coachId }, select: { coachPlan: true } }) : null;
            const used = (tag: string) => allContent.some((c: any) => parseAudience(c.audience).includes(tag as any));
            const caps = {
                exames: used('EXAMES') ? (await availableRecipients(prisma, me)).length > 0 : false,
                // sem coach (ou coach do time master) = o recurso é do master, sempre ligado
                execVideo: used('EXEC_VIDEO') ? (!me.coachId || await coachHasFeature(prisma, me.coachId, 'execVideo', { isMaster: isMasterId(me.coachId) })) : false,
            };
            visibleContent = allContent.filter((c: any) => studentCanSee(parseAudience(c.audience), me, coach?.coachPlan ?? null, caps));
        }
    }

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
    const processedContent = visibleContent.map(video => ({
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
      type, isVIP, pdfUrl, audioUrl, adminId, valor, audience, notify, shared
    } = body;

    if (!title || !category) {
        return NextResponse.json({ error: "Campos obrigatórios faltando" }, { status: 400 });
    }

    const auth = requireAuth(request);
    if ('response' in auth) return auth.response;
    if (adminId && !canActAsCoach(auth.user, adminId)) {
        return NextResponse.json({ error: "Acesso negado." }, { status: 403 });
    }

    const newContent = await prisma.content.create({
      data: {
        title,
        subtitle: subtitle || null,
        category, 
        type: type || 'video',
        isVIP: isVIP || false,
        valor: (isVIP && valor) ? parseFloat(valor) : null,
        audience: audienceToString(parseAudience(audience)),
        shared: isMasterId(auth.user.id) && shared === true,   // só o master compartilha com os coaches parceiros
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

    // 🎯 Sem aviso em massa quando o coach desligou o aviso ou quando o conteúdo é só para um grupo de alunos (o aviso iria também para quem não pode ver).
    if (notify !== false && !(newContent as any).audience) {
        sendNotificationToAll(
            notifTitle,
            notifMsg,
            { screen: 'Biblioteca', contentId: newContent.id }
        );
    }

    return NextResponse.json(newContent);

  } catch (error) {
    console.error("Erro PA FLIX (POST):", error);
    return NextResponse.json({ error: "Erro ao criar conteúdo" }, { status: 500 });
  }
}