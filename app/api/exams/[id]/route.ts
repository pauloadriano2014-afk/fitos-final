// app/api/exams/[id]/route.ts
// 🩺 (25 out 2026) GET    -> o envio inteiro: arquivos (cada um com um LINK ASSINADO de 10 min), respostas. Profissional abrindo marca como lido; aluno abrindo marca as respostas como lidas.
//                  DELETE -> só o aluno apaga o envio dele (arquivos + respostas somem de vez).
// Quem não tem acesso recebe 404 (não revela que o envio existe).
import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuth } from '@/lib/auth';
import { LINK_TTL_SEC, signFileToken, summarizeSubmission } from '@/lib/exams';
import { purgeExams } from '@/lib/examsStore';
import { UNAVAILABLE, loadForUser, missing } from '@/lib/examsService';

export const dynamic = 'force-dynamic';
const NOT_FOUND = () => NextResponse.json({ error: 'Documento não encontrado.' }, { status: 404 });

export async function GET(req: Request, { params }: { params: { id: string } }) {
  try {
    const auth = requireAuth(req);
    if ('response' in auth) return auth.response;
    const { sub, student, role } = await loadForUser(prisma, auth.user, params.id);
    if (!sub || !role) return NOT_FOUND();
    const files: any[] = await prisma.examFile.findMany({ where: { submissionId: sub.id }, orderBy: { pageNo: 'asc' } });
    const replies: any[] = await prisma.examReply.findMany({ where: { submissionId: sub.id }, orderBy: { createdAt: 'asc' } });
    const authors: any[] = replies.length ? await prisma.user.findMany({ where: { id: { in: Array.from(new Set(replies.map((r) => r.authorId))) } }, select: { id: true, name: true } }) : [];
    const nameOf = (id: string) => authors.find((a) => a.id === id)?.name || null;
    const now = new Date();
    let row = sub;
    if (role === 'PRO' && !sub.coachViewedAt) {
      await prisma.examSubmission.updateMany({ where: { id: sub.id, coachViewedAt: null }, data: { coachViewedAt: now, ...(sub.status === 'NEW' ? { status: 'READ' } : {}) } });
      row = { ...sub, coachViewedAt: now, status: sub.status === 'NEW' ? 'READ' : sub.status };
    }
    const unread = replies.filter((r) => !r.studentReadAt).length;
    if (role === 'STUDENT' && unread) await prisma.examReply.updateMany({ where: { submissionId: sub.id, studentReadAt: null }, data: { studentReadAt: now } });
    return NextResponse.json({
      role, student: { id: student.id, name: student.name || null },
      exam: summarizeSubmission(row, files, { total: replies.length, unread }),
      files: files.map((f) => ({ id: f.id, mime: f.mime, size: f.size, pageNo: f.pageNo, url: `/api/exams/file/${f.id}?t=${encodeURIComponent(signFileToken(f.id, auth.user.id))}`, expiresInSec: LINK_TTL_SEC })),
      replies: replies.map((r) => ({ id: r.id, body: r.body, createdAt: r.createdAt, authorName: nameOf(r.authorId), isNew: role === 'STUDENT' ? !r.studentReadAt : false })),
    });
  } catch (e: any) {
    if (missing(e)) return NextResponse.json(UNAVAILABLE, { status: 503 });
    console.error('[GET /api/exams/:id]', e);
    return NextResponse.json({ error: 'Erro ao abrir o documento.' }, { status: 500 });
  }
}

export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  try {
    const auth = requireAuth(req);
    if ('response' in auth) return auth.response;
    const { sub, role } = await loadForUser(prisma, auth.user, params.id);
    if (!sub || !role) return NOT_FOUND();
    if (role !== 'STUDENT') return NextResponse.json({ error: 'Só quem enviou pode apagar o documento.' }, { status: 403 });
    await purgeExams(prisma, sub.userId, { onlySubmissionId: sub.id });
    return NextResponse.json({ success: true });
  } catch (e: any) {
    if (missing(e)) return NextResponse.json(UNAVAILABLE, { status: 503 });
    console.error('[DELETE /api/exams/:id]', e);
    return NextResponse.json({ error: 'Erro ao apagar o documento.' }, { status: 500 });
  }
}
