// app/api/admin/weekly-feedback/whatsapp/route.ts
// POST { studentId } -> monta a mensagem de WhatsApp do "reforço" do feedback da semana (saudação + o questionário personalizado do aluno) e
// devolve { phone, text, url } pro app abrir o WhatsApp. Conta como cobrança do coach (StudentAlert WEEKLY_NUDGE, no máximo uma a cada 12 h).
import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuth, canAccessStudent } from '@/lib/auth';
import { evaluatedWeekStart, isDueStudent, isMissingTable, weekLabel } from '@/lib/weeklyFeedback';
import { ensureQuestionSet } from '@/lib/weeklyQuestionSet';
import { buildWhatsAppText, normalizeBrPhone } from '@/lib/weeklyWhatsApp';
import { NUDGE_TYPE, NUDGE_COOLDOWN_MS } from '@/lib/weeklyBoard';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const studentId = body.studentId as string | undefined;
    if (!studentId) return NextResponse.json({ error: 'Aluno não informado.' }, { status: 400 });

    const auth = requireAuth(req);
    if ('response' in auth) return auth.response;
    const student: any = await prisma.user.findUnique({ where: { id: studentId }, select: { id: true, name: true, phone: true, coachId: true, createdAt: true, active: true, accountStatus: true, role: true, dietModule: true } });
    if (!student) return NextResponse.json({ error: 'Aluno não encontrado.' }, { status: 404 });
    if (auth.user.id === studentId || !canAccessStudent(auth.user, studentId, student.coachId)) return NextResponse.json({ error: 'Acesso negado.' }, { status: 403 });

    const now = new Date();
    if (!isDueStudent(student, now)) return NextResponse.json({ error: 'Esse aluno não tem feedback pendente.' }, { status: 400 });
    const phone = normalizeBrPhone(student.phone);
    if (!phone) return NextResponse.json({ error: 'O aluno não tem um celular válido cadastrado.', code: 'NO_PHONE' }, { status: 400 });

    const weekStart = evaluatedWeekStart(now);
    try {
      const done = await prisma.weeklyFeedback.findUnique({ where: { userId_weekStart: { userId: studentId, weekStart } }, select: { id: true } });
      if (done) return NextResponse.json({ error: 'Esse aluno já respondeu.' }, { status: 409 });
    } catch (e) {
      if (isMissingTable(e)) return NextResponse.json({ error: 'Recurso ainda não disponível.' }, { status: 503 });
      throw e;
    }

    const set = await ensureQuestionSet(prisma, student, { weekStart, now, ai: { timeoutMs: 8000, maxRetries: 0 } });
    const text = buildWhatsAppText({ name: student.name, weekLabel: weekLabel(weekStart), intro: set.intro, questions: set.questions });

    // conta como cobrança (sem empilhar: uma por 12 h), mas o texto sai sempre
    const last = await prisma.studentAlert.findFirst({ where: { userId: studentId, type: NUDGE_TYPE, createdAt: { gte: new Date(now.getTime() - NUDGE_COOLDOWN_MS) } }, select: { id: true } }).catch(() => null);
    if (!last) {
      await prisma.studentAlert.create({
        data: { userId: studentId, coachId: student.coachId || undefined, type: NUDGE_TYPE, title: 'Cobrança de feedback da semana (WhatsApp)', message: '', isRead: true },
      }).catch((e: any) => console.warn('[weekly whatsapp] não registrou a cobrança:', e?.message || e));
    }
    return NextResponse.json({ success: true, phone, text, url: `https://wa.me/${phone}?text=${encodeURIComponent(text)}` });
  } catch (error) {
    console.error('Erro POST whatsapp weekly-feedback:', error);
    return NextResponse.json({ error: 'Não foi possível montar a mensagem.' }, { status: 500 });
  }
}
