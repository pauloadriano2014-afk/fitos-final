// lib/voiceWorkout/techniques.ts
// 🎙️ (30 set 2026) Montar treino por voz -- catálogo de técnicas + padrões.
//
// As chaves (DROPSET, RESTPAUSE...) são as MESMAS que o app usa em
// `tecnicasDisponiveis` (useMontarTreino.js) e em `identifyTechnique`
// (workoutUtils.js) -- é o que vai no campo `technique` de cada bloco.
//
// REGRA DE OURO DOS PADRÕES: o que o coach FALOU sempre vence. Os padrões
// abaixo só preenchem o que faltou (ex.: "GVT" sozinho vira 10x10, mas
// "GVT 6x10" fica 6x10). Pra mudar um padrão, é só editar TECH_DEFAULTS.

export type TechKey =
  | 'DROPSET' | 'RESTPAUSE' | 'BISET' | 'TRISET' | '21'
  | 'CLUSTERSET' | '1_5_REPS' | 'TUT' | 'GVT';

export const TECH_KEYS: TechKey[] = [
  'DROPSET', 'RESTPAUSE', 'BISET', 'TRISET', '21',
  'CLUSTERSET', '1_5_REPS', 'TUT', 'GVT',
];

export const DEFAULT_SETS = 3;
export const DEFAULT_REPS = '12';
export const DEFAULT_REST_SECONDS = 60;

export const TECH_DEFAULTS: Partial<Record<TechKey, { series?: number; reps?: string; rest?: number }>> = {
  GVT: { series: 10, reps: '10', rest: 60 },
  // Método 21 = 7+7+7 = 21 repetições. O app guarda 21 e só troca por uma faixa
  // normal quando o deload do aluno está ativo (workoutMaskUtils.js).
  '21': { reps: '21' },
};

// minúsculo, sem acento, hífen/underscore viram espaço
function normTech(raw: string): string {
  return raw
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[-_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// A ordem importa: GVT antes de "21", "1 5 reps" antes de "21" etc.
const PATTERNS: Array<[TechKey, RegExp]> = [
  ['GVT',        /\bgvt\b|metodo alemao|volume alemao|german volume/],
  ['RESTPAUSE',  /rest ?pause|restpause/],
  ['DROPSET',    /drop ?set|\bdrop\b|dropset/],
  ['TRISET',     /tri ?set|triset/],
  ['BISET',      /bi ?set|biset/],
  ['CLUSTERSET', /cluster/],
  ['1_5_REPS',   /\b1 ?[.,] ?5\b|1 5 reps|uma e meia|um e meio|1 e meio|1 e 1 ?\/ ?2|meia rep/],
  ['TUT',        /\btut\b|tempo sob tensao/],
  ['21',         /^(metodo )?21( s)?$|\bmetodo 21\b|\bmetodo vinte e um\b|\bvinte e um\b/],
];

/**
 * Converte o que veio (da IA ou de qualquer texto) numa chave do app.
 *  - vazio/nulo  -> null   (sem técnica)
 *  - reconhecida -> TechKey
 *  - qualquer outra coisa (inclusive "OUTRA") -> 'UNKNOWN'
 */
export function resolveTechnique(raw: unknown): TechKey | 'UNKNOWN' | null {
  if (raw === null || raw === undefined) return null;
  const s = String(raw).trim();
  if (!s || s.toLowerCase() === 'null' || s.toLowerCase() === 'normal' || s.toLowerCase() === 'nenhuma') return null;

  // já é uma chave exata do app?
  const upper = s.toUpperCase();
  if ((TECH_KEYS as string[]).includes(upper)) return upper as TechKey;

  const n = normTech(s);
  for (const [key, re] of PATTERNS) {
    if (re.test(n)) return key;
  }
  return 'UNKNOWN';
}
