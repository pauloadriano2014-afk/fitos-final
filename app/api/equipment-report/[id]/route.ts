// app/api/equipment-report/[id]/route.ts
// PATCH { action: 'resolve' | 'available' | 'reopen', resolution?, replacedWithId? }  (só o coach do aluno ou o time master)
//   resolve   -> tratado (trocou/orientou); continua valendo como "este aluno não tem" nos alertas
//   available -> VOLTOU A TER: sai dos alertas, fica no histórico
//   reopen    -> volta para a lista de pendências
import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuth, canAccessStudent } from '@/lib/auth';
import { isCoachRole } from '@/lib/agendaAuth';

export const dynamic = 'force-dynamic';
const cut = (v: any, n: number) => String(v ?? '').trim().slice(0, n);

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  try {
    const auth = requireAuth(req);
    if ('response' in auth) return auth.response;
    const rep: any = await prisma.equipmentReport.findUnique({ where: { id: params.id } });
    if (!rep) return NextResponse.json({ error: 'Aviso não encontrado.' }, { status: 404 });
    const student: any = await prisma.user.findUnique({ where: { id: rep.userId }, select: { coachId: true } });
    if (!isCoachRole(auth.user) || auth.user.id === rep.userId || !canAccessStudent(auth.user, rep.userId, student?.coachId)) return NextResponse.json({ error: 'Acesso negado.' }, { status: 403 });
    const b = await req.json().catch(() => ({}));
    const now = new Date();
    let data: any;
    if (b.action === 'resolve') data = { status: 'RESOLVED', resolvedAt: now, resolution: cut(b.resolution, 300) || null, replacedWithId: cut(b.replacedWithId, 80) || null };
    else if (b.action === 'available') data = { status: 'AVAILABLE', resolvedAt: now };
    else if (b.action === 'reopen') data = { status: 'OPEN', resolvedAt: null };
    else return NextResponse.json({ error: 'Ação inválida.' }, { status: 400 });
    const report = await prisma.equipmentReport.update({ where: { id: params.id }, data });
    // o aviso saiu de "aberto" por aqui: some também da central HOJE (e volta se for reaberto)
    if (b.action === 'reopen') await prisma.agendaTaskResolved.deleteMany({ where: { taskKey: `aparelho:${params.id}` } }).catch(() => undefined);
    return NextResponse.json({ success: true, report });
  } catch (e: any) {
    console.error('[PATCH /api/equipment-report/[id]]', e);
    return NextResponse.json({ error: 'Erro ao atualizar o aviso.' }, { status: 500 });
  }
}
