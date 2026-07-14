// app/api/admin/coach-requests/route.ts
// 🧑‍🏫 GESTÃO DE COACHES PENDENTES (aprovar / recusar)
//
// GET  → lista coaches com accountStatus PENDING_APPROVAL (e recentes REJECTED)
// POST → { coachId, action: "APPROVE" | "REJECT", inviteCode? }
//        APPROVE: ativa a conta e define o código de convite dele
//        REJECT:  marca como REJECTED (sem acesso; vira lead pra remarketing)

import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Gera código de convite a partir do nome (ex: "Carlos Silva" → "CARLOS742")
async function generateInviteCode(name: string): Promise<string> {
  const base = (name || 'COACH')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // remove acentos
    .replace(/[^a-zA-Z]/g, '')
    .toUpperCase()
    .split(' ')[0]
    .substring(0, 8) || 'COACH';

  for (let i = 0; i < 10; i++) {
    const candidate = `${base}${Math.floor(100 + Math.random() * 900)}`;
    const exists = await prisma.user.findFirst({
      where: { inviteCode: candidate } as any,
    });
    if (!exists) return candidate;
  }
  return `${base}${Date.now().toString().slice(-5)}`;
}

export async function GET() {
  try {
    const pending = await prisma.user.findMany({
      where: {
        role: 'COACH',
        accountStatus: { in: ['PENDING_APPROVAL', 'REJECTED'] },
      } as any,
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        cpf: true,
        accountStatus: true,
        coachRequestInfo: true,
        createdAt: true,
      } as any,
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json(pending);
  } catch (error: any) {
    console.error('[coach-requests GET] Erro:', error?.message || error);
    return NextResponse.json({ error: 'Erro ao listar solicitações' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { coachId, action, inviteCode } = body;

    if (!coachId || !['APPROVE', 'REJECT'].includes(action)) {
      return NextResponse.json(
        { error: 'coachId e action (APPROVE/REJECT) são obrigatórios.' },
        { status: 400 }
      );
    }

    const coach = await prisma.user.findUnique({ where: { id: coachId } });
    if (!coach || coach.role !== 'COACH') {
      return NextResponse.json({ error: 'Coach não encontrado.' }, { status: 404 });
    }

    if (action === 'REJECT') {
      await prisma.user.update({
        where: { id: coachId },
        data: { accountStatus: 'REJECTED' } as any,
      });
      return NextResponse.json({ success: true, status: 'REJECTED' });
    }

    // APPROVE
    // Código de convite: usa o enviado pelo admin (se veio) ou gera automático
    let finalCode = (inviteCode || '').trim().toUpperCase();
    if (finalCode) {
      const exists = await prisma.user.findFirst({
        where: { inviteCode: finalCode, NOT: { id: coachId } } as any,
      });
      if (exists) {
        return NextResponse.json(
          { error: `O código "${finalCode}" já está em uso por outro coach.` },
          { status: 400 }
        );
      }
    } else {
      finalCode = await generateInviteCode(coach.name || 'COACH');
    }

    const updated = await prisma.user.update({
      where: { id: coachId },
      data: {
        accountStatus: 'ACTIVE',
        inviteCode: finalCode,
      } as any,
    });

    // 🔔 Avisa o coach aprovado (se já tiver aberto o app e registrado push token)
    try {
      if (updated.pushToken) {
        await fetch('https://exp.host/--/api/v2/push/send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            to: updated.pushToken,
            sound: 'default',
            title: '🎉 Você foi aprovado!',
            body: `Seu acesso está liberado. Seu código de convite para alunos é: ${finalCode}`,
          }),
        });
      }
    } catch (e) { /* não-crítico */ }

    return NextResponse.json({
      success: true,
      status: 'ACTIVE',
      inviteCode: finalCode,
      coach: { id: updated.id, name: updated.name, email: updated.email },
    });
  } catch (error: any) {
    console.error('[coach-requests POST] Erro:', error?.message || error);
    return NextResponse.json({ error: 'Erro ao processar solicitação' }, { status: 500 });
  }
}