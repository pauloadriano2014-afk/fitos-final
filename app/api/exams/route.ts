// app/api/exams/route.ts
// 🩺 (25 out 2026) EXAMES DO ALUNO.
//   POST (multipart: type, examDate?, note?, to? = COACH|NUTRI|BOTH, userId?, file x N) -> o aluno envia 1 PDF ou até 8 fotos ao(s) profissional(is) dele.
//   GET  ?userId=&limit= -> lista leve. Aluno: os dele. Profissional: os do aluno informado que FORAM ENVIADOS a ele (master sem vínculo não vê).
import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuth } from '@/lib/auth';
import { MAX_PER_DAY, availableRecipients, cleanSubmissionInput, examRole, pickRecipients, sniffMime, summarizeSubmission, validateFiles, actsAsExamStudent, FIRST_NAME, EXAM_TYPE_LABELS } from '@/lib/exams';
import { examKey, getExamStore, purgeExams } from '@/lib/examsStore';
import { UNAVAILABLE, loadStudent, missing, notifyUser, replyCounts } from '@/lib/examsService';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function POST(req: Request) {
  try {
    const auth = requireAuth(req);
    if ('response' in auth) return auth.response;
    const store = getExamStore();
    if (!store) return NextResponse.json({ error: 'O envio de exames ainda não está configurado no servidor.', unavailable: true }, { status: 503 });
    const form = await req.formData().catch(() => null);
    if (!form) return NextResponse.json({ error: 'Envio inválido.' }, { status: 400 });

    const studentId = String(form.get('userId') || auth.user.id);
    const student: any = await loadStudent(prisma, studentId);
    if (!student || student.role !== 'USER') return NextResponse.json({ error: 'Aluno não encontrado.' }, { status: 404 });
    if (!actsAsExamStudent(auth.user, student)) return NextResponse.json({ error: 'Acesso negado.' }, { status: 403 });

    const input = cleanSubmissionInput({ type: form.get('type'), examDate: form.get('examDate'), note: form.get('note'), to: form.get('to') });
    if (!input.ok) return NextResponse.json({ error: input.error }, { status: 400 });

    const avail = await availableRecipients(prisma, student);
    const who = pickRecipients(avail, input.value.to);
    if (!who.coachId && !who.nutritionistId) {
      return NextResponse.json({ error: avail.length ? 'Escolha para quem enviar.' : 'O envio de exames ainda não está disponível com o seu profissional.' }, { status: 403 });
    }
    const dayAgo = new Date(Date.now() - 86400000);
    if ((await prisma.examSubmission.count({ where: { userId: studentId, createdAt: { gte: dayAgo } } })) >= MAX_PER_DAY) return NextResponse.json({ error: 'Você já enviou muitos documentos hoje. Tente de novo amanhã.' }, { status: 429 });

    const raw = form.getAll('file').filter((f: any) => f && typeof f === 'object' && typeof f.arrayBuffer === 'function') as any[];
    const bufs: { buf: Buffer; mime: string | null }[] = [];
    for (const f of raw.slice(0, 20)) { const buf = Buffer.from(await f.arrayBuffer()); bufs.push({ buf, mime: sniffMime(buf) }); }
    const check = validateFiles(bufs.map((b) => ({ mime: b.mime, size: b.buf.length })));
    if (!check.ok) return NextResponse.json({ error: check.error }, { status: 400 });

    const sub: any = await prisma.examSubmission.create({ data: { userId: studentId, coachId: who.coachId, nutritionistId: who.nutritionistId, type: input.value.type, examDate: input.value.examDate, note: input.value.note, status: 'NEW' } });
    try {
      let page = 1;
      for (const b of bufs) {
        const key = examKey(studentId, sub.id, b.mime as string);
        await store.put(key, b.buf, b.mime as string);
        await prisma.examFile.create({ data: { submissionId: sub.id, key, mime: b.mime as string, size: b.buf.length, pageNo: page++ } });
      }
    } catch (e) {
      console.error('[POST /api/exams] falha ao guardar:', (e as any)?.message || e);
      await purgeExams(prisma, studentId, { onlySubmissionId: sub.id, store }).catch(() => {});
      return NextResponse.json({ error: 'Não foi possível guardar o arquivo agora. Tente de novo em instantes.' }, { status: 502 });
    }

    const title = `🩺 ${FIRST_NAME(student.name) || 'Aluno'} enviou um documento`;
    const body = `${EXAM_TYPE_LABELS[input.value.type]}${input.value.note ? ` — “${input.value.note.slice(0, 60)}”` : ''}`;
    for (const id of [who.coachId, who.nutritionistId].filter(Boolean) as string[]) await notifyUser(prisma, id, title, body, { type: 'exam', examId: sub.id, studentId });
    const files: any[] = await prisma.examFile.findMany({ where: { submissionId: sub.id } });
    return NextResponse.json({ success: true, exam: summarizeSubmission(sub, files) });
  } catch (e: any) {
    if (missing(e)) return NextResponse.json(UNAVAILABLE, { status: 503 });
    console.error('[POST /api/exams]', e);
    return NextResponse.json({ error: 'Erro ao enviar o documento.' }, { status: 500 });
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
    const limit = Math.min(100, Math.max(1, Number(sp.get('limit')) || 50));
    const rows: any[] = await prisma.examSubmission.findMany({ where: { userId }, orderBy: { createdAt: 'desc' }, take: limit });
    const visible = rows.filter((r) => examRole(auth.user, r, student) !== null);
    const isStudent = actsAsExamStudent(auth.user, student);
    if (!isStudent && !visible.length && auth.user.id !== userId) {
      // sem nenhum envio visível: só confirma se quem chama é mesmo profissional do aluno; senão nega (não revela que existe)
      const linked = auth.user.id === student.coachId || auth.user.id === student.nutritionistId;
      if (!linked) return NextResponse.json({ error: 'Acesso negado.' }, { status: 403 });
    }
    const ids = visible.map((r) => r.id);
    const counts = await replyCounts(prisma, ids);
    const files: any[] = ids.length ? await prisma.examFile.findMany({ where: { submissionId: { in: ids } }, select: { submissionId: true, mime: true } }) : [];
    return NextResponse.json({ exams: visible.map((r) => summarizeSubmission(r, files.filter((f) => f.submissionId === r.id), counts.get(r.id))) });
  } catch (e: any) {
    if (missing(e)) return NextResponse.json({ exams: [], unavailable: true });
    console.error('[GET /api/exams]', e);
    return NextResponse.json({ error: 'Erro ao carregar os exames.' }, { status: 500 });
  }
}
