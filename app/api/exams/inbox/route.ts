// app/api/exams/inbox/route.ts
// 🩺 (25 out 2026) GET -> para o PROFISSIONAL (personal/nutri): os envios que foram feitos para ELE e ainda não foram respondidos, do mais novo ao mais antigo.
//   { exams: [{ ...resumo, studentName, studentPhotoUrl }], newCount }.  Master sem alunos próprios vê lista vazia (não há passe livre).
import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuth } from '@/lib/auth';
import { summarizeSubmission } from '@/lib/exams';
import { missing, replyCounts } from '@/lib/examsService';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  try {
    const auth = requireAuth(req);
    if ('response' in auth) return auth.response;
    const me = auth.user.id;
    const limit = Math.min(100, Math.max(1, Number(new URL(req.url).searchParams.get('limit')) || 50));
    const rows: any[] = await prisma.examSubmission.findMany({ where: { OR: [{ coachId: me }, { nutritionistId: me }], status: { in: ['NEW', 'READ'] } }, orderBy: { createdAt: 'desc' }, take: limit * 2 });
    const ids = Array.from(new Set(rows.map((r) => r.userId)));
    const studs: any[] = ids.length ? await prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, name: true, photoUrl: true, coachId: true, nutritionistId: true } }) : [];
    const byId = new Map(studs.map((s) => [s.id, s]));
    // só vale quem ainda é aluno dele hoje
    const mine = rows.filter((r) => { const s = byId.get(r.userId); return s && (s.coachId === me || s.nutritionistId === me); }).slice(0, limit);
    const counts = await replyCounts(prisma, mine.map((r) => r.id));
    const files: any[] = mine.length ? await prisma.examFile.findMany({ where: { submissionId: { in: mine.map((r) => r.id) } }, select: { submissionId: true, mime: true } }) : [];
    return NextResponse.json({
      exams: mine.map((r) => ({ ...summarizeSubmission(r, files.filter((f) => f.submissionId === r.id), counts.get(r.id)), studentName: byId.get(r.userId)?.name || null, studentPhotoUrl: byId.get(r.userId)?.photoUrl || null })),
      newCount: mine.filter((r) => r.status === 'NEW').length,
    });
  } catch (e: any) {
    if (missing(e)) return NextResponse.json({ exams: [], newCount: 0, unavailable: true });
    console.error('[GET /api/exams/inbox]', e);
    return NextResponse.json({ error: 'Erro ao carregar os exames.' }, { status: 500 });
  }
}
