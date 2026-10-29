// lib/repsDone.ts
// 🔢 (29 out 2026) REPETIÇÕES FEITAS: o aluno passa a anotar quantas repetições fez em cada série (além da carga). `ExerciseHistory.reps` segue sendo a META do coach
// (texto, ex.: "12" ou "8-10"); `ExerciseHistory.repsDone` é o que o aluno fez (número) e fica nulo quando ele não mexeu no campo (app antigo, ou "fez o combinado").
// Nulo NUNCA vira zero: sem dado, a sugestão de carga e o histórico agem como antes.

/** O que o app mandou -> número inteiro de 1 a 300, ou null (vazio, texto, zero, negativo, absurdo). */
export function cleanRepsDone(v: unknown): number | null {
    if (v === null || v === undefined || v === '' || typeof v === 'boolean') return null;
    const n = typeof v === 'number' ? v : parseInt(String(v).replace(/[^0-9-]/g, ''), 10);
    if (!Number.isFinite(n)) return null;
    const i = Math.round(n);
    return i >= 1 && i <= 300 ? i : null;
}

/** A meta do coach em texto ("12", "8-10", "10 a 12", "12 cada lado") -> { min, max }. Sem número legível = null. */
export function targetRange(reps: unknown): { min: number; max: number } | null {
    const nums = (String(reps ?? '').match(/\d+/g) || []).map((x) => parseInt(x, 10)).filter((n) => Number.isFinite(n) && n > 0 && n <= 300);
    if (nums.length === 0) return null;
    const first = nums[0];
    const second = nums.length > 1 ? nums[1] : first;
    // "8-10" / "8 a 10": faixa; "12 cada lado", "4+4+4": usa o primeiro número como meta
    const isRange = nums.length > 1 && /^\s*\d+\s*(-|–|a|à|ate|até)\s*\d+/i.test(String(reps));
    return isRange ? { min: Math.min(first, second), max: Math.max(first, second) } : { min: first, max: first };
}

export type RepsRow = { setNumber: number; weight: number; reps?: string | null; repsDone?: number | null };

/**
 * Como foram as repetições de UM treino do exercício? Só olha a linha principal de cada série (a de maior carga) e só as séries em que o aluno informou o número.
 * hitAll = bateu o topo da meta em todas elas; missed = ficou abaixo do mínimo da meta em metade ou mais delas; known = quantas séries tinham número e meta.
 */
export function repsVerdict(rows: RepsRow[]): { known: number; hitAll: boolean; missed: boolean } {
    const bySet = new Map<number, RepsRow>();
    for (const r of rows || []) {
        const cur = bySet.get(r.setNumber);
        if (!cur || Number(r.weight) > Number(cur.weight)) bySet.set(r.setNumber, r);
    }
    let known = 0; let hit = 0; let below = 0;
    bySet.forEach((r) => {
        const done = cleanRepsDone(r.repsDone);
        const t = targetRange(r.reps);
        if (done === null || !t) return;
        known++;
        if (done >= t.max) hit++;
        if (done < t.min) below++;
    });
    return { known, hitAll: known > 0 && hit === known, missed: known > 0 && below * 2 >= known };
}
