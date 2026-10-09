// lib/execVideo.ts
// 🎥 (9 out 2026) Regras do VÍDEO DE EXECUÇÃO (ver prisma/schema/exec-video.prisma): quem pode enviar (liberação + limite do coach, ou pedido), validação do que o app manda
// e o que o coach responde. Funções puras + consultas com `db` injetável (para teste).
import prisma from '@/lib/prisma';
import { dateKeyBrt, startOfDayBrt } from '@/lib/agenda';

export const MAX_RECORD_SECONDS = 20;        // o que o app mostra ao aluno
export const MAX_UPLOAD_SECONDS = 30;        // teto na Cloudflare (folga para vídeo escolhido da galeria)
export const MAX_REPLY_SECONDS = 60;         // vídeo-resposta do coach
export const KEEP_DAYS = 90;                 // depois disso o arquivo é apagado
export const MAX_NOTE = 300;
export const MAX_BODY = 1000;
export const FEEDBACK_KINDS = ['TEXT', 'MOMENT', 'DRAWING', 'VIDEO', 'REFERENCE', 'COMBO'] as const;
export type FeedbackKind = (typeof FEEDBACK_KINDS)[number];
export const DRAW_COLORS = ['#FF3B30', '#FFD60A', '#34C759', '#0A84FF', '#FFFFFF'];
export const MAX_STROKES = 30;
export const MAX_POINTS = 200;
export const SHAPES = ['free', 'line', 'arrow', 'circle', 'rect'] as const;   // forma de cada traço: livre (vários pontos) ou figura (2 pontos: início e fim)
export const MAX_MARKS = 12;                  // marcações por vídeo numa resposta composta
const DAY = 86400000;
const GUID_RE = /^[a-f0-9]{32}$/i;

const text = (v: any, max: number) => String(v ?? '').replace(/\r\n/g, '\n').trim().slice(0, max);
const strip = (s: any) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export const isGuid = (v: any) => GUID_RE.test(String(v || ''));
export const expiryFrom = (now: Date) => new Date(now.getTime() + KEEP_DAYS * DAY);

/** O recado do aluno cita dor/lesão? Esses vídeos sobem na frente na central HOJE (regra simples por palavras: sem IA). */
export const isPriorityNote = (note: any) => /\b(dor|dores|doi|doeu|doendo|dolorid[oa]|lesao|lesoes|machu[cq]\w*|estalo|estalou|travou|formigamento|tontura|desmai\w*|inchad[oa]|inchou|inchaco)\b/.test(strip(note));

/** Primeiro instante do mês (horário de Brasília): o limite mensal conta a partir daqui. */
export function monthStartBrt(now: Date): Date {
  const key = dateKeyBrt(now);
  return startOfDayBrt(`${key.slice(0, 7)}-01`);
}

export interface UploadInput { exerciseId: string | null; exerciseName: string; workoutId: string | null; workoutExerciseId: string | null; day: string | null; setNumber: number | null; note: string | null; requestId: string | null }
export function cleanUploadInput(b: any): UploadInput {
  const n = Number(b?.setNumber);
  return {
    exerciseId: text(b?.exerciseId, 80) || null, exerciseName: text(b?.exerciseName, 120), workoutId: text(b?.workoutId, 80) || null, workoutExerciseId: text(b?.workoutExerciseId, 80) || null,
    day: text(b?.day, 40) || null, setNumber: Number.isInteger(n) && n >= 1 && n <= 50 ? n : null, note: text(b?.note, MAX_NOTE) || null, requestId: text(b?.requestId, 80) || null,
  };
}

