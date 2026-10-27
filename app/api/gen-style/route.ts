// app/api/gen-style/route.ts
// 🧬 (27 out 2026) "O que a IA entendeu do meu estilo": o resumo do jeito do coach montar treino, calculado dos treinos que ele já fez (lib/ai/styleProfile.ts). SÓ LEITURA.
// Por enquanto só o Paulo (STYLE_COACH_IDS); os outros recebem 403 com `enabled: false`. `?fresh=1` recalcula na hora (sem usar a memória de 10 min).
// Com `?studentId=` (aluno do coach) devolve também `context`: o texto EXATO que a IA recebe para esse aluno (resumo + os treinos parecidos escolhidos); `&days=` diz quantos dias o ciclo teria.
import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuth } from '@/lib/auth';
import { canUseStyle, loadCoachStyleWorkouts, STYLE_COACH_NAMES } from '@/lib/ai/styleStore';
import { buildStyleProfile, styleProfileText, buildStyleContext } from '@/lib/ai/styleProfile';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const auth = requireAuth(req);
  if ('response' in auth) return auth.response;
  const coachId = auth.user.id;
  if (!canUseStyle(coachId)) return NextResponse.json({ enabled: false, error: 'Ainda não liberado para você.' }, { status: 403 });
  const url = new URL(req.url);
  try {
    const name = STYLE_COACH_NAMES[coachId] || 'o coach';
    const workouts = await loadCoachStyleWorkouts(coachId, { fresh: url.searchParams.get('fresh') === '1' });
    const profile = buildStyleProfile(workouts);
    const body: any = { enabled: true, coachName: name, profile, text: styleProfileText(profile, name), builtAt: new Date().toISOString() };
    const studentId = url.searchParams.get('studentId');
    if (studentId) {
      const stu: any = await (prisma as any).user.findUnique({ where: { id: studentId }, select: { id: true, coachId: true, gender: true, level: true } });
      if (!stu || stu.coachId !== coachId) return NextResponse.json({ error: 'Aluno não encontrado.' }, { status: 404 });
      const days = parseInt(url.searchParams.get('days') || '', 10);
      body.context = buildStyleContext(workouts, { gender: stu.gender || '', level: stu.level || '', goal: url.searchParams.get('goal') || '', days: Number.isFinite(days) ? days : undefined, studentId: stu.id }, { coachName: name });
    }
    return NextResponse.json(body);
  } catch (e) {
    console.error('[gen-style] erro:', e);
    return NextResponse.json({ error: 'Não consegui ler os treinos agora. Tente de novo.' }, { status: 500 });
  }
}
