// app/api/equipment-report/ranking/route.ts
// GET ?coachId= -> "aparelhos que faltam": quantos alunos do coach avisaram que não têm cada exercício (últimos 180 dias, avisos que ainda valem).
// Serve para o coach cadastrar UM substituto padrão na biblioteca e resolver para todos de uma vez.
import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAgendaCoach } from '@/lib/agendaAuth';
import { ACTIVE_STATUS } from '@/lib/equipment';

export const dynamic = 'force-dynamic';
const DAY = 86400000;

export async function GET(req: Request) {
  try {
    const coachId = new URL(req.url).searchParams.get('coachId');
    const auth = requireAgendaCoach(req, coachId);
    if ('response' in auth) return auth.response;
    const rows: any[] = await prisma.equipmentReport.findMany({ where: { coachId: coachId!, status: { in: ACTIVE_STATUS }, lastReportedAt: { gte: new Date(Date.now() - 180 * DAY) } }, select: { exerciseId: true, exerciseName: true, userId: true, status: true } });
    const by = new Map<string, { exerciseId: string; exerciseName: string; users: Set<string>; open: number }>();
    for (const r of rows) {
      const cur = by.get(r.exerciseId) || { exerciseId: r.exerciseId, exerciseName: r.exerciseName, users: new Set<string>(), open: 0 };
      cur.users.add(r.userId); if (r.status === 'OPEN') cur.open++; by.set(r.exerciseId, cur);
    }
    const ids = [...by.keys()];
    const ex: any[] = ids.length ? await prisma.exercise.findMany({ where: { id: { in: ids } }, select: { id: true, defaultSubstitutes: true } }) : [];
    const hasDefault = new Map(ex.map((e) => [e.id, Array.isArray(e.defaultSubstitutes) && e.defaultSubstitutes.length > 0]));
    const names: any[] = by.size ? await prisma.user.findMany({ where: { id: { in: [...new Set(rows.map((r) => r.userId))] } }, select: { id: true, name: true } }) : [];
    const nm = new Map(names.map((u) => [u.id, String(u.name || 'Aluno').split(/\s+/)[0]]));
    const items = [...by.values()].map((x) => ({ exerciseId: x.exerciseId, exerciseName: x.exerciseName, students: x.users.size, open: x.open, names: [...x.users].map((u) => nm.get(u) || 'Aluno').slice(0, 5), hasDefaultSubstitute: !!hasDefault.get(x.exerciseId) }))
      .sort((a, b) => b.students - a.students || b.open - a.open || a.exerciseName.localeCompare(b.exerciseName)).slice(0, 30);
    return NextResponse.json({ items });
  } catch (e: any) {
    if (/does not exist|P2021|P2022/i.test(String(e?.code || '') + String(e?.message || ''))) return NextResponse.json({ items: [], unavailable: true });
    console.error('[GET /api/equipment-report/ranking]', e);
    return NextResponse.json({ error: 'Erro ao montar o ranking.' }, { status: 500 });
  }
}
