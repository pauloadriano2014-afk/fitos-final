// app/api/coach-notes/route.ts
// 🎙️ DIÁRIO DO COACH.
//   POST { studentId?, kind, tag?, body, rawText?, source?, dueDate? } -> salva a anotação (TAREFA nasce aberta e entra na central HOJE na data)
//   GET  ?studentId=&status=&q=&limit= -> as anotações do coach (mais novas primeiro); `status` = OPEN | DONE | INFO
import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { cleanNoteInput, statusFor, todayKeyBrt, STATUSES } from '@/lib/coachNotes';
import { missing, requireNotesCoach, studentBelongs, UNAVAILABLE } from '@/lib/coachNotesStore';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  try {
    const auth = await requireNotesCoach(req);
    if ('response' in auth) return auth.response;
    const b = await req.json().catch(() => null);
    if (!b) return NextResponse.json({ error: 'Corpo inválido.' }, { status: 400 });
    const c = cleanNoteInput(b, todayKeyBrt());
    if (!c.ok) return NextResponse.json({ error: c.error }, { status: 400 });
    let studentName: string | null = null;
    if (c.value.studentId) {
      const st = await studentBelongs(prisma, auth.user.id, c.value.studentId);
      if (!st) return NextResponse.json({ error: 'Aluno não encontrado.' }, { status: 404 });
      studentName = st.name || null;
    } else if (c.value.kind === 'TAREFA') {
      // tarefa sem aluno vale (ex.: "lembrar de comprar fita métrica"), mas a nota solta precisa de texto próprio: já garantido pelo body
    }
    const note = await prisma.coachNote.create({
      data: { coachId: auth.user.id, studentId: c.value.studentId, studentName, kind: c.value.kind, tag: c.value.tag, body: c.value.body, rawText: c.value.rawText, source: c.value.source, dueDate: c.value.dueDate, status: statusFor(c.value.kind) },
    });
    return NextResponse.json({ success: true, note });
  } catch (e: any) {
    if (missing(e)) return NextResponse.json(UNAVAILABLE, { status: 503 });
    console.error('[POST /api/coach-notes]', e);
    return NextResponse.json({ error: 'Erro ao salvar a anotação.' }, { status: 500 });
  }
}

export async function GET(req: Request) {
  try {
    const auth = await requireNotesCoach(req);
    if ('response' in auth) return auth.response;
    const sp = new URL(req.url).searchParams;
    const where: any = { coachId: auth.user.id };
    const studentId = sp.get('studentId'); if (studentId) where.studentId = studentId;
    const status = sp.get('status'); if (status && (STATUSES as readonly string[]).includes(status)) where.status = status;
    const limit = Math.min(Math.max(parseInt(sp.get('limit') || '60', 10) || 60, 1), 200);
    let notes: any[] = await prisma.coachNote.findMany({ where, orderBy: { createdAt: 'desc' }, take: limit });
    const q = (sp.get('q') || '').trim().toLowerCase();
    if (q) notes = notes.filter((n) => [n.body, n.studentName, n.rawText].some((x) => String(x || '').toLowerCase().includes(q)));
    return NextResponse.json({ notes });
  } catch (e: any) {
    if (missing(e)) return NextResponse.json(UNAVAILABLE, { status: 503 });
    console.error('[GET /api/coach-notes]', e);
    return NextResponse.json({ error: 'Erro ao carregar as anotações.' }, { status: 500 });
  }
}
