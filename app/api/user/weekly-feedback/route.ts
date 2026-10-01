// app/api/user/weekly-feedback/route.ts
// 💜 Feedback da semana, lado do ALUNO (ver lib/weeklyFeedback.ts).
//   GET  ?userId=            -> { available, due, answered, weekStart, weekLabel, questions? }   (o card da Início decide se aparece)
//   POST { userId, weekStart, answers } -> grava a resposta (uma por semana; refazer enquanto o coach não viu) e avisa o coach por push
import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuth, canAccessStudent } from '@/lib/auth';
import { sendPushToUser } from '@/app/utils/sendNotification';
import {
  buildQuestions, validateAnswers, deriveSummary, evaluatedWeekStart, weekLabel, isDueStudent, isMissingTable, shortName, FLAG_LABELS, type Flag,
} from '@/lib/weeklyFeedback';

export const dynamic = 'force-dynamic';

const studentSelect = { id: true, name: true, coachId: true, createdAt: true, active: true, accountStatus: true, role: true, dietModule: true } as const;

async function questionsFor(student: any) {
  let anamnese: any = null;
  try {
    anamnese = await prisma.anamnese.findFirst({ where: { userId: student.id }, orderBy: { createdAt: 'desc' }, select: { limitacoes: true, sleepQuality: true } });
  } catch { /* sem anamnese: só as perguntas de sempre */ }
  return buildQuestions({ limitations: anamnese?.limitacoes, sleepQuality: anamnese?.sleepQuality, dietModule: student.dietModule });
}

export async function GET(req: Request) {
  try {
    const userId = new URL(req.url).searchParams.get('userId');
    if (!userId) return NextResponse.json({ available: false });
    const auth = requireAuth(req);
    if ('response' in auth) return auth.response;

    const student: any = await prisma.user.findUnique({ where: { id: userId }, select: studentSelect });
    if (!canAccessStudent(auth.user, userId, student?.coachId)) return NextResponse.json({ error: 'Acesso negado.' }, { status: 403 });
    if (!student) return NextResponse.json({ available: false });

    const now = new Date();
    const weekStart = evaluatedWeekStart(now);
    const base = { available: true, weekStart, weekLabel: weekLabel(weekStart) };

    let existing: any = null;
    try {
      existing = await prisma.weeklyFeedback.findUnique({ where: { userId_weekStart: { userId, weekStart } }, select: { id: true, createdAt: true, coachReply: true, coachReplyAt: true } });
    } catch (e) {
      if (isMissingTable(e)) return NextResponse.json({ available: false });   // deploy antes do `prisma db push`: o card simplesmente não aparece
      throw e;
    }
    if (existing) return NextResponse.json({ ...base, due: false, answered: true, answeredAt: existing.createdAt });
    if (!isDueStudent(student, now)) return NextResponse.json({ ...base, due: false, answered: false });
    return NextResponse.json({ ...base, due: true, answered: false, questions: await questionsFor(student) });
  } catch (error) {
    console.error('Erro GET weekly-feedback:', error);
    return NextResponse.json({ available: false });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const { userId, weekStart, answers } = body as { userId?: string; weekStart?: string; answers?: unknown };
    if (!userId || !weekStart) return NextResponse.json({ error: 'Dados incompletos.' }, { status: 400 });

    const auth = requireAuth(req);
    if ('response' in auth) return auth.response;
    const student: any = await prisma.user.findUnique({ where: { id: userId }, select: studentSelect });
    if (!student) return NextResponse.json({ error: 'Aluno não encontrado.' }, { status: 404 });
    if (!canAccessStudent(auth.user, userId, student.coachId)) return NextResponse.json({ error: 'Acesso negado.' }, { status: 403 });

    const now = new Date();
    if (weekStart !== evaluatedWeekStart(now)) return NextResponse.json({ error: 'Essa semana não está mais aberta para feedback.' }, { status: 400 });
    if (!isDueStudent(student, now)) return NextResponse.json({ error: 'Não há feedback para você nesta semana.' }, { status: 400 });

    const questions = await questionsFor(student);
    const v = validateAnswers(questions, answers);
    if (!v.ok) return NextResponse.json({ error: v.error, field: v.field }, { status: 400 });
    const { score, flags } = deriveSummary(v.clean);

    let existing: any = null;
    try {
      existing = await prisma.weeklyFeedback.findUnique({ where: { userId_weekStart: { userId, weekStart } }, select: { id: true, coachSeenAt: true } });
    } catch (e) {
      if (isMissingTable(e)) return NextResponse.json({ error: 'Recurso ainda não disponível.' }, { status: 503 });
      throw e;
    }
    if (existing?.coachSeenAt) return NextResponse.json({ error: 'Seu coach já viu esse feedback.' }, { status: 409 });

    const data = { questions: questions as any, answers: v.clean as any, score, flags };
    let row: any;
    let created = false;
    if (existing) {
      row = await prisma.weeklyFeedback.update({ where: { id: existing.id }, data });
    } else {
      try {
        row = await prisma.weeklyFeedback.create({ data: { userId, coachId: student.coachId || null, weekStart, ...data } });
        created = true;
      } catch (e: any) {
        if (e?.code !== 'P2002') throw e;   // duas respostas ao mesmo tempo: a segunda vira atualização
        const again: any = await prisma.weeklyFeedback.findUnique({ where: { userId_weekStart: { userId, weekStart } }, select: { id: true } });
        row = await prisma.weeklyFeedback.update({ where: { id: again.id }, data });
      }
    }

    // 🔔 avisa o coach (só na primeira resposta; refazer não manda de novo)
    if (created && student.coachId) {
      const coach = await prisma.user.findUnique({ where: { id: student.coachId }, select: { id: true, pushToken: true } }).catch(() => null);
      if (coach) {
        const alerts = flags.filter((f) => f === 'PAIN' || f === 'LOW_ADHERENCE').map((f) => FLAG_LABELS[f as Flag]);
        const body = `${score !== null ? `Dedicação ${score}/10` : 'Respondeu'}${alerts.length ? ` · ⚠ ${alerts.join(', ').toLowerCase()}` : ''}`;
        sendPushToUser(coach, `💜 ${shortName(student.name)} respondeu o feedback da semana`, body, { type: 'weekly_feedback', studentId: userId, feedbackId: row.id }).catch(() => {});
      }
    }
    return NextResponse.json({ success: true, id: row.id });
  } catch (error: any) {
    console.error('Erro POST weekly-feedback:', error);
    return NextResponse.json({ error: 'Não foi possível enviar agora.' }, { status: 500 });
  }
}
