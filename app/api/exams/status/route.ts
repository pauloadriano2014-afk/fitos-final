// app/api/exams/status/route.ts
// 🩺 (25 out 2026) GET -> o que o app do ALUNO precisa para mostrar (ou esconder) "Meus exames":
//   { enabled, recipients: [{ id, name, kind: COACH|NUTRI }], types: [...], limits: {...}, unreadReplies }
//   `enabled` = há ao menos um profissional do aluno com o recurso `exames` ligado E o armazenamento privado está configurado.
import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuth } from '@/lib/auth';
import { EXAM_TYPES, EXAM_TYPE_LABELS, LINK_TTL_SEC, MAX_FILES, MAX_IMAGE_BYTES, MAX_NOTE, MAX_PDF_BYTES, actsAsExamStudent, availableRecipients } from '@/lib/exams';
import { examsStoreConfigured } from '@/lib/examsStore';
import { loadStudent, missing } from '@/lib/examsService';

export const dynamic = 'force-dynamic';
const OFF = { enabled: false, recipients: [], types: [], unreadReplies: 0 };

export async function GET(req: Request) {
  try {
    const auth = requireAuth(req);
    if ('response' in auth) return auth.response;
    const userId = new URL(req.url).searchParams.get('userId') || auth.user.id;
    const student: any = await loadStudent(prisma, userId);
    if (!student || !actsAsExamStudent(auth.user, student)) return NextResponse.json(OFF);
    const recipients = await availableRecipients(prisma, student);
    let unreadReplies = 0;
    try {
      const mine: any[] = await prisma.examSubmission.findMany({ where: { userId }, select: { id: true } });
      if (mine.length) unreadReplies = await prisma.examReply.count({ where: { submissionId: { in: mine.map((m) => m.id) }, studentReadAt: null } });
    } catch (e) { if (!missing(e)) throw e; }
    return NextResponse.json({
      enabled: recipients.length > 0 && examsStoreConfigured(), recipients, unreadReplies,
      types: EXAM_TYPES.map((t) => ({ key: t, label: EXAM_TYPE_LABELS[t] })),
      limits: { maxFiles: MAX_FILES, maxImageMb: MAX_IMAGE_BYTES / 1048576, maxPdfMb: MAX_PDF_BYTES / 1048576, maxNote: MAX_NOTE, linkMinutes: LINK_TTL_SEC / 60 },
    });
  } catch (e: any) {
    if (missing(e)) return NextResponse.json(OFF);
    console.error('[GET /api/exams/status]', e);
    return NextResponse.json({ error: 'Erro ao carregar.' }, { status: 500 });
  }
}
