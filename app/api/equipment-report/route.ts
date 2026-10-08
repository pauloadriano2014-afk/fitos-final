// app/api/equipment-report/route.ts
// 🛠️ (9 out 2026) O aluno avisa que NÃO tem esse aparelho/exercício na academia.
//   POST { userId?, exerciseId, exerciseName?, workoutId?, workoutExerciseId?, day?, note? }  -> registra (ou soma ao aviso que já existe), avisa o coach e devolve
//        substitutos para o aluno treinar hoje sem esperar.
//   GET  ?userId=&status=active|all  -> os avisos do aluno (o app do coach usa para alertar ao montar/importar treino).
import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuth, canAccessStudent } from '@/lib/auth';
import { sendPushToUser } from '@/app/utils/sendNotification';
import { ACTIVE_STATUS, suggestSubstitutes } from '@/lib/equipment';

export const dynamic = 'force-dynamic';
const missing = (e: any) => /does not exist|P2021|P2022/i.test(String(e?.code || '') + String(e?.message || ''));
const cut = (v: any, n: number) => String(v ?? '').trim().slice(0, n);

export async function POST(req: Request) {
  try {
    const auth = requireAuth(req);
    if ('response' in auth) return auth.response;
    const b = await req.json().catch(() => null);
    if (!b) return NextResponse.json({ error: 'Corpo inválido.' }, { status: 400 });
    const userId = cut(b.userId, 80) || auth.user.id;
    const exerciseId = cut(b.exerciseId, 80);
    if (!exerciseId) return NextResponse.json({ error: 'Exercício não informado.' }, { status: 400 });
    const student: any = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, name: true, coachId: true, role: true } });
    if (!student || student.role !== 'USER') return NextResponse.json({ error: 'Aluno não encontrado.' }, { status: 404 });
    if (!canAccessStudent(auth.user, userId, student.coachId)) return NextResponse.json({ error: 'Acesso negado.' }, { status: 403 });
    const ex: any = await prisma.exercise.findUnique({ where: { id: exerciseId }, select: { id: true, name: true } });
    if (!ex) return NextResponse.json({ error: 'Exercício não encontrado.' }, { status: 404 });

    const note = cut(b.note, 300) || null;
    const fields = { workoutId: cut(b.workoutId, 80) || null, workoutExerciseId: cut(b.workoutExerciseId, 80) || null, day: cut(b.day, 40) || null };
    const existing: any = await prisma.equipmentReport.findFirst({ where: { userId, exerciseId, status: { in: ACTIVE_STATUS } }, orderBy: { lastReportedAt: 'desc' } });
    let report: any, reopened = false;
    if (existing) {
      reopened = existing.status !== 'OPEN';   // o coach tinha tratado e o aluno avisou de novo: volta para a lista
      report = await prisma.equipmentReport.update({ where: { id: existing.id }, data: { count: (existing.count || 1) + 1, lastReportedAt: new Date(), status: 'OPEN', resolvedAt: null, ...(note ? { note } : {}), ...(fields.workoutId ? fields : {}) } });
    } else {
      report = await prisma.equipmentReport.create({ data: { userId, coachId: student.coachId || null, exerciseId, exerciseName: ex.name, note, ...fields } });
    }

    if (student.coachId && (!existing || reopened)) {
      try {
        const coach: any = await prisma.user.findUnique({ where: { id: student.coachId }, select: { id: true, pushToken: true } });
        if (coach) await sendPushToUser(coach, `🛠️ ${student.name || 'Aluno'} não tem: ${ex.name}`, 'Veja a pendência e troque o exercício na ficha.', { type: 'equipment_report', studentId: userId, reportId: report.id });
      } catch (e) { console.error('[equipment-report] push:', (e as any)?.message || e); }
    }
    const substitutes = await suggestSubstitutes({ exerciseId, workoutExerciseId: fields.workoutExerciseId, userId, coachId: student.coachId });
    return NextResponse.json({ success: true, report, substitutes });
  } catch (e: any) {
    if (missing(e)) return NextResponse.json({ error: 'O aviso de aparelho ainda não está habilitado no servidor.', unavailable: true }, { status: 503 });
    console.error('[POST /api/equipment-report]', e);
    return NextResponse.json({ error: 'Erro ao registrar o aviso.' }, { status: 500 });
  }
}

export async function GET(req: Request) {
  try {
    const auth = requireAuth(req);
    if ('response' in auth) return auth.response;
    const sp = new URL(req.url).searchParams;
    const userId = sp.get('userId') || auth.user.id;
    const target: any = await prisma.user.findUnique({ where: { id: userId }, select: { coachId: true } });
    if (!target) return NextResponse.json({ error: 'Aluno não encontrado.' }, { status: 404 });
    if (!canAccessStudent(auth.user, userId, target.coachId)) return NextResponse.json({ error: 'Acesso negado.' }, { status: 403 });
    const all = sp.get('status') === 'all';
    const reports = await prisma.equipmentReport.findMany({ where: { userId, ...(all ? {} : { status: { in: ACTIVE_STATUS } }) }, orderBy: { lastReportedAt: 'desc' }, take: 200 });
    return NextResponse.json({ reports });
  } catch (e: any) {
    if (missing(e)) return NextResponse.json({ reports: [], unavailable: true });
    console.error('[GET /api/equipment-report]', e);
    return NextResponse.json({ error: 'Erro ao carregar os avisos.' }, { status: 500 });
  }
}
