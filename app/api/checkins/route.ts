// app/api/checkins/route.ts
// 🔥 Diário diário (biofeedback) do aluno — fome/digestão/energia + aderência
// à dieta do dia. Essa rota já era chamada pelo BiofeedbackModal.js desde
// antes, mas nunca existiu no backend (o modelo DailyCheckin já estava no
// schema, órfão, sem rota nenhuma apontando pra ele) — feature "morta" até
// agora. Criada em 16 set 2026 junto com o diário alimentar por refeição
// (ver /api/diet/meal-log).
//
// GET  ?studentId=&date=YYYY-MM-DD  → devolve o registro do dia (ou null)
// POST { studentId, date, fome, digestao, energia, dietAdherence?, dietNote? }
//      → upsert por [studentId, date]

import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuth, canAccessStudent } from '@/lib/auth';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const studentId = searchParams.get('studentId');
    const date = searchParams.get('date');

    if (!studentId || !date) {
      return NextResponse.json({ error: 'studentId e date são obrigatórios' }, { status: 400 });
    }

    const auth = requireAuth(req);
    if ('response' in auth) return auth.response;

    const student = await prisma.user.findUnique({ where: { id: studentId }, select: { coachId: true } });
    if (!student) {
      return NextResponse.json({ error: 'Aluno não encontrado' }, { status: 404 });
    }
    if (!canAccessStudent(auth.user, studentId, student.coachId)) {
      return NextResponse.json({ error: 'Acesso negado.' }, { status: 403 });
    }

    const checkin = await prisma.dailyCheckin.findUnique({
      where: { studentId_date: { studentId, date } },
    });

    return NextResponse.json(checkin ?? null);
  } catch (error: any) {
    console.error('[checkins] Erro GET:', error?.message || error);
    return NextResponse.json({ error: 'Erro ao buscar diário do dia' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { studentId, date, fome, digestao, energia, dietAdherence, dietNote } = body;

    if (!studentId || !date) {
      return NextResponse.json({ error: 'studentId e date são obrigatórios' }, { status: 400 });
    }

    const auth = requireAuth(req);
    if ('response' in auth) return auth.response;

    const student = await prisma.user.findUnique({ where: { id: studentId }, select: { coachId: true } });
    if (!student) {
      return NextResponse.json({ error: 'Aluno não encontrado' }, { status: 404 });
    }
    if (!canAccessStudent(auth.user, studentId, student.coachId)) {
      return NextResponse.json({ error: 'Acesso negado.' }, { status: 403 });
    }

    const data: any = {};
    if (fome !== undefined) data.fome = fome;
    if (digestao !== undefined) data.digestao = digestao;
    if (energia !== undefined) data.energia = energia;
    if (dietAdherence !== undefined) data.dietAdherence = dietAdherence;
    if (dietNote !== undefined) data.dietNote = dietNote;

    const checkin = await prisma.dailyCheckin.upsert({
      where: { studentId_date: { studentId, date } },
      update: data,
      create: { studentId, date, ...data },
    });

    return NextResponse.json({ success: true, checkin });
  } catch (error: any) {
    console.error('[checkins] Erro POST:', error?.message || error);
    return NextResponse.json({ error: 'Erro ao salvar diário do dia' }, { status: 500 });
  }
}
