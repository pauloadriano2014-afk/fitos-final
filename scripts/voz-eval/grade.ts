// scripts/voz-eval/grade.ts
// Corretor PROGRAMÁTICO (sem IA julgando IA): compara o resultado FINAL que o
// pipeline de produção montou a partir da resposta do modelo com o resultado
// esperado (montado pelo mesmo pipeline a partir da resposta "ideal").
//
// O que é comparado, por exercício, na ordem falada:
//   - qual exercício da biblioteca foi escolhido (id);
//   - por bloco: séries, repetições, descanso e técnica.
// Cardio: o app troca os blocos pelo padrão, então só o exercício conta.
import type { ReviewItem } from '../../lib/voiceWorkout/pipeline';

export type FieldTally = { total: number; ok: number };

export type CaseGrade = {
  pass: boolean;
  countOk: boolean;
  expectedCount: number;
  actualCount: number;
  name: FieldTally;   // exercício certo
  sets: FieldTally;
  reps: FieldTally;
  rest: FieldTally;
  tech: FieldTally;
  diffs: string[];    // divergências legíveis, para auditoria
};

const tally = (): FieldTally => ({ total: 0, ok: 0 });
const isCardio = (it: ReviewItem) => String(it.match?.category || '').toUpperCase() === 'CARDIO';

export function gradeCase(actual: ReviewItem[], expected: ReviewItem[]): CaseGrade {
  const g: CaseGrade = {
    pass: false,
    countOk: actual.length === expected.length,
    expectedCount: expected.length,
    actualCount: actual.length,
    name: tally(), sets: tally(), reps: tally(), rest: tally(), tech: tally(),
    diffs: [],
  };
  if (!g.countOk) g.diffs.push(`nº de exercícios: esperado ${expected.length}, veio ${actual.length}`);

  let allBlocksOk = true;
  let allNamesOk = true;

  expected.forEach((exp, i) => {
    const act = actual[i];
    g.name.total++;
    const nameOk = !!act && (act.match?.exerciseId ?? null) === (exp.match?.exerciseId ?? null);
    if (nameOk) g.name.ok++; else {
      allNamesOk = false;
      g.diffs.push(`#${i + 1} exercício: esperado "${exp.match?.name}", veio "${act?.match?.name ?? act?.spoken ?? '—'}"`);
    }

    if (isCardio(exp)) return; // blocos de cardio não entram na nota

    const eb = exp.blocks;
    const ab = act?.blocks || [];
    eb.forEach((e) => { g.sets.total++; g.reps.total++; g.rest.total++; g.tech.total++; });

    if (!act || ab.length !== eb.length) {
      allBlocksOk = false;
      g.diffs.push(`#${i + 1} blocos: esperado ${eb.length} (${eb.map(fmt).join(' + ')}), veio ${ab.length} (${ab.map(fmt).join(' + ') || '—'})`);
      return;
    }
    eb.forEach((e, k) => {
      const a = ab[k];
      if (a.sets === e.sets) g.sets.ok++;
      if (a.reps === e.reps) g.reps.ok++;
      if (a.restTime === e.restTime) g.rest.ok++;
      if (a.technique === e.technique) g.tech.ok++;
      if (fmt(a) !== fmt(e)) {
        allBlocksOk = false;
        g.diffs.push(`#${i + 1} bloco ${k + 1}: esperado ${fmt(e)}, veio ${fmt(a)}`);
      }
    });
  });

  g.pass = g.countOk && allNamesOk && allBlocksOk;
  return g;
}

export const fmt = (b: { sets: string; reps: string; restTime: string; technique: string }) =>
  `${b.sets}x${b.reps}${b.technique ? `[${b.technique}]` : ''}/${b.restTime}s`;

/** Intervalo de confiança de Wilson (95%) para uma taxa de acerto. */
export function wilson(ok: number, n: number): { p: number; lo: number; hi: number } {
  if (n === 0) return { p: 0, lo: 0, hi: 0 };
  const z = 1.96, p = ok / n;
  const d = 1 + (z * z) / n;
  const c = p + (z * z) / (2 * n);
  const m = z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n));
  return { p, lo: Math.max(0, (c - m) / d), hi: Math.min(1, (c + m) / d) };
}
