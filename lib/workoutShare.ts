// lib/workoutShare.ts
// 🔗 (2 out 2026) LINK DO TREINO EM PÁGINA. Regras puras (sem banco) usadas pelas rotas:
//   - POST/GET/DELETE /api/workout-share            -> o coach cria, lista e desativa os links (escolhas: nome do aluno, dias, validade)
//   - GET /api/treino-publico/[code]                -> a página pública (elitefitapp.com.br/t/?c=<code>) lê o treino por aqui, sem login
// Tudo o que sai para a página pública passa por buildPublicWorkout: só o que o aluno já vê no app (exercícios, séries, descanso, técnicas,
// "COACH AVISA", vídeos) -- nunca e-mail, telefone, ids de pessoas, cargas, histórico, avaliação ou anamnese.
import { randomBytes, createHash } from 'crypto';
import { SYSTEM_TECHNIQUES } from './techniqueGuide';

export const SHARE_CODE_LENGTH = 12;
export const MAX_EXPIRY_DAYS = 365;
export const MAX_EXPIRY_HOURS = MAX_EXPIRY_DAYS * 24;
export const MAX_DISPLAY_NAME = 40;
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
export type ShareOptions = { showName: boolean; displayName: string | null; days: string[]; expiresInHours: number | null };

/** Nome livre da página: sem quebras de linha/controle, espaços normalizados, até 40 caracteres. Vazio = null. */
export function cleanDisplayName(raw: unknown): string | null {
  const t = String(raw == null ? '' : raw).replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim();
  return t ? t : null;
}

export function parseShareOptions(body: any, availableDays: string[]): { ok: true; value: ShareOptions } | { ok: false; error: string } {
  const b = body && typeof body === 'object' ? body : {};
  if (b.showName !== undefined && typeof b.showName !== 'boolean') return { ok: false, error: 'showName deve ser verdadeiro ou falso.' };

  // validade: obrigatória e explícita (null = sem validade), para nunca criar um link eterno por descuido.
  // `expiresInHours` (1 a 8760) ou `expiresInDays` (1 a 365, formato antigo); se vierem os dois, vale o das horas.
  if (!('expiresInHours' in b) && !('expiresInDays' in b)) return { ok: false, error: 'Informe a validade (expiresInHours ou expiresInDays): um número ou null para não expirar.' };
  let expiresInHours: number | null = null;
  const useHours = 'expiresInHours' in b;
  const rawExp = useHours ? b.expiresInHours : b.expiresInDays;
  if (rawExp !== null) {
    const n = Number(rawExp);
    const max = useHours ? MAX_EXPIRY_HOURS : MAX_EXPIRY_DAYS;
    if (!Number.isInteger(n) || n < 1 || n > max) return { ok: false, error: useHours ? `A validade deve ser de 1 a ${MAX_EXPIRY_HOURS} horas, ou null para não expirar.` : `A validade deve ser de 1 a ${MAX_EXPIRY_DAYS} dias, ou null para não expirar.` };
    expiresInHours = useHours ? n : n * 24;
  }

  // nome que aparece na página (só vale com showName)
  let displayName: string | null = null;
  if (b.displayName !== undefined && b.displayName !== null) {
    if (typeof b.displayName !== 'string') return { ok: false, error: 'O nome deve ser um texto.' };
    const raw = b.displayName.replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim();
    if (raw.length > MAX_DISPLAY_NAME) return { ok: false, error: `O nome pode ter até ${MAX_DISPLAY_NAME} caracteres.` };
    displayName = b.showName === true ? cleanDisplayName(raw) : null;
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
  return { ok: true, value: { showName: b.showName === true, displayName, days, expiresInHours } };
}

export const computeExpiresAt = (expiresInHours: number | null, now: Date = new Date()): Date | null =>
  expiresInHours == null ? null : new Date(now.getTime() + expiresInHours * 60 * 60 * 1000);

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
  share: { code?: string; showName: boolean; displayName?: string | null; days: string[]; expiresAt: Date | string | null };
  studentName?: string | null;
  coach?: { name?: string | null; brandLogoUrl?: string | null; brandLogoSize?: number | null } | null;
  customTechniques?: CustomTechniqueRow[];
  systemVideos?: Record<string, string>;                       // chave da técnica -> endereço do vídeo (já com a herança do time)
};

const customKey = (id: string) => `C:${id}`;

/** Código opaco do exercício na página (guarda a marcação de "feito" no aparelho do aluno). Vem do dia + exercício do catálogo + posição entre repetidos,
 *  e NÃO do id da linha (o app recria as linhas a cada salvar), então sobrevive a edições do coach. O código do link entra no cálculo: não vaza id nenhum. */
