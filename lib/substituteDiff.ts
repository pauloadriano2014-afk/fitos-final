// lib/substituteDiff.ts
// 🔁 (16 out 2026) "O coach acrescentou opções de troca (substitutos) a um exercício": a comparação antes/depois do treino (lib/workoutDiff.ts) NÃO enxerga isso (só séries, descanso, técnica,
// exercício que entrou/saiu), então a aluna nunca era avisada. Aqui só olhamos os substitutos: função pura (sem banco), no mesmo formato de linha do Montar treino.
export interface SubRow { exerciseId: string; day?: string | null; substitutes?: string[] | null }
export interface SubstituteAdded { exerciseId: string; exercise: string; day: string; added: string[]; addedIds: string[] }

const norm = (s: any) => String(s ?? '').trim().toUpperCase();
const key = (r: SubRow, n: number) => `${norm(r.day)}|${r.exerciseId}|${n}`;   // n = ocorrência (o mesmo exercício duas vezes no dia)
const ids = (r: SubRow | undefined): string[] => (r && Array.isArray(r.substitutes) ? r.substitutes.map((x) => String(x)).filter(Boolean) : []);

function index(rows: SubRow[]): Map<string, SubRow> {
  const seen = new Map<string, number>(); const out = new Map<string, SubRow>();
  for (const r of rows || []) {
    const base = `${norm(r.day)}|${r.exerciseId}`; const n = seen.get(base) || 0; seen.set(base, n + 1);
    out.set(key(r, n), r);
  }
  return out;
}

/**
 * Substitutos que PASSARAM a existir em exercícios que JÁ estavam na ficha. Exercício novo na ficha não conta (isso é "Incluí X", outro aviso).
 * `names` = id do exercício -> nome (para o texto ao aluno). Só devolve exercícios com algo novo; a ordem é a da ficha.
 */
export function diffSubstitutes(before: SubRow[], after: SubRow[], names: Record<string, string> = {}): SubstituteAdded[] {
  const B = index(before); const out: SubstituteAdded[] = [];
  for (const [k, a] of index(after)) {
    const b = B.get(k); if (!b) continue;
    const had = new Set(ids(b));
    const addedIds = [...new Set(ids(a).filter((id) => !had.has(id)))];
    if (!addedIds.length) continue;
    out.push({ exerciseId: a.exerciseId, exercise: names[a.exerciseId] || 'exercício', day: String(a.day ?? '').trim() || 'Treino', added: addedIds.map((id) => names[id] || 'outro exercício'), addedIds });
  }
  return out;
}
