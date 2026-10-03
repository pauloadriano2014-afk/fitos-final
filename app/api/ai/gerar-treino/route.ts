// app/api/ai/gerar-treino/route.ts
// (3 out 2026) O motor de geração (banco de exercícios, prompt, chamada da IA, validação) mora em lib/ai/workoutGen.ts, compartilhado com o plano
// automático do aluno. Esta rota ficou só com a autenticação e as travas de acesso.
import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, canAccessStudent, canActAsCoach } from '@/lib/auth';
import { canUseAiBuilder, aiBuilderLocked } from '@/lib/aiAccess';
import { generateWorkoutPlan } from '@/lib/ai/workoutGen';

export async function POST(req: NextRequest) {
  try {
    const auth = requireAuth(req);
    if ('response' in auth) return auth.response;
    // 🔒 Montagem por IA só pro time master (a criação por voz continua liberada pros parceiros).
    if (!canUseAiBuilder(auth.user)) return aiBuilderLocked();

    const body = await req.json();
    const { userId, adminId, cycleConfig } = body;

    if (!userId || !adminId) {
      return NextResponse.json({ error: 'userId e adminId obrigatórios' }, { status: 400 });
    }

    if (!canActAsCoach(auth.user, adminId)) {
      return NextResponse.json({ error: 'Acesso negado' }, { status: 403 });
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
