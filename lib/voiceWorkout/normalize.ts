// lib/voiceWorkout/normalize.ts
// 🎙️ (30 set 2026) Pega o que a IA extraiu da fala e devolve BLOCOS no formato
// exato que o Montar Treino já usa: { sets, reps, restTime, technique, load }
// (tudo string, igual ao app).
//
// A IA só diz o que foi FALADO. Aqui o código:
//  - valida e limpa (a resposta da IA nunca é confiável às cegas);
//  - preenche o que faltou com padrões (GVT sozinho = 10x10, descanso = 60s...);
//  - marca em `assumed` tudo que veio de padrão, pra tela de revisão mostrar
//    "assumido" e o coach saber o que ele falou e o que foi completado.

import {
  DEFAULT_REPS, DEFAULT_REST_SECONDS, DEFAULT_SETS,
  TECH_DEFAULTS, resolveTechnique,
} from './techniques';

export type RawBlock = {
  series?: unknown;
  reps?: unknown;
  tecnica?: unknown;
  descanso_seg?: unknown;
};

export type RawExercise = {
  nome_falado?: unknown;
  blocos?: unknown;
  tecnica_geral?: unknown;
  descanso_seg?: unknown;
  observacao?: unknown;
};

export type RawParse = {
  descanso_padrao_seg?: unknown;
  exercicios?: unknown;
  avisos?: unknown;
};

export type Block = {
  sets: string;
  reps: string;
  restTime: string;
  technique: string;
  load: string;
};

export type AssumedField = 'sets' | 'reps' | 'rest';

export type NormalizedExercise = {
  spoken: string;
  blocks: Block[];
  assumed: AssumedField[];
  observation: string;
  warnings: string[];
};

const MAX_EXERCISES = 40;
const MAX_BLOCKS = 20;

function toInt(v: unknown, min: number, max: number): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = typeof v === 'number' ? v : parseInt(String(v).replace(/[^\d-]/g, ''), 10);
  if (!Number.isFinite(n)) return null;
  return Math.min(max, Math.max(min, Math.round(n)));
}

function cleanText(v: unknown, max: number): string {
  if (typeof v !== 'string') return '';
  return v.replace(/\s+/g, ' ').trim().slice(0, max);
}

/** "8 a 10", "8 à 10", "8–10" -> "8-10"; "falha" -> "Falha"; número -> "12". */
export function normalizeReps(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  if (typeof v === 'number') return Number.isFinite(v) && v > 0 ? String(Math.round(v)) : null;
  const s = String(v).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
  if (!s) return null;
  if (/falha/.test(s)) return 'Falha';
  if (/^max(imo|imas)?$/.test(s)) return 'Máx';
  const range = s.match(/^(\d{1,3})\s*(?:-|–|—|a|ate|to)\s*(\d{1,3})$/);
  if (range) return `${parseInt(range[1], 10)}-${parseInt(range[2], 10)}`;
  const single = s.match(/^(\d{1,3})(?:\s*(?:reps?|repeticoes?|x))?$/);
  if (single) return String(parseInt(single[1], 10));
  return null;
}

type Draft = { sets: number | null; reps: string | null; tech: string; rest: number | null };

export function normalizeExercise(raw: RawExercise, globalRest: number | null): NormalizedExercise | null {
  const spoken = cleanText(raw?.nome_falado, 120);
  if (!spoken) return null;

  const warnings: string[] = [];
  const assumed = new Set<AssumedField>();
  let observation = cleanText(raw?.observacao, 300);

  const noteUnknown = (rawTech: unknown) => {
    const label = cleanText(rawTech, 40);
    warnings.push(`Técnica "${label || 'não identificada'}" não reconhecida — conferir.`);
    if (label && !observation.toLowerCase().includes(label.toLowerCase())) {
      observation = observation ? `${observation} (${label})` : label;
    }
  };

  // técnica que vale pro exercício inteiro (GVT, bi-set, método 21...)
  let general = resolveTechnique(raw?.tecnica_geral);
  if (general === 'UNKNOWN') { noteUnknown(raw?.tecnica_geral); general = null; }

  const exerciseRest = toInt(raw?.descanso_seg, 0, 600);

  const rawBlocks = Array.isArray(raw?.blocos) ? (raw.blocos as RawBlock[]).slice(0, MAX_BLOCKS) : [];
  const source: RawBlock[] = rawBlocks.length ? rawBlocks : [{}];

  const drafts: Draft[] = source.map((b) => {
    let tech = resolveTechnique(b?.tecnica);
    if (tech === 'UNKNOWN') { noteUnknown(b?.tecnica); tech = null; }
    return {
      sets: toInt(b?.series, 1, 30),
      reps: normalizeReps(b?.reps),
      tech: (tech || general || '') as string,
      rest: toInt(b?.descanso_seg, 0, 600),
    };
  });

  const multi = drafts.length > 1;
  const blocks: Block[] = drafts.map((d) => {
    const defaults = d.tech ? TECH_DEFAULTS[d.tech as keyof typeof TECH_DEFAULTS] : undefined;

    let sets = d.sets;
    if (sets === null) {
      if (defaults?.series) { sets = defaults.series; }
      else if (multi) { sets = 1; }                    // vários blocos sem "séries": cada um é uma série
      else { sets = DEFAULT_SETS; }
      if (!multi) assumed.add('sets');
    }

    let reps = d.reps;
    if (reps === null) {
      reps = defaults?.reps ?? DEFAULT_REPS;
      assumed.add('reps');
    }

    let rest = d.rest ?? exerciseRest ?? globalRest;
    if (rest === null) {
      rest = defaults?.rest ?? DEFAULT_REST_SECONDS;
      assumed.add('rest');
    }

    return {
      sets: String(sets),
      reps,
      restTime: String(rest),
      technique: d.tech,
      load: '',
    };
  });

  // Junta blocos vizinhos idênticos ("3x10" que a IA quebrou em 3 blocos de 1).
  const merged: Block[] = [];
  for (const b of blocks) {
    const last = merged[merged.length - 1];
    if (last && last.reps === b.reps && last.restTime === b.restTime && last.technique === b.technique) {
      last.sets = String(Math.min(30, parseInt(last.sets, 10) + parseInt(b.sets, 10)));
    } else {
      merged.push({ ...b });
    }
  }

  return { spoken, blocks: merged, assumed: Array.from(assumed), observation, warnings };
}

export function normalizeParse(raw: RawParse | null | undefined): {
  exercises: NormalizedExercise[];
  warnings: string[];
} | null {
  if (!raw || typeof raw !== 'object' || !Array.isArray(raw.exercicios)) return null;

  const globalRest = toInt(raw.descanso_padrao_seg, 0, 600);
  const exercises: NormalizedExercise[] = [];
  for (const e of (raw.exercicios as RawExercise[]).slice(0, MAX_EXERCISES)) {
    const n = normalizeExercise(e, globalRest);
    if (n) exercises.push(n);
  }

  const warnings = Array.isArray(raw.avisos)
    ? (raw.avisos as unknown[]).map((a) => cleanText(a, 200)).filter(Boolean).slice(0, 10)
    : [];

  return { exercises, warnings };
}
