// app/api/agenda/me/[id]/route.ts
// ✅ (6 out 2026) O aluno responde um atendimento: POST { response: 'CONFIRMED' | 'RESCHEDULE' }. O coach recebe um aviso e, se pediu para remarcar, a
// central HOJE mostra a pendência.
import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuth } from '@/lib/auth';
import { sendPushToUser } from '@/app/utils/sendNotification';
import { STUDENT_RESPONSES, firstName, dateKeyBrt, timeKeyBrt } from '@/lib/agenda';
import { studentRespond, isMissingTable } from '@/lib/agendaStore';

export const dynamic = 'force-dynamic';

export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const auth = requireAuth(req);
    if ('response' in auth) return auth.response;
    const body = await req.json().catch(() => null);
    const response = String(body?.response || '').toUpperCase();
    if (!(STUDENT_RESPONSES as readonly string[]).includes(response)) return NextResponse.json({ error: 'response deve ser CONFIRMED ou RESCHEDULE.' }, { status: 400 });
    const res: any = await studentRespond(prisma, auth.user.id, params.id, response);
    if ('status' in res) return NextResponse.json({ error: res.error }, { status: res.status });
    // aviso ao coach (melhor esforço: falhar aqui não desfaz a resposta)
    try {
      const [coach, student] = await Promise.all([
        prisma.user.findUnique({ where: { id: res.event.coachId }, select: { id: true, pushToken: true } }),
        prisma.user.findUnique({ where: { id: auth.user.id }, select: { name: true } }),
      ]);
      if (coach) {
        const when = `${dateKeyBrt(res.event.startsAt).split('-').reverse().slice(0, 2).join('/')} às ${timeKeyBrt(res.event.startsAt)}`;
        const who = firstName(student?.name) || 'O aluno';
        await sendPushToUser(coach, response === 'CONFIRMED' ? `✅ ${who} confirmou presença` : `🔁 ${who} pediu para remarcar`, `Atendimento de ${when}`, { type: 'agenda_response', eventId: res.event.id });
      }
    } catch (e: any) { console.error('[agenda] aviso ao coach falhou:', e?.message || e); }
    return NextResponse.json({ success: true, studentResponse: response });
  } catch (e: any) {
    if (isMissingTable(e)) return NextResponse.json({ error: 'Agenda indisponível.' }, { status: 503 });
    console.error('Erro ao responder atendimento:', e);
    return NextResponse.json({ error: 'Erro ao enviar a resposta.' }, { status: 500 });
  }
}
