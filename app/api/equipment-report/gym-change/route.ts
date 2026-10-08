// app/api/equipment-report/gym-change/route.ts
// POST { userId } -> "o aluno MUDOU DE ACADEMIA": os avisos de aparelho dele (em aberto ou tratados) viram "outra academia": deixam de gerar alerta e de afastar a IA,
// mas continuam no histórico (nada é apagado). Se na academia nova faltar algo, o aluno avisa de novo.
import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuth, canAccessStudent } from '@/lib/auth';
import { isCoachRole } from '@/lib/agendaAuth';
import { ACTIVE_STATUS } from '@/lib/equipment';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  try {
    const auth = requireAuth(req);
    if ('response' in auth) return auth.response;
    const b = await req.json().catch(() => null);
    const userId = String(b?.userId || '');
    if (!userId) return NextResponse.json({ error: 'userId obrigatório.' }, { status: 400 });
    const student: any = await prisma.user.findUnique({ where: { id: userId }, select: { coachId: true, role: true } });
    if (!student || student.role !== 'USER') return NextResponse.json({ error: 'Aluno não encontrado.' }, { status: 404 });
    if (!isCoachRole(auth.user) || auth.user.id === userId || !canAccessStudent(auth.user, userId, student.coachId)) return NextResponse.json({ error: 'Acesso negado.' }, { status: 403 });
    const open: any[] = await prisma.equipmentReport.findMany({ where: { userId, status: 'OPEN' }, select: { id: true } });
    const res = await prisma.equipmentReport.updateMany({ where: { userId, status: { in: ACTIVE_STATUS } }, data: { status: 'OTHER_GYM', resolvedAt: new Date() } });
    for (const r of open) await prisma.agendaTaskResolved.deleteMany({ where: { taskKey: `aparelho:${r.id}` } }).catch(() => undefined);
    return NextResponse.json({ success: true, moved: res.count });
  } catch (e: any) {
    if (/does not exist|P2021|P2022/i.test(String(e?.code || '') + String(e?.message || ''))) return NextResponse.json({ success: true, moved: 0, unavailable: true });
    console.error('[POST /api/equipment-report/gym-change]', e);
    return NextResponse.json({ error: 'Erro ao registrar a troca de academia.' }, { status: 500 });
  }
}
