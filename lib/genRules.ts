// lib/genRules.ts
// 🎛️ (19 out 2026) FILTROS DE EXERCÍCIOS DA GERAÇÃO DE TREINO — o que o coach quer (ou não quer) que a IA use, sem abrir a biblioteca inteira toda vez.
// Duas formas de dizer, e as duas valem juntas:
//   • por REGRA (vale para a biblioteca toda): equipamento a evitar, articulação a poupar, sem alto impacto, perfil (gestante, 3ª idade, pós-cirurgia);
//   • por EXERCÍCIO: `excludeIds` (esse não entra) e `pinIds` (esse tem que entrar, se o plano tiver vaga para o músculo dele).
// O conjunto fica salvo no ALUNO (tabela GenPrefs) e pode virar PRESET do coach (tabela GenPreset) para usar com outros alunos. Aplicar um preset COPIA as regras para o aluno
// (depois o coach ainda ajusta à mão, sem mexer no preset). Tudo aqui é função pura; só `loadStudentRules` / `loadPresets` leem o banco (e nunca derrubam a geração).
import { effectiveExtra, PROFILES, type Profile } from '@/lib/exerciseTags';
import { looksLikeMachine, type LibEx } from '@/lib/exerciseSwap';

export const EQUIPMENTS = ['MAQUINA', 'POLIA', 'BARRA', 'SMITH', 'HALTER', 'PESO_CORPORAL', 'OUTROS', 'LIVRE', 'CANELEIRA'] as const;   // LIVRE/CANELEIRA = nomes antigos (regras já salvas continuam valendo)
export const JOINTS = ['JOELHO', 'LOMBAR', 'OMBRO'] as const;
export const MAX_IDS = 600;
/** Locais de treino que o coach marca nos exercícios (Exercise.environments). */
export const ENVIRONMENT_IDS = ['UNIVERSAL', 'CONDOMINIO', 'ACADEMIA_PADRAO', 'SMARTFIT', 'GETGYM', 'OVERALL', 'BRAVES', 'SEVENPLAY', 'EM_CASA'] as const;

export interface GenRules {
  excludeIds: string[]; pinIds: string[];
  excludeEquipment: string[]; excludeJointRisk: string[];
  noHighImpact: boolean; avoidProfiles: Profile[];
  /** de quais LOCAIS podem vir os exercícios; vazio = automático (Universal + o local do aluno) */
  includeEnvironments: string[];
}
export const emptyRules = (): GenRules => ({ excludeIds: [], pinIds: [], excludeEquipment: [], excludeJointRisk: [], noHighImpact: false, avoidProfiles: [], includeEnvironments: [] });

/** Locais que valem para a geração: o que o coach marcou ou, sem marcação, Universal + o local do aluno (null = sem filtro de local). */
export function effectiveEnvironments(rules: Pick<GenRules, 'includeEnvironments'>, trainingEnv: string | null | undefined): string[] | null {
  if (rules.includeEnvironments && rules.includeEnvironments.length) return rules.includeEnvironments;
  return trainingEnv && trainingEnv !== 'UNIVERSAL' ? ['UNIVERSAL', trainingEnv] : null;
}

const uniq = <T,>(a: T[]) => [...new Set(a)];
const strs = (v: any, max = MAX_IDS): string[] => (Array.isArray(v) ? uniq(v.map((x) => String(x ?? '').trim()).filter(Boolean)).slice(0, max) : []);
const upperIn = (v: any, allowed: readonly string[]): string[] => uniq(strs(v, 50).map((x) => x.toUpperCase()).filter((x) => allowed.includes(x)));

/** Limpa qualquer coisa que venha da tela/banco: valores desconhecidos somem, listas sem repetição, e quem está bloqueado nunca fica fixado ao mesmo tempo. */
export function cleanRules(raw: any): GenRules {
  const r = raw && typeof raw === 'object' ? raw : {};
  const excludeIds = strs(r.excludeIds);
  const ex = new Set(excludeIds);
  return {
    excludeIds,
    pinIds: strs(r.pinIds).filter((id) => !ex.has(id)),
    excludeEquipment: upperIn(r.excludeEquipment, EQUIPMENTS),
    excludeJointRisk: upperIn(r.excludeJointRisk, JOINTS),
    noHighImpact: r.noHighImpact === true,
    avoidProfiles: upperIn(r.avoidProfiles, PROFILES) as Profile[],
    includeEnvironments: upperIn(r.includeEnvironments, ENVIRONMENT_IDS),
  };
}

export const isEmptyRules = (r: GenRules) => !r.excludeIds.length && !r.pinIds.length && !r.excludeEquipment.length && !r.excludeJointRisk.length && !r.noHighImpact && !r.avoidProfiles.length && !r.includeEnvironments.length;

/** Junta duas regras (usado para somar um preset ao que o aluno já tinha). */
export function mergeRules(a: GenRules, b: GenRules): GenRules {
  return cleanRules({
    excludeIds: [...a.excludeIds, ...b.excludeIds], pinIds: [...a.pinIds, ...b.pinIds],
    excludeEquipment: [...a.excludeEquipment, ...b.excludeEquipment], excludeJointRisk: [...a.excludeJointRisk, ...b.excludeJointRisk],
    noHighImpact: a.noHighImpact || b.noHighImpact, avoidProfiles: [...a.avoidProfiles, ...b.avoidProfiles],
    includeEnvironments: [...a.includeEnvironments, ...b.includeEnvironments],
  });
}

