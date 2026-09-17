// app/api/diet/meal-log/route.ts
// 🔥 Diário alimentar por refeição (16 set 2026) — registro opcional, um
// toque só (ver DietMealLog em nutrition.prisma pro significado de cada
// status). Nunca obriga nada: ausência de registro é só ausência, não vira
// "PULOU" automaticamente.
//
// GET  ?userId=&date=YYYY-MM-DD           → lista os registros do aluno nesse dia
// POST { userId, date, mealId, mealName, status, substitutionLabel?, note? }
//      → upsert por [userId, date, mealId]

import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuth, canAccessStudent } from '@/lib/auth';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const VALID_STATUS = ['SEGUIU', 'SUBSTITUIU', 'PULOU', 'LIVRE'];

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const userId = searchParams.get('userId');
    const date = searchParams.get('date');

    if (!userId || !date) {
      return NextResponse.json({ error: 'userId e date são obrigatórios' }, { status: 400 });
    }

    const auth = requireAuth(req);
    if ('response' in auth) return auth.response;

    const student = await prisma.user.findUnique({ where: { id: userId }, select: { coachId: true } });
    if (!student) {
      return NextResponse.json({ error: 'Aluno não encontrado' }, { status: 404 });
    }
    if (!canAccessStudent(auth.user, userId, student.coachId)) {
      return NextResponse.json({ error: 'Acesso negado.' }, { status: 403 });
    }

    const logs = await prisma.dietMealLog.findMany({ where: { userId, date } });
    return NextResponse.json(logs);
  } catch (error: any) {
    console.error('[diet/meal-log] Erro GET:', error?.message || error);
    return NextResponse.json({ error: 'Erro ao buscar diário alimentar' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { userId, date, mealId, mealName, status, substitutionLabel, note } = body;

    if (!userId || !date || !mealId || !status) {
      return NextResponse.json({ error: 'userId, date, mealId e status são obrigatórios' }, { status: 400 });
    }
    if (!VALID_STATUS.includes(status)) {
      return NextResponse.json({ error: `status inválido: ${status}` }, { status: 400 });
    }

    const auth = requireAuth(req);
    if ('response' in auth) return auth.response;

    const student = await prisma.user.findUnique({ where: { id: userId }, select: { coachId: true } });
    if (!student) {
      return NextResponse.json({ error: 'Aluno não encontrado' }, { status: 404 });
    }
    if (!canAccessStudent(auth.user, userId, student.coachId)) {
      return NextResponse.json({ error: 'Acesso negado.' }, { status: 403 });
    }

    const data = {
      mealName: mealName || '',
      status,
      substitutionLabel: substitutionLabel ?? null,
      note: note ?? null,
      coachId: student.coachId ?? null,
    };

    const log = await prisma.dietMealLog.upsert({
      where: { userId_date_mealId: { userId, date, mealId } },
      update: data,
      create: { userId, date, mealId, ...data },
    });

    return NextResponse.json({ success: true, log });
  } catch (error: any) {
    console.error('[diet/meal-log] Erro POST:', error?.message || error);
    return NextResponse.json({ error: 'Erro ao salvar diário alimentar' }, { status: 500 });
  }
}
