// lib/loadSuggest.ts
// 🏋️ (7 out 2026) SUGESTÃO DE CARGA: na hora de anotar a série o app mostra "Hoje tente 42 kg" quando o histórico do aluno diz que já está na hora de subir.
//
// COMO DECIDE (regras simples, sem IA, e o aluno sempre pode ignorar):
//   • O app NÃO guarda quantas repetições o aluno fez (só a carga de cada série e se ele marcou a série como feita). Por isso o gatilho é:
//       - "como foi?" que o aluno marca ao terminar o exercício: FÁCIL, NA MEDIDA ou PESADO (campo `effort`, opcional); e
//       - a CARGA REPETIDA nos 2 últimos treinos daquele exercício.
//   • FÁCIL no último treino            -> SOBE (um treino já basta).
//   • Mesma carga nos 2 últimos treinos, sem "pesado" -> SOBE (o aluno já dominou essa carga).
//   • PESADO no último treino           -> MANTÉM; PESADO nos 2 últimos com a mesma carga -> DESCE um degrau.
//   • Reduziu a carga no último treino  -> MANTÉM para firmar (a não ser que tenha marcado fácil).
//   • Mais de 6 semanas sem fazer o exercício -> MANTÉM e avisa (voltar de pausa é na mesma carga).
//   • Sem dado suficiente (1º treino, cargas diferentes) -> não sugere nada (nada de ruído na tela).
//
// O SALTO (em kg, no TOTAL): o coach escolhe (1, 2, 2,5 ou 5) ou fica AUTOMÁTICO = 5% da carga, em passos de 0,5 kg, entre 1 e 5 kg (20 kg -> 1, 40 -> 2,
// 100 -> 5). No modo "cada lado" o salto é sempre um número inteiro de kg no total (assim cada lado muda de 0,5 em 0,5 kg). `weight` do histórico é SEMPRE o
// TOTAL (ver exerciseLoad.ts); o app converte para "cada lado" na hora de mostrar.
//
// Este arquivo é PURO (sem banco): recebe o histórico já lido e devolve a sugestão. O texto que o aluno lê é montado no app (a partir de `reason`).

export const EFFORTS = ['FACIL', 'OK', 'PESADO'] as const;
export type Effort = (typeof EFFORTS)[number];

/** Saltos que o coach pode escolher (kg, no total). `null` = automático. */
export const ALLOWED_STEPS = [1, 2, 2.5, 5];
/** Dias sem fazer o exercício a partir dos quais não se sobe (volta de pausa). */
export const LONG_BREAK_DAYS = 42;
const SAME_TOLERANCE = 0.01;

export type Action = 'UP' | 'HOLD' | 'DOWN';
export type Reason = 'EASY' | 'REPEATED' | 'HEAVY' | 'HEAVY_TWICE' | 'REDUCED' | 'BREAK';

export type SessionSet = { setNumber: number; weight: number; perSide: boolean };
export type Session = { date: Date | string; sets: SessionSet[]; effort: Effort | null };

export type Suggestion = {
    action: Action;
    reason: Reason;
    /** Salto usado (kg, total). */
    step: number;
    /** Maior carga do último treino e a carga sugerida para ela (kg, total). */
    from: number;
    to: number;
    /** A última anotação foi "cada lado"? (o app abre o exercício nesse modo; aqui só informa) */
    perSide: boolean;
    /** Dias desde o último treino com este exercício. */
    daysSince: number;
    /** Carga sugerida por série (número da série -> kg total). */
    loads: Record<number, number>;
};

type DetailRow = {
    exerciseId: string; setNumber: number; weight: number;
    perSide?: boolean | null; effort?: string | null;
    cardioSeconds?: number | null; cardioKcal?: number | null;
};
type HistoryRow = { date: Date | string; details?: DetailRow[] | null };

/** Resposta do aluno em "como foi?": só FACIL / OK / PESADO valem (qualquer outra coisa = sem resposta). */
export function cleanEffort(v: unknown): Effort | null {
    const s = String(v ?? '').trim().toUpperCase();
    return (EFFORTS as readonly string[]).includes(s) ? (s as Effort) : null;
}

