// app/api/agenda/hoje/route.ts
// ☀️ (6 out 2026) Central HOJE do coach.
//   GET  /api/agenda/hoje?coachId=   -> { agenda: compromissos de hoje, tasks: pendências em ordem de urgência, counts, unavailable }
//   POST /api/agenda/hoje { coachId, taskKey, days? }  -> adia (days, padrão 1) ou marca como tratada (days 30) uma pendência
import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAgendaCoach, UNAVAILABLE } from '@/lib/agendaAuth';
import { buildHoje } from '@/lib/agendaHoje';
import { isMissingTable } from '@/lib/agendaStore';

export const dynamic = 'force-dynamic';
const SNOOZE_DAYS = [1, 3, 7, 30];

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
    const days = body.days == null ? 1 : Number(body.days);
    if (!SNOOZE_DAYS.includes(days)) return NextResponse.json({ error: `days deve ser ${SNOOZE_DAYS.join(', ')}.` }, { status: 400 });
    const until = new Date(Date.now() + days * 86400000);
    await prisma.agendaTaskSnooze.upsert({ where: { coachId_taskKey: { coachId: coachId!, taskKey } }, update: { until }, create: { coachId: coachId!, taskKey, until } });
    return NextResponse.json({ success: true, until });
  } catch (e: any) {
    if (isMissingTable(e)) return NextResponse.json(UNAVAILABLE, { status: 503 });
    console.error('Erro ao adiar pendência:', e);
    return NextResponse.json({ error: 'Erro ao adiar a pendência.' }, { status: 500 });
  }
}
