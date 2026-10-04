// lib/workoutTemplates.ts
// 📋 (4 out 2026) TREINOS PRONTOS do coach para o plano automático. O coach monta o treino no "Montar treino" do app e usa "Salvar como modelo" numa PASTA
// chamada "DESAFIO 21 DIAS" ou "FICHA 8 SEMANAS". Quando o aluno termina a anamnese, o servidor procura nessas pastas o modelo que combina com ele e copia
// para o aluno, em vez de pedir o treino à IA. Sem modelo que sirva, cai na IA (como era). Tudo aqui é função pura, menos `loadTemplates`.
//
// Como o servidor escolhe (marcas opcionais no NOME do modelo, em qualquer ordem; sem marca = serve para qualquer aluno):
//   gênero  : FEM / FEMININO / MULHER            ou  MASC / MASCULINO / HOMEM
//   local   : CASA / CONDOMINIO / ACADEMIA         (além disso, o servidor confere o ambiente de cada exercício)
//   fase    : FASE 1 / FASE 2                      (ficha de 8 semanas: o modelo da 1ª e o da 2ª fase de 4 semanas)
//   foco    : GLUTEOS / PERNAS / COSTAS / PEITO / OMBROS / BRACOS / ABDOMEN / EQUILIBRADO  (ficha: melhorar uma área do corpo)
//   objetivo: EMAGRECER (perder peso)              (ficha: separa o modelo de perder peso do de foco numa área)
//   nível   : o campo "Nível" do modelo (Iniciante, Intermediário, Avançado)
// Nunca entra modelo que: use exercício que não existe mais, precise de equipamento que o aluno não tem, tenha exercício de risco para a articulação
// com dor do aluno, ou (no modo seguro) use GVT/21/cluster. Nesse último caso as técnicas pesadas (dropset, rest-pause, triset) são tiradas do treino.
import type { AutoPlanKind } from '@/lib/autoPlanKinds';

export type Env = 'EM_CASA' | 'CONDOMINIO' | 'ACADEMIA_PADRAO';
export type Level = 'INICIANTE' | 'INTERMEDIARIO' | 'AVANCADO';

export interface TemplateRow { id: string; name: string; goal?: string | null; level?: string | null; data: string; collectionId?: string | null }
export interface TemplateStudent {
  gender: string | null;
  level: Level;
  env: Env;
  fatLoss: boolean;
  focus: string | null;     // área escolhida (ficha de músculo); null = equilibrado ou perder peso
  phase: number;            // 1, 2...
  phases: number;           // quantas fases o plano tem (desafio = 1)
}
export interface TemplateTags {
  gender: 'Feminino' | 'Masculino' | null;
  env: Env | null;
  level: Level | null;
  phase: number | null;
  focus: string | null;
  objective: 'FAT' | 'MUSCLE' | null;
}

export const FOCUS_EQUILIBRADO = 'Corpo todo (equilibrado)';
export const COLLECTION_PATTERNS: Record<AutoPlanKind, RegExp> = {
  CHALLENGE_21: /desafio.*21|21.*desafio|21 ?dias/,
  FICHA_8S: /ficha.*8|8.*semanas?|8 ?sem/,
};

