// app/api/agenda/me/route.ts
// 📅 (6 out 2026) Lado do ALUNO: GET /api/agenda/me -> os próximos atendimentos dele (presencial, videochamada, avaliação) nos próximos 21 dias.
// Sem as anotações do coach. O link do Meet só vem em videochamada.
import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuth } from '@/lib/auth';
import { upcomingForStudent, isMissingTable } from '@/lib/agendaStore';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  try {
    const auth = requireAuth(req);
    if ('response' in auth) return auth.response;
    return NextResponse.json({ events: await upcomingForStudent(prisma, auth.user.id) });
  } catch (e: any) {
    // tabela ainda não criada: o aluno simplesmente não vê nada
    if (isMissingTable(e)) return NextResponse.json({ events: [] });
    console.error('Erro ao ler a agenda do aluno:', e);
    return NextResponse.json({ error: 'Erro ao carregar a agenda.' }, { status: 500 });
  }
}
