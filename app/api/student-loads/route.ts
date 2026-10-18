// app/api/student-loads/route.ts
// 🏋️ (18 out 2026) GET /api/student-loads?userId=<aluno>[&exerciseIds=a,b,c] -> as cargas de cada exercício do aluno, SEPARADAS POR FASE (normal / deload / choque),
// a sugestão de carga e a sugestão de "subir a base" depois de um choque bem-sucedido (ver lib/studentLoads.ts). É o que alimenta os chips do editor do coach
// (Montar treino) e o "Puxar cargas". Só lê. Quem pode: o coach do aluno ou o time master (mesma regra do histórico do aluno).
import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuth, canAccessStudent } from '@/lib/auth';
import { buildStudentLoads } from '@/lib/studentLoads';

export const dynamic = 'force-dynamic';
const HISTORY_TAKE = 150;
const MAX_IDS = 200;

export async function GET(req: Request) {
  try {
    const auth = requireAuth(req);
    if ('response' in auth) return auth.response;
    const params = new URL(req.url).searchParams;
    const userId = params.get('userId');
    if (!userId) return NextResponse.json({ error: 'UserId required' }, { status: 400 });
    const student: any = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, coachId: true, loadSuggestOff: true, loadStep: true } });
    if (!student) return NextResponse.json({ error: 'Aluno não encontrado' }, { status: 404 });
    if (!canAccessStudent(auth.user, userId, student.coachId)) return NextResponse.json({ error: 'Acesso negado.' }, { status: 403 });
    const onlyIds = (params.get('exerciseIds') || '').split(',').map((x) => x.trim()).filter(Boolean).slice(0, MAX_IDS);
    const history = await prisma.workoutHistory.findMany({ where: { userId }, orderBy: { date: 'desc' }, take: HISTORY_TAKE, include: { details: true } });
    const exercises = buildStudentLoads(history as any, { step: student.loadStep ?? null, onlyIds, suggest: !student.loadSuggestOff });
    return NextResponse.json({ ok: true, loadSuggestEnabled: !student.loadSuggestOff, sessions: history.length, exercises });
  } catch (e) {
    console.error('Erro em student-loads:', e);
    return NextResponse.json({ error: 'Não foi possível carregar as cargas agora.' }, { status: 500 });
  }
}
