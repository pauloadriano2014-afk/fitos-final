// app/api/agenda/route.ts
// 📅 (6 out 2026) Agenda do coach.
//   GET  /api/agenda?coachId=&from=AAAA-MM-DD&to=AAAA-MM-DD  -> os compromissos do período (as séries semanais já viram dias reais aqui) + os ajustes da agenda
//   POST /api/agenda  { coachId, kind, title?, studentId? | offlineClientId?, date, time, durationMin?, location?, meetUrl?, notes?, repeatWeekly?, weekdays?, endDate?, force? }
//        Choque de horário responde 409 com a lista (o app pergunta e reenvia com force: true).
import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAgendaCoach, UNAVAILABLE } from '@/lib/agendaAuth';
import { parseCreateBody } from '@/lib/agenda';
import { checkWindow, listWindow, createAgenda, getSettings, isMissingTable } from '@/lib/agendaStore';

export const dynamic = 'force-dynamic';


export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const coachId = url.searchParams.get('coachId');
    const auth = requireAgendaCoach(req, coachId);
    if ('response' in auth) return auth.response;
    const win = checkWindow(url.searchParams.get('from'), url.searchParams.get('to'));
    if (!win.ok) return NextResponse.json({ error: win.error }, { status: 400 });
    const events = await listWindow(prisma, coachId!, win.from, win.to);
    const settings = await getSettings(prisma, coachId!);
    return NextResponse.json({ events, settings, from: win.from, to: win.to });
  } catch (e: any) {
    if (isMissingTable(e)) return NextResponse.json(UNAVAILABLE, { status: 503 });
    console.error('Erro ao listar a agenda:', e);
    return NextResponse.json({ error: 'Erro ao carregar a agenda.' }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => null);
    const coachId = body && typeof body.coachId === 'string' ? body.coachId : null;
    const auth = requireAgendaCoach(req, coachId);
    if ('response' in auth) return auth.response;
    const parsed = parseCreateBody(body);
    if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
    const res: any = await createAgenda(prisma, coachId!, parsed.value);
    if ('status' in res) return NextResponse.json({ error: res.error, conflicts: res.conflicts }, { status: res.status });
    return NextResponse.json(res, { status: 201 });
  } catch (e: any) {
    if (isMissingTable(e)) return NextResponse.json(UNAVAILABLE, { status: 503 });
    console.error('Erro ao criar compromisso:', e);
    return NextResponse.json({ error: 'Erro ao salvar o compromisso.' }, { status: 500 });
  }
}
