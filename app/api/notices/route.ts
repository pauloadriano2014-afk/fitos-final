import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { Expo } from 'expo-server-sdk';

const prisma = new PrismaClient();
const expo = new Expo();

// 🔥 POST: Criar um novo aviso e disparar Push Notifications
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { title, content, adminId, targetUsers } = body;

    if (!title || !content || !adminId) {
        return NextResponse.json({ error: "Dados incompletos" }, { status: 400 });
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
        coachId: adminId
      }
    });

    // 3. DISPARO DE NOTIFICAÇÃO PUSH (O Celular apita no bolso!)
    // Se for 'ALL', pega todos os alunos do Coach. Se for array, pega só os selecionados.
    const usersFilter = targetUsers === 'ALL' ? { coachId: adminId } : { id: { in: targetUsers } };
    
    const usersToNotify = await prisma.user.findMany({
        where: { 
            ...usersFilter, 
            role: 'USER',
            pushToken: { not: null } 
        },
        select: { pushToken: true }
    });

    const messages = [];
    for (let u of usersToNotify) {
        if (Expo.isExpoPushToken(u.pushToken)) {
            messages.push({
                to: u.pushToken,
                sound: 'default',
                title: `🔔 ${title}`,
                body: content,
                data: { noticeId: notice.id },
            });
        }
    }

    if (messages.length > 0) {
        try { await expo.sendPushNotificationsAsync(messages); } catch(e) { console.log("Erro Push:", e) }
    }

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

    // Descobre de qual coach é este aluno
    const user = await prisma.user.findUnique({ 
        where: { id: userId }, 
        select: { coachId: true } 
    });

    if (!user || !user.coachId) return NextResponse.json([]);

    // Pega o último aviso ativo deste coach específico
    const notices = await prisma.notice.findMany({
      where: { coachId: user.coachId, active: true },
      orderBy: { date: 'desc' },
      take: 1
    });

    return NextResponse.json(notices); // O app sempre espera receber um Array
  } catch (error) {
    console.error("Erro GET Notice:", error);
    return NextResponse.json([]);
  }
}