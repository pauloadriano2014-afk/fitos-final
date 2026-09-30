// lib/dayScheme.ts
// 🏷️ (1 out 2026) ABAS DA DIETA: nomes personalizados e até 7 abas (Opção 1..4, Carbo Alto, Seg..Dom, Cardápio 1..6...).
//
// Modelo (v2): uma lista de abas, em ordem. Cada aba tem
//   - key:   a chave gravada em cada refeição (Meal.dayType). É POSICIONAL: a 1ª aba é sempre TREINO, a 2ª TREINO_CARDIO,
//            a 3ª CARDIO, a 4ª DESCANSO, a 5ª EXTRA_5, a 6ª EXTRA_6, a 7ª EXTRA_7. As 4 primeiras são as chaves que o app
//            do aluno antigo já conhece (ele mostra essas 4 e esconde as EXTRA_*), então nada quebra nele;
//   - label: nome da aba (até 14 caracteres, sem emoji nem HTML). Vazio = o nome de sempre;
//   - base:  "se comporta como" TREINO | TREINO_CARDIO | CARDIO | DESCANSO -- define as calorias/macros da aba, o tipo
//            que a IA usa pra gerar e a cor. Não muda a chave gravada.
// v1 (só `labels` por chave, da primeira versão) continua sendo lido e vira v2.
// Tudo aqui é à prova de "tabela ainda não criada" (deploy antes do `prisma db push`): não lança.
import prisma from '@/lib/prisma';

export const LEGACY_KEYS = ['TREINO', 'TREINO_CARDIO', 'CARDIO', 'DESCANSO'] as const;
export const DAY_KEYS = LEGACY_KEYS;
export const SLOT_KEYS = ['TREINO', 'TREINO_CARDIO', 'CARDIO', 'DESCANSO', 'EXTRA_5', 'EXTRA_6', 'EXTRA_7'] as const;
export const MAX_TABS = SLOT_KEYS.length;
export const MAX_LABEL = 14;
const PRESETS = ['default', 'options', 'cycle', 'week', 'menus', 'custom'];

export type DayTab = { key: string; label?: string; base: string };
export type DayScheme = { v: 2; preset: string; tabs: DayTab[] };

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

const isLegacy = (b: unknown): b is string => typeof b === 'string' && (LEGACY_KEYS as readonly string[]).includes(b);

/** Esquema v2 válido ou null quando é igual ao padrão (4 abas, nomes e tipos de sempre). Aceita também o v1 ({ labels }). */
export function sanitizeDayScheme(raw: any): DayScheme | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  let tabs: DayTab[];
  if (Array.isArray(raw.tabs)) {
    const src = raw.tabs.slice(0, MAX_TABS);
    if (!src.length) return null;
    tabs = src.map((t: any, i: number) => {
      const label = sanitizeLabel(t?.label);
      const base = isLegacy(t?.base) ? t.base : (LEGACY_KEYS[i] ?? 'TREINO');
      return label ? { key: SLOT_KEYS[i], label, base } : { key: SLOT_KEYS[i], base };
    });
  } else if (raw.labels && typeof raw.labels === 'object') {
    // v1: nomes por chave nas 4 abas de sempre
    tabs = LEGACY_KEYS.map((k) => {
      const label = sanitizeLabel(raw.labels[k]);
      return label ? { key: k, label, base: k } : { key: k, base: k };
    });
  } else return null;
  const isDefault = tabs.length === 4 && tabs.every((t, i) => !t.label && t.base === LEGACY_KEYS[i]);
  if (isDefault) return null;
  return { v: 2, preset: PRESETS.includes(raw.preset) ? raw.preset : 'custom', tabs };
}

/** Chaves de aba permitidas por este esquema (sem esquema = as 4 de sempre). */
export const allowedKeys = (scheme: DayScheme | null): string[] => (scheme ? scheme.tabs.map((t) => t.key) : [...LEGACY_KEYS]);
/** Mais de 4 abas: um editor antigo (que não conhece as EXTRA_*) não pode salvar essa dieta sem apagar as abas extras. */
export const isExtended = (scheme: DayScheme | null): boolean => !!scheme && scheme.tabs.length > 4;

const missingTable = (e: any) => e?.code === 'P2021' || e?.code === 'P2022' || /does not exist/i.test(String(e?.message || '')) || /dietDayScheme/i.test(String(e?.message || ''));
let warned = false;
const warnOnce = (where: string, e: any) => {
  if (warned) return;
  warned = true;
  console.warn(`[dayScheme] ${where}: ${e?.code || ''} ${e?.message || e} — seguindo com as abas padrão (rode "prisma db push" pra ativar as abas personalizadas).`);
};

/** A tabela existe? (quando não existe, abas extras NÃO podem ser salvas: as refeições delas ficariam sem aba) */
export async function daySchemeAvailable(): Promise<boolean> {
  try {
    await (prisma as any).dietDayScheme.findFirst({ select: { dietId: true } });
    return true;
  } catch (e) {
    if (missingTable(e)) warnOnce('daySchemeAvailable', e); else console.error('[dayScheme] daySchemeAvailable', e);
    return false;
  }
}

/** Esquema gravado de UMA dieta (ou null). Nunca lança. */
export async function loadDayScheme(dietId: string | null | undefined): Promise<DayScheme | null> {
  if (!dietId) return null;
  try {
    const row = await (prisma as any).dietDayScheme.findUnique({ where: { dietId } });
    return row ? sanitizeDayScheme(row.scheme) : null;
  } catch (e) {
    if (missingTable(e)) warnOnce('loadDayScheme', e); else console.error('[dayScheme] loadDayScheme', e);
    return null;
  }
}

/**
 * Grava (ou apaga) o esquema de UMA dieta. `raw === undefined` = o cliente não mandou nada: herda o da dieta anterior
 * (`inheritFromDietId`), pra um salvamento feito por app que não conhece o esquema não perder as abas.
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
