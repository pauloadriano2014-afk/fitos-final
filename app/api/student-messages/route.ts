// app/api/student-messages/route.ts
// 💬 (9 out 2026) Mensagens do coach para um aluno.
//   POST { studentId, kind, title, body, changes?, workoutId?, day?, sourceTaskKey?, followUp? }  -> coach (ou master) manda; o aluno recebe push.
//   GET  ?userId=&unread=1&kind=&workoutId=&day=&limit=  -> o aluno lê as dele (default: as dos últimos 30 dias); o coach lê as do aluno.
import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuth, canAccessStudent } from '@/lib/auth';
import { isCoachRole } from '@/lib/agendaAuth';
import { cleanMessage, createStudentMessage, MESSAGE_KINDS } from '@/lib/studentMessages';
import { resolveExerciseNote } from '@/lib/noteSync';

export const dynamic = 'force-dynamic';
const DAY = 86400000;

const missing = (e: any) => /does not exist|P2021|P2022/i.test(String(e?.code || '') + String(e?.message || ''));
const UNAVAILABLE = { error: 'As mensagens ao aluno ainda não estão habilitadas no servidor (falta criar as tabelas novas: npx prisma db push).', unavailable: true };

export async function POST(req: Request) {
  try {
    const auth = requireAuth(req);
    if ('response' in auth) return auth.response;
    const body = await req.json().catch(() => null);
    if (!body) return NextResponse.json({ error: 'Corpo inválido.' }, { status: 400 });
    const studentId = String(body.studentId || '');
    if (!studentId) return NextResponse.json({ error: 'studentId obrigatório.' }, { status: 400 });
    if (!isCoachRole(auth.user) || auth.user.id === studentId) return NextResponse.json({ error: 'Acesso negado.' }, { status: 403 });
    const student: any = await prisma.user.findUnique({ where: { id: studentId }, select: { id: true, role: true, coachId: true } });
    if (!student || student.role !== 'USER') return NextResponse.json({ error: 'Aluno não encontrado.' }, { status: 404 });
    if (!canAccessStudent(auth.user, studentId, student.coachId)) return NextResponse.json({ error: 'Acesso negado.' }, { status: 403 });
    const clean = cleanMessage(body);
    if (!clean.ok) return NextResponse.json({ error: clean.error }, { status: 400 });
    // 🔗 (9 out 2026) `resolveNote` { workoutHistoryId, exerciseHistoryId }: a mensagem é a RESPOSTA ao comentário do aluno naquele exercício (ex.: "Troquei X por Y"). Valida ANTES de enviar.
    let note: { workoutHistory: any; exerciseName: string } | null = null;
    if (body.resolveNote && typeof body.resolveNote === 'object') {
      const wh: any = await prisma.workoutHistory.findFirst({ where: { id: String(body.resolveNote.workoutHistoryId || ''), userId: studentId }, select: { id: true, userId: true, date: true } });
      const eh: any = wh ? await prisma.exerciseHistory.findFirst({ where: { id: String(body.resolveNote.exerciseHistoryId || ''), workoutHistoryId: wh.id }, select: { exerciseName: true } }) : null;
      if (!wh || !eh) return NextResponse.json({ error: 'Comentário do aluno não encontrado.' }, { status: 404 });
      note = { workoutHistory: wh, exerciseName: eh.exerciseName };
    }
    const { row, pushed } = await createStudentMessage(auth.user.id, studentId, clean.value);
    if (note) { try { await resolveExerciseNote({ workoutHistory: note.workoutHistory, exerciseName: note.exerciseName, reply: clean.value.body }); } catch (e) { console.error('[student-messages] resolver comentário:', (e as any)?.message || e); } }
    return NextResponse.json({ success: true, message: row, pushed, resolvedNote: !!note });
  } catch (e: any) {
    if (missing(e)) return NextResponse.json(UNAVAILABLE, { status: 503 });
    console.error('[POST /api/student-messages]', e);
    return NextResponse.json({ error: 'Erro ao enviar a mensagem.' }, { status: 500 });
  }
}

export async function GET(req: Request) {
  try {
    const auth = requireAuth(req);
    if ('response' in auth) return auth.response;
    const sp = new URL(req.url).searchParams;
    const userId = sp.get('userId') || auth.user.id;
    if (userId !== auth.user.id) {
      const target: any = await prisma.user.findUnique({ where: { id: userId }, select: { coachId: true } });
      if (!target || !canAccessStudent(auth.user, userId, target.coachId)) return NextResponse.json({ error: 'Acesso negado.' }, { status: 403 });
    }
    const where: any = { userId, createdAt: { gte: new Date(Date.now() - 30 * DAY) } };
    if (sp.get('unread') === '1') where.readAt = null;
    const kind = sp.get('kind'); if (kind && (MESSAGE_KINDS as readonly string[]).includes(kind)) where.kind = kind;
    const workoutId = sp.get('workoutId'); if (workoutId) where.workoutId = workoutId.slice(0, 80);
    const day = sp.get('day'); if (day) where.day = day.slice(0, 40);
    const limit = Math.min(Math.max(parseInt(sp.get('limit') || '20', 10) || 20, 1), 50);
    const messages = await prisma.studentCoachMessage.findMany({ where, orderBy: { createdAt: 'desc' }, take: limit });
    return NextResponse.json({ messages });
  } catch (e: any) {
    if (missing(e)) return NextResponse.json({ messages: [], unavailable: true });   // aluno nunca vê erro: sem tabela, simplesmente não há mensagem
    console.error('[GET /api/student-messages]', e);
    return NextResponse.json({ error: 'Erro ao carregar as mensagens.' }, { status: 500 });
  }
}
