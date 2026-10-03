// app/api/challenge21/check/route.ts
// 🔥 (3 out 2026) Marca ou desmarca uma missão do desafio de 21 dias.
//   POST { missionId, done, date? , userId? }  -> devolve o resumo atualizado (mesmo formato do GET)
// Só dá pra mexer em hoje e ontem (a missão de sono só se sabe na manhã seguinte) e dentro dos 21 dias do desafio.
import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuth, canAccessStudent } from '@/lib/auth';
import { loadChallenge, isMissingTable } from '@/lib/challenge21Data';
import { brtDate, canToggle, dayIndexOf, editableDates, isDate } from '@/lib/challenge21';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  try {
    const auth = requireAuth(req);
    if ('response' in auth) return auth.response;
    const body = await req.json().catch(() => ({}));
    const userId = String(body.userId || auth.user.id);
    const missionId = String(body.missionId || '');
    const done = body.done === true;
    if (!missionId) return NextResponse.json({ error: 'missionId obrigatório.' }, { status: 400 });

    const target = await prisma.user.findUnique({ where: { id: userId }, select: { coachId: true } });
    if (!target) return NextResponse.json({ error: 'Aluno não encontrado.' }, { status: 404 });
    if (!canAccessStudent(auth.user, userId, target.coachId)) return NextResponse.json({ error: 'Acesso negado.' }, { status: 403 });

    const before = await loadChallenge(prisma, userId);
    if (!before.enabled) return NextResponse.json({ error: 'Esse plano não tem o desafio de 21 dias.' }, { status: 400 });
    if (before.state === 'PREPARING' || before.state === 'WAITING') return NextResponse.json({ error: 'O desafio ainda não começou.' }, { status: 400 });

    const today = brtDate();
    const date = body.date === undefined ? today : body.date;
    if (!isDate(date) || !editableDates(today).includes(date)) return NextResponse.json({ error: 'Só dá para marcar missões de hoje e de ontem.' }, { status: 400 });
    const idx = dayIndexOf(before.summary.startDate, date);
    if (!canToggle(idx, { waterMl: before.waterMl }, missionId)) return NextResponse.json({ error: 'Essa missão não pode ser marcada nesse dia.' }, { status: 400 });

    const row = await prisma.challengeCheckin.findUnique({ where: { userId_date: { userId, date } } });
    const current: string[] = row?.done || [];
    const next = done ? Array.from(new Set([...current, missionId])) : current.filter((m) => m !== missionId);
    if (row) { if (next.length !== current.length) await prisma.challengeCheckin.update({ where: { userId_date: { userId, date } }, data: { done: next } }); }
    else if (done) await prisma.challengeCheckin.create({ data: { userId, date, done: next } });

    return NextResponse.json(await loadChallenge(prisma, userId));
  } catch (error: any) {
    if (isMissingTable(error)) return NextResponse.json({ error: 'Tabela do desafio ainda não existe: rode "npx prisma db push".' }, { status: 503 });
    console.error('[POST /api/challenge21/check]', error);
    return NextResponse.json({ error: 'Erro ao salvar a missão.' }, { status: 500 });
  }
}
