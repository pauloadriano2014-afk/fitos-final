// app/api/admin/weekly-feedback/import/route.ts
// POST { studentId, weekStart, answers, sourceText } -> o coach conferiu a transcrição da resposta do WhatsApp e salva como a resposta do aluno
// (channel WHATSAPP, com a mensagem original guardada). Valida contra as MESMAS perguntas que o aluno recebeu (WeeklyQuestionSet).
// O coach acabou de ler a resposta, então ela já entra como "vista" (não fica pendente no FEED); ele ainda pode responder o aluno pelo painel.
import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuth, canAccessStudent } from '@/lib/auth';
import { validateAnswers, deriveSummary, evaluatedWeekStart } from '@/lib/weeklyFeedback';
import { objectiveSignals } from '@/lib/weeklyFacts';
import { ensureQuestionSet } from '@/lib/weeklyQuestionSet';
import { checkPendingStudent } from '@/lib/weeklyImport';
import { cleanSource } from '@/lib/weeklyReplyParse';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const { studentId, weekStart, answers } = body as { studentId?: string; weekStart?: string; answers?: unknown };
    if (!studentId || !weekStart) return NextResponse.json({ error: 'Dados incompletos.' }, { status: 400 });

    const auth = requireAuth(req);
    if ('response' in auth) return auth.response;
    const student: any = await prisma.user.findUnique({ where: { id: studentId }, select: { id: true, name: true, coachId: true, createdAt: true, active: true, accountStatus: true, role: true, dietModule: true } });
    if (!student) return NextResponse.json({ error: 'Aluno não encontrado.' }, { status: 404 });
    if (auth.user.id === studentId || !canAccessStudent(auth.user, studentId, student.coachId)) return NextResponse.json({ error: 'Acesso negado.' }, { status: 403 });

    const now = new Date();
    if (weekStart !== evaluatedWeekStart(now)) return NextResponse.json({ error: 'Essa semana não está mais aberta para feedback.' }, { status: 400 });
    const pending = await checkPendingStudent(prisma, student, now);
    if (!pending.ok) return NextResponse.json({ error: pending.error }, { status: pending.status });

    const set = await ensureQuestionSet(prisma, student, { weekStart, now, ai: { timeoutMs: 8000, maxRetries: 0 } });
    const v = validateAnswers(set.questions, answers);
    if (!v.ok) return NextResponse.json({ error: v.error, field: v.field }, { status: 400 });
    const { score, flags } = deriveSummary(v.clean, objectiveSignals(set.facts));
    const sourceText = cleanSource(body.sourceText) || null;

    try {
      const row = await prisma.weeklyFeedback.create({
        data: {
          userId: studentId, coachId: student.coachId || null, weekStart,
          questions: set.questions as any, answers: v.clean as any, score, flags, ...(set.facts ? { facts: set.facts as any } : {}),
          channel: 'WHATSAPP', sourceText, coachSeenAt: now,
        },
        select: { id: true },
      });
      return NextResponse.json({ success: true, id: row.id });
    } catch (e: any) {
      if (e?.code === 'P2002') return NextResponse.json({ error: 'Esse aluno acabou de responder pelo app.' }, { status: 409 });   // o aluno respondeu enquanto o coach conferia
      throw e;
    }
  } catch (error) {
    console.error('Erro POST weekly-feedback/import:', error);
    return NextResponse.json({ error: 'Não foi possível salvar agora.' }, { status: 500 });
  }
}