/** Traços do desenho: coordenadas de 0 a 1 (independe do tamanho da tela), cores da lista, limites de tamanho. `type` = livre ou figura (reta, seta, círculo, retângulo: só início e fim). `null` se não sobrou traço. */
export function cleanDrawing(raw: any): { type: string; color: string; points: [number, number][] }[] | null {
  if (!Array.isArray(raw)) return null;
  const out: { type: string; color: string; points: [number, number][] }[] = [];
  for (const s of raw.slice(0, MAX_STROKES)) {
    const pts: [number, number][] = [];
    for (const p of (Array.isArray(s?.points) ? s.points : []).slice(0, MAX_POINTS)) {
      const x = Number(p?.[0]), y = Number(p?.[1]);
      if (Number.isFinite(x) && Number.isFinite(y)) pts.push([Math.round(Math.min(1, Math.max(0, x)) * 10000) / 10000, Math.round(Math.min(1, Math.max(0, y)) * 10000) / 10000]);
    }
    const type = (SHAPES as readonly string[]).includes(s?.type) ? String(s.type) : 'free';
    if (pts.length < 2) continue;
    const points = type === 'free' ? pts : [pts[0], pts[pts.length - 1]];   // figura = início e fim
    if (type !== 'free' && points[0][0] === points[1][0] && points[0][1] === points[1][1]) continue;   // figura sem tamanho não vale
    out.push({ type, color: DRAW_COLORS.includes(s?.color) ? s.color : DRAW_COLORS[0], points });
  }
  return out.length ? out : null;
}

/** Marcações num vídeo: cada uma = um instante + desenho (opcional) + nota (opcional); precisa ter ao menos um dos dois. Ordenadas pelo instante. */
export interface Mark { atSec: number; drawing: any[] | null; note: string | null }
export function cleanMarks(raw: any): Mark[] {
  if (!Array.isArray(raw)) return [];
  const out: Mark[] = [];
  for (const m of raw.slice(0, MAX_MARKS)) {
    const at = Number(m?.atSec);
    if (!Number.isFinite(at) || at < 0 || at > 3600) continue;
    const drawing = cleanDrawing(m?.drawing); const note = text(m?.note, MAX_NOTE) || null;
    if (!drawing && !note) continue;
    out.push({ atSec: Math.round(at * 10) / 10, drawing, note });
  }
  return out.sort((a, b) => a.atSec - b.atSec);
}

export interface CleanFeedback { kind: FeedbackKind; body: string | null; atSec: number | null; drawing: any[] | null; replyCfUid: string | null; referenceExerciseId: string | null; parts: any | null }
export function cleanFeedback(b: any): { ok: true; value: CleanFeedback } | { ok: false; error: string } {
  const kind = (FEEDBACK_KINDS as readonly string[]).includes(b?.kind) ? (b.kind as FeedbackKind) : null;
  if (!kind) return { ok: false, error: 'Tipo de resposta inválido.' };
  const body = text(b?.body, MAX_BODY) || null;
  const at = Number(b?.atSec);
  const atSec = Number.isFinite(at) && at >= 0 && at <= 3600 ? Math.round(at * 10) / 10 : null;
  const v: CleanFeedback = { kind, body, atSec: null, drawing: null, replyCfUid: null, referenceExerciseId: null, parts: null };
  if (kind === 'TEXT') { if (!body) return { ok: false, error: 'Escreva a resposta.' }; }
  if (kind === 'MOMENT') { if (!body) return { ok: false, error: 'Escreva o comentário.' }; if (atSec === null) return { ok: false, error: 'Escolha o instante do vídeo.' }; v.atSec = atSec; }
  if (kind === 'DRAWING') { const d = cleanDrawing(b?.drawing); if (!d) return { ok: false, error: 'Desenhe algo no vídeo.' }; if (atSec === null) return { ok: false, error: 'Escolha o instante do vídeo.' }; v.atSec = atSec; v.drawing = d; }
  if (kind === 'VIDEO') { if (!isGuid(b?.replyCfUid)) return { ok: false, error: 'Vídeo-resposta inválido.' }; v.replyCfUid = String(b.replyCfUid); }
  if (kind === 'REFERENCE') { const id = text(b?.referenceExerciseId, 80); if (!id) return { ok: false, error: 'Escolha o exercício da biblioteca.' }; v.referenceExerciseId = id; }
  if (kind === 'COMBO') {
    const marks = cleanMarks(b?.marks);
    let coach: { replyCfUid: string; marks: Mark[] } | null = null;
    if (b?.coach && b.coach.replyCfUid !== undefined && b.coach.replyCfUid !== null) {
      if (!isGuid(b.coach.replyCfUid)) return { ok: false, error: 'Vídeo do coach inválido.' };
      coach = { replyCfUid: String(b.coach.replyCfUid), marks: cleanMarks(b.coach.marks) };
    }
    const ref = text(b?.referenceExerciseId, 80) || null;
    if (!body && !marks.length && !coach && !ref) return { ok: false, error: 'Escreva algo, marque o vídeo, envie o seu vídeo ou escolha uma comparação.' };
    v.parts = { marks, coach };
    v.replyCfUid = coach ? coach.replyCfUid : null; v.referenceExerciseId = ref;
  }
  return { ok: true, value: v };
}

