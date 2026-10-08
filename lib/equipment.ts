// lib/equipment.ts
// 🛠️ (9 out 2026) "Não tem esse aparelho na academia": avisos do aluno (EquipmentReport) e sugestões de substituto. Nada aqui apaga exercício da biblioteca nem do treino:
// o aviso só (1) chega ao coach, (2) mantém a IA longe do exercício para ESTE aluno e (3) vira alerta quando o coach monta ou importa treino para ele.
import prisma from '@/lib/prisma';

/** Avisos que valem como "este aluno não tem": em aberto ou já tratados. VOLTOU A TER / OUTRA ACADEMIA saem dos alertas (ficam só no histórico). */
export const ACTIVE_STATUS = ['OPEN', 'RESOLVED'];
export type Substitute = { id: string; name: string; category: string | null; videoUrl: string | null; source: 'COACH' | 'PADRAO' | 'PARECIDO' };

const missing = (e: any) => /does not exist|P2021|P2022/i.test(String(e?.code || '') + String(e?.message || ''));

/** Ids dos exercícios que o aluno disse não ter (para a IA evitar e o app avisar). Sem a tabela criada, devolve vazio. */
export async function unavailableExerciseIds(userId: string, db: any = prisma): Promise<string[]> {
  try {
    const rows: any[] = await db.equipmentReport.findMany({ where: { userId, status: { in: ACTIVE_STATUS } }, select: { exerciseId: true } });
    return [...new Set(rows.map((r) => String(r.exerciseId)))];
  } catch (e) { if (missing(e)) return []; throw e; }
}

const FILLER = new Set(['no', 'na', 'nos', 'nas', 'com', 'c', 'de', 'do', 'da', 'o', 'a', 'e', 'em']);
const TWO_WORD = new Set(['leg', 'mesa', 'cadeira', 'supino', 'rosca', 'remada', 'puxada', 'crucifixo', 'desenvolvimento', 'elevacao', 'agachamento', 'triceps', 'pulldown', 'stiff', 'levantamento']);
/** "Família" do exercício pelo nome: "Afundo c/halteres" e "Afundo no Smith" são "afundo"; "Leg press 45°" e "Leg press horizontal" são "leg press". Serve só para não repetir o mesmo movimento no dia. */
export function familyKey(name: any): string {
  const t = String(name || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().split(/[^a-z0-9]+/).filter((w) => w && !FILLER.has(w) && !/\d/.test(w));
  if (!t.length) return '';
  return TWO_WORD.has(t[0]) && t[1] ? `${t[0]} ${t[1]}` : t[0];
}
/** Famílias dos OUTROS exercícios do mesmo dia da ficha (o exercício que falta não conta). Sem ficha/dia, vazio. */
async function familiesInDay(o: { exerciseId: string; workoutExerciseId?: string | null; workoutId?: string | null; day?: string | null }, db: any): Promise<Set<string>> {
  const fams = new Set<string>();
  if (!o.workoutId || !o.day) return fams;
  try {
    const rows: any[] = await db.workoutExercise.findMany({ where: { workoutId: o.workoutId, day: o.day }, select: { id: true, exerciseId: true } });
    const others = rows.filter((r) => r.id !== o.workoutExerciseId && r.exerciseId !== o.exerciseId);
    if (!others.length) return fams;
    const names: any[] = await db.exercise.findMany({ where: { id: { in: others.map((r) => r.exerciseId) } }, select: { id: true, name: true } });
    names.forEach((n) => { const k = familyKey(n.name); if (k) fams.add(k); });
  } catch (e) { if (!missing(e)) console.error('[equipment] famílias do dia:', (e as any)?.message || e); }
  return fams;
}

/**
 * Até `limit` alternativas para o aluno fazer HOJE, em ordem de confiança: as que o coach já cadastrou nesse cartão, as padrão do exercício e, só se faltar,
 * exercícios parecidos (mesma categoria/subcategoria) da biblioteca. Nunca sugere um exercício que o próprio aluno também disse não ter.
 */
export async function suggestSubstitutes(o: { exerciseId: string; workoutExerciseId?: string | null; workoutId?: string | null; day?: string | null; userId: string; coachId?: string | null; limit?: number }, db: any = prisma): Promise<Substitute[]> {
  const limit = o.limit ?? 3;
  const banned = new Set<string>([o.exerciseId, ...(await unavailableExerciseIds(o.userId, db))]);
  const inDay = await familiesInDay(o, db);   // o treino do dia já tem "Afundo": não sugerir "Afundo com halteres" (ficaria repetido)
  const out: Substitute[] = [];
  const take = async (ids: string[], source: Substitute['source']) => {
    const want = ids.filter((id) => id && !banned.has(String(id)) && !out.some((x) => x.id === String(id)));
    if (!want.length || out.length >= limit) return;
    const rows: any[] = await db.exercise.findMany({ where: { id: { in: want } }, select: { id: true, name: true, category: true, videoUrl: true } });
    for (const id of want) {
      const r = rows.find((x) => x.id === id); if (!r || out.length >= limit) continue;
      const fam = familyKey(r.name);
      if (fam && (inDay.has(fam) || out.some((x) => familyKey(x.name) === fam))) continue;
      out.push({ id: r.id, name: r.name, category: r.category ?? null, videoUrl: r.videoUrl ?? null, source });
    }
  };
  if (o.workoutExerciseId) {
    const we: any = await db.workoutExercise.findUnique({ where: { id: o.workoutExerciseId }, select: { substitutes: true, substituteId: true } }).catch(() => null);
    if (we) await take([...(we.substitutes || []), ...(we.substituteId ? [we.substituteId] : [])].map(String), 'COACH');
  }
  const ex: any = await db.exercise.findUnique({ where: { id: o.exerciseId }, select: { id: true, category: true, subCategory: true, defaultSubstitutes: true, coachId: true } }).catch(() => null);
  if (ex) await take((ex.defaultSubstitutes || []).map(String), 'PADRAO');
  if (ex && out.length < limit && ex.category) {
    const like: any[] = await db.exercise.findMany({ where: { category: ex.category, ...(ex.coachId ? { coachId: ex.coachId } : {}), id: { notIn: [...banned] } }, select: { id: true, name: true, category: true, subCategory: true, videoUrl: true }, orderBy: { name: 'asc' }, take: 60 });
    like.sort((a, b) => Number(b.subCategory === ex.subCategory) - Number(a.subCategory === ex.subCategory));
    await take(like.map((x) => x.id), 'PARECIDO');
  }
  return out;
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
