// app/api/exams/[id]/reply/route.ts
// 🩺 (25 out 2026) POST { body } -> o PROFISSIONAL (personal/nutri escolhido pelo aluno) responde por escrito; o aluno recebe um aviso.
import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuth } from '@/lib/auth';
import { EXAM_TYPE_LABELS, FIRST_NAME, ExamType, cleanReply } from '@/lib/exams';
import { UNAVAILABLE, loadForUser, missing, notifyUser } from '@/lib/examsService';

export const dynamic = 'force-dynamic';

export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const auth = requireAuth(req);
    if ('response' in auth) return auth.response;
    const { sub, role } = await loadForUser(prisma, auth.user, params.id);
    if (!sub || !role) return NextResponse.json({ error: 'Documento não encontrado.' }, { status: 404 });
    if (role !== 'PRO') return NextResponse.json({ error: 'Só o profissional responde.' }, { status: 403 });
    const b = await req.json().catch(() => null);
    const c = cleanReply(b);
    if (!c.ok) return NextResponse.json({ error: c.error }, { status: 400 });
    const reply: any = await prisma.examReply.create({ data: { submissionId: sub.id, authorId: auth.user.id, body: c.body } });
    await prisma.examSubmission.updateMany({ where: { id: sub.id }, data: { status: 'ANSWERED', ...(sub.coachViewedAt ? {} : { coachViewedAt: new Date() }) } });
    const pro: any = await prisma.user.findUnique({ where: { id: auth.user.id }, select: { name: true } }).catch(() => null);
    await notifyUser(prisma, sub.userId, `🩺 ${FIRST_NAME(pro?.name) || 'Seu profissional'} respondeu seu documento`, `${EXAM_TYPE_LABELS[sub.type as ExamType] || 'Documento'}: toque para ler.`, { type: 'exam_reply', examId: sub.id });
    return NextResponse.json({ success: true, reply: { id: reply.id, body: reply.body, createdAt: reply.createdAt } });
  } catch (e: any) {
    if (missing(e)) return NextResponse.json(UNAVAILABLE, { status: 503 });
    console.error('[POST /api/exams/:id/reply]', e);
    return NextResponse.json({ error: 'Erro ao enviar a resposta.' }, { status: 500 });
  }
}
