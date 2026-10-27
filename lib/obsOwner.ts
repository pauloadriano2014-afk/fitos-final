// lib/obsOwner.ts
// 🗂️ (27 out 2026) De quem é a lista de frases prontas / categorias: o time master (Paulo e Adri) usa a lista COMPARTILHADA (coachId nulo, como sempre foi);
// cada coach parceiro tem a PRÓPRIA (coachId dele), já com o padrão (lib/obsDefaults.ts) na primeira vez. Aluno não tem lista.
import { randomUUID } from 'crypto';
import prisma from '@/lib/prisma';
import { isMasterId, type AuthUser } from '@/lib/auth';
import { OBS_DEFAULTS } from '@/lib/obsDefaults';

export const OBS_FIXED_KEYS = ['TECNICA', 'CUIDADOS', 'CONTAGEM', 'COMO_FAZER', 'CARGA', 'OUTRAS'];
export const OBS_FIXED_LABELS = ['técnica', 'cuidados', 'contagem', 'como fazer', 'carga', 'outras'];
export const OBS_MAX_CATEGORIES = 20;

export const obsMode = (u: AuthUser): 'MASTER' | 'PARTNER' | 'NONE' => (isMasterId(u.id) ? 'MASTER' : ['USER', 'STUDENT'].includes(String(u.role)) ? 'NONE' : 'PARTNER');
export const obsOwner = (u: AuthUser): string | null => (isMasterId(u.id) ? null : u.id);
export const obsNorm = (s: string) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();

// Entrega o padrão uma única vez. A marca (ObservationSeed) é criada PRIMEIRO dentro da mesma transação: se duas chamadas chegarem juntas,
// a segunda esbarra na marca, desfaz tudo e simplesmente lê o que a primeira gravou (nunca duplica).
export async function ensureSeeded(coachId: string): Promise<void> {
  const done = await prisma.observationSeed.findUnique({ where: { coachId } });
  if (done) return;
  const now = Date.now();
  const cats = OBS_DEFAULTS.map((c, i) => ({ id: randomUUID(), name: c.name, color: c.color, position: i, coachId, createdAt: new Date(now) }));
  let n = 0;
  const presets: any[] = [];
  OBS_DEFAULTS.forEach((c, i) => c.phrases.forEach((text) => presets.push({ id: randomUUID(), text, category: cats[i].id, coachId, createdAt: new Date(now - n++) })));   // a lista vem da mais nova para a mais velha: a 1ª frase fica no topo
  try {
    await prisma.$transaction([
      prisma.observationSeed.create({ data: { coachId } }),
      prisma.observationCategory.createMany({ data: cats }),
      prisma.observationPreset.createMany({ data: presets }),
    ]);
  } catch {
    // outra chamada entregou o padrão ao mesmo tempo: nada a fazer
  }
}

// "Restaurar padrão": devolve só o que falta (categoria pelo nome, frase pelo texto; categoria só volta se tiver frase para devolver). Nada que o coach criou ou mudou é tocado.
export async function restoreDefaults(coachId: string): Promise<{ addedCategories: number; addedPhrases: number }> {
  const cats: any[] = await prisma.observationCategory.findMany({ where: { coachId } });
  const presets: any[] = await prisma.observationPreset.findMany({ where: { coachId } });
  const haveTexts = new Set(presets.map((p) => obsNorm(p.text)));
  const byName = new Map(cats.map((c) => [obsNorm(c.name), c]));
  let position = cats.reduce((m, c) => Math.max(m, c.position ?? 0), -1) + 1;
  let addedCategories = 0, addedPhrases = 0, n = 0;
  const now = Date.now();
  for (const d of OBS_DEFAULTS) {
    const missing = d.phrases.filter((t) => !haveTexts.has(obsNorm(t)));
    let cat = byName.get(obsNorm(d.name));
    if (!cat) {
      if (!missing.length || cats.length + addedCategories >= OBS_MAX_CATEGORIES) continue;   // categoria vazia não volta; nem passa do limite
      cat = await prisma.observationCategory.create({ data: { name: d.name, color: d.color, position: position++, coachId } });
      addedCategories++;
    }
    for (const text of missing) { await prisma.observationPreset.create({ data: { text, category: cat.id, coachId, createdAt: new Date(now - n++) } }); addedPhrases++; }
  }
  return { addedCategories, addedPhrases };
}
