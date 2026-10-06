// app/api/workout/start/route.ts
// 🔔 (7 out 2026) O app do aluno avisa aqui quando ele toca em INICIAR TREINO. O servidor guarda a sessão (lib/workoutSessions.ts) para poder lembrar o aluno
// de FINALIZAR se ele esquecer. Melhor esforço: o app ignora qualquer erro daqui (nunca atrapalha o treino). Só o próprio aluno abre a sessão dele.
import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuth } from '@/lib/auth';
import { isMissingTable } from '@/lib/agendaStore';
import { parseSessionInput, startSession } from '@/lib/workoutSessions';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  try {
    const body: any = await req.json().catch(() => null);
    if (!body || typeof body !== 'object') return NextResponse.json({ error: 'Corpo inválido.' }, { status: 400 });
    const userId = typeof body.userId === 'string' ? body.userId : '';
    if (!userId) return NextResponse.json({ error: 'userId obrigatório.' }, { status: 400 });

    const auth = requireAuth(req);
    if ('response' in auth) return auth.response;
    if (auth.user.id !== userId) return NextResponse.json({ error: 'Acesso negado.' }, { status: 403 });

    const parsed = parseSessionInput(body);
    if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });

    const r = await startSession(prisma, userId, parsed.value);
    return NextResponse.json({ success: true, created: r.created });
  } catch (e: any) {
    if (isMissingTable(e)) return NextResponse.json({ success: false, skipped: 'tabela ainda não criada (npx prisma db push)' });
    console.error('Erro POST workout/start:', e);
    return NextResponse.json({ error: 'Erro ao registrar o início.' }, { status: 500 });
  }
}
