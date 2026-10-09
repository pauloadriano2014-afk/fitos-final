// app/api/exec-video/route.ts
// 🎥 (9 out 2026) VÍDEO DE EXECUÇÃO.
//   POST { userId?, exerciseId?, exerciseName?, workoutId?, workoutExerciseId?, day?, setNumber?, note?, requestId?, durationSec? }
//        -> (aluno) confere se pode enviar (liberação + limite do coach, ou pedido) e devolve { video, uploadURL }: o app manda o arquivo DIRETO para a Cloudflare (privado).
//   GET  ?userId=&limit=  -> lista leve dos vídeos (aluno: os dele; coach/master: os do aluno informado)
import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuth } from '@/lib/auth';
import { cfConfig, createDirectUpload } from '@/lib/videoStream';
import { MAX_UPLOAD_SECONDS, checkAllowance, cleanUploadInput, expiryFrom, isPriorityNote } from '@/lib/execVideo';
import { actsAsCoach, actsAsStudent, feedbackCounts, loadStudent, summarize, STALE_UPLOAD_HOURS } from '@/lib/execVideoService';

export const dynamic = 'force-dynamic';
const UNAVAILABLE = { error: 'O vídeo de execução ainda não está habilitado no servidor (falta criar as tabelas novas: npx prisma db push).', unavailable: true };
const missing = (e: any) => /does not exist|P2021|P2022/i.test(String(e?.code || '') + String(e?.message || ''));

export async function POST(req: Request) {
  try {
    const auth = requireAuth(req);
    if ('response' in auth) return auth.response;
    const b = await req.json().catch(() => null);
    if (!b) return NextResponse.json({ error: 'Corpo inválido.' }, { status: 400 });
    const studentId = String(b.userId || auth.user.id);
    const student: any = await loadStudent(prisma, studentId);
    if (!student || student.role !== 'USER') return NextResponse.json({ error: 'Aluno não encontrado.' }, { status: 404 });
    if (!actsAsStudent(auth.user, student)) return NextResponse.json({ error: 'Acesso negado.' }, { status: 403 });
    const cf = cfConfig();
    if (!cf) return NextResponse.json({ error: 'O envio de vídeos não está configurado no servidor.' }, { status: 503 });

    const input = cleanUploadInput(b);
    let exerciseName = input.exerciseName;
    if (input.exerciseId) { const ex: any = await prisma.exercise.findUnique({ where: { id: input.exerciseId }, select: { name: true } }).catch(() => null); if (ex?.name) exerciseName = ex.name; }
    if (!exerciseName) return NextResponse.json({ error: 'Diga de qual exercício é o vídeo.' }, { status: 400 });

    const allow = await checkAllowance(prisma, { studentId, coachId: student.coachId, exerciseId: input.exerciseId, requestId: input.requestId });
    if (!allow.canUpload) return NextResponse.json({ error: allow.reason, allowance: allow }, { status: 403 });
    const staleAfter = new Date(Date.now() - STALE_UPLOAD_HOURS * 3600000);
    const inFlight = await prisma.executionVideo.count({ where: { userId: studentId, status: 'UPLOADING', createdAt: { gte: staleAfter } } });
    if (inFlight >= 3) return NextResponse.json({ error: 'Você já tem vídeos sendo enviados. Espere terminarem e tente de novo.' }, { status: 429 });

    const up = await createDirectUpload(cf, { creator: studentId, maxDurationSeconds: MAX_UPLOAD_SECONDS, name: `exec:${studentId}:${exerciseName}`.slice(0, 200) });
    if (!up) return NextResponse.json({ error: 'Não foi possível preparar o envio agora. Tente de novo em instantes.' }, { status: 502 });

    const now = new Date();
    const video = await prisma.executionVideo.create({
      data: {
        userId: studentId, coachId: student.coachId || null, exerciseId: input.exerciseId, exerciseName, workoutId: input.workoutId, workoutExerciseId: input.workoutExerciseId, day: input.day, setNumber: input.setNumber,
        studentNote: input.note, cfUid: up.uid, status: 'UPLOADING', requestId: allow.requestId, priority: allow.mode === 'REQUEST' || isPriorityNote(input.note), expiresAt: expiryFrom(now),
      },
    });
    return NextResponse.json({ success: true, video: summarize(video), uploadURL: up.uploadURL, maxSeconds: MAX_UPLOAD_SECONDS, mode: allow.mode });
  } catch (e: any) {
    if (missing(e)) return NextResponse.json(UNAVAILABLE, { status: 503 });
    console.error('[POST /api/exec-video]', e);
    return NextResponse.json({ error: 'Erro ao preparar o envio do vídeo.' }, { status: 500 });
  }
}

export async function GET(req: Request) {
  try {
    const auth = requireAuth(req);
    if ('response' in auth) return auth.response;
    const sp = new URL(req.url).searchParams;
    const userId = sp.get('userId') || auth.user.id;
    const student: any = await loadStudent(prisma, userId);
    if (!student) return NextResponse.json({ error: 'Aluno não encontrado.' }, { status: 404 });
    if (!actsAsStudent(auth.user, student) && !actsAsCoach(auth.user, student)) return NextResponse.json({ error: 'Acesso negado.' }, { status: 403 });
    const limit = Math.min(100, Math.max(1, Number(sp.get('limit')) || 50));
    const rows: any[] = await prisma.executionVideo.findMany({ where: { userId, status: { in: ['UPLOADING', 'READY'] } }, orderBy: { createdAt: 'desc' }, take: limit });
    const counts = await feedbackCounts(prisma, rows.map((r) => r.id));
    return NextResponse.json({ videos: rows.map((r) => summarize(r, counts.get(r.id))) });
  } catch (e: any) {
    if (missing(e)) return NextResponse.json({ videos: [], unavailable: true });
    console.error('[GET /api/exec-video]', e);
    return NextResponse.json({ error: 'Erro ao carregar os vídeos.' }, { status: 500 });
  }
}
