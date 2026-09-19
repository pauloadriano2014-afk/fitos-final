// app/api/user/web-push-subscription/route.ts
// 🔥 Web Push (17 set 2026) — salva/remove a assinatura de notificação do
// navegador (PWA). Espelha /api/user/push-token, que faz o mesmo pro token
// da Expo (app nativo) — os dois convivem no mesmo User, ver lib/webPush.ts.
//
// 🔥 (19 set 2026) CORRIGIDO — antes isso escrevia num único campo Json no
// User (webPushSubscription), então um segundo navegador/dispositivo
// (ex: ativar notificação no PC depois de já ter no celular) SOBRESCREVIA a
// assinatura anterior, e o outro dispositivo simplesmente parava de receber
// notificação sem erro nenhum. Agora cada assinatura vira uma linha própria
// na tabela WebPushSubscription (uma por endpoint = um por navegador/
// dispositivo instalado), então vários navegadores do mesmo usuário
// recebem ao mesmo tempo. Ver prisma/schema/user.prisma.
//
// POST   { userId, subscription: { endpoint, keys: { p256dh, auth } } }
//        → upsert por endpoint: mesmo navegador registrando de novo
//        atualiza a linha, navegador novo cria uma linha nova.
// DELETE { userId, endpoint? }
//        → com endpoint: remove só a assinatura DESSE navegador (usuário
//        desativou notificação nesse dispositivo específico).
//        → sem endpoint (compatibilidade): remove TODAS as assinaturas
//        desse usuário.

import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuth, canAccessStudent } from '@/lib/auth';

export async function POST(req: Request) {
  try {
    const { userId, subscription } = await req.json();

    if (!userId || !subscription?.endpoint || !subscription?.keys?.p256dh || !subscription?.keys?.auth) {
      return NextResponse.json({ error: 'Dados incompletos' }, { status: 400 });
    }

    const auth = requireAuth(req);
    if ('response' in auth) return auth.response;
    const target = await prisma.user.findUnique({ where: { id: userId }, select: { coachId: true } });
    if (!canAccessStudent(auth.user, userId, target?.coachId)) {
      return NextResponse.json({ error: 'Acesso negado.' }, { status: 403 });
    }

    await prisma.webPushSubscription.upsert({
      where: { endpoint: subscription.endpoint },
      create: {
        userId,
        endpoint: subscription.endpoint,
        p256dh: subscription.keys.p256dh,
        auth: subscription.keys.auth,
      },
      update: {
        // 🔥 userId também entra no update — cobre o caso raro de alguém
        // deslogar e logar com OUTRA conta no MESMO navegador: o endpoint
        // já existe (é do navegador, não do usuário), então precisa
        // "trocar de dono" em vez de ficar preso ao usuário antigo.
        userId,
        p256dh: subscription.keys.p256dh,
        auth: subscription.keys.auth,
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Erro ao salvar assinatura de web push:', error);
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    const { userId, endpoint } = await req.json();
    if (!userId) {
      return NextResponse.json({ error: 'userId obrigatório' }, { status: 400 });
    }

    const auth = requireAuth(req);
    if ('response' in auth) return auth.response;
    const target = await prisma.user.findUnique({ where: { id: userId }, select: { coachId: true } });
    if (!canAccessStudent(auth.user, userId, target?.coachId)) {
      return NextResponse.json({ error: 'Acesso negado.' }, { status: 403 });
    }

    await prisma.webPushSubscription.deleteMany({
      where: endpoint ? { userId, endpoint } : { userId },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Erro ao remover assinatura de web push:', error);
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
  }
}
