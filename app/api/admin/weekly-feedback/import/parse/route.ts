// app/api/admin/weekly-feedback/import/parse/route.ts
// POST { studentId, text } -> o coach colou a resposta que o aluno mandou no WhatsApp; a IA (Haiku) preenche o formulário da semana dele.
// NÃO grava nada: devolve { questions, answers, status } pro coach conferir/completar no app (salvar é em ../route.ts).
import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuth, canAccessStudent } from '@/lib/auth';
import { checkRateLimit } from '@/lib/rateLimit';
import { ensureQuestionSet } from '@/lib/weeklyQuestionSet';
import { feedbackAiOptions } from '@/lib/aiAccess';
import { checkPendingStudent } from '@/lib/weeklyImport';
import { parseWhatsAppReply, cleanSource, requiredMissing, MAX_SOURCE } from '@/lib/weeklyReplyParse';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const studentId = body.studentId as string | undefined;
    if (!studentId) return NextResponse.json({ error: 'Aluno não informado.' }, { status: 400 });
    if (typeof body.text !== 'string' || body.text.length > MAX_SOURCE * 2) return NextResponse.json({ error: 'Mensagem inválida ou grande demais.' }, { status: 400 });
    const text = cleanSource(body.text);
    if (text.length < 3) return NextResponse.json({ error: 'Cole a mensagem que o aluno mandou.' }, { status: 400 });

    const auth = requireAuth(req);
    if ('response' in auth) return auth.response;
    const student: any = await prisma.user.findUnique({ where: { id: studentId }, select: { id: true, name: true, coachId: true, createdAt: true, active: true, accountStatus: true, role: true, dietModule: true } });
    if (!student) return NextResponse.json({ error: 'Aluno não encontrado.' }, { status: 404 });
    if (auth.user.id === studentId || !canAccessStudent(auth.user, studentId, student.coachId)) return NextResponse.json({ error: 'Acesso negado.' }, { status: 403 });

    const rl = checkRateLimit(`weekly-import:${auth.user.id}`, { max: 40, windowMs: 60 * 60 * 1000 });
    if (!rl.allowed) return NextResponse.json({ error: 'Muitas interpretações seguidas. Tente de novo daqui a pouco.' }, { status: 429 });

    const now = new Date();
    const pending = await checkPendingStudent(prisma, student, now);
    if (!pending.ok) return NextResponse.json({ error: pending.error }, { status: pending.status });

    const set = await ensureQuestionSet(prisma, student, { weekStart: pending.weekStart, now, ai: await feedbackAiOptions(prisma, student.coachId, { timeoutMs: 8000, maxRetries: 0 }) });
    const parsed = await parseWhatsAppReply({ questions: set.questions, text });

    if (parsed.ai) {
      (prisma as any).aiLog?.create?.({ data: { userId: studentId, question: `weekly-whatsapp-parse:${pending.weekStart}`, answer: JSON.stringify({ status: parsed.status, usage: parsed.usage }).slice(0, 4000) } })?.catch?.(() => {});
    }
    return NextResponse.json({
      success: true, weekStart: pending.weekStart, weekLabel: pending.weekLabel,
      questions: set.questions, intro: set.intro,
      answers: parsed.answers, status: parsed.status, requiredMissing: requiredMissing(set.questions, parsed), ai: parsed.ai,
    });
  } catch (error) {
    console.error('Erro POST weekly-feedback/import/parse:', error);
    return NextResponse.json({ error: 'Não foi possível interpretar a mensagem agora.' }, { status: 500 });
  }
}
