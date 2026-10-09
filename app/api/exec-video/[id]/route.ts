// app/api/exec-video/[id]/route.ts
//   GET    -> o vídeo com link assinado + respostas do coach. Coach abrindo marca "visto"; aluno abrindo marca as respostas como lidas (devolve `isNew` do que ainda não tinha visto).
//   PATCH  { action: 'uploaded' | 'retry' }  (aluno) 'uploaded' = terminei de enviar (confere na Cloudflare e avisa o coach); 'retry' = o envio falhou: novo link de envio
//   DELETE -> aluno (o dele) ou coach: apaga o arquivo da Cloudflare e marca como apagado
import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuth } from '@/lib/auth';
import { cfConfig, createDirectUpload, removeVideo } from '@/lib/videoStream';
import { MAX_UPLOAD_SECONDS } from '@/lib/execVideo';
import { actsAsCoach, actsAsStudent, loadStudent, presentVideo, refreshStatus, summarize } from '@/lib/execVideoService';

export const dynamic = 'force-dynamic';
const missing = (e: any) => /does not exist|P2021|P2022/i.test(String(e?.code || '') + String(e?.message || ''));

async function load(req: Request, id: string) {
  const auth = requireAuth(req);
  if ('response' in auth) return { response: auth.response } as const;
  const video: any = await prisma.executionVideo.findUnique({ where: { id } });
  if (!video || video.status === 'DELETED' || video.status === 'FAILED') return { response: NextResponse.json({ error: 'Vídeo não encontrado.' }, { status: 404 }) } as const;
  const student: any = await loadStudent(prisma, video.userId);
  const asStudent = actsAsStudent(auth.user, student), asCoach = actsAsCoach(auth.user, student);
  if (!asStudent && !asCoach) return { response: NextResponse.json({ error: 'Acesso negado.' }, { status: 403 }) } as const;
  return { auth, video, student, asStudent, asCoach } as const;
}

export async function GET(req: Request, { params }: { params: { id: string } }) {
  try {
    const r = await load(req, params.id);
    if ('response' in r) return r.response;
    const cf = cfConfig();
    let video = r.video;
    if (video.status === 'UPLOADING') video = await refreshStatus(prisma, cf, video);
    const sp = new URL(req.url).searchParams;
    // quem está olhando: o próprio aluno, ou (aluno TESTE) o coach que abriu "visualizar como aluno" e avisa com ?as=student; nos demais casos é o coach
    const studentView = r.auth.user.id === r.student.id || (r.student.isTestAccount === true && r.asStudent && sp.get('as') === 'student');
    const data = await presentVideo(prisma, cf, video, { viewerIsStudent: studentView });
    if (!studentView && !video.coachViewedAt && sp.get('peek') !== '1') await prisma.executionVideo.update({ where: { id: video.id }, data: { coachViewedAt: new Date() } }).catch(() => undefined);
    if (studentView) await prisma.videoFeedback.updateMany({ where: { videoId: video.id, studentReadAt: null }, data: { studentReadAt: new Date() } }).catch(() => undefined);
    return NextResponse.json({ video: data, student: { id: r.student.id, name: r.student.name }, role: studentView ? 'STUDENT' : 'COACH' });
  } catch (e: any) {
    if (missing(e)) return NextResponse.json({ error: 'Vídeo indisponível.', unavailable: true }, { status: 503 });
    console.error('[GET /api/exec-video/:id]', e);
    return NextResponse.json({ error: 'Erro ao abrir o vídeo.' }, { status: 500 });
  }
}

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  try {
    const r = await load(req, params.id);
    if ('response' in r) return r.response;
    if (!r.asStudent) return NextResponse.json({ error: 'Só o aluno pode fazer isso.' }, { status: 403 });
    const b = await req.json().catch(() => ({}));
    const cf = cfConfig();
    if (!cf) return NextResponse.json({ error: 'O envio de vídeos não está configurado no servidor.' }, { status: 503 });
    if (b.action === 'uploaded') {
      const v = await refreshStatus(prisma, cf, r.video);
      return NextResponse.json({ success: true, video: summarize(v) });
    }
    if (b.action === 'retry') {
      if (r.video.status !== 'UPLOADING') return NextResponse.json({ error: 'Esse vídeo já foi enviado.' }, { status: 409 });
      await removeVideo(cf, r.video.cfUid);
      const up = await createDirectUpload(cf, { creator: r.video.userId, maxDurationSeconds: MAX_UPLOAD_SECONDS, name: `exec:${r.video.userId}:${r.video.exerciseName}`.slice(0, 200) });
      if (!up) return NextResponse.json({ error: 'Não foi possível preparar o envio agora. Tente de novo em instantes.' }, { status: 502 });
      const v = await prisma.executionVideo.update({ where: { id: r.video.id }, data: { cfUid: up.uid } });
      return NextResponse.json({ success: true, video: summarize(v), uploadURL: up.uploadURL });
    }
    return NextResponse.json({ error: 'Ação inválida.' }, { status: 400 });
  } catch (e: any) {
    if (missing(e)) return NextResponse.json({ error: 'Vídeo indisponível.', unavailable: true }, { status: 503 });
    console.error('[PATCH /api/exec-video/:id]', e);
    return NextResponse.json({ error: 'Erro ao atualizar o vídeo.' }, { status: 500 });
  }
}

export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  try {
    const r = await load(req, params.id);
    if ('response' in r) return r.response;
    const cf = cfConfig();
    const replies: any[] = await prisma.videoFeedback.findMany({ where: { videoId: r.video.id, replyCfUid: { not: null } }, select: { replyCfUid: true } });
    if (cf) { await removeVideo(cf, r.video.cfUid); for (const x of replies) await removeVideo(cf, x.replyCfUid); }
    await prisma.executionVideo.update({ where: { id: r.video.id }, data: { status: 'DELETED', deletedAt: new Date() } });
    return NextResponse.json({ success: true });
  } catch (e: any) {
    if (missing(e)) return NextResponse.json({ error: 'Vídeo indisponível.', unavailable: true }, { status: 503 });
    console.error('[DELETE /api/exec-video/:id]', e);
    return NextResponse.json({ error: 'Erro ao apagar o vídeo.' }, { status: 500 });
  }
}
