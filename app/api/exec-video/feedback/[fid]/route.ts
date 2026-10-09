// app/api/exec-video/feedback/[fid]/route.ts
// DELETE -> o coach apaga uma resposta que mandou (e o vídeo-resposta dela na Cloudflare, se houver).
import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuth } from '@/lib/auth';
import { cfConfig, removeVideo } from '@/lib/videoStream';
import { actsAsCoach, loadStudent } from '@/lib/execVideoService';

export const dynamic = 'force-dynamic';
const missing = (e: any) => /does not exist|P2021|P2022/i.test(String(e?.code || '') + String(e?.message || ''));

export async function DELETE(req: Request, { params }: { params: { fid: string } }) {
  try {
    const auth = requireAuth(req);
    if ('response' in auth) return auth.response;
    const fb: any = await prisma.videoFeedback.findUnique({ where: { id: params.fid } });
    if (!fb) return NextResponse.json({ error: 'Resposta não encontrada.' }, { status: 404 });
    const video: any = await prisma.executionVideo.findUnique({ where: { id: fb.videoId } });
    const student: any = video ? await loadStudent(prisma, video.userId) : null;
    if (!actsAsCoach(auth.user, student)) return NextResponse.json({ error: 'Acesso negado.' }, { status: 403 });
    const cf = cfConfig();
    if (cf && fb.replyCfUid) await removeVideo(cf, fb.replyCfUid);
    await prisma.videoFeedback.delete({ where: { id: fb.id } });
    return NextResponse.json({ success: true });
  } catch (e: any) {
    if (missing(e)) return NextResponse.json({ error: 'Vídeo indisponível.', unavailable: true }, { status: 503 });
    console.error('[DELETE /api/exec-video/feedback/:fid]', e);
    return NextResponse.json({ error: 'Erro ao apagar a resposta.' }, { status: 500 });
  }
}
