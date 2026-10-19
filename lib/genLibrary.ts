// lib/genLibrary.ts
// 📚 (19 out 2026) A biblioteca de exercícios que a geração de treino enxerga para um coach + ambiente de treino. Extraído de lib/ai/workoutGen.ts SEM mudar o comportamento,
// para a prévia dos filtros (app/api/gen-prefs/preview) contar exatamente os mesmos exercícios que a IA vai receber.
//   • ambiente: só exercícios do ambiente (ou UNIVERSAL); sem ambiente/UNIVERSAL = todos;
//   • coach: os próprios; a Adri enxerga também os do master (lista base compartilhada).
import { effectiveEnvironments } from '@/lib/genRules';
type Db = any;

export const GEN_LIBRARY_SELECT = { id: true, name: true, category: true, subCategory: true, videoUrl: true, tags: true, environments: true, defaultSubstitutes: true } as const;

export interface GenLibRow { id: string; name: string; category: string; subCategory: string | null; videoUrl: string | null; tags: any; environments: string[]; defaultSubstitutes: string[] }

export async function loadAdminLibrary(db: Db, adminId: string, trainingEnv: string | null | undefined, includeEnvironments?: string[] | null): Promise<GenLibRow[]> {
  // 🏢 (19 out 2026) o coach pode escolher de quais LOCAIS vêm os exercícios (filtros do Protocolo ELITE); sem escolha, vale o de sempre: Universal + o local do aluno
  const envs = effectiveEnvironments({ includeEnvironments: includeEnvironments || [] }, trainingEnv);
  const envFilter = envs ? { hasSome: envs } : undefined;
  const currentAdmin = await db.user.findUnique({ where: { id: adminId }, select: { email: true } });
  const isAdri = currentAdmin?.email?.toLowerCase() === 'adri.personal@hotmail.com';
  let coachFilter: any = { coachId: adminId };
  if (isAdri) {
    const masterAdmin = await db.user.findFirst({ where: { role: 'ADMIN', email: { not: 'adri.personal@hotmail.com' } }, select: { id: true } });
    if (masterAdmin) coachFilter = { OR: [{ coachId: adminId }, { coachId: masterAdmin.id }] };
  }
  return db.exercise.findMany({
    where: { ...coachFilter, ...(envFilter ? { environments: envFilter } : {}) },
    select: GEN_LIBRARY_SELECT,
    orderBy: { name: 'asc' },
  });
}