export function exerciseKey(shareCode: string, day: string, exerciseId: unknown, occurrence: number): string {
  return createHash('sha256').update(`${shareCode}|${day}|${String(exerciseId == null ? '' : exerciseId)}|${occurrence}`).digest('hex').slice(0, 12);
}
const stepsOf = (steps: any): string[] | null => {
  if (!Array.isArray(steps)) return null;
  const out = steps.map((s) => (typeof s === 'string' ? s : s && typeof s.text === 'string' ? s.text : s && typeof s.title === 'string' ? s.title : '')).map((s) => s.trim().slice(0, 300)).filter(Boolean).slice(0, 12);
  return out.length ? out : null;
};

export function buildPublicWorkout(input: PublicInput) {
  const customMap = new Map<string, CustomTechniqueRow>((input.customTechniques || []).map((t) => [t.id, t]));
  const sysVideos = input.systemVideos || {};
  const usedTech = new Set<string>();

  const shareCode = String(input.share.code || '');
  const allDays: string[] = [];
  for (const r of input.rows) { const d = String(r?.day == null ? '' : r.day); if (!allDays.includes(d)) allDays.push(d); }
  const wanted = input.share.days && input.share.days.length ? allDays.filter((d) => input.share.days.includes(d)) : allDays;

  const days = wanted.map((day) => {
    const dayRows = input.rows.filter((r) => String(r?.day == null ? '' : r.day) === day);
    const bySection: Record<SectionKey, any[]> = { MOBILIDADE: [], MUSCULACAO: [], CARDIO: [] };
    const seen: Record<string, number> = {};

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
      const repsLabel = !firstReps ? '?' : /^\d+(?:\s*[-–/]\s*\d+)*$/.test(firstReps) ? `${firstReps} reps` : firstReps;   // "10" -> "10 reps"; "30s" e "Falha" ficam como o coach escreveu
      const summary = cardio ? `${total} minutos · ${firstReps || '?'} kcal` : varying ? `${total} séries totais` : `${total} séries × ${repsLabel}`;
      const rest = blocks.find((b) => b.restTime)?.restTime || null;
      const subIds: any[] = Array.isArray(r.substitutes) && r.substitutes.length ? r.substitutes : r.substituteId ? [r.substituteId] : [];   // `substituteId` = formato antigo (um só)
      const subs = subIds.map((id: any) => input.substituteNames?.[String(id)]).filter(Boolean).slice(0, 3) as string[];

      const exId = String(r.exerciseId == null ? name : r.exerciseId);
      seen[exId] = (seen[exId] || 0) + 1;
      bySection[sectionOf(ex.category)].push({
        key: exerciseKey(shareCode, day, exId, seen[exId]),
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
    student: input.share.showName ? cleanDisplayName(input.share.displayName) || firstName(input.studentName) || null : null,
    coach: coach ? { name: coach.name ? String(coach.name).trim().slice(0, 80) : null, brandLogoUrl: coach.brandLogoUrl || null, brandLogoSize: coach.brandLogoSize || null } : null,
    expiresAt: input.share.expiresAt ? new Date(input.share.expiresAt).toISOString() : null,
    days,
    techniques,
  };
}

// ─────────────────────────── treino AVULSO (QuickWorkout) ───────────────────────────
// O editor do app guarda o treino avulso como nos templates: JSON {"A":[exercício do editor...], "B":[...]}. Aqui validamos esse JSON ao salvar e o
// transformamos nas mesmas "linhas" do treino de aluno, para a página pública usar o mesmo código (buildPublicWorkout) nos dois casos.
export const MAX_QUICK_DATA_CHARS = 500_000;
export const MAX_QUICK_DAYS = 14;
export const MAX_QUICK_PER_DAY = 100;
export const MAX_QUICK_TOTAL = 400;
export const MAX_QUICK_NAME = 80;

export type QuickDays = Record<string, any[]>;

export function parseQuickData(data: unknown): { ok: true; days: QuickDays } | { ok: false; error: string } {
  if (typeof data !== 'string' || !data.trim()) return { ok: false, error: 'O treino está vazio.' };
  if (data.length > MAX_QUICK_DATA_CHARS) return { ok: false, error: 'O treino é grande demais.' };
  let parsed: any;
  try { parsed = JSON.parse(data); } catch { return { ok: false, error: 'O treino está em um formato inválido.' }; }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return { ok: false, error: 'O treino está em um formato inválido.' };
  const keys = Object.keys(parsed);
  if (keys.length === 0 || keys.length > MAX_QUICK_DAYS) return { ok: false, error: `O treino deve ter de 1 a ${MAX_QUICK_DAYS} dias.` };
  const days: QuickDays = {};
  let total = 0;
  for (const k of keys) {
    const day = String(k).trim();
    if (!day || day.length > 40 || day in days) return { ok: false, error: 'Nome de dia inválido.' };
    const list = parsed[k];
    if (!Array.isArray(list)) return { ok: false, error: 'O treino está em um formato inválido.' };
    if (list.length > MAX_QUICK_PER_DAY) return { ok: false, error: `Cada dia pode ter até ${MAX_QUICK_PER_DAY} exercícios.` };
    for (const ex of list) {
      if (!ex || typeof ex !== 'object' || ex.exerciseId == null || String(ex.exerciseId).trim() === '') return { ok: false, error: 'Há um exercício sem identificação.' };
      total += 1;
    }
    days[day] = list;
  }
  if (total === 0) return { ok: false, error: 'Adicione pelo menos um exercício.' };
  if (total > MAX_QUICK_TOTAL) return { ok: false, error: `O treino pode ter até ${MAX_QUICK_TOTAL} exercícios.` };
  return { ok: true, days };
}

/** Dias que têm exercício, na ordem do treino (é o que o coach pode escolher mostrar). */
export const quickAvailableDays = (days: QuickDays): string[] => Object.keys(days).filter((d) => (days[d] || []).length > 0);

const subIdsOf = (ex: any): string[] => {
  const ids: string[] = [];
  (Array.isArray(ex?.substitutes) ? ex.substitutes : []).forEach((s: any) => { const id = s && typeof s === 'object' ? (s.id ?? s.exerciseId) : s; if (id != null && String(id)) ids.push(String(id)); });
  if (!ids.length && ex?.substitute && ex.substitute.id != null) ids.push(String(ex.substitute.id));
  return ids;
};

/** Ids de exercícios do catálogo que o treino cita (os principais e as trocas), para buscar nome/categoria/vídeo no banco. */
export function quickExerciseIds(days: QuickDays): string[] {
  const out = new Set<string>();
  Object.values(days).forEach((list) => list.forEach((ex) => { out.add(String(ex.exerciseId)); subIdsOf(ex).forEach((id) => out.add(id)); }));
  return Array.from(out);
}

/** Nomes das trocas que vieram escritos no próprio JSON (usados quando o exercício não está mais no catálogo). */
export function quickSubstituteNames(days: QuickDays): Record<string, string> {
  const out: Record<string, string> = {};
  Object.values(days).forEach((list) => list.forEach((ex) => {
    (Array.isArray(ex?.substitutes) ? ex.substitutes : []).forEach((s: any) => { if (s && typeof s === 'object' && (s.id ?? s.exerciseId) != null && typeof s.name === 'string' && s.name.trim()) out[String(s.id ?? s.exerciseId)] = s.name.trim().slice(0, 120); });
  }));
  return out;
}

export type CatalogExercise = { name?: string | null; category?: string | null; videoUrl?: string | null };

/** Linhas no formato do treino de aluno (day, order, exerciseId, technique {"b","t","o"}, exercise{name,category,videoUrl}). O catálogo do banco manda; o JSON só cobre exercício apagado. */
export function quickRows(days: QuickDays, catalog: Record<string, CatalogExercise | undefined>): any[] {
  const rows: any[] = [];
  let order = 0;
  Object.keys(days).forEach((day) => {
    (days[day] || []).forEach((ex) => {
      const id = String(ex.exerciseId);
      const cat = catalog[id];
      const rawBlocks = Array.isArray(ex.blocks) && ex.blocks.length ? ex.blocks.slice(0, 30) : [{ sets: '3', reps: '10', restTime: '60', technique: '' }];
      const first = rawBlocks[0] || {};
      const obs = typeof ex.observation === 'string' ? ex.observation : '';
      rows.push({
        day: String(day).trim(),
        order: order++,
        exerciseId: id,
        title: null,
        sets: parseInt(String(first.sets), 10) || 3,
        reps: String(first.reps == null ? '12' : first.reps),
        restTime: parseInt(String(first.restTime), 10) || 0,
        technique: JSON.stringify({ t: first.technique || '', b: rawBlocks, o: obs }),
        observation: obs,
        substitutes: subIdsOf(ex),
        exercise: cat && cat.name
          ? { name: cat.name, category: cat.category || ex.category || '', videoUrl: cat.videoUrl || null }
          : { name: String(ex.title || ex.name || 'Exercício'), category: String(ex.category || ''), videoUrl: typeof ex.videoUrl === 'string' ? ex.videoUrl : null },
      });
    });
  });
  return rows;
}
