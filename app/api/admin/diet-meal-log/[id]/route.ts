// app/api/admin/diet-meal-log/[id]/route.ts
// 🔥 (18 set 2026) O coach deixa uma observação num registro específico do
// diário alimentar do aluno (ex: comentar sobre uma refeição livre) — some na
// tela "Diário Alimentar" de AdminUserDietTab.js, junto de "ÚLTIMAS
// REFEIÇÕES LIVRES". A permissão é checada contra o coachId ATUAL do aluno
// (busca fresca em User), não o coachId denormalizado no log — que pode
// ficar desatualizado se o aluno trocar de coach depois do registro.
//
// PATCH { coachObservation }

import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuth, canAccessStudent } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  try {
    const auth = requireAuth(req);
    if ('response' in auth) return auth.response;

    const { coachObservation } = await req.json();

    const log = await prisma.dietMealLog.findUnique({ where: { id: params.id } });
    if (!log) {
      return NextResponse.json({ error: 'Registro não encontrado' }, { status: 404 });
    }

    const student = await prisma.user.findUnique({ where: { id: log.userId }, select: { coachId: true } });
    if (!student || !canAccessStudent(auth.user, log.userId, student.coachId)) {
      return NextResponse.json({ error: 'Acesso negado.' }, { status: 403 });
    }

    const updated = await prisma.dietMealLog.update({
      where: { id: params.id },
      data: { coachObservation: coachObservation?.trim() || null },
    });

    return NextResponse.json({ success: true, log: updated });
  } catch (error: any) {
    console.error('[admin/diet-meal-log/[id]/PATCH]', error?.message || error);
    return NextResponse.json({ error: 'Erro ao salvar observação' }, { status: 500 });
  }
}