export const norm = (s: any) => String(s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

const FOCUS_WORDS: Array<[RegExp, string]> = [
  [/glute/, 'Glúteos'], [/perna/, 'Pernas'], [/costa/, 'Costas'], [/peito/, 'Peito'], [/ombro/, 'Ombros'], [/brac/, 'Braços'], [/abdom/, 'Abdômen'],
  [/equilibrad|corpo todo|full ?body/, FOCUS_EQUILIBRADO],
];
const LEVELS: Level[] = ['INICIANTE', 'INTERMEDIARIO', 'AVANCADO'];
const levelOf = (s: string): Level | null => (s.includes('inic') ? 'INICIANTE' : s.includes('interm') ? 'INTERMEDIARIO' : s.includes('avanc') ? 'AVANCADO' : null);
const ENV_RANK: Record<Env, number> = { EM_CASA: 1, CONDOMINIO: 2, ACADEMIA_PADRAO: 3 };

export function parseTags(t: Pick<TemplateRow, 'name' | 'level'>): TemplateTags {
  const n = norm(t.name);
  const gender = /\b(fem|feminino|feminina|mulher|mulheres)\b/.test(n) ? 'Feminino' : /\b(masc|masculino|masculina|homem|homens)\b/.test(n) ? 'Masculino' : null;
  const env: Env | null = /\bcasa\b/.test(n) ? 'EM_CASA' : /condominio/.test(n) ? 'CONDOMINIO' : /academia/.test(n) ? 'ACADEMIA_PADRAO' : null;
  const fase = n.match(/\bfase ?([12])\b|\bf([12])\b/);
  const focus = FOCUS_WORDS.find(([re]) => re.test(n))?.[1] ?? null;
  const objective = /emagrec|perder|queima/.test(n) ? 'FAT' : null;
  return { gender, env, level: levelOf(norm(t.level)), phase: fase ? Number(fase[1] || fase[2]) : null, focus, objective };
}

/** Nota do modelo para este aluno; null = não serve de jeito nenhum. */
export function scoreTemplate(tags: TemplateTags, kind: AutoPlanKind, s: TemplateStudent): number | null {
  let score = 0;
  if (tags.gender && s.gender && tags.gender !== s.gender) return null;
  if (tags.gender && tags.gender === s.gender) score += 2;
  if (tags.env && ENV_RANK[tags.env] > ENV_RANK[s.env]) return null;
  if (tags.env && tags.env === s.env) score += 1;
  if (tags.level) {
    const d = Math.abs(LEVELS.indexOf(tags.level) - LEVELS.indexOf(s.level));
    if (d >= 2) return null;
    if (d === 0) score += 3;
  }
  if (s.phases > 1 && tags.phase !== null) { if (tags.phase !== s.phase) return null; score += 3; }
  if (kind === 'FICHA_8S') {
    const want = s.fatLoss ? null : s.focus;
    if (tags.focus) {
      if (tags.focus === FOCUS_EQUILIBRADO && !want) score += 2;
      else if (tags.focus === want) score += 4;
      else return null;
    } else score += want ? 0 : 1;
    if (tags.objective === 'FAT') { if (!s.fatLoss) return null; score += 2; }
  }
  return score;
}

/** Modelos que servem, do melhor para o pior (empate: ordem alfabética). */
export function rankTemplates(templates: TemplateRow[], kind: AutoPlanKind, s: TemplateStudent): TemplateRow[] {
  return templates
    .map((t) => ({ t, score: scoreTemplate(parseTags(t), kind, s) }))
    .filter((x): x is { t: TemplateRow; score: number } => x.score !== null)
    .sort((a, b) => b.score - a.score || a.t.name.localeCompare(b.t.name))
    .map((x) => x.t);
}

export interface LibraryExercise { id: string; category?: string | null; tags?: any; environments?: string[] | null }
export interface Inspection { ok: boolean; reason?: string; byDay: Record<string, any[]>; tabs: string[]; notes: string[] }

const HEAVY_STRUCTURE = new Set(['GVT', '21', 'CLUSTERSET']);          // mudam o nº de séries: não dá para só tirar a técnica
const HEAVY_TECHNIQUES = new Set(['DROPSET', 'RESTPAUSE', 'TRISET', '1_5_REPS', 'TUT']);   // dá para tirar e virar série normal

export function parseTemplateData(data: string): Record<string, any[]> | null {
  try {
    const parsed = JSON.parse(data);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    const out: Record<string, any[]> = {};
    for (const [tab, list] of Object.entries(parsed)) if (Array.isArray(list) && list.length) out[tab] = list as any[];
    return Object.keys(out).length ? out : null;
  } catch { return null; }
}

/**
 * Confere um modelo contra a biblioteca e as restrições do aluno e devolve o treino pronto para salvar.
 * `risks` = articulações com dor/cirurgia; `careful` = modo seguro.
 */
export function inspectTemplate(data: string, lib: Map<string, LibraryExercise>, student: { env: Env; risks: string[]; careful: boolean }): Inspection {
  const fail = (reason: string): Inspection => ({ ok: false, reason, byDay: {}, tabs: [], notes: [] });
  const raw = parseTemplateData(data);
  if (!raw) return fail('modelo vazio ou ilegível');
  const notes: string[] = [];
  let total = 0, dropped = 0;
  const byDay: Record<string, any[]> = {};

  for (const [tab, list] of Object.entries(raw)) {
    const kept: any[] = [];
    for (const ex of list) {
      total++;
      const id = String(ex?.exerciseId ?? '');
      const dbEx = lib.get(id);
      if (!id || !dbEx) { dropped++; continue; }
      const envs = (dbEx.environments || []).map(String);
      if (student.env !== 'ACADEMIA_PADRAO' && envs.length && !envs.includes('UNIVERSAL') && !envs.includes(student.env)) return fail(`"${ex.title || ex.name || id}" usa equipamento que o aluno não tem`);
      const risk = Array.isArray(dbEx.tags?.jointRisk) ? dbEx.tags.jointRisk.map((r: any) => String(r).toUpperCase()) : [];
      if (student.risks.some((r) => risk.includes(r))) return fail(`"${ex.title || ex.name || id}" é de risco para ${student.risks.join('/')}`);
      let blocks: any[] = Array.isArray(ex.blocks) && ex.blocks.length ? ex.blocks.map((b: any) => ({ ...b })) : [{ sets: '3', reps: '10', load: '', restTime: '60', technique: '' }];
      if (student.careful) {
        for (const b of blocks) {
          const tech = String(b.technique || '').toUpperCase();
          if (HEAVY_STRUCTURE.has(tech)) return fail(`usa ${tech} (não vale no modo seguro)`);
          if (HEAVY_TECHNIQUES.has(tech)) b.technique = '';
        }
      }
      kept.push({ ...ex, exerciseId: id, category: ex.category || dbEx.category || '', blocks });
    }
    if (kept.length) byDay[tab] = kept;
  }
  if (!Object.keys(byDay).length) return fail('nenhum exercício do modelo existe mais na biblioteca');
  if (dropped / total > 0.25) return fail(`${dropped} de ${total} exercícios não existem mais na biblioteca`);
  if (dropped) notes.push(`${dropped} exercício(s) do modelo não existem mais na biblioteca e ficaram de fora`);
  return { ok: true, byDay, tabs: Object.keys(byDay), notes };
}

/** O que `inspectTemplate` precisa da biblioteca: os ids que o modelo cita. */
export function templateExerciseIds(data: string): string[] {
  const raw = parseTemplateData(data);
  if (!raw) return [];
  return [...new Set(Object.values(raw).flat().map((e: any) => String(e?.exerciseId ?? '')).filter(Boolean))];
}

/** Modelos do coach nas pastas do plano (pasta cujo nome bate com o plano). Tenta o coach do aluno e depois o master, sem repetir. */
export async function loadTemplates(db: any, coachIds: string[], kind: AutoPlanKind): Promise<TemplateRow[]> {
  const ids = [...new Set(coachIds.filter(Boolean))];
  const out: TemplateRow[] = [];
  for (const coachId of ids) {
    const cols = await db.templateCollection.findMany({ where: { coachId } });
    const colIds = (cols || []).filter((c: any) => COLLECTION_PATTERNS[kind].test(norm(c.name))).map((c: any) => c.id);
    if (!colIds.length) continue;
    const rows = await db.workoutTemplate.findMany({ where: { collectionId: { in: colIds } } });
    if (rows && rows.length) { out.push(...rows); break; }   // o primeiro coach que tem modelos vale; não mistura biblioteca de coaches
  }
  return out;
}