/** Salto escolhido pelo coach: só os valores permitidos (aceita vírgula); qualquer outra coisa = automático (null). */
export function cleanStep(v: unknown): number | null {
    if (v === null || v === undefined || v === '') return null;
    const n = parseFloat(String(v).replace(',', '.'));
    return ALLOWED_STEPS.includes(n) ? n : null;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Salto automático (kg total) para uma carga: 5% em passos de 0,5 kg, entre 1 e 5 (cada lado: número inteiro). */
export function autoStep(load: number, perSide: boolean): number {
    const raw = Math.round((Math.max(0, load) * 0.05) / 0.5) * 0.5;
    const step = Math.min(5, Math.max(1, raw));
    return perSide ? Math.max(1, Math.round(step)) : step;
}

/** Ajusta uma carga total ao que existe na academia: meio quilo (cada lado: número inteiro no total, ou seja, meio quilo em cada lado). */
export function snapLoad(total: number, perSide: boolean): number {
    const unit = perSide ? 1 : 0.5;
    return round2(Math.round(total / unit) * unit);
}

/** Treinos de UM exercício a partir do histórico (do mais novo para o mais velho, como o banco devolve). Só entram treinos com carga > 0; cardio nunca. */
export function sessionsOf(history: HistoryRow[], exerciseId: string): Session[] {
    const out: Session[] = [];
    for (const h of history || []) {
        const rows = (h.details || []).filter((d) => d.exerciseId === exerciseId);
        if (rows.length === 0) continue;
        if (rows.some((d) => d.cardioSeconds != null || d.cardioKcal != null)) return [];   // é cardio: peso aqui são minutos
        const sets = rows
            .filter((d) => Number(d.weight) > 0)
            .map((d) => ({ setNumber: d.setNumber, weight: Number(d.weight), perSide: d.perSide === true }))
            .sort((a, b) => a.setNumber - b.setNumber);
        if (sets.length === 0) continue;
        out.push({ date: h.date, sets, effort: cleanEffort(rows.find((d) => cleanEffort(d.effort))?.effort) });
    }
    return out;
}

const topOf = (s: Session) => Math.max(...s.sets.map((x) => x.weight));

/** As séries que os dois treinos têm em comum usaram a mesma carga? (precisa haver pelo menos uma em comum) */
function sameLoads(a: Session, b: Session): boolean {
    const byB = new Map(b.sets.map((s) => [s.setNumber, s.weight]));
    let common = 0;
    for (const s of a.sets) {
        if (!byB.has(s.setNumber)) continue;
        common++;
        if (Math.abs(byB.get(s.setNumber)! - s.weight) > SAME_TOLERANCE) return false;
    }
    return common > 0;
}

const daysBetween = (now: Date, date: Date | string) => {
    const t = new Date(date).getTime();
    return Number.isFinite(t) ? Math.max(0, Math.floor((now.getTime() - t) / 86400000)) : 0;
};

/**
 * A sugestão para o próximo treino deste exercício, ou null quando não há nada a dizer.
 * `sessions` = treinos do exercício, do mais novo para o mais velho (ver sessionsOf). `step` = salto fixo do coach (null = automático).
 */
export function suggestLoad(sessions: Session[], opts: { now?: Date; step?: number | null } = {}): Suggestion | null {
    const last = sessions[0];
    if (!last || last.sets.length === 0) return null;
    const prev = sessions[1];
    const now = opts.now || new Date();

    const perSide = last.sets.every((s) => s.perSide);
    const from = topOf(last);
    const step = cleanStep(opts.step) ?? autoStep(from, perSide);
    const daysSince = daysBetween(now, last.date);

    const make = (action: Action, reason: Reason, delta: number): Suggestion => {
        const loads: Record<number, number> = {};
        // descer nunca zera uma série leve (ex.: aquecimento de 1 kg numa pirâmide): se não sobra carga depois do degrau, ela fica como estava
        for (const s of last.sets) loads[s.setNumber] = snapLoad(s.weight + delta > 0 ? s.weight + delta : s.weight, perSide);
        return { action, reason, step, from, to: snapLoad(Math.max(0, from + delta), perSide), perSide, daysSince, loads };
    };

    if (daysSince > LONG_BREAK_DAYS) return make('HOLD', 'BREAK', 0);

    const same = !!prev && sameLoads(last, prev);
    const reduced = !!prev && from < topOf(prev) - SAME_TOLERANCE;

    if (last.effort === 'PESADO') {
        // desce um degrau só quando sobra carga (nunca sugere 0 kg)
        if (prev && prev.effort === 'PESADO' && same && from - step > 0) return make('DOWN', 'HEAVY_TWICE', -step);
        return make('HOLD', 'HEAVY', 0);
    }
    if (last.effort === 'FACIL') return make('UP', 'EASY', step);
    if (reduced) return make('HOLD', 'REDUCED', 0);
    if (prev && same && prev.effort !== 'PESADO') return make('UP', 'REPEATED', step);
    return null;
}

/** Sugestões de vários exercícios de uma vez: { exerciseId -> sugestão }, só dos que têm algo a dizer. */
export function buildLoadSuggestions(
    history: HistoryRow[],
    exerciseIds: string[],
    opts: { now?: Date; step?: number | null } = {},
): Record<string, Suggestion> {
    const out: Record<string, Suggestion> = {};
    for (const id of new Set(exerciseIds.filter(Boolean))) {
        const sug = suggestLoad(sessionsOf(history, id), opts);
        if (sug) out[id] = sug;
    }
    return out;
}
