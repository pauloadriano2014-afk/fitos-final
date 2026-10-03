// lib/exerciseLoad.ts
// ⚖️ (3 out 2026) CARGA DO ALUNO: "total" ou "cada lado".
//
// REGRA ÚNICA: `ExerciseHistory.weight` é SEMPRE a carga TOTAL em kg (soma dos dois lados). Quem digita "20 cada lado" manda o app já com 40 em
// `weight` + `perSide: true`. Assim tudo que já lia esse número (evolução, tonelagem, "Puxar cargas", estagnação, IA, raio-x) continua certo sem
// mudar nada, e `perSide` serve só para MOSTRAR do jeito que o aluno anotou ("20 kg cada lado") e para lembrar o modo usado da última vez.

/** Carga digitada -> número (aceita vírgula). Vazio/inválido = 0. */
export function cleanWeight(val: unknown): number {
    if (!val) return 0;
    return parseFloat(String(val).replace(',', '.')) || 0;   // igual ao que a rota sempre fez
}

/** Só `true` de verdade conta como "cada lado" (texto "false", 1, "sim"... NÃO): na dúvida é carga total, como sempre foi. */
export function isPerSide(set: unknown): boolean {
    return !!set && typeof set === 'object' && (set as { perSide?: unknown }).perSide === true;
}

/** O valor de UM lado de uma carga total (40 -> 20). Arredonda em 2 casas (22,5 continua 22,5). */
export function sideValue(totalKg: number): number {
    return Math.round((Number(totalKg) / 2) * 100) / 100;
}

/** Como mostrar a carga de uma série: "40 kg" ou "20 kg cada lado". */
export function describeLoad(totalKg: number, perSide: boolean): string {
    const fmt = (n: number) => String(n).replace('.', ',');
    return perSide ? `${fmt(sideValue(totalKg))} kg cada lado` : `${fmt(Number(totalKg))} kg`;
}

type DetailRow = { exerciseId: string; setNumber: number; weight: number; perSide?: boolean | null };
type HistoryRow = { details?: DetailRow[] | null };

/**
 * "Última carga por exercício/série" a partir do histórico (do mais novo para o mais velho, como o banco devolve): vence a mais recente.
 * `weights` segue exatamente como antes (total, em kg); `modes` diz se aquela série foi anotada "cada lado".
 */
export function buildLastLoads(history: HistoryRow[]): { weights: Record<string, Record<number, number>>; modes: Record<string, Record<number, boolean>> } {
    const weights: Record<string, Record<number, number>> = {};
    const modes: Record<string, Record<number, boolean>> = {};
    history.slice().reverse().forEach((h) => {
        (h.details || []).forEach((d) => {
            if (!weights[d.exerciseId]) { weights[d.exerciseId] = {}; modes[d.exerciseId] = {}; }
            weights[d.exerciseId][d.setNumber] = d.weight;
            modes[d.exerciseId][d.setNumber] = d.perSide === true;
        });
    });
    return { weights, modes };
}
