// app/api/gen-prefs/concerns/route.ts
// 🩺 (19 out 2026) GET ?userId=... -> o que a aluna escreveu sobre os exercícios (dor, "não senti o músculo", "muito difícil") nos últimos 120 dias, agrupado por exercício, com o que ainda está
// na rotina atual dela. É o cartão "Observações da aluna" da tela do Protocolo ELITE. Só lê. Só o coach dele ou o master (o próprio aluno não vê).
import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuth, canAccessStudent } from '@/lib/auth';
import { buildConcerns, KIND_LABEL } from '@/lib/exerciseConcerns';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  try {
    const auth = requireAuth(req); if ('response' in auth) return auth.response;
    const userId = new URL(req.url).searchParams.get('userId');
    if (!userId) return NextResponse.json({ error: 'userId obrigatório' }, { status: 400 });
    const student = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, coachId: true } });
    if (!student) return NextResponse.json({ error: 'Aluno não encontrado' }, { status: 404 });
    if (auth.user.id === userId || !canAccessStudent(auth.user, userId, student.coachId)) return NextResponse.json({ error: 'Acesso negado.' }, { status: 403 });

    const since = new Date(Date.now() - 120 * 86400000);
    const history = await prisma.workoutHistory.findMany({ where: { userId, date: { gte: since } }, orderBy: { date: 'desc' }, take: 80, include: { details: { where: { note: { not: null } } } } });
    const concerns = buildConcerns(history as any, { sinceDays: 120 });

    // o que ainda está na rotina atual dela (para o coach ver o que "continua lá")
    const latest = await prisma.workout.findFirst({ where: { userId }, orderBy: { createdAt: 'desc' }, select: { exercises: { select: { exerciseId: true } } } }).catch(() => null);
    const current = new Set<string>(((latest as any)?.exercises || []).map((e: any) => String(e.exerciseId)));
    return NextResponse.json({ concerns: concerns.map((c) => ({ ...c, kindLabel: KIND_LABEL[c.kind], inCurrent: current.has(c.exerciseId) })), total: concerns.length });
  } catch (e) {
    console.error('Erro nas observações da aluna:', e);
    return NextResponse.json({ error: 'Não foi possível ler as observações agora.' }, { status: 500 });
  }
}
