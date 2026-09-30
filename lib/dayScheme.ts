// lib/dayScheme.ts
// 🏷️ (30 set 2026) Nomes personalizados das abas de dia da dieta.
//   - Só os 4 tipos internos existentes (TREINO, TREINO_CARDIO, CARDIO, DESCANSO) podem ganhar nome: o app do aluno
//     antigo ignora o esquema e mostra os nomes de sempre (nada quebra).
//   - Nome: até 14 caracteres, só letras/números/espaço e pontuação simples (sem emoji, sem HTML); vazio = nome padrão.
//   - Tudo aqui é à prova de "tabela ainda não criada" (deploy antes do `prisma db push`): não lança.
import prisma from '@/lib/prisma';

export const DAY_KEYS = ['TREINO', 'TREINO_CARDIO', 'CARDIO', 'DESCANSO'] as const;
export const MAX_LABEL = 14;
const PRESETS = ['default', 'options', 'week', 'cycle', 'custom'];

export type DayScheme = { v: 1; preset: string; labels: Record<string, string> };

export function sanitizeLabel(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const s = v
    .normalize('NFC')
    .replace(/<[^>]*>/g, '')
    .replace(/[^\p{L}\p{N} .,+\-/&()'ºª]/gu, '')       // letras/números/pontuação simples: emoji e símbolos saem
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_LABEL)
    .trim();
  return s.length ? s : null;
}

/** null = sem nome personalizado (usa os nomes de sempre). */
export function sanitizeDayScheme(raw: any): DayScheme | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const labels: Record<string, string> = {};
  for (const k of DAY_KEYS) {
    const l = sanitizeLabel(raw.labels?.[k]);
    if (l) labels[k] = l;
  }
  if (!Object.keys(labels).length) return null;
  return { v: 1, preset: PRESETS.includes(raw.preset) ? raw.preset : 'custom', labels };
}

const missingTable = (e: any) => e?.code === 'P2021' || e?.code === 'P2022' || /does not exist/i.test(String(e?.message || '')) || /dietDayScheme/i.test(String(e?.message || ''));
let warned = false;
const warnOnce = (where: string, e: any) => {
  if (warned) return;
  warned = true;
  console.warn(`[dayScheme] ${where}: ${e?.code || ''} ${e?.message || e} — seguindo com os nomes padrão (rode "prisma db push" pra ativar os nomes personalizados).`);
};

/**
 * Grava (ou apaga) o esquema de UMA dieta. `raw === undefined` = o cliente não mandou nada: herda o da dieta anterior
 * (`inheritFromDietId`), pra um salvamento feito por app que não conhece o esquema não perder os nomes.
 */
export async function saveDayScheme(dietId: string, raw: unknown, inheritFromDietId?: string | null): Promise<void> {
  try {
    const db = (prisma as any).dietDayScheme;
    let scheme: DayScheme | null;
    if (raw === undefined) {
      if (!inheritFromDietId) return;
      const prev = await db.findUnique({ where: { dietId: inheritFromDietId } });
      scheme = prev ? sanitizeDayScheme(prev.scheme) : null;
    } else {
      scheme = sanitizeDayScheme(raw);
    }
    if (!scheme) { await db.deleteMany({ where: { dietId } }); return; }
    await db.upsert({ where: { dietId }, create: { dietId, scheme }, update: { scheme } });
  } catch (e) {
    if (missingTable(e)) warnOnce('saveDayScheme', e); else console.error('[dayScheme] saveDayScheme', e);
  }
}

/** Junta `dayScheme` (ou null) em cada dieta (objeto ou lista) com UMA consulta. Nunca lança. */
export async function attachDayScheme(dietOrDiets: any): Promise<void> {
  try {
    const diets: any[] = (Array.isArray(dietOrDiets) ? dietOrDiets : [dietOrDiets]).filter((d) => d && d.id);
    if (!diets.length) return;
    const rows = await (prisma as any).dietDayScheme.findMany({ where: { dietId: { in: diets.map((d) => d.id) } } });
    const byId = new Map<string, DayScheme | null>(rows.map((r: any) => [r.dietId, sanitizeDayScheme(r.scheme)]));
    for (const d of diets) d.dayScheme = byId.get(d.id) ?? null;
  } catch (e) {
    if (missingTable(e)) warnOnce('attachDayScheme', e); else console.error('[dayScheme] attachDayScheme', e);
  }
}
