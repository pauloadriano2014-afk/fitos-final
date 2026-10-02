// lib/workoutShare.ts
// 🔗 (2 out 2026) LINK DO TREINO EM PÁGINA. Regras puras (sem banco) usadas pelas rotas:
//   - POST/GET/DELETE /api/workout-share            -> o coach cria, lista e desativa os links (escolhas: nome do aluno, dias, validade)
//   - GET /api/treino-publico/[code]                -> a página pública (elitefitapp.com.br/t/?c=<code>) lê o treino por aqui, sem login
// Tudo o que sai para a página pública passa por buildPublicWorkout: só o que o aluno já vê no app (exercícios, séries, descanso, técnicas,
// "COACH AVISA", vídeos) -- nunca e-mail, telefone, ids de pessoas, cargas, histórico, avaliação ou anamnese.
import { randomBytes } from 'crypto';
import { SYSTEM_TECHNIQUES } from './techniqueGuide';

export const SHARE_CODE_LENGTH = 12;
export const MAX_EXPIRY_DAYS = 365;
export const MASTER_TEAM_ID = 'MASTER_TEAM';

const ALPHABET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';   // 62 símbolos

/** Código aleatório do link (12 caracteres de 62 = ~71 bits; sem viés: descarta bytes que não dividem certinho). */
export function generateShareCode(length = SHARE_CODE_LENGTH): string {
  let out = '';
  while (out.length < length) {
    for (const b of randomBytes(length * 2)) {
      if (b >= 248) continue;                                   // 248 = 62 * 4
      out += ALPHABET[b % 62];
      if (out.length === length) break;
    }
  }
  return out;
}

export const isValidShareCode = (code: unknown): code is string => typeof code === 'string' && /^[A-Za-z0-9]{10,24}$/.test(code);

// ─────────────────────────── escolhas do coach ───────────────────────────
export type ShareOptions = { showName: boolean; days: string[]; expiresInDays: number | null };

export function parseShareOptions(body: any, availableDays: string[]): { ok: true; value: ShareOptions } | { ok: false; error: string } {
  const b = body && typeof body === 'object' ? body : {};
  if (b.showName !== undefined && typeof b.showName !== 'boolean') return { ok: false, error: 'showName deve ser verdadeiro ou falso.' };

  // validade: obrigatória e explícita (null = sem validade), para nunca criar um link eterno por descuido
  if (!('expiresInDays' in b)) return { ok: false, error: 'Informe a validade (expiresInDays): um número de dias ou null para não expirar.' };
  let expiresInDays: number | null = null;
  if (b.expiresInDays !== null) {
    const n = Number(b.expiresInDays);
    if (!Number.isInteger(n) || n < 1 || n > MAX_EXPIRY_DAYS) return { ok: false, error: `A validade deve ser de 1 a ${MAX_EXPIRY_DAYS} dias, ou null para não expirar.` };
    expiresInDays = n;
  }

  // dias: vazio/ausente = todos
  let days: string[] = [];
  if (b.days !== undefined && b.days !== null) {
    if (!Array.isArray(b.days)) return { ok: false, error: 'days deve ser uma lista de dias.' };
    const wanted: string[] = Array.from(new Set<string>(b.days.map((d: any) => String(d == null ? '' : d).trim()).filter(Boolean)));
    const unknown = wanted.filter((d) => !availableDays.includes(d));
    if (unknown.length) return { ok: false, error: `Este treino não tem o(s) dia(s): ${unknown.join(', ')}.` };
    days = wanted.length === availableDays.length ? [] : wanted;   // todos os dias marcados = "todos" (inclui dias criados depois)
  }
  return { ok: true, value: { showName: b.showName === true, days, expiresInDays } };
}

export const computeExpiresAt = (expiresInDays: number | null, now: Date = new Date()): Date | null =>
  expiresInDays == null ? null : new Date(now.getTime() + expiresInDays * 24 * 60 * 60 * 1000);

export type ShareStatus = 'ACTIVE' | 'EXPIRED' | 'REVOKED';
export function shareStatus(share: { revokedAt?: Date | string | null; expiresAt?: Date | string | null }, now: Date = new Date()): ShareStatus {
  if (share.revokedAt) return 'REVOKED';
  if (share.expiresAt && new Date(share.expiresAt).getTime() <= now.getTime()) return 'EXPIRED';
  return 'ACTIVE';
}

