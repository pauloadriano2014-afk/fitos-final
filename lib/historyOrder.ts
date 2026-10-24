// 🧭 (25 out 2026) ORDEM DO HISTÓRICO DE TREINOS. O banco devolve as linhas de `ExerciseHistory` sem ordem garantida (e quando o coach responde um comentário a linha é
// reescrita e muda de lugar), então o histórico podia mostrar a 3ª série antes da 2ª, ou um exercício fora de lugar. Aqui a lista sai SEMPRE na ordem que o coach montou:
// exercícios na ordem da ficha (WorkoutExercise.order do dia daquele treino) e, dentro de cada exercício, séries por número (1, 2, 3...) com a série principal antes da
// redução de drop-set (mesmo número, carga maior primeiro). O que não está na ficha (ficha apagada, exercício trocado) vai depois, na ordem em que apareceu.

type Row = { exerciseId?: any; setNumber?: any; weight?: any; [k: string]: any };
type PlanRow = { exerciseId?: any; day?: any; order?: any };

const num = (v: any, fallback: number) => { const n = Number(v); return Number.isFinite(n) ? n : fallback; };

/** Mapa exerciseId -> posição na ficha, só do dia pedido (dia vazio = todos os dias da ficha, na ordem). */
export function planPositions(plan: PlanRow[] | null | undefined, day: any): Map<string, number> {
  const out = new Map<string, number>();
  const d = day == null ? '' : String(day).trim().toLowerCase();
  const rows = (Array.isArray(plan) ? plan : []).filter((p) => p && p.exerciseId != null && (!d || String(p.day == null ? '' : p.day).trim().toLowerCase() === d));
  rows.slice().sort((a, b) => num(a.order, 0) - num(b.order, 0)).forEach((p) => { const k = String(p.exerciseId); if (!out.has(k)) out.set(k, out.size); });
  return out;
}

/** Devolve uma cópia de `details` na ordem do coach (estável: empate mantém a ordem original). */
export function orderHistoryDetails<T extends Row>(details: T[] | null | undefined, positions?: Map<string, number> | null): T[] {
  const list = Array.isArray(details) ? details.slice() : [];
  const first = new Map<string, number>();   // 1ª aparição de cada exercício (para o que não está na ficha)
  list.forEach((d, i) => { const k = String(d && d.exerciseId != null ? d.exerciseId : ''); if (!first.has(k)) first.set(k, i); });
  const pos = (d: T) => { const k = String(d && d.exerciseId != null ? d.exerciseId : ''); const p = positions ? positions.get(k) : undefined; return p !== undefined ? p : 1e6 + (first.get(k) ?? 0); };
  return list.map((d, i) => ({ d, i })).sort((a, b) => {
    const pa = pos(a.d), pb = pos(b.d); if (pa !== pb) return pa - pb;
    const sa = num(a.d.setNumber, 1e6), sb = num(b.d.setNumber, 1e6); if (sa !== sb) return sa - sb;
    const wa = num(a.d.weight, 0), wb = num(b.d.weight, 0); if (wa !== wb) return wb - wa;   // principal (carga maior) antes da redução do drop-set
    return a.i - b.i;
  }).map((x) => x.d);
}