const EQ_LABEL: Record<string, string> = { MAQUINA: 'máquina', POLIA: 'polia', BARRA: 'barra', HALTER: 'halter', LIVRE: 'livre', PESO_CORPORAL: 'peso do corpo', CANELEIRA: 'caneleira' };
const ENV_TXT: Record<string, string> = { UNIVERSAL: 'universal', CONDOMINIO: 'condomínio', ACADEMIA_PADRAO: 'academia padrão', SMARTFIT: 'SmartFit', GETGYM: 'GetGym', OVERALL: 'Overall', BRAVES: 'Braves', SEVENPLAY: 'SevenPlay', EM_CASA: 'em casa' };
const PROFILE_TXT: Record<string, string> = { GESTANTE: 'gestante', TERCEIRA_IDADE: '3ª idade', POS_CIRURGIA: 'pós-cirurgia' };
/** Frase curta em português para mostrar ao coach. */
export function describeRules(r: GenRules): string[] {
  const out: string[] = [];
  if (r.excludeEquipment.length) out.push(`sem ${r.excludeEquipment.map((e) => EQ_LABEL[e] || e.toLowerCase()).join(', ')}`);
  if (r.excludeJointRisk.length) out.push(`poupa ${r.excludeJointRisk.map((j) => j.toLowerCase()).join(', ')}`);
  if (r.noHighImpact) out.push('sem alto impacto');
  if (r.avoidProfiles.length) out.push(`perfil: ${r.avoidProfiles.map((p) => PROFILE_TXT[p] || p).join(', ')}`);
  if (r.includeEnvironments.length) out.push(`locais: ${r.includeEnvironments.map((e) => ENV_TXT[e] || e.toLowerCase()).join(', ')}`);
  if (r.excludeIds.length) out.push(`${r.excludeIds.length} ${r.excludeIds.length === 1 ? 'exercício bloqueado' : 'exercícios bloqueados'}`);
  if (r.pinIds.length) out.push(`${r.pinIds.length} ${r.pinIds.length === 1 ? 'exercício fixado' : 'exercícios fixados'}`);
  return out;
}

export type RemovedBy = 'excluded' | 'equipment' | 'joint' | 'impact' | 'profile';
export interface AppliedRules {
  list: LibEx[]; removed: Record<RemovedBy, number>; removedTotal: number;
  /** fixados que continuam na biblioteca desta geração / fixados que não estão mais disponíveis (ambiente, limitação, aparelho do aluno...) */
  pinned: string[]; droppedPins: string[];
  active: boolean;
}

/** Por que (se for o caso) a regra tira este exercício. Fixar vence as regras; só `excludeIds` vence o fixar (e a limpeza já impede os dois juntos). */
export function removalReason(ex: LibEx, r: GenRules): RemovedBy | null {
  if (r.excludeIds.includes(ex.id)) return 'excluded';
  if (r.pinIds.includes(ex.id)) return null;
  const tags: any = ex.tags || {};
  const eq = String(tags.equipment || '').toUpperCase();
  if (r.excludeEquipment.includes(eq) || (r.excludeEquipment.includes('MAQUINA') && looksLikeMachine(ex.name))) return 'equipment';
  const jr = (Array.isArray(tags.jointRisk) ? tags.jointRisk : []).map((x: any) => String(x).toUpperCase());
  if (r.excludeJointRisk.some((j) => jr.includes(j))) return 'joint';
  const ef = effectiveExtra(ex);
  if (r.noHighImpact && ef.impact === 'ALTO') return 'impact';
  if (r.avoidProfiles.some((p) => ef.avoid.includes(p))) return 'profile';
  return null;
}

export function applyRules(list: LibEx[], rules: GenRules): AppliedRules {
  const removed: Record<RemovedBy, number> = { excluded: 0, equipment: 0, joint: 0, impact: 0, profile: 0 };
  const kept: LibEx[] = [];
  for (const ex of list) { const why = removalReason(ex, rules); if (why) removed[why]++; else kept.push(ex); }
  const have = new Set(kept.map((e) => e.id));
  const pinned = rules.pinIds.filter((id) => have.has(id)); const droppedPins = rules.pinIds.filter((id) => !have.has(id));
  const removedTotal = Object.values(removed).reduce((s, n) => s + n, 0);
  return { list: kept, removed, removedTotal, pinned, droppedPins, active: !isEmptyRules(rules) };
}

const REMOVED_TXT: Record<RemovedBy, string> = { excluded: 'bloqueados à mão', equipment: 'pelo equipamento', joint: 'pela articulação', impact: 'por alto impacto', profile: 'pelo perfil' };
export const removedSummary = (r: Record<RemovedBy, number>) => (Object.keys(r) as RemovedBy[]).filter((k) => r[k] > 0).map((k) => `${r[k]} ${REMOVED_TXT[k]}`).join(', ');

// ─────────────────────────── leitura do banco (nunca derruba a geração) ───────────────────────────
type Db = any;
/** Regras salvas do aluno. Tabela ainda não criada (antes do `db push`) ou qualquer erro = sem regras. */
export async function loadStudentRules(db: Db, userId: string): Promise<{ rules: GenRules; presetId: string | null; saved: boolean }> {
  try {
    const row = await db.genPrefs.findUnique({ where: { userId } });
    if (!row) return { rules: emptyRules(), presetId: null, saved: false };
    return { rules: cleanRules(row.rules), presetId: row.presetId || null, saved: true };
  } catch (_) { return { rules: emptyRules(), presetId: null, saved: false }; }
}
