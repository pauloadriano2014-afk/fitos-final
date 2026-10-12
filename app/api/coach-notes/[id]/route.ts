// app/api/coach-notes/[id]/route.ts
//   PATCH { status?: 'DONE' | 'OPEN', body?, tag?, dueDate? } -> concluir/reabrir a tarefa ou editar a anotação (só a do próprio coach)
//   DELETE -> apaga a anotação
import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { MAX_BODY, cleanDue, cleanText, isTag, todayKeyBrt } from '@/lib/coachNotes';
import { missing, requireNotesCoach, UNAVAILABLE } from '@/lib/coachNotesStore';

export const dynamic = 'force-dynamic';

async function mine(req: Request, id: string) {
  const auth = await requireNotesCoach(req);
  if ('response' in auth) return { response: auth.response } as const;
  const note: any = await prisma.coachNote.findUnique({ where: { id } });
  if (!note || note.coachId !== auth.user.id) return { response: NextResponse.json({ error: 'Anotação não encontrada.' }, { status: 404 }) } as const;
  return { auth, note } as const;
}

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  try {
    const r = await mine(req, params.id);
    if ('response' in r) return r.response;
    const b = await req.json().catch(() => null);
    if (!b) return NextResponse.json({ error: 'Corpo inválido.' }, { status: 400 });
    const data: any = {};
    if (b.status !== undefined) {
      if (r.note.kind !== 'TAREFA') return NextResponse.json({ error: 'Só tarefa pode ser concluída.' }, { status: 400 });
      if (b.status === 'DONE') { data.status = 'DONE'; data.doneAt = new Date(); }
      else if (b.status === 'OPEN') { data.status = 'OPEN'; data.doneAt = null; }
      else return NextResponse.json({ error: 'status inválido.' }, { status: 400 });
    }
    if (b.body !== undefined) { const t = cleanText(b.body, MAX_BODY); if (!t) return NextResponse.json({ error: 'A anotação não pode ficar vazia.' }, { status: 400 }); data.body = t; }
    if (b.tag !== undefined) { if (b.tag !== null && !isTag(b.tag)) return NextResponse.json({ error: 'Etiqueta inválida.' }, { status: 400 }); data.tag = b.tag; }
    if (b.dueDate !== undefined) {
      if (r.note.kind !== 'TAREFA') return NextResponse.json({ error: 'Só tarefa tem data.' }, { status: 400 });
      const d = cleanDue(b.dueDate, todayKeyBrt()); if (!d) return NextResponse.json({ error: 'Data inválida.' }, { status: 400 });
      data.dueDate = d;
    }
    if (!Object.keys(data).length) return NextResponse.json({ error: 'Nada para alterar.' }, { status: 400 });
    const note = await prisma.coachNote.update({ where: { id: params.id }, data });
    // concluir/reabrir aqui também limpa o "resolvido" da central HOJE (a chave `nota:<id>`), para as duas telas não discordarem
    if (data.status === 'OPEN') await prisma.agendaTaskResolved.deleteMany({ where: { coachId: r.auth.user.id, taskKey: `nota:${params.id}` } }).catch(() => undefined);
    return NextResponse.json({ success: true, note });
  } catch (e: any) {
    if (missing(e)) return NextResponse.json(UNAVAILABLE, { status: 503 });
    console.error('[PATCH /api/coach-notes/:id]', e);
    return NextResponse.json({ error: 'Erro ao atualizar a anotação.' }, { status: 500 });
  }
}

export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  try {
    const r = await mine(req, params.id);
    if ('response' in r) return r.response;
    await prisma.coachNote.delete({ where: { id: params.id } });
    await prisma.agendaTaskResolved.deleteMany({ where: { coachId: r.auth.user.id, taskKey: `nota:${params.id}` } }).catch(() => undefined);
    await prisma.agendaTaskSnooze.deleteMany({ where: { coachId: r.auth.user.id, taskKey: `nota:${params.id}` } }).catch(() => undefined);
    return NextResponse.json({ success: true });
  } catch (e: any) {
    if (missing(e)) return NextResponse.json(UNAVAILABLE, { status: 503 });
    console.error('[DELETE /api/coach-notes/:id]', e);
    return NextResponse.json({ error: 'Erro ao apagar a anotação.' }, { status: 500 });
  }
}