export const firstName = (name: unknown): string => String(name == null ? '' : name).trim().split(/\s+/)[0] || '';

// ─────────────────────────── vídeos ───────────────────────────
export type VideoRef = { type: 'cf'; c: string; v: string } | { type: 'yt'; id: string } | { type: 'url'; url: string } | null;
const CF_RE = /^https?:\/\/customer-([a-z0-9]+)\.cloudflarestream\.com\/([a-f0-9]{32})(?:[/?#]|$)/i;
const YT_RE = /(?:youtube\.com\/(?:[^/]+\/.+\/|(?:v|e(?:mbed)?|shorts)\/|.*[?&]v=)|youtu\.be\/)([A-Za-z0-9_-]{11})(?:[^A-Za-z0-9_-]|$)/;
const DIRECT_RE = /^https?:\/\/[^\s]+\.(?:mp4|mov|m4v|webm)(?:[?#][^\s]*)?$/i;

export function parseVideoRef(raw: unknown): VideoRef {
  const url = String(raw == null ? '' : raw).trim();
  if (!url) return null;
  const cf = url.match(CF_RE); if (cf) return { type: 'cf', c: cf[1].toLowerCase(), v: cf[2].toLowerCase() };
  const yt = url.match(YT_RE); if (yt) return { type: 'yt', id: yt[1] };
  if (DIRECT_RE.test(url)) return { type: 'url', url };
  return null;
}

// ─────────────────────────── técnicas ───────────────────────────
const TECH_ALIASES: Record<string, string> = {
  DROPSET: 'DROPSET', RESTPAUSE: 'RESTPAUSE', BISET: 'BISET', TRISET: 'TRISET', CLUSTERSET: 'CLUSTERSET', CLUSTER: 'CLUSTERSET', GVT: 'GVT', GVT10X10: 'GVT',
  TUT: 'TUT', '21': '21', METODO21: '21', MÉTODO21: '21', '15REPS': '1_5_REPS', '1EMEIO': '1_5_REPS', '1EMEIO15REPS': '1_5_REPS',
};

/** Chave da técnica do sistema (DROPSET, RESTPAUSE...) ou null se for execução normal/texto livre. */
export function normalizeTechKey(raw: unknown): string | null {
  const t = String(raw == null ? '' : raw).trim().toUpperCase();
  if (!t || t === 'NORMAL') return null;
  if (SYSTEM_TECHNIQUES[t]) return t;
  const compact = t.replace(/[\s_.\-()]/g, '');
  return TECH_ALIASES[compact] || null;
}

export type Block = { sets: number; reps: string; restTime: number | null; techKey: string | null; customId: string | null; techLabel: string | null };

const clampInt = (v: any, min: number, max: number, fallback: number) => { const n = parseInt(String(v), 10); return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback; };

/** Mesma leitura do app do aluno: a coluna `technique` pode guardar {"b": blocos, "t": técnica, "o": observação}. */
export function parseExerciseRow(row: any): { blocks: Block[]; observation: string | null } {
  let rawBlocks: any[] | null = null;
  let realTech: any = row?.technique;
  let obs: any = row?.observation;
  if (typeof row?.technique === 'string' && row.technique.trim().startsWith('{')) {
    realTech = null;
    try {
      const parsed = JSON.parse(row.technique);
      if (parsed && Array.isArray(parsed.b)) { rawBlocks = parsed.b; realTech = parsed.t || null; obs = parsed.o || obs; }
    } catch { /* texto quebrado: cai no padrão da linha */ }
  }
  if (!rawBlocks || rawBlocks.length === 0) {
    rawBlocks = [{ sets: row?.sets || 3, reps: row?.reps || '12', restTime: row?.restTime || 60, technique: realTech || '', customTechniqueId: row?.customTechniqueId || undefined }];
  }
  const blocks: Block[] = rawBlocks.slice(0, 30).map((b: any) => {
    const customId = b && b.customTechniqueId ? String(b.customTechniqueId) : null;
    const rest = parseInt(String(b?.restTime), 10);
    return {
      sets: clampInt(b?.sets, 1, 99, 1),
      reps: String(b?.reps == null ? '' : b.reps).trim().slice(0, 20),
      restTime: Number.isFinite(rest) && rest > 0 ? Math.min(rest, 3600) : null,
      techKey: customId ? null : normalizeTechKey(b?.technique),
      customId,
      techLabel: customId ? null : (b?.technique && !normalizeTechKey(b.technique) && String(b.technique).trim().toUpperCase() !== 'NORMAL' ? String(b.technique).trim().slice(0, 40) : null),
    };
  });
  const observation = typeof obs === 'string' && obs.trim() ? obs.trim().slice(0, 600) : null;
  return { blocks, observation };
}

// ─────────────────────────── seções (como no app) ───────────────────────────
export type SectionKey = 'MOBILIDADE' | 'MUSCULACAO' | 'CARDIO';
export const SECTION_ORDER: SectionKey[] = ['MOBILIDADE', 'MUSCULACAO', 'CARDIO'];
export const SECTION_LABEL: Record<SectionKey, string> = { MOBILIDADE: 'Alongamento e mobilidade', MUSCULACAO: 'Musculação', CARDIO: 'Cardio' };
export function sectionOf(category: unknown): SectionKey {
  const c = String(category == null ? '' : category).toUpperCase();
  if (c === 'MOBILIDADE') return 'MOBILIDADE';
  if (c === 'CARDIO') return 'CARDIO';
  return 'MUSCULACAO';
}
const isCardio = (category: unknown, name: unknown) => {
  const c = String(category == null ? '' : category).toUpperCase();
  return c === 'CARDIO' || c === 'AERÓBICO' || c === 'AEROBICO' || /elíptico|eliptico|esteira|bike|bicicleta|escada|caminhada|corrida/i.test(String(name == null ? '' : name));
};

// ─────────────────────────── a página pública ───────────────────────────
export type PublicTechnique = { title: string; desc: string; steps: string[] | null; video: VideoRef };
export type CustomTechniqueRow = { id: string; name: string; description?: string | null; steps?: any; videoUrl?: string | null };

export type PublicInput = {
  workoutName: string;
  rows: any[];                                                // WorkoutExercise com `exercise`, já ordenadas por `order`
  substituteNames?: Record<string, string>;                    // id do exercício -> nome (para "pode trocar por")
  share: { showName: boolean; days: string[]; expiresAt: Date | string | null };
  studentName?: string | null;
  coach?: { name?: string | null; brandLogoUrl?: string | null; brandLogoSize?: number | null } | null;
  customTechniques?: CustomTechniqueRow[];
  systemVideos?: Record<string, string>;                       // chave da técnica -> endereço do vídeo (já com a herança do time)
};

const customKey = (id: string) => `C:${id}`;
const stepsOf = (steps: any): string[] | null => {
  if (!Array.isArray(steps)) return null;
  const out = steps.map((s) => (typeof s === 'string' ? s : s && typeof s.text === 'string' ? s.text : s && typeof s.title === 'string' ? s.title : '')).map((s) => s.trim().slice(0, 300)).filter(Boolean).slice(0, 12);
  return out.length ? out : null;
};

export function buildPublicWorkout(input: PublicInput) {
  const customMap = new Map<string, CustomTechniqueRow>((input.customTechniques || []).map((t) => [t.id, t]));
  const sysVideos = input.systemVideos || {};
  const usedTech = new Set<string>();

  const allDays: string[] = [];
  for (const r of input.rows) { const d = String(r?.day == null ? '' : r.day); if (!allDays.includes(d)) allDays.push(d); }
  const wanted = input.share.days && input.share.days.length ? allDays.filter((d) => input.share.days.includes(d)) : allDays;

  const days = wanted.map((day) => {
    const dayRows = input.rows.filter((r) => String(r?.day == null ? '' : r.day) === day);
    const bySection: Record<SectionKey, any[]> = { MOBILIDADE: [], MUSCULACAO: [], CARDIO: [] };

    dayRows.forEach((r) => {
      const ex = r.exercise || {};
      const name = String(r.title || ex.name || 'Exercício').trim().slice(0, 120);
      const cardio = isCardio(ex.category, ex.name);
      const { blocks, observation } = parseExerciseRow(r);

      // alertas de técnica por trecho de séries (mesma redação do app: "DROP-SET na última série")
      const titleOf = (b: Block) => (b.customId ? customMap.get(b.customId)?.name || 'Técnica personalizada' : b.techKey ? SYSTEM_TECHNIQUES[b.techKey]?.title || b.techKey : b.techLabel || '');
      const keyOf = (b: Block) => (b.customId ? customKey(b.customId) : b.techKey);
      const segs: { label: string; key: string | null; start: number; end: number }[] = [];
      let cum = 0;
      blocks.forEach((b) => {
        const label = titleOf(b); const key = keyOf(b); const start = cum + 1; const end = cum + b.sets; cum += b.sets;
        const last = segs[segs.length - 1];
        if (last && last.label === label && last.key === key) last.end = end; else segs.push({ label, key, start, end });
      });
      const total = cum;
      const techAlerts: { key: string | null; text: string }[] = [];
      segs.forEach((s) => {
        if (!s.label) return;
        if (s.key) usedTech.add(s.key);
        const n = s.end - s.start + 1;
        let text: string;
        if (cardio) text = s.label;
        else if (n === total) text = `${s.label} em todas as séries`;
        else if (s.end === total && n === 1) text = `${s.label} na última série`;
        else if (s.end === total) text = `${s.label} nas últimas séries`;
        else if (n === 1) text = `${s.label} na ${s.start}ª série`;
        else text = `${s.label} da ${s.start}ª à ${s.end}ª série`;
        if (!techAlerts.some((a) => a.text === text)) techAlerts.push({ key: s.key, text });
      });

      const firstReps = blocks[0]?.reps || '';
      const varying = blocks.some((b) => b.reps !== firstReps);
      const summary = cardio ? `${total} minutos · ${firstReps || '?'} kcal` : varying ? `${total} séries totais` : `${total} séries × ${firstReps || '?'} reps`;
      const rest = blocks.find((b) => b.restTime)?.restTime || null;
      const subIds: any[] = Array.isArray(r.substitutes) && r.substitutes.length ? r.substitutes : r.substituteId ? [r.substituteId] : [];   // `substituteId` = formato antigo (um só)
      const subs = subIds.map((id: any) => input.substituteNames?.[String(id)]).filter(Boolean).slice(0, 3) as string[];

      bySection[sectionOf(ex.category)].push({
        name,
        cardio,
        video: parseVideoRef(ex.videoUrl),
        summary,
        rest: cardio ? null : rest,
        blocks: blocks.length > 1 ? blocks.map((b) => ({ sets: b.sets, reps: b.reps, tech: titleOf(b) || null })) : null,
        techAlerts,
        observation,
        substitutes: subs,
      });
    });

    return {
      day,
      sections: SECTION_ORDER.filter((k) => bySection[k].length).map((k) => ({ key: k, label: SECTION_LABEL[k], items: bySection[k] })),
    };
  });

  const techniques: Record<string, PublicTechnique> = {};
  usedTech.forEach((key) => {
    if (key.startsWith('C:')) {
      const t = customMap.get(key.slice(2));
      if (t) techniques[key] = { title: t.name, desc: String(t.description || '').trim().slice(0, 2000), steps: stepsOf(t.steps), video: parseVideoRef(t.videoUrl) };
    } else if (SYSTEM_TECHNIQUES[key]) {
      techniques[key] = { title: SYSTEM_TECHNIQUES[key].title, desc: SYSTEM_TECHNIQUES[key].desc, steps: null, video: parseVideoRef(sysVideos[key]) };
    }
  });

  const coach = input.coach || null;
  return {
    workout: { name: String(input.workoutName || 'Treino').trim().slice(0, 120) },
    student: input.share.showName ? firstName(input.studentName) || null : null,
    coach: coach ? { name: coach.name ? String(coach.name).trim().slice(0, 80) : null, brandLogoUrl: coach.brandLogoUrl || null, brandLogoSize: coach.brandLogoSize || null } : null,
    expiresAt: input.share.expiresAt ? new Date(input.share.expiresAt).toISOString() : null,
    days,
    techniques,
  };
}
