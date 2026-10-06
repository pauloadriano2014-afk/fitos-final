// app/api/agenda/hoje/route.ts
// ☀️ (6 out 2026) Central HOJE do coach.
//   GET  /api/agenda/hoje?coachId=   -> { agenda: compromissos de hoje, tasks: pendências em ordem de urgência, counts, unavailable }
//   POST /api/agenda/hoje { coachId, taskKey, days?, note? }  -> adia (days) ou marca como tratada (days 30) uma pendência e/ou guarda uma anotação nela
//     (só `days` ou nenhum dos dois: adia 1 dia; só `note`: só anota; `note` vazia apaga a anotação; `note` + `days`: anota e adia)
import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAgendaCoach, UNAVAILABLE } from '@/lib/agendaAuth';
import { buildHoje, NOTE_DAYS } from '@/lib/agendaHoje';
import { isMissingTable } from '@/lib/agendaStore';

export const dynamic = 'force-dynamic';
const SNOOZE_DAYS = [1, 3, 7, 30];
const MAX_NOTE = 300;

export async function GET(req: Request) {
  try {
    const coachId = new URL(req.url).searchParams.get('coachId');
    const auth = requireAgendaCoach(req, coachId);
    if ('response' in auth) return auth.response;
    return NextResponse.json(await buildHoje(prisma, coachId!));
  } catch (e: any) {
    if (isMissingTable(e)) return NextResponse.json(UNAVAILABLE, { status: 503 });
    console.error('Erro ao montar a central HOJE:', e);
    return NextResponse.json({ error: 'Erro ao carregar a central HOJE.' }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => null);
    const coachId = body && typeof body.coachId === 'string' ? body.coachId : null;
    const auth = requireAgendaCoach(req, coachId);
    if ('response' in auth) return auth.response;
    const taskKey = typeof body.taskKey === 'string' ? body.taskKey.trim() : '';
    if (!taskKey || taskKey.length > 120) return NextResponse.json({ error: 'taskKey inválida.' }, { status: 400 });
    const hasNote = body.note !== undefined && body.note !== null, hasDays = body.days !== undefined && body.days !== null;
    if (hasNote && typeof body.note !== 'string') return NextResponse.json({ error: 'note deve ser texto.' }, { status: 400 });
    const note: string = hasNote ? body.note.trim() : '';
    if (note.length > MAX_NOTE) return NextResponse.json({ error: `A anotação pode ter até ${MAX_NOTE} letras.` }, { status: 400 });
    if (note && taskKey.endsWith(':mais')) return NextResponse.json({ error: 'Essa linha junta várias pendências e não aceita anotação.' }, { status: 400 });
    const days = hasDays ? Number(body.days) : 1;
    if (hasDays && !SNOOZE_DAYS.includes(days)) return NextResponse.json({ error: `days deve ser ${SNOOZE_DAYS.join(', ')}.` }, { status: 400 });
    if (hasNote) {
      if (note) await prisma.agendaTaskNote.upsert({ where: { coachId_taskKey: { coachId: coachId!, taskKey } }, update: { note }, create: { coachId: coachId!, taskKey, note } });
      else await prisma.agendaTaskNote.deleteMany({ where: { coachId: coachId!, taskKey } });
      await prisma.agendaTaskNote.deleteMany({ where: { coachId: coachId!, updatedAt: { lt: new Date(Date.now() - NOTE_DAYS * 86400000) } } }).catch(() => undefined);   // faxina das antigas
    }
    let until: Date | null = null;
    if (hasDays || !hasNote) {
      until = new Date(Date.now() + days * 86400000);
      await prisma.agendaTaskSnooze.upsert({ where: { coachId_taskKey: { coachId: coachId!, taskKey } }, update: { until }, create: { coachId: coachId!, taskKey, until } });
    }
    return NextResponse.json({ success: true, until, note: note || null });
  } catch (e: any) {
    if (isMissingTable(e)) return NextResponse.json(UNAVAILABLE, { status: 503 });
    console.error('Erro ao adiar pendência:', e);
    return NextResponse.json({ error: 'Erro ao adiar a pendência.' }, { status: 500 });
  }
}
