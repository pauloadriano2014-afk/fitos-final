// lib/exerciseReplace.ts
// 🔁 (20 out 2026) EXCLUIR EXERCÍCIO DA BIBLIOTECA TROCANDO POR OUTRO. O exercício que está na ficha de algum aluno não pode ser apagado (o banco protege: a ficha ficaria sem exercício e sem vídeo).
// Em vez de só recusar, o coach escolhe por qual exercício trocar (o app sugere o MESMO exercício, se já existir, ou os parecidos) e o servidor passa tudo para o novo antes de apagar.
// Aqui só ficam as contas (funções puras, sem banco): a sugestão de quem substitui e as trocas de id dentro de listas, textos e JSON. O banco é mexido em app/api/exercise/replace/route.ts.

export interface Cand { id: string; name: string; category: string; subCategory?: string | null; videoUrl?: string | null; tags?: any }
export type Reason = 'MESMO_NOME' | 'MESMO_VIDEO' | 'PARECIDO';
export interface Ranked extends Cand { score: number; reason: Reason; sameCategory: boolean }

export const norm = (s: any): string => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
const STOP = new Set(['de', 'da', 'do', 'das', 'dos', 'com', 'no', 'na', 'em', 'e', 'a', 'o', 'c', 'para', 'p']);

/** Palavras que contam no nome ("Agachamento sumô c/ halter" → agachamento, sumo, halter). */
export function nameTokens(name: any): string[] {
  return norm(name).split(/[^a-z0-9]+/).filter((t) => t && !STOP.has(t));
}

/** 0 a 1: quanto dois nomes se parecem (palavras em comum / palavras no total). */
export function similarity(a: any, b: any): number {
  const x = new Set(nameTokens(a)), y = new Set(nameTokens(b));
  if (!x.size || !y.size) return 0;
  let inter = 0; x.forEach((t) => { if (y.has(t)) inter++; });
  return inter / (x.size + y.size - inter);
}

const tg = (c: Cand) => String(c.tags?.target || '').toUpperCase();

/**
 * Quem pode substituir `target`, do mais para o menos indicado. Mesmo nome (ou mesmo vídeo) = é o MESMO exercício cadastrado duas vezes: vai no topo.
 * Os outros precisam ser da mesma categoria ou ter nome bem parecido. Nunca devolve o próprio exercício.
 */
export function rankReplacements(target: Cand, pool: Cand[], limit = 8): Ranked[] {
  const tName = norm(target.name), tVideo = String(target.videoUrl || '').trim();
  const out: Ranked[] = [];
  for (const c of pool || []) {
    if (!c || !c.id || c.id === target.id) continue;
    const sameCategory = norm(c.category) === norm(target.category);
    let score: number, reason: Reason;
    if (norm(c.name) === tName) { score = 100; reason = 'MESMO_NOME'; }
    else if (tVideo && String(c.videoUrl || '').trim() === tVideo) { score = 95; reason = 'MESMO_VIDEO'; }
    else {
      const sim = similarity(c.name, target.name);
      if (!sameCategory && sim < 0.5) continue;
      score = sim * 60 + (sameCategory ? 25 : 0);
      if (c.subCategory && norm(c.subCategory) !== 'geral' && norm(c.subCategory) === norm(target.subCategory)) score += 10;
      if (tg(c) && tg(c) === tg(target)) score += 5;
      if (score < 20) continue;
      reason = 'PARECIDO';
    }
    out.push({ ...c, score: Math.round(score * 10) / 10, reason, sameCategory });
  }
  return out.sort((a, b) => b.score - a.score || norm(a.name).localeCompare(norm(b.name))).slice(0, Math.max(1, limit));
}
export const isSameExercise = (r: Reason | string | undefined): boolean => r === 'MESMO_NOME' || r === 'MESMO_VIDEO';

/** Lista de ids de substitutos com `oldId` trocado por `newId`, sem repetir e sem o próprio dono da lista (um exercício não é substituto de si mesmo). */
export function replaceInList(list: any, oldId: string, newId: string, ownerId?: string | null): string[] {
  const seen = new Set<string>(); const out: string[] = [];
  for (const raw of Array.isArray(list) ? list : []) {
    const id = String(raw) === oldId ? newId : String(raw);
    if (!id || id === ownerId || seen.has(id)) continue;
    seen.add(id); out.push(id);
  }
  return out;
}

/** O título gravado na ficha acompanha o novo exercício quando era o nome do antigo (um título que o coach escreveu à mão fica como está). */
export function swapTitle(title: string | null | undefined, oldName: string, newName: string): string | null {
  if (title == null) return null;
  return norm(title) === norm(oldName) ? newName : title;
}

/** Troca o id num texto (modelos de treino guardam a ficha como texto JSON). O id é um UUID: só aparece onde é referência. */
export function replaceIdInText(text: string, oldId: string, newId: string): { text: string; count: number } {
  if (!oldId || !text || !text.includes(oldId)) return { text, count: 0 };
  const parts = text.split(oldId);
  return { text: parts.join(newId), count: parts.length - 1 };
}

/** Troca o id dentro de um JSON (combos de cardio e mobilidade): `exerciseId` e substitutos `{ id, name }`. Nome/título acompanham quando eram os do antigo. */
export function replaceIdInJson(value: any, oldId: string, newId: string, oldName: string, newName: string): { value: any; count: number } {
  let count = 0;
  const walk = (v: any): any => {
    if (Array.isArray(v)) return v.map(walk);
    if (v && typeof v === 'object') {
      const o: any = {};
      const hit = v.exerciseId === oldId, sub = v.id === oldId && 'name' in v;
      for (const [k, x] of Object.entries(v)) o[k] = walk(x);
      if (hit) { o.exerciseId = newId; if ('title' in o && typeof o.title === 'string') o.title = swapTitle(o.title, oldName, newName); count++; }
      if (sub) { o.id = newId; o.name = newName; count++; }
      return o;
    }
    return v;
  };
  return { value: walk(value), count };
}
