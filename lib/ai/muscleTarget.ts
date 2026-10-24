// lib/ai/muscleTarget.ts
// 🎯 (24 out 2026) O MÚSCULO REAL DE UM EXERCÍCIO. A etiqueta `tags.target` da biblioteca tem erro de importação: 45 exercícios estão numa categoria (Abdômen, Bíceps, Costas...) com alvo "PEITO"
// ("Abdominal no cross em pé" era tratado como peito e saía antes de ombro e braços). Aqui a categoria e o subgrupo corrigem a etiqueta quando ela contradiz.
// Regras: Abdômen/Bíceps/Tríceps mandam sempre (são músculos únicos); alvo PEITO em categoria que não é Peito é o padrão errado da importação e vira o músculo da categoria
// (pelo subgrupo quando dá: Puxadas, Remadas, Frontal, Lateral, Glúteos...). O resto fica como o coach etiquetou. Função pura.

const strip = (s: any) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().trim();

/** Músculos únicos: a categoria decide e pronto. */
const SINGLE: Record<string, string> = { ABDOMEN: 'ABDOMEN', BICEPS: 'BICEPS', TRICEPS: 'TRICEPS' };

const BY_SUB: Record<string, Record<string, string>> = {
  COSTAS: { PUXADAS: 'COSTAS_PUXADA', REMADAS: 'COSTAS_REMADA' },
  OMBROS: { FRONTAL: 'OMBRO_FRONTAL', LATERAL: 'OMBRO_LATERAL', POSTERIOR: 'OMBRO_POST', MULTIARTICULAR: 'OMBRO_MULTI', TRAPEZIO: 'TRAPEZIO' },
  PERNAS: { GLUTEOS: 'GLUTEOS', POSTERIORES: 'POSTERIOR', QUADRICEPS: 'QUADRICEPS', PANTURRILHA: 'PANTURRILHA', ADUTOR: 'ADUTOR', ABDUTOR: 'ABDUTOR' },
};
const GENERIC: Record<string, string> = { COSTAS: 'COSTAS', OMBROS: 'OMBROS', PERNAS: 'PERNAS' };

/** O alvo (grupo muscular) do exercício, já corrigido pela categoria; sem categoria nem alvo devolve ''. */
export function muscleTarget(e: { tags?: any; category?: any; subCategory?: any } | null | undefined): string {
  if (!e) return '';
  const raw = strip(e.tags?.target);
  const cat = strip(e.category);
  if (SINGLE[cat]) return SINGLE[cat];
  if (raw === 'PEITO' && cat && cat !== 'PEITO') {
    const sub = strip(e.subCategory);
    return BY_SUB[cat]?.[sub] || GENERIC[cat] || raw;
  }
  if (cat === 'OMBROS' && raw === 'POSTERIOR') return 'OMBRO_POST';   // "posterior" dentro de Ombros é o deltoide posterior, não a coxa
  return raw || cat;
}

/** O exercício está com a etiqueta contradizendo a categoria? (para a lista de correção da biblioteca) */
export function targetMismatch(e: { tags?: any; category?: any; subCategory?: any }): { from: string; to: string } | null {
  const from = strip(e.tags?.target);
  const to = muscleTarget(e);
  if (!from || !to) return null;
  const same = from === to || (from === 'ABDOMEN' && to === 'ABDOMEN');
  return same ? null : { from, to };
}
