// lib/exerciseTags.ts
// 🏷️ (19 out 2026) TAGS NOVAS da biblioteca, para o coach filtrar a geração de treino sem abrir a lista inteira: impacto, "evitar para" (perfis) e favorito.
// Ficam dentro de `Exercise.tags` (JSON), ao lado de target/mechanic/equipment/jointRisk: NÃO precisa de coluna nova.
//   impact   'ALTO' | 'BAIXO'                         (alto = pulos, corrida, burpee...)
//   avoid    ['GESTANTE' | 'TERCEIRA_IDADE' | 'POS_CIRURGIA']   (perfis para quem o exercício NÃO é indicado)
//   favorite true                                     (o exercício que o coach prefere: ganha prioridade na lista de candidatos)
// Quem NÃO foi marcado à mão usa a SUGESTÃO pelo nome (função pura abaixo), então os filtros já funcionam no dia 1; marcar à mão sempre vence a sugestão.
// ⚠️ A edição do exercício (PUT /api/exercise) e o "sync-tags" REESCREVEM target/mechanic/equipment/jointRisk pelo nome; `mergeTags` garante que estas chaves novas sobrevivam.
// Sugestão é só uma sugestão por nome — não é orientação médica: o coach confirma (tela de revisão de tags).

export const IMPACTS = ['ALTO', 'BAIXO'] as const;
export type Impact = (typeof IMPACTS)[number];
export const PROFILES = ['GESTANTE', 'TERCEIRA_IDADE', 'POS_CIRURGIA'] as const;
export type Profile = (typeof PROFILES)[number];
export const PROFILE_LABEL: Record<Profile, string> = { GESTANTE: 'Gestante', TERCEIRA_IDADE: '3ª idade', POS_CIRURGIA: 'Pós-cirurgia' };
export const EXTRA_KEYS = ['impact', 'avoid', 'favorite'] as const;

export interface ExtraTags { impact?: Impact; avoid?: Profile[]; favorite?: boolean }

const norm = (s: any) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();

const HIGH_IMPACT = /\b(pulo|pulos|salto|saltos|pular|jump|jumping|burpee|burpees|polichinelo|corrida|sprint|skip|pliometric\w*|saltito\w*|mountain climber|escalador|tiro)\b|pular corda|pulo na corda/;
const AVOID_PREGNANT = /\b(abdominal|abdominais|crunch|canivete|rodinha|prancha|remador|infra|hiperextens\w*|mesa flexora|bruços|bruco|decubito ventral|terra|burpee|burpees)\b|supino(?! inclinado)/;
const AVOID_SENIOR = /\b(terra|arranco|arremesso|pistol|bulgaro|barra fixa|paralela|paralelas|mergulho|good ?morning|militar|levantamento|stiff com barra)\b|agachamento (livre|profundo|sumo com barra|frontal)/;

export const suggestImpact = (name: string): Impact => (HIGH_IMPACT.test(norm(name)) ? 'ALTO' : 'BAIXO');
export function suggestAvoid(name: string): Profile[] {
  const n = norm(name); const out: Profile[] = [];
  if (suggestImpact(name) === 'ALTO' || AVOID_PREGNANT.test(n)) out.push('GESTANTE');
  if (suggestImpact(name) === 'ALTO' || AVOID_SENIOR.test(n)) out.push('TERCEIRA_IDADE');
  return out;   // pós-cirurgia depende da cirurgia: só à mão
}

const isImpact = (v: any): v is Impact => IMPACTS.includes(v);
const isProfile = (v: any): v is Profile => PROFILES.includes(v);

/** Só as chaves novas e válidas de um `tags` qualquer. */
export function pickExtra(tags: any): ExtraTags {
  const out: ExtraTags = {};
  if (!tags || typeof tags !== 'object') return out;
  if (isImpact(tags.impact)) out.impact = tags.impact;
  if (Array.isArray(tags.avoid)) out.avoid = [...new Set(tags.avoid.map((x: any) => String(x).toUpperCase()).filter(isProfile))] as Profile[];
  if (tags.favorite === true) out.favorite = true;
  return out;
}

/** Pedido de alteração vindo da tela: só valida (null/false apaga a marcação e volta à sugestão). */
export function cleanExtraPatch(raw: any): { impact?: Impact | null; avoid?: Profile[] | null; favorite?: boolean } {
  const out: { impact?: Impact | null; avoid?: Profile[] | null; favorite?: boolean } = {};
  if (!raw || typeof raw !== 'object') return out;
  if ('impact' in raw) out.impact = isImpact(raw.impact) ? raw.impact : null;
  if ('avoid' in raw) out.avoid = Array.isArray(raw.avoid) ? ([...new Set(raw.avoid.map((x: any) => String(x).toUpperCase()).filter(isProfile))] as Profile[]) : null;
  if ('favorite' in raw) out.favorite = raw.favorite === true;
  return out;
}

/** Tags geradas pelo nome (target/mechanic/equipment/jointRisk) + as chaves novas que o exercício já tinha (e o pedido, se vier). Nunca perde uma marcação feita à mão. */
export function mergeTags(generated: object, existing: any, patch?: ReturnType<typeof cleanExtraPatch>): object {
  const base: any = { ...generated, ...pickExtra(existing) };
  if (patch) {
    if ('impact' in patch) { if (patch.impact) base.impact = patch.impact; else delete base.impact; }
    if ('avoid' in patch) { if (patch.avoid) base.avoid = patch.avoid; else delete base.avoid; }
    if ('favorite' in patch) { if (patch.favorite) base.favorite = true; else delete base.favorite; }
  }
  return base;
}

export interface EffectiveExtra { impact: Impact; avoid: Profile[]; favorite: boolean; source: { impact: 'TAG' | 'SUGESTAO'; avoid: 'TAG' | 'SUGESTAO' } }
/** O que vale para a geração: a marcação feita à mão ou, na falta dela, a sugestão pelo nome. */
export function effectiveExtra(ex: { name?: string; tags?: any }): EffectiveExtra {
  const t = pickExtra(ex.tags); const name = ex.name || '';
  return {
    impact: t.impact ?? suggestImpact(name), avoid: t.avoid ?? suggestAvoid(name), favorite: !!t.favorite,
    source: { impact: t.impact ? 'TAG' : 'SUGESTAO', avoid: t.avoid ? 'TAG' : 'SUGESTAO' },
  };
}
