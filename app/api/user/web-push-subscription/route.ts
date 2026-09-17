// app/api/user/web-push-subscription/route.ts
// 🔥 Web Push (17 set 2026) — salva/remove a assinatura de notificação do
// navegador (PWA). Espelha /api/user/push-token, que faz o mesmo pro token
// da Expo (app nativo) — os dois convivem no mesmo User, ver lib/webPush.ts.
//
// POST   { userId, subscription: { endpoint, keys: { p256dh, auth } } }
// DELETE { userId }  → usuário desativou notificação no navegador

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

    await prisma.user.update({
      where: { id: userId },
      data: { webPushSubscription: subscription } as any,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Erro ao salvar assinatura de web push:', error);
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    const { userId } = await req.json();
    if (!userId) {
      return NextResponse.json({ error: 'userId obrigatório' }, { status: 400 });
    }

    const auth = requireAuth(req);
    if ('response' in auth) return auth.response;
    const target = await prisma.user.findUnique({ where: { id: userId }, select: { coachId: true } });
    if (!canAccessStudent(auth.user, userId, target?.coachId)) {
      return NextResponse.json({ error: 'Acesso negado.' }, { status: 403 });
    }

    await prisma.user.update({ where: { id: userId }, data: { webPushSubscription: null } as any });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Erro ao remover assinatura de web push:', error);
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
  }
}
