// app/api/insights/similar/route.ts
// 🧬 (18 out 2026) GET /api/insights/similar?studentId=<aluno> -> alunos parecidos do MESMO coach, do mesmo gênero, com a rotina na fase certa (ver lib/similarStudents.ts).
// Só o coach (ou o time master) e só alunos da carteira dele. Só lê, sem IA e sem custo. Aluno de outro coach responde igual a "não encontrado".
import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuth } from '@/lib/auth';
import { findSimilar } from '@/lib/similarStudents';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const auth = requireAuth(req);
  if ('response' in auth) return auth.response;
  if (String(auth.user.role || '').toUpperCase() === 'USER') return NextResponse.json({ error: 'Acesso restrito ao coach.' }, { status: 403 });
  const studentId = new URL(req.url).searchParams.get('studentId');
  if (!studentId) return NextResponse.json({ error: 'studentId obrigatório' }, { status: 400 });
  try {
    const r = await findSimilar(prisma, auth.user.id, studentId);
    if (!r.ok && r.reason === 'NAO_ENCONTRADO') return NextResponse.json({ error: 'Aluno não encontrado.' }, { status: 404 });
    return NextResponse.json(r);
  } catch (e) {
    console.error('Erro GET insights/similar:', e);
    return NextResponse.json({ error: 'Não foi possível buscar alunos parecidos agora.' }, { status: 500 });
  }
}
