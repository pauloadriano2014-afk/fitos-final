// app/api/agenda/settings/route.ts
// ⚙️ (6 out 2026) Ajustes da agenda de cada coach: link do Google Meet, avisos, resumo diário e limites da grade.
//   GET /api/agenda/settings?coachId=     PUT { coachId, meetUrl?, remindCoachMin?, remindStudentMin?, dailySummary?, summaryHour?, workStart?, workEnd? }
import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAgendaCoach, UNAVAILABLE } from '@/lib/agendaAuth';
import { getSettings, saveSettings, parseSettingsBody, isMissingTable } from '@/lib/agendaStore';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  try {
    const coachId = new URL(req.url).searchParams.get('coachId');
    const auth = requireAgendaCoach(req, coachId);
    if ('response' in auth) return auth.response;
    return NextResponse.json({ settings: await getSettings(prisma, coachId!) });
  } catch (e: any) {
    if (isMissingTable(e)) return NextResponse.json(UNAVAILABLE, { status: 503 });
    console.error('Erro ao ler ajustes da agenda:', e);
    return NextResponse.json({ error: 'Erro ao carregar os ajustes.' }, { status: 500 });
  }
}

export async function PUT(req: Request) {
  try {
    const body = await req.json().catch(() => null);
    const coachId = body && typeof body.coachId === 'string' ? body.coachId : null;
    const auth = requireAgendaCoach(req, coachId);
    if ('response' in auth) return auth.response;
    const parsed = parseSettingsBody(body);
    if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
    return NextResponse.json({ settings: await saveSettings(prisma, coachId!, parsed.value) });
  } catch (e: any) {
    if (e?.status === 400) return NextResponse.json({ error: e.message }, { status: 400 });
    if (isMissingTable(e)) return NextResponse.json(UNAVAILABLE, { status: 503 });
    console.error('Erro ao salvar ajustes da agenda:', e);
    return NextResponse.json({ error: 'Erro ao salvar os ajustes.' }, { status: 500 });
  }
}
