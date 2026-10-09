// app/api/exec-video/[id]/feedback/route.ts
// POST { kind: TEXT|MOMENT|DRAWING|VIDEO|REFERENCE|COMBO, body?, atSec?, drawing?, replyCfUid?, referenceExerciseId?, marks?, coach?: { replyCfUid, marks }, saveAsQuickReply? }  (coach do aluno ou master)
// COMBO = UMA resposta com tudo junto: texto + marcações (instante + formas + nota) no vídeo do aluno + o vídeo do coach (com marcações) + comparação com a biblioteca.
// -> grava a resposta ao vídeo e avisa o aluno por push (uma só notificação a cada 10 min por vídeo: várias respostas seguidas não viram spam).
import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuth } from '@/lib/auth';
import { cleanFeedback } from '@/lib/execVideo';
import { cfConfig, getVideoInfo } from '@/lib/videoStream';
import { actsAsCoach, loadStudent, notifyUser } from '@/lib/execVideoService';

export const dynamic = 'force-dynamic';
const missing = (e: any) => /does not exist|P2021|P2022/i.test(String(e?.code || '') + String(e?.message || ''));
const PUSH_GAP_MS = 10 * 60000;
const QUICK_MAX = 60;

export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const auth = requireAuth(req);
    if ('response' in auth) return auth.response;
    const video: any = await prisma.executionVideo.findUnique({ where: { id: params.id } });
    if (!video || video.status === 'DELETED' || video.status === 'FAILED') return NextResponse.json({ error: 'Vídeo não encontrado.' }, { status: 404 });
    const student: any = await loadStudent(prisma, video.userId);
    if (!actsAsCoach(auth.user, student)) return NextResponse.json({ error: 'Acesso negado.' }, { status: 403 });
    const b = await req.json().catch(() => null);
    const clean = cleanFeedback(b);
    if (!clean.ok) return NextResponse.json({ error: clean.error }, { status: 400 });
    const v = clean.value;
    if (v.kind === 'VIDEO' || (v.kind === 'COMBO' && v.replyCfUid)) {
      const cf = cfConfig();
      const info = cf ? await getVideoInfo(cf, v.replyCfUid!) : null;
      if (!info) return NextResponse.json({ error: 'Não encontrei o seu vídeo-resposta. Confirme se o envio terminou e tente de novo.' }, { status: 400 });
    }
    let referenceName: string | null = null;
    if (v.kind === 'REFERENCE' || (v.kind === 'COMBO' && v.referenceExerciseId)) {
      const ex: any = await prisma.exercise.findUnique({ where: { id: v.referenceExerciseId! }, select: { name: true, videoUrl: true } }).catch(() => null);
      if (!ex) return NextResponse.json({ error: 'Exercício da biblioteca não encontrado.' }, { status: 404 });
      if (!ex.videoUrl) return NextResponse.json({ error: 'Esse exercício ainda não tem vídeo na biblioteca.' }, { status: 400 });
      referenceName = ex.name;
    }
    const recent = await prisma.videoFeedback.count({ where: { videoId: video.id, createdAt: { gte: new Date(Date.now() - PUSH_GAP_MS) } } });
    const row = await prisma.videoFeedback.create({ data: { videoId: video.id, coachId: auth.user.id, kind: v.kind, body: v.body, atSec: v.atSec, drawing: v.drawing ?? undefined, replyCfUid: v.replyCfUid, referenceExerciseId: v.referenceExerciseId, referenceName, parts: v.parts ?? undefined } });
    if (!video.coachViewedAt) await prisma.executionVideo.update({ where: { id: video.id }, data: { coachViewedAt: new Date() } }).catch(() => undefined);
    if (recent === 0) await notifyUser(prisma, video.userId, '🎥 Seu coach respondeu o seu vídeo', video.exerciseName, { type: 'exec_video_feedback', videoId: video.id });
    if (b?.saveAsQuickReply === true && v.body && (v.kind === 'TEXT' || v.kind === 'MOMENT' || v.kind === 'COMBO')) {
      const have = await prisma.videoQuickReply.count({ where: { coachId: auth.user.id } });
      const same = await prisma.videoQuickReply.findFirst({ where: { coachId: auth.user.id, text: v.body } });
      if (!same && have < QUICK_MAX) await prisma.videoQuickReply.create({ data: { coachId: auth.user.id, text: v.body } }).catch(() => undefined);
    }
    return NextResponse.json({ success: true, feedback: row });
  } catch (e: any) {
    if (missing(e)) return NextResponse.json({ error: 'Vídeo indisponível.', unavailable: true }, { status: 503 });
    console.error('[POST /api/exec-video/:id/feedback]', e);
    return NextResponse.json({ error: 'Erro ao enviar a resposta.' }, { status: 500 });
  }
}
