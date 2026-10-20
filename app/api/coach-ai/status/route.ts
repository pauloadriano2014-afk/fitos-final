// app/api/coach-ai/status/route.ts
// 🤖 (20 out 2026) GET ?kind=treino|dieta[&userId=<aluno>] -> o que o app mostra no "ANTES DE GERAR":
//   { master, kind, allowed, code?, reason?, usage: { used, limit, left, resetsOn } | null, readiness: { ok, blockers[], warnings[] } | null, tips[] }
// `allowed` = a chave está ligada, o plano cobre e ainda há saldo no mês. `readiness` só vem com `userId` (a anamnese e a biblioteca dão base para gerar bem?).
// Para a dieta a anamnese vem da própria ficha do aluno. Só lê: não gasta IA.
import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuth, canAccessStudent } from '@/lib/auth';
import { checkCoachAi, dietReadiness, workoutReadiness } from '@/lib/coachAi';

export const dynamic = 'force-dynamic';

const TIPS: Record<'treino' | 'dieta', string[]> = {
  treino: [
    'A IA monta um RASCUNHO: leia dia por dia e ajuste antes de salvar. Quem assina o treino é você.',
    'Quanto mais completa a anamnese (objetivo, nível, lesões, equipamentos), melhor o treino. Revise-a antes de gerar.',
    'Escolha o local certo (academia, casa, condomínio) e só os grupos que o aluno vai treinar.',
    'Aluno com dor ou cirurgia: confira cada exercício e troque o que não for adequado.',
    'Se o resultado vier estranho, não gere de novo no escuro: ajuste os filtros ou monte o dia à mão.',
  ],
  dieta: [
    'A IA monta um RASCUNHO: confira calorias, macros e cada refeição antes de enviar ao aluno.',
    'Peso, altura e objetivo corretos na anamnese são a base das calorias. Se estiverem errados, a dieta toda erra.',
    'Gere uma aba por vez (dia de treino, de descanso) e revise antes de gerar a próxima.',
    'Aluno com condição de saúde, remédio ou cirurgia: a IA não substitui o seu julgamento. Revise tudo.',
    'Troque o que o aluno não come ou não gosta; a lista de favoritos ajuda a IA a acertar.',
  ],
};

export async function GET(req: Request) {
  try {
    const auth = requireAuth(req);
    if ('response' in auth) return auth.response;
    const url = new URL(req.url);
    const kind = url.searchParams.get('kind') === 'dieta' ? 'dieta' : 'treino';
    const userId = url.searchParams.get('userId');

    const gate = await checkCoachAi(prisma, auth.user, kind);
    const base: any = { kind, tips: TIPS[kind] };
    if (!gate.ok) {
      Object.assign(base, { master: false, allowed: false, code: gate.body.code, reason: gate.body.error, usage: gate.body.limit != null ? { used: gate.body.used, limit: gate.body.limit, left: 0, resetsAt: gate.body.resetsAt } : null });
      if (gate.status === 401) return NextResponse.json(base, { status: 401 });
    } else {
      Object.assign(base, { master: gate.master, allowed: true, usage: gate.usage });
    }

    base.readiness = null;
    if (userId && !(gate.ok && gate.master)) {
      const stu: any = await prisma.user.findUnique({ where: { id: userId }, select: { coachId: true, anamneses: { orderBy: { createdAt: 'desc' }, take: 1 } } as any });
      if (!stu || !canAccessStudent(auth.user, userId, stu.coachId)) return NextResponse.json({ error: 'Acesso negado' }, { status: 403 });
      const anamnese = stu.anamneses?.[0] || null;
      if (kind === 'treino') {
        const libraryCount = await prisma.exercise.count({ where: { coachId: auth.user.id } });
        const hasPreviousWorkout = (await prisma.workout.count({ where: { userId } })) > 0;
        base.readiness = workoutReadiness({ anamnese, libraryCount, hasPreviousWorkout });
      } else {
        base.readiness = dietReadiness(anamnese);
      }
    }
    return NextResponse.json(base);
  } catch (e: any) {
    console.error('[GET /api/coach-ai/status]', e);
    return NextResponse.json({ error: 'Não foi possível conferir agora.' }, { status: 500 });
  }
}
