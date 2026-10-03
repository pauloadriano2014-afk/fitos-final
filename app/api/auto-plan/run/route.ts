// app/api/auto-plan/run/route.ts
// 🤖 (3 out 2026) O coach (time master) dispara ou refaz a montagem automática do plano de um aluno de FICHA_8S / CHALLENGE_21.
// Uso: aluno que ficou sem plano (IA falhou 3 vezes) ou que o coach quer remontar. `force` cria uma nova corrida mesmo que a anterior tenha dado certo
// (o treino antigo é arquivado quando o novo entra; a dieta antiga fica inativa).
import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuth, canAccessStudent } from '@/lib/auth';
import { canUseAiBuilder, aiBuilderLocked } from '@/lib/aiAccess';
import { startAutoPlan } from '@/lib/autoPlan';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  try {
    const auth = requireAuth(req);
    if ('response' in auth) return auth.response;
    // 🔒 Montagem por IA só pro time master (é o que custa); o aluno não dispara por aqui.
    if (!canUseAiBuilder(auth.user)) return aiBuilderLocked();

    const { userId, force } = await req.json();
    if (!userId) return NextResponse.json({ error: 'userId obrigatório.' }, { status: 400 });

    const target = await prisma.user.findUnique({ where: { id: String(userId) }, select: { coachId: true } });
    if (!target) return NextResponse.json({ error: 'Aluno não encontrado.' }, { status: 404 });
    if (!canAccessStudent(auth.user, String(userId), target.coachId)) {
      return NextResponse.json({ error: 'Acesso negado.' }, { status: 403 });
    }

    const result = await startAutoPlan(String(userId), { force: force === true });
    return NextResponse.json(result);
  } catch (error: any) {
    console.error('[POST /api/auto-plan/run]', error);
    return NextResponse.json({ error: 'Erro ao iniciar o plano automático.' }, { status: 500 });
  }
}
