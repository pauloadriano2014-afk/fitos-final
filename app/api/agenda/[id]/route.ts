// app/api/agenda/[id]/route.ts
// 📅 (6 out 2026) Um compromisso da agenda.
//   PATCH  { status? | title? | location? | meetUrl? | notes? | date? | time? | durationMin? | weekdays? | scope?: 'this'|'future' | force? }
//          status = SCHEDULED | DONE | MISSED | RESCHEDULED (o aluno pediu outra data) | CANCELLED (presença); notifyStudent/notifyCoach = avisos ligados/desligados. Remarcar = date/time. scope 'future' (só em série) muda este dia e os próximos.
//   DELETE ?scope=this|future   -- dia de série vira CANCELADO (a série não recria); 'future' encerra a série a partir deste dia; avulso é apagado.
import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAgendaCoach, UNAVAILABLE } from '@/lib/agendaAuth';
import { parsePatchBody } from '@/lib/agenda';
import { updateAgenda, deleteAgenda, isMissingTable } from '@/lib/agendaStore';

export const dynamic = 'force-dynamic';

async function load(req: Request, id: string) {
  const ev = await prisma.agendaEvent.findUnique({ where: { id } });
  if (!ev) return { response: NextResponse.json({ error: 'Compromisso não encontrado.' }, { status: 404 }) };
  const auth = requireAgendaCoach(req, ev.coachId);
  if ('response' in auth) return auth;
  return { ev, user: auth.user };
}

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  try {
    const got: any = await load(req, params.id);
    if ('response' in got) return got.response;
    const body = await req.json().catch(() => null);
    const parsed = parsePatchBody(body);
    if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
    const res: any = await updateAgenda(prisma, got.ev.coachId, got.ev, parsed.value);
    if ('status' in res) return NextResponse.json({ error: res.error, conflicts: res.conflicts }, { status: res.status });
    return NextResponse.json(res);
  } catch (e: any) {
    if (isMissingTable(e)) return NextResponse.json(UNAVAILABLE, { status: 503 });
    console.error('Erro ao atualizar compromisso:', e);
    return NextResponse.json({ error: 'Erro ao salvar o compromisso.' }, { status: 500 });
  }
}

export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  try {
    const got: any = await load(req, params.id);
    if ('response' in got) return got.response;
    const scope = new URL(req.url).searchParams.get('scope') === 'future' ? 'future' : 'this';
    const res = await deleteAgenda(prisma, got.ev.coachId, got.ev, scope);
    return NextResponse.json({ success: true, ...res });
  } catch (e: any) {
    if (isMissingTable(e)) return NextResponse.json(UNAVAILABLE, { status: 503 });
    console.error('Erro ao apagar compromisso:', e);
    return NextResponse.json({ error: 'Erro ao apagar o compromisso.' }, { status: 500 });
  }
}
