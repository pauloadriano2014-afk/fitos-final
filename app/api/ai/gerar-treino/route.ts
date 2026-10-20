// app/api/ai/gerar-treino/route.ts
// (3 out 2026) O motor de geração (banco de exercícios, prompt, chamada da IA, validação) mora em lib/ai/workoutGen.ts, compartilhado com o plano
// automático do aluno. Esta rota ficou só com a autenticação e as travas de acesso.
import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, canAccessStudent, canActAsCoach } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { checkCoachAi, gateResponse, workoutReadiness } from '@/lib/coachAi';
import { generateWorkoutPlan } from '@/lib/ai/workoutGen';

export async function POST(req: NextRequest) {
  try {
    const auth = requireAuth(req);
    if ('response' in auth) return auth.response;
    // 🔒 Montagem por IA: time master sempre; coach parceiro só com a chave `iaTreino` ligada pelo master, dentro do limite do mês (lib/coachAi.ts).
    const gate = await checkCoachAi(prisma, auth.user, 'treino');
    if (!gate.ok) return gateResponse(gate);

    const body = await req.json();
    const { userId, adminId, cycleConfig } = body;

    if (!userId || !adminId) {
      return NextResponse.json({ error: 'userId e adminId obrigatórios' }, { status: 400 });
    }

    if (!canActAsCoach(auth.user, adminId)) {
      return NextResponse.json({ error: 'Acesso negado' }, { status: 403 });
    }

    // 🧭 Coach parceiro: só gera se a anamnese e a biblioteca derem base para um treino bom (o app mostra o mesmo checklist antes, em /api/coach-ai/status).
    if (!gate.master) {
      const stu: any = await prisma.user.findUnique({ where: { id: userId }, select: { coachId: true, anamneses: { orderBy: { createdAt: 'desc' }, take: 1 } } as any });
      if (!stu || !canAccessStudent(auth.user, userId, stu.coachId)) return NextResponse.json({ error: 'Acesso negado' }, { status: 403 });
      const libraryCount = await prisma.exercise.count({ where: { coachId: adminId } });
      const ready = workoutReadiness({ anamnese: stu.anamneses?.[0] || null, libraryCount });
      if (!ready.ok) return NextResponse.json({ error: ready.blockers[0], code: 'NAO_PRONTO', blockers: ready.blockers, warnings: ready.warnings }, { status: 422 });
    }

    const result = await generateWorkoutPlan({
      userId, adminId, cycleConfig,
      guard: (student) => canAccessStudent(auth.user, userId, student.coachId),
    });
    return NextResponse.json(result.body, { status: result.status });

  } catch (error: any) {
    console.error('[gerar-treino] erro geral:', error);
    return NextResponse.json({ error: error.message || 'Erro interno' }, { status: 500 });
  }
}
