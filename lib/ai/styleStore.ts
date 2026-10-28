// lib/ai/styleStore.ts
// 🧬 (27 out 2026) Lê do banco os treinos que um coach montou para os alunos dele e entrega no formato de lib/ai/styleProfile.ts.
// Só LEITURA: não cria tabela nem grava nada. Guarda o resultado na memória do servidor por 10 min (a conta dos ~300 treinos não precisa rodar a cada pedido).
// Por enquanto SÓ o Paulo usa (STYLE_COACH_IDS): quando der certo, a Adri e os coaches parceiros entram aqui.
import prisma from '@/lib/prisma';
import { PAULO_ID } from '@/lib/masterIds';
import { toStyleWorkout, buildStyleProfile, type StyleWorkout, type StyleProfile } from '@/lib/ai/styleProfile';

export const STYLE_COACH_IDS: readonly string[] = [PAULO_ID];
export const STYLE_COACH_NAMES: Record<string, string> = { [PAULO_ID]: 'Paulo' };
export const canUseStyle = (coachId: any): boolean => STYLE_COACH_IDS.includes(String(coachId || ''));
export const STYLE_CACHE_MS = 10 * 60 * 1000;
export const STYLE_MAX_WORKOUTS = 600;

const cache = new Map<string, { at: number; value: StyleWorkout[] }>();
export const clearStyleCache = () => cache.clear();
/** Só para teste: coloca treinos já prontos na memória (sem ir ao banco). */
export const primeStyleCache = (coachId: string, value: StyleWorkout[], at: number = Date.now()) => { cache.set(coachId, { at, value }); };

/** Os treinos do coach (mais novos primeiro), já no formato do estilo. Treino pequeno demais ou só de cardio fica de fora. */
export async function loadCoachStyleWorkouts(coachId: string, opts: { db?: any; now?: () => number; fresh?: boolean } = {}): Promise<StyleWorkout[]> {
  const db = opts.db || (prisma as any); const now = (opts.now || Date.now)();
  const hit = cache.get(coachId);
  if (!opts.fresh && hit && now - hit.at < STYLE_CACHE_MS) return hit.value;
  const rows = await db.workout.findMany({
    where: { user: { coachId } },
    orderBy: { createdAt: 'desc' },
    take: STYLE_MAX_WORKOUTS,
    select: {
      id: true, userId: true, createdAt: true, goal: true, level: true, user: { select: { gender: true } },
      exercises: { select: { exerciseId: true, day: true, order: true, sets: true, reps: true, technique: true, exercise: { select: { name: true, category: true, subCategory: true } } } },
    },
  });
  const value = (rows || []).map(toStyleWorkout).filter((w: StyleWorkout | null): w is StyleWorkout => !!w);
  cache.set(coachId, { at: now, value });
  return value;
}

/** O perfil pronto de um coach (para a tela "o que a IA entendeu"). */
export async function loadCoachStyleProfile(coachId: string, opts: { db?: any; now?: () => number; fresh?: boolean } = {}): Promise<StyleProfile> {
  return buildStyleProfile(await loadCoachStyleWorkouts(coachId, opts));
}