// ───────────────────────── liberação e limite ─────────────────────────
export interface Policy { enabled: boolean; monthlyLimit: number | null; source: 'STUDENT' | 'DEFAULT' | 'NONE' }

/** A regra do aluno vence a padrão do coach; sem nenhuma, só envia a pedido. */
export async function resolvePolicy(db: any, coachId: string | null | undefined, studentId: string): Promise<Policy> {
  if (!coachId) return { enabled: false, monthlyLimit: null, source: 'NONE' };
  const own = await db.videoPolicy.findFirst({ where: { coachId, studentId } });
  if (own) return { enabled: !!own.enabled, monthlyLimit: Number.isInteger(own.monthlyLimit) ? own.monthlyLimit : null, source: 'STUDENT' };
  const def = await db.videoPolicy.findFirst({ where: { coachId, studentId: '*' } });
  if (def) return { enabled: !!def.enabled, monthlyLimit: Number.isInteger(def.monthlyLimit) ? def.monthlyLimit : null, source: 'DEFAULT' };
  return { enabled: false, monthlyLimit: null, source: 'NONE' };
}

/** Vídeos livres do mês (os enviados a pedido do coach não contam; os que o aluno apagou contam, para não burlar o limite). */
export async function monthlyUsage(db: any, studentId: string, now: Date): Promise<number> {
  return db.executionVideo.count({ where: { userId: studentId, requestId: null, status: { in: ['UPLOADING', 'READY', 'DELETED'] }, createdAt: { gte: monthStartBrt(now) } } });
}

export async function openRequests(db: any, studentId: string): Promise<any[]> {
  return db.videoRequest.findMany({ where: { userId: studentId, status: 'OPEN' }, orderBy: { createdAt: 'desc' } });
}

export interface Allowance { canUpload: boolean; mode: 'REQUEST' | 'FREE' | 'NONE'; requestId: string | null; enabled: boolean; used: number; limit: number | null; reason: string | null }

/** O aluno pode enviar agora? Pedido do coach (daquele exercício, ou "qualquer") > liberação com limite sobrando > não. */
export async function checkAllowance(db: any, o: { studentId: string; coachId: string | null | undefined; exerciseId?: string | null; requestId?: string | null; now?: Date }): Promise<Allowance> {
  const now = o.now || new Date();
  const pol = await resolvePolicy(db, o.coachId, o.studentId);
  const used = await monthlyUsage(db, o.studentId, now);
  const base = { enabled: pol.enabled, used, limit: pol.monthlyLimit };
  const reqs = await openRequests(db, o.studentId);
  const hit = (o.requestId ? reqs.find((r) => r.id === o.requestId) : null) || (o.exerciseId ? reqs.find((r) => r.exerciseId === o.exerciseId) : null) || reqs.find((r) => !r.exerciseId) || null;
  if (hit && (!o.requestId || hit.id === o.requestId)) return { canUpload: true, mode: 'REQUEST', requestId: hit.id, reason: null, ...base };
  if (o.requestId) return { canUpload: false, mode: 'NONE', requestId: null, reason: 'Esse pedido de vídeo já foi atendido ou cancelado.', ...base };
  if (pol.enabled && (pol.monthlyLimit === null || used < pol.monthlyLimit)) return { canUpload: true, mode: 'FREE', requestId: null, reason: null, ...base };
  if (pol.enabled) return { canUpload: false, mode: 'NONE', requestId: null, reason: `Você já enviou os ${pol.monthlyLimit} vídeos deste mês. Seu coach pode pedir mais se precisar.`, ...base };
  return { canUpload: false, mode: 'NONE', requestId: null, reason: 'Seu coach ainda não liberou o envio de vídeos. Quando ele pedir um, você recebe um aviso.', ...base };
}

export const FIRST_NAME = (n: any) => String(n || '').trim().split(/\s+/)[0] || '';
export { prisma };
