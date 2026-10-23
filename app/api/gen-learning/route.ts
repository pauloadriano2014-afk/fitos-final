// app/api/gen-learning/route.ts
// 🧠 (23 out 2026) O que o coach corrigiu nos treinos gerados pela IA (etapa 2). SÓ LEITURA: lista os últimos treinos gerados com o resumo do que mudou ao salvar.
// O coach vê os seus; o time master pode pedir os de outro coach (?coachId=). Sem a tabela (falta o `npx prisma db push`) devolve lista vazia e avisa.
import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuth, isMasterId } from '@/lib/auth';
import { summarizeEdits } from '@/lib/ai/genLearning';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const auth = requireAuth(req);
  if ('response' in auth) return auth.response;
  const url = new URL(req.url);
  const asked = url.searchParams.get('coachId');
  const coachId = asked && asked !== auth.user.id ? (isMasterId(auth.user.id) ? asked : null) : auth.user.id;
  if (!coachId) return NextResponse.json({ error: 'Acesso negado.' }, { status: 403 });
  const P = prisma as any;
  if (!P.workoutGenSnapshot) return NextResponse.json({ items: [], missingTable: true });
  try {
    const limit = Math.min(Math.max(parseInt(url.searchParams.get('limit') || '30', 10) || 30, 1), 100);
    const rows = await P.workoutGenSnapshot.findMany({ where: { coachId }, orderBy: { createdAt: 'desc' }, take: limit, select: { id: true, studentId: true, engine: true, createdAt: true, savedAt: true, editCount: true, edits: true, workoutId: true } });
    const items = rows.map((r: any) => ({ id: r.id, studentId: r.studentId, engine: r.engine, createdAt: r.createdAt, savedAt: r.savedAt, workoutId: r.workoutId, saved: !!r.savedAt, summary: Array.isArray(r.edits) ? summarizeEdits(r.edits) : null }));
    return NextResponse.json({ items });
  } catch (e) {
    return NextResponse.json({ items: [], missingTable: true });
  }
}
