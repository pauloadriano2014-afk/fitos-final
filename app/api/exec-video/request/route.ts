// app/api/exec-video/request/route.ts
// POST { studentId, exerciseId?, exerciseName?, workoutId?, workoutExerciseId?, day?, note? }  (coach do aluno ou master) -> "me mande um vídeo desse exercício": libera UM envio e avisa o aluno.
//      Sem exercício = pede um vídeo de qualquer exercício do treino.
// GET  ?userId= -> pedidos em aberto (aluno: os dele; coach: os do aluno informado)
import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuth } from '@/lib/auth';
import { openRequests } from '@/lib/execVideo';
import { actsAsCoach, actsAsStudent, loadStudent, notifyUser } from '@/lib/execVideoService';

export const dynamic = 'force-dynamic';
const missing = (e: any) => /does not exist|P2021|P2022/i.test(String(e?.code || '') + String(e?.message || ''));
const cut = (v: any, n: number) => String(v ?? '').trim().slice(0, n);
const MAX_OPEN = 10;

export async function POST(req: Request) {
  try {
    const auth = requireAuth(req);
    if ('response' in auth) return auth.response;
    const b = await req.json().catch(() => null);
    const studentId = cut(b?.studentId, 80);
    if (!studentId) return NextResponse.json({ error: 'studentId obrigatório.' }, { status: 400 });
    const student: any = await loadStudent(prisma, studentId);
    if (!student || student.role !== 'USER') return NextResponse.json({ error: 'Aluno não encontrado.' }, { status: 404 });
    if (!actsAsCoach(auth.user, student)) return NextResponse.json({ error: 'Acesso negado.' }, { status: 403 });
    const exerciseId = cut(b?.exerciseId, 80) || null;
    let exerciseName = cut(b?.exerciseName, 120);
    if (exerciseId) { const ex: any = await prisma.exercise.findUnique({ where: { id: exerciseId }, select: { name: true } }).catch(() => null); if (ex?.name) exerciseName = ex.name; }
    if (exerciseId && !exerciseName) return NextResponse.json({ error: 'Exercício não encontrado.' }, { status: 404 });
    if (!exerciseId && !exerciseName) exerciseName = 'qualquer exercício do treino';
    const open = await openRequests(prisma, studentId);
    if (open.length >= MAX_OPEN) return NextResponse.json({ error: 'Esse aluno já tem muitos pedidos de vídeo em aberto.' }, { status: 409 });
    const dup = open.find((r: any) => (r.exerciseId || null) === exerciseId);
    if (dup) return NextResponse.json({ success: true, request: dup, already: true });
    const row = await prisma.videoRequest.create({ data: { userId: studentId, coachId: auth.user.id, exerciseId, exerciseName, workoutId: cut(b?.workoutId, 80) || null, workoutExerciseId: cut(b?.workoutExerciseId, 80) || null, day: cut(b?.day, 40) || null, note: cut(b?.note, 300) || null } });
    await notifyUser(prisma, studentId, '🎥 Seu coach pediu um vídeo', exerciseId ? `Grave um vídeo de “${exerciseName}” e envie pelo app.` : 'Grave um vídeo de um exercício do seu treino e envie pelo app.', { type: 'exec_video_request', requestId: row.id, exerciseId, workoutId: row.workoutId, day: row.day });
    return NextResponse.json({ success: true, request: row });
  } catch (e: any) {
    if (missing(e)) return NextResponse.json({ error: 'O vídeo de execução ainda não está habilitado no servidor.', unavailable: true }, { status: 503 });
    console.error('[POST /api/exec-video/request]', e);
    return NextResponse.json({ error: 'Erro ao pedir o vídeo.' }, { status: 500 });
  }
}

export async function GET(req: Request) {
  try {
    const auth = requireAuth(req);
    if ('response' in auth) return auth.response;
    const userId = new URL(req.url).searchParams.get('userId') || auth.user.id;
    const student: any = await loadStudent(prisma, userId);
    if (!student) return NextResponse.json({ error: 'Aluno não encontrado.' }, { status: 404 });
    if (!actsAsStudent(auth.user, student) && !actsAsCoach(auth.user, student)) return NextResponse.json({ error: 'Acesso negado.' }, { status: 403 });
    return NextResponse.json({ requests: await openRequests(prisma, userId) });
  } catch (e: any) {
    if (missing(e)) return NextResponse.json({ requests: [], unavailable: true });
    console.error('[GET /api/exec-video/request]', e);
    return NextResponse.json({ error: 'Erro ao carregar os pedidos.' }, { status: 500 });
  }
}
