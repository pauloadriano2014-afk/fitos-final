// lib/exerciseSwap.ts
// 🔁 (18 out 2026) TROCA AUTOMÁTICA de exercício na rotina clonada: quando um exercício da rotina de outro aluno não serve para ESTE aluno (aparelho que ele não tem, outro local,
// risco para a limitação, exercício complexo para o nível), escolhe na BIBLIOTECA um parecido que serve. Função pura (a biblioteca vem pronta); sem IA.
// Regras: mesmo músculo (tags.target; sem tag, mesma categoria), nunca o mesmo exercício nem um que já está na rotina, nunca um que o aluno disse não ter, só o que combina com o local
// dele, sem risco para a limitação e sem pedir mais nível do que ele tem. Entre os que servem, prefere o mesmo tipo de movimento (composto/isolado), e — em condomínio ou em casa —
// os que usam menos aparelho (halter, peso do corpo, livre, barra) antes de polia e máquina.
import type { LevelKey } from '@/lib/studentLevel';

export interface LibEx { id: string; name: string; category: string; subCategory?: string | null; videoUrl?: string | null; tags?: any; environments?: string[] | null }
export interface SwapTarget { id: string; name: string; videoUrl: string | null; category: string; subCategory: string | null }
export interface SwapCtx {
  unavailable: Set<string>; jointRisks: string[]; env: string; level?: LevelKey | null; usedNames: Set<string>;
  envOk: (envs: any) => boolean; levelIssues: (name: string, technique: string | null, level?: LevelKey | null) => string[];
}

const norm = (s: any) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
export const nameKey = norm;
const arr = (v: any): string[] => (Array.isArray(v) ? v.map((x) => String(x)) : []);
const LIGHT = ['HALTER', 'LIVRE', 'PESO_CORPORAL', 'CANELEIRA', 'BARRA'];
// A tag `equipment` da biblioteca nem sempre diz a verdade ("Cadeira abdutora" está como LIVRE). Pelo nome dá para desconfiar de máquina: em condomínio/casa é o último recurso.
export const looksLikeMachine = (name: string) => /\b(cadeira|maquina|mesa flexora|leg ?press|hack|smith|pec ?deck|articulad[ao]|projetad[ao]|reclinad[ao]|newtech|extensora|flexora|panturrilha em pe)\b/.test(norm(name));
const tg = (e: LibEx) => String(e.tags?.target || '').toUpperCase();

/** O melhor substituto da biblioteca para `orig` (ou null se nada serve). */
export function pickSwap(orig: LibEx, pool: LibEx[], ctx: SwapCtx): SwapTarget | null {
  const origTarget = tg(orig); const origEq = String(orig.tags?.equipment || '').toUpperCase(); const origMech = String(orig.tags?.mechanic || '').toUpperCase();
  const light = ctx.env === 'CONDOMINIO' || ctx.env === 'EM_CASA';
  let best: { c: LibEx; score: number } | null = null;
  const seen = new Set<string>();
  for (const c of pool || []) {
    if (!c || !c.id || c.id === orig.id) continue;
    const key = norm(c.name); if (!key || key === norm(orig.name) || ctx.usedNames.has(key)) continue;
    if (seen.has(key + '|' + c.id)) continue; seen.add(key + '|' + c.id);
    if (ctx.unavailable.has(c.id)) continue;
    if (origTarget ? tg(c) !== origTarget : norm(c.category) !== norm(orig.category)) continue;
    if (!ctx.envOk(c.environments)) continue;
    if (arr(c.tags?.jointRisk).map((x) => x.toUpperCase()).some((j) => ctx.jointRisks.includes(j))) continue;
    if (ctx.levelIssues(c.name, null, ctx.level).length) continue;
    const eq = String(c.tags?.equipment || '').toUpperCase();
    let score = 0;
    if (origMech && String(c.tags?.mechanic || '').toUpperCase() === origMech) score += 3;
    if (c.subCategory && norm(c.subCategory) !== 'geral' && norm(c.subCategory) === norm(orig.subCategory)) score += 1;
    if (light) { if (eq === 'MAQUINA' || looksLikeMachine(c.name)) score -= 3; else if (LIGHT.includes(eq)) score += 2; else if (eq === 'POLIA') score += 1; } else if (origEq && eq === origEq) score += 1;
    if (c.videoUrl) score += 1;
    if (!best || score > best.score || (score === best.score && norm(c.name) < norm(best.c.name))) best = { c, score };
  }
  if (!best) return null;
  const c = best.c;
  return { id: c.id, name: c.name, videoUrl: c.videoUrl || null, category: c.category, subCategory: c.subCategory || null };
}
