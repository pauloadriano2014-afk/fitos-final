// app/api/insights/compare/route.ts
// 🆚 (18 out 2026) GET /api/insights/compare?targetId=<destino>&sourceId=<referência>&workoutId=<ficha da referência>
// -> a rotina do aluno-referência analisada para o destino: o que dá para aproveitar e o que mudar (sem o aparelho, limitação, local). Ver lib/similarStudents.ts.
// Só o coach (ou o time master), os DOIS alunos da carteira dele e do mesmo gênero. Só lê, sem IA.
import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuth } from '@/lib/auth';
import { loadComparison } from '@/lib/similarStudents';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const auth = requireAuth(req);
  if ('response' in auth) return auth.response;
  if (String(auth.user.role || '').toUpperCase() === 'USER') return NextResponse.json({ error: 'Acesso restrito ao coach.' }, { status: 403 });
  const q = new URL(req.url).searchParams;
  const targetId = q.get('targetId'), sourceId = q.get('sourceId'), workoutId = q.get('workoutId');
  if (!targetId || !sourceId || !workoutId) return NextResponse.json({ error: 'Envie targetId, sourceId e workoutId.' }, { status: 400 });
  try {
    const r = await loadComparison(prisma, auth.user.id, targetId, sourceId, workoutId);
    if (!r.ok) {
      if (r.reason === 'GENERO_DIFERENTE') return NextResponse.json({ error: 'Só comparamos alunos do mesmo gênero.', code: r.reason }, { status: 422 });
      if (r.reason === 'SEM_GENERO') return NextResponse.json({ error: 'Falta o gênero no cadastro de um dos alunos.', code: r.reason }, { status: 422 });
      return NextResponse.json({ error: 'Treino ou aluno não encontrado.', code: r.reason }, { status: 404 });
    }
    return NextResponse.json(r);
  } catch (e) {
    console.error('Erro GET insights/compare:', e);
    return NextResponse.json({ error: 'Não foi possível comparar agora.' }, { status: 500 });
  }
}
