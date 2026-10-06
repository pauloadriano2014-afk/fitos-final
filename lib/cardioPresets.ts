// lib/cardioPresets.ts
// 🚴 (7 out 2026) Validação do que o app manda para criar um COMBO DE CARDIO (rota app/api/admin/cardio-presets). Só limpa e limita o tamanho: a estrutura do cardio
// (modo, tempo, calorias, regulagem) é normalizada pelo app ao ler (utils/cardioPlan.js), então aqui basta garantir que é um objeto simples e pequeno.

export const CARDIO_GOALS = ['HIPERTROFIA', 'DEFINICAO', 'EMAGRECIMENTO', 'OUTRO'] as const;
export const MAX_NAME = 60;
export const MAX_EXERCISES = 6;
export const MAX_SUBS = 3;
export const MAX_PRESETS_PER_COACH = 100;
const MAX_STRUCT_CHARS = 6000;   // uma estrutura de cardio (HIIT/progressivo) tem poucas centenas de caracteres

const clean = (v: any, max: number) => String(v ?? '').trim().slice(0, max);
const isPlain = (v: any) => !!v && typeof v === 'object' && !Array.isArray(v);
const smallObject = (v: any) => { try { return isPlain(v) && JSON.stringify(v).length <= MAX_STRUCT_CHARS; } catch { return false; } };

/** Objetivo do combo: um dos conhecidos ou null (sem objetivo). */
export function cleanGoal(v: any): string | null {
  const g = clean(v, 20).toUpperCase();
  return (CARDIO_GOALS as readonly string[]).includes(g) ? g : null;
}

function cleanBlock(b: any): any | null {
  if (!isPlain(b)) return null;
  const out: any = { sets: clean(b.sets, 4) || '20', reps: clean(b.reps, 5), restTime: clean(b.restTime, 4) || '0', technique: clean(b.technique, 40) };
  if (b.cardio !== undefined && b.cardio !== null) { if (!smallObject(b.cardio)) return null; out.cardio = b.cardio; }
  return out;
}

/** Valida e normaliza a lista de exercícios do combo. Retorna null se inválida. */
export function sanitizeCardioExercises(input: any): any[] | null {
  if (!Array.isArray(input) || input.length === 0 || input.length > MAX_EXERCISES) return null;
  const out: any[] = [];
  const seen = new Set<string>();
  for (const ex of input) {
    const exerciseId = clean(ex?.exerciseId, 100);
    if (!exerciseId || exerciseId.startsWith('custom_') || seen.has(exerciseId)) return null;
    seen.add(exerciseId);
    const block = Array.isArray(ex?.blocks) ? cleanBlock(ex.blocks[0]) : null;
    if (!block) return null;
    const substitutes: { id: string; name: string }[] = [];
    for (const s of (Array.isArray(ex?.substitutes) ? ex.substitutes : [])) {
      if (substitutes.length >= MAX_SUBS) break;
      const id = clean(s?.id ?? s?.exerciseId, 100);
      if (id && id !== exerciseId && !substitutes.some((x) => x.id === id)) substitutes.push({ id, name: clean(s?.name ?? s?.title, 120) });
    }
    // o que o aluno faz em cada opção de troca: só das opções que existem e só com cardio de verdade
    const subBlocks: Record<string, any> = {};
    if (isPlain(ex?.subBlocks)) {
      for (const s of substitutes) {
        const v = ex.subBlocks[s.id];
        if (v === undefined) continue;
        const sb = cleanBlock(v);
        if (!sb || !sb.cardio) return null;
        subBlocks[s.id] = sb;
      }
    }
    out.push({ exerciseId, title: clean(ex?.title, 120), observation: clean(ex?.observation, 500), substitutes, blocks: [block], ...(Object.keys(subBlocks).length ? { subBlocks } : {}) });
  }
  return out;
}

/** O corpo inteiro do POST: { name, goal, exercises } → valores limpos ou o erro para o app. */
export function parseCardioPresetInput(body: any): { ok: true; name: string; goal: string | null; exercises: any[] } | { ok: false; error: string } {
  const name = clean(body?.name, MAX_NAME);
  if (!name) return { ok: false, error: 'Dê um nome para o combo.' };
  const exercises = sanitizeCardioExercises(body?.exercises);
  if (!exercises) return { ok: false, error: `O combo precisa ter de 1 a ${MAX_EXERCISES} exercícios de cardio válidos (sem repetir o mesmo).` };
  return { ok: true, name, goal: cleanGoal(body?.goal), exercises };
}
