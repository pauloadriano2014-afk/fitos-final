// app/api/workout/extend/route.ts
// ⏩ (18 out 2026) POST { studentId | studentIds[], days: 1 | 3 | 7 } -> prorroga o treino atual (ver lib/workoutExtend.ts). SÓ o coach do aluno (ou o time master):
// o próprio aluno NÃO pode empurrar o vencimento do treino dele. Cada aluno responde sozinho: um erro (sem treino, sem prazo, não é seu) não derruba os outros.
import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuth, isMasterId } from '@/lib/auth';
import { extendCurrentWorkouts, parseExtendDays, parseExtendStudents, MAX_EXTEND_STUDENTS } from '@/lib/workoutExtend';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const auth = requireAuth(req);
  if ('response' in auth) return auth.response;
  try {
    const body = await req.json().catch(() => ({}));
    const days = parseExtendDays(body?.days);
    if (!days) return NextResponse.json({ error: 'Escolha 1 dia, 3 dias ou 1 semana (days: 1, 3 ou 7).' }, { status: 400 });
    const ids = parseExtendStudents(body);
    if (!ids) return NextResponse.json({ error: `Envie de 1 a ${MAX_EXTEND_STUDENTS} alunos.` }, { status: 400 });
    const users: any[] = await prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, coachId: true } });
    const byId = new Map(users.map((u) => [u.id, u]));
    const results: any[] = [];
    for (const id of ids) {
      const u = byId.get(id);
      const mine = !!u && (isMasterId(auth.user.id) || (!!u.coachId && u.coachId === auth.user.id)) && auth.user.id !== id;
      if (!u || !mine) { results.push({ studentId: id, ok: false, error: 'Aluno não encontrado.' }); continue; }   // mesma resposta para "não existe" e "não é seu": não revela alunos de outro coach
      try { results.push({ studentId: id, ...(await extendCurrentWorkouts(prisma, id, days)) }); }
      catch (e: any) { console.error('Erro ao prorrogar treino', id, e?.message || e); results.push({ studentId: id, ok: false, error: 'Não foi possível prorrogar agora.' }); }
    }
    return NextResponse.json({ ok: results.some((r) => r.ok), days, results });
  } catch (error) {
    console.error('Erro POST workout/extend:', error);
    return NextResponse.json({ error: 'Erro ao prorrogar o treino.' }, { status: 500 });
  }
}
