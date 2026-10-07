// app/api/monthly-report/route.ts
// 📅 (7 out 2026) RELATÓRIO MENSAL do aluno (ver lib/monthlyReport.ts). GET /api/monthly-report?userId=<aluno>&days=30
// Quem pode ver: o próprio aluno, o coach dele ou o time master (mesma regra do histórico). Calculado na hora (o relatório em si não grava nada).
// (8 out 2026) O ALUNO só vê o relatório DELE depois que o coach libera (`User.monthlyReportOn`); o coach e o master veem sempre.
const NOT_RELEASED_MESSAGE = 'O relatório do mês ainda não foi liberado pelo seu coach.';
import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuth, canAccessStudent, isMasterId } from '@/lib/auth';
import { cleanDays, loadMonthlyReport } from '@/lib/monthlyReport';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const userId = searchParams.get('userId');
    if (!userId) return NextResponse.json({ error: 'userId obrigatório' }, { status: 400 });

    const auth = requireAuth(req);
    if ('response' in auth) return auth.response;

    const student = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, name: true, coachId: true, dietModule: true, monthlyReportOn: true } });
    if (!student) return NextResponse.json({ error: 'Aluno não encontrado' }, { status: 404 });
    if (!canAccessStudent(auth.user, userId, student.coachId)) return NextResponse.json({ error: 'Acesso negado.' }, { status: 403 });
    if (auth.user.id === userId && !isMasterId(auth.user.id) && student.monthlyReportOn !== true) return NextResponse.json({ error: NOT_RELEASED_MESSAGE, code: 'NOT_RELEASED' }, { status: 403 });

    const report = await loadMonthlyReport(prisma, student, { days: cleanDays(searchParams.get('days')) });
    return NextResponse.json(report);
  } catch (e) {
    console.error('Erro no relatório mensal:', e);
    return NextResponse.json({ error: 'Não foi possível gerar o relatório agora.' }, { status: 500 });
  }
}
