// lib/equipment.ts
// 🛠️ (9 out 2026) "Não tem esse aparelho na academia": avisos do aluno (EquipmentReport). Nada aqui apaga exercício da biblioteca nem do treino:
// o aviso só (1) chega ao coach, (2) mantém a IA longe do exercício para ESTE aluno e (3) vira alerta quando o coach monta ou importa treino para ele.
import prisma from '@/lib/prisma';

/** Avisos que valem como "este aluno não tem": em aberto ou já tratados. VOLTOU A TER / OUTRA ACADEMIA saem dos alertas (ficam só no histórico). */
export const ACTIVE_STATUS = ['OPEN', 'RESOLVED'];

const missing = (e: any) => /does not exist|P2021|P2022/i.test(String(e?.code || '') + String(e?.message || ''));

/** Ids dos exercícios que o aluno disse não ter (para a IA evitar e o app avisar). Sem a tabela criada, devolve vazio. */
export async function unavailableExerciseIds(userId: string, db: any = prisma): Promise<string[]> {
  try {
    const rows: any[] = await db.equipmentReport.findMany({ where: { userId, status: { in: ACTIVE_STATUS } }, select: { exerciseId: true } });
    return [...new Set(rows.map((r) => String(r.exerciseId)))];
  } catch (e) { if (missing(e)) return []; throw e; }
}

/**
 * Tira da biblioteca da IA os exercícios que o aluno disse não ter. Se tirar deixaria um grupo com menos de 2 exercícios, o exercício volta (treino completo vale mais
 * do que o aviso). Devolve a lista nova e os nomes realmente afastados (para o resumo do coach).
 */
export function filterUnavailable<T extends { id: string; name: string; category?: string | null; tags?: any }>(list: T[], banned: Set<string>): { list: T[]; avoided: string[] } {
  if (!banned.size) return { list, avoided: [] };
  const tgt = (ex: T) => String((ex.tags as any)?.target || ex.category || '').toUpperCase();
  const kept = list.filter((ex) => !banned.has(ex.id));
  const left = new Map<string, number>();
  kept.forEach((ex) => left.set(tgt(ex), (left.get(tgt(ex)) || 0) + 1));
  const restored = list.filter((ex) => banned.has(ex.id) && (left.get(tgt(ex)) || 0) < 2);
  return { list: [...kept, ...restored], avoided: list.filter((ex) => banned.has(ex.id) && !restored.includes(ex)).map((ex) => ex.name) };
}
