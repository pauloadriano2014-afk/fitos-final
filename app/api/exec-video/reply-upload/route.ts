// app/api/exec-video/reply-upload/route.ts
// POST { videoId } (coach do aluno ou master) -> { uploadURL, uid }: link de envio do VÍDEO-RESPOSTA do coach (privado, até 60 s). Depois o app manda
// POST /api/exec-video/:id/feedback { kind: 'VIDEO', replyCfUid: uid }.
import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuth } from '@/lib/auth';
import { cfConfig, createDirectUpload } from '@/lib/videoStream';
import { MAX_REPLY_SECONDS } from '@/lib/execVideo';
import { actsAsCoach, loadStudent } from '@/lib/execVideoService';

export const dynamic = 'force-dynamic';
const missing = (e: any) => /does not exist|P2021|P2022/i.test(String(e?.code || '') + String(e?.message || ''));

export async function POST(req: Request) {
  try {
    const auth = requireAuth(req);
    if ('response' in auth) return auth.response;
    const b = await req.json().catch(() => null);
    const video: any = b?.videoId ? await prisma.executionVideo.findUnique({ where: { id: String(b.videoId) } }) : null;
    if (!video || video.status === 'DELETED' || video.status === 'FAILED') return NextResponse.json({ error: 'Vídeo não encontrado.' }, { status: 404 });
    const student: any = await loadStudent(prisma, video.userId);
    if (!actsAsCoach(auth.user, student)) return NextResponse.json({ error: 'Acesso negado.' }, { status: 403 });
    const cf = cfConfig();
    if (!cf) return NextResponse.json({ error: 'O envio de vídeos não está configurado no servidor.' }, { status: 503 });
    const up = await createDirectUpload(cf, { creator: auth.user.id, maxDurationSeconds: MAX_REPLY_SECONDS, name: `exec-reply:${video.id}` });
    if (!up) return NextResponse.json({ error: 'Não foi possível preparar o envio agora. Tente de novo em instantes.' }, { status: 502 });
    return NextResponse.json({ success: true, uploadURL: up.uploadURL, uid: up.uid, maxSeconds: MAX_REPLY_SECONDS });
  } catch (e: any) {
    if (missing(e)) return NextResponse.json({ error: 'Vídeo indisponível.', unavailable: true }, { status: 503 });
    console.error('[POST /api/exec-video/reply-upload]', e);
    return NextResponse.json({ error: 'Erro ao preparar o envio.' }, { status: 500 });
  }
}
