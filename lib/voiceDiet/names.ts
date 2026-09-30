// lib/voiceDiet/names.ts
// 🎙️ (30 set 2026) Dieta por voz -- nome e horário da refeição.
// Os nomes padrão são os MESMOS do seletor do app (MEAL_NAME_OPTIONS em
// DietModalsAdmin.js). Qualquer outro nome falado vira nome personalizado.
import { norm } from '../voiceWorkout/match';

export const MEAL_NAMES = [
  'Café da Manhã', 'Lanche da Manhã', 'Almoço', 'Lanche da Tarde', 'Pré-Treino', 'Pós-Treino', 'Jantar', 'Ceia',
] as const;

const DEFAULT_TIME: Record<string, string> = {
  'Café da Manhã': '07:00', 'Lanche da Manhã': '10:00', 'Almoço': '12:30', 'Lanche da Tarde': '16:00',
  'Pré-Treino': '17:30', 'Pós-Treino': '19:30', 'Jantar': '20:00', 'Ceia': '22:00',
};

const RULES: Array<[RegExp, string]> = [
  [/\blanche da manha\b|\bcolacao\b/, 'Lanche da Manhã'],
  [/\bcafe da manha\b|\bdesjejum\b|\bcafe\b/, 'Café da Manhã'],
  [/\balmoco\b/, 'Almoço'],
  [/\blanche da tarde\b|\blanche\b/, 'Lanche da Tarde'],
  [/\bpre ?treino\b/, 'Pré-Treino'],
  [/\bpos ?treino\b/, 'Pós-Treino'],
  [/\bjantar\b|\bjanta\b/, 'Jantar'],
  [/\bceia\b/, 'Ceia'],
];

const cap = (s: string) => s.replace(/\s+/g, ' ').trim().slice(0, 40);

/** nome falado -> { name, standard }. Sem nome falado: name = null. */
export function resolveMealName(spoken: unknown): { name: string | null; standard: boolean } {
  if (typeof spoken !== 'string' || !spoken.trim()) return { name: null, standard: false };
  const n = norm(spoken);
  for (const [re, name] of RULES) if (re.test(n)) return { name, standard: true };
  const num = n.match(/\brefeicao (\d{1,2})\b/);
  if (num) return { name: `Refeição ${parseInt(num[1], 10)}`, standard: false };
  const label = cap(spoken);
  return { name: label ? label.charAt(0).toUpperCase() + label.slice(1) : null, standard: false };
}

/** "7h", "7:30", "07:00" -> "07:00". Inválido -> null. */
export function normalizeTime(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const m = v.trim().match(/^(\d{1,2})(?::|h)?(\d{2})?$/i);
  if (!m) return null;
  const h = parseInt(m[1], 10);
  const min = m[2] ? parseInt(m[2], 10) : 0;
  if (h > 23 || min > 59) return null;
  return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
}

/** Horário sugerido quando o coach não falou: pelo nome padrão ou, senão, de 3 em 3 h a partir das 07:00. */
export function defaultTimeFor(name: string | null, position: number): string {
  if (name && DEFAULT_TIME[name]) return DEFAULT_TIME[name];
  const h = (7 + position * 3) % 24;
  return `${String(h).padStart(2, '0')}:00`;
}
