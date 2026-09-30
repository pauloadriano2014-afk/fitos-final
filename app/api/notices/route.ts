import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuth, canActAsCoach, canAccessStudent } from '@/lib/auth';
import { sendPushToUsers } from '@/app/utils/sendNotification';

const NOTICE_HISTORY_LIMIT = 20;

// 🔥 POST: Criar um novo aviso e disparar Push Notifications
export async function POST(req: Request) {
  try {
    const body = await req.json();
    // 🚨 (28 set 2026) imageUrl/ctaLabel/ctaRoute são opcionais -- avisos
    // simples (só título+texto) continuam funcionando mandando só isso, sem
    // precisar dos campos novos.
    const { title, content, adminId, targetUsers, imageUrl, ctaLabel, ctaRoute } = body;

    if (!title || !content || !adminId) {
        return NextResponse.json({ error: "Dados incompletos" }, { status: 400 });
    }

    const auth = requireAuth(req);
    if ('response' in auth) return auth.response;
    if (!canActAsCoach(auth.user, adminId)) {
      return NextResponse.json({ error: 'Acesso negado.' }, { status: 403 });
    }

    // 1. Desativa os avisos anteriores DESSA CONSULTORIA para não encavalar na tela do aluno
    await prisma.notice.updateMany({ 
        where: { coachId: adminId, active: true },
        data: { active: false } 
    });

    // 2. Salva o aviso novo no banco de dados (Aparece no App)
    const notice = await prisma.notice.create({
      data: {
        title,
        content,
        date: new Date(),
        active: true,
        coachId: adminId,
        imageUrl: imageUrl || null,
        ctaLabel: ctaLabel || null,
        ctaRoute: ctaRoute || null,
      }
    });

    // 3. DISPARO DE NOTIFICAÇÃO PUSH (O Celular apita no bolso — ou o
    // navegador, pra quem usa o PWA e nunca tinha token da Expo)
    // Se for 'ALL', pega todos os alunos do Coach. Se for array, pega só os selecionados.
    const usersFilter = targetUsers === 'ALL' ? { coachId: adminId } : { id: { in: targetUsers } };

    const usersToNotify = await prisma.user.findMany({
        where: { ...usersFilter, role: 'USER' },
        select: { id: true, pushToken: true, webPushSubscription: true }
    });

    await sendPushToUsers(usersToNotify, `🔔 ${title}`, content, { type: 'notice', noticeId: notice.id });

    return NextResponse.json(notice);
  } catch (error) {
    console.error("Erro POST Notice:", error);
    return NextResponse.json({ error: "Erro ao criar aviso" }, { status: 500 });
  }
}

// 🔥 GET: O App do aluno pergunta "Tem aviso pra mim?"
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const userId = searchParams.get('userId');

    if (!userId) return NextResponse.json([]); // Retorna array vazio se não achar

    const auth = requireAuth(req);
    if ('response' in auth) return auth.response;

    // Descobre de qual coach é este aluno
    const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { coachId: true, createdAt: true }
    });

    if (!canAccessStudent(auth.user, userId, user?.coachId)) {
      return NextResponse.json({ error: 'Acesso negado.' }, { status: 403 });
    }

    if (!user || !user.coachId) return NextResponse.json([]);

    // 🔔 (30 set 2026) O aluno só enxerga avisos enviados DEPOIS que a conta dele
    // foi criada -- quem entra hoje não recebe no sino o que o coach mandou meses
    // antes de ele existir (nem os avisos de teste antigos). Vale pros dois modos.
    const sinceJoined = user.createdAt ? { date: { gte: user.createdAt } } : {};

    // 🔔 (30 set 2026) HISTÓRICO pro sininho: com ?history=1 devolve os últimos
    // avisos do coach (ativos ou não -- cada aviso novo desativa o anterior, então
    // "ativo" só diz qual é o mais recente, não se ele ainda vale). Sem o
    // parâmetro o comportamento é o de sempre (só o último ativo), então o PWA
    // com cache antigo e as builds antigas seguem funcionando.
    if (searchParams.get('history') === '1') {
      const history = await prisma.notice.findMany({
        where: { coachId: user.coachId, ...sinceJoined },
        orderBy: { date: 'desc' },
        take: NOTICE_HISTORY_LIMIT,
      });
      return NextResponse.json(history);
    }

    // Pega o último aviso ativo deste coach específico
    const notices = await prisma.notice.findMany({
      where: { coachId: user.coachId, active: true, ...sinceJoined },
      orderBy: { date: 'desc' },
      take: 1
    });

    return NextResponse.json(notices); // O app sempre espera receber um Array
  } catch (error) {
    console.error("Erro GET Notice:", error);
    return NextResponse.json([]);
  }
}