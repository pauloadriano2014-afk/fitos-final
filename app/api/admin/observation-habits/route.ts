// app/api/admin/observation-habits/route.ts
// 📝 (30 out 2026) Os recados (observações) que o coach MAIS repete em cada exercício, tirados dos treinos que ele montou (lib/observationHabits.ts). SÓ LEITURA.
// O Montar treino usa para já vir com o recado preenchido (hábito forte) e para sugerir os mais usados. Cada coach só enxerga os alunos dele; aluno não tem acesso.
// `?fresh=1` recalcula na hora (sem a memória de 5 min).
import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { obsMode } from '@/lib/obsOwner';
import { loadObservationHabits } from '@/lib/observationHabits';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const auth = requireAuth(req);
  if ('response' in auth) return auth.response;
  if (obsMode(auth.user) === 'NONE') return NextResponse.json({ error: 'Sem acesso.' }, { status: 403 });
  try {
    const fresh = new URL(req.url).searchParams.get('fresh') === '1';
    const habits = await loadObservationHabits(auth.user.id, { fresh });
    return NextResponse.json({ habits, builtAt: new Date().toISOString() });
  } catch (e) {
    console.error('[observation-habits] erro:', e);
    return NextResponse.json({ error: 'Não consegui ler os treinos agora.' }, { status: 500 });
  }
}
