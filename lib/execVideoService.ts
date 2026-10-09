// lib/execVideoService.ts
// 🎥 (9 out 2026) O "miolo" do vídeo de execução usado pelas rotas e pela limpeza automática: quem é quem (aluno x coach), a virada UPLOADING → READY (que avisa o coach e atende o pedido),
// como o vídeo é apresentado ao app (com link assinado) e a varredura que apaga o que venceu. Nada aqui derruba a ação principal por falha de push ou da Cloudflare.
import prisma from '@/lib/prisma';
import { canAccessStudent, AuthUser } from '@/lib/auth';
import { isCoachRole } from '@/lib/agendaAuth';
import { sendPushToUser } from '@/app/utils/sendNotification';
import { CfCfg, FetchLike, getVideoInfo, playbackFor, removeVideo } from '@/lib/videoStream';
import { FIRST_NAME, MAX_UPLOAD_SECONDS } from '@/lib/execVideo';

export const SWEEP_BATCH = 20;
const HOUR = 3600000;
/** Envio que não ficou pronto em tantas horas é dado como falho (o link de envio da Cloudflare já expirou). */
export const STALE_UPLOAD_HOURS = 6;

export async function loadStudent(db: any, id: string) {
  return db.user.findUnique({ where: { id }, select: { id: true, name: true, coachId: true, role: true, isTestAccount: true, pushToken: true } });
}

/** Aluno de verdade, ou o coach/master usando a conta do ALUNO TESTE (visualizar como aluno). Em aluno real, o coach nunca age como ele. */
export function actsAsStudent(user: AuthUser, student: any): boolean {
  if (!user || !student) return false;
  if (user.id === student.id) return true;
  return student.isTestAccount === true && canAccessStudent(user, student.id, student.coachId);
}
export const actsAsCoach = (user: AuthUser, student: any): boolean => !!student && user.id !== student.id && isCoachRole(user) && canAccessStudent(user, student.id, student.coachId);

async function notify(db: any, userId: string, title: string, body: string, data: any, send: any = sendPushToUser) {
  try {
    const u = await db.user.findUnique({ where: { id: userId }, select: { id: true, pushToken: true } });
    if (u) await send(u, title, body, data);
  } catch (e) { console.error('[execVideo] push:', (e as any)?.message || e); }
}
export { notify as notifyUser };

/**
 * O vídeo estava UPLOADING: pergunta à Cloudflare. Pronto → READY, atende o pedido do coach (se houve) e avisa o coach (uma vez só: a virada é o que dispara).
 * Ainda processando → continua UPLOADING. Devolve a linha atual.
 */
export async function refreshStatus(db: any, cf: CfCfg | null, video: any, o: { f?: FetchLike; send?: any; now?: Date } = {}) {
  if (!video || video.status !== 'UPLOADING' || !cf) return video;
  const info = await getVideoInfo(cf, video.cfUid, o.f);
  if (!info || !info.ready) return video;
  const now = o.now || new Date();
  const res = await db.executionVideo.updateMany({ where: { id: video.id, status: 'UPLOADING' }, data: { status: 'READY', durationSec: info.duration ?? video.durationSec ?? null } });
  if (!res.count) return db.executionVideo.findUnique({ where: { id: video.id } });   // outro processo já virou: ele avisou
  if (video.requestId) await db.videoRequest.updateMany({ where: { id: video.requestId, status: 'OPEN' }, data: { status: 'FULFILLED', videoId: video.id, fulfilledAt: now } });
  const row = await db.executionVideo.findUnique({ where: { id: video.id } });
  if (row && row.coachId) {
    const st: any = await db.user.findUnique({ where: { id: row.userId }, select: { name: true } }).catch(() => null);
    await notify(db, row.coachId, `🎥 ${FIRST_NAME(st?.name) || 'Aluno'} enviou um vídeo`, `${row.exerciseName}${row.studentNote ? ` — “${String(row.studentNote).slice(0, 60)}”` : ''}`, { type: 'exec_video', videoId: row.id, studentId: row.userId }, o.send);
  }
  return row;
}

/** Como o app enxerga um vídeo: dados + link assinado (só no detalhe) + respostas do coach. */
export async function presentVideo(db: any, cf: CfCfg | null, video: any, o: { f?: FetchLike; viewerIsStudent?: boolean } = {}) {
  const feedbacks: any[] = await db.videoFeedback.findMany({ where: { videoId: video.id }, orderBy: { createdAt: 'asc' } });
  const playback = video.status === 'READY' || video.status === 'UPLOADING' ? await playbackFor(cf, video.cfUid, o.f) : null;
  const items: any[] = [];
  for (const fb of feedbacks) {
    const it: any = { id: fb.id, kind: fb.kind, body: fb.body, atSec: fb.atSec, drawing: fb.drawing, createdAt: fb.createdAt, isNew: o.viewerIsStudent ? !fb.studentReadAt : false };
    if ((fb.kind === 'VIDEO' || fb.kind === 'COMBO') && fb.replyCfUid) { const p = await playbackFor(cf, fb.replyCfUid, o.f); it.reply = p ? { hls: p.hls, thumb: p.thumb, ready: p.ready } : null; }
    if (fb.kind === 'COMBO') { const pr: any = fb.parts && typeof fb.parts === 'object' ? fb.parts : {}; it.parts = { marks: Array.isArray(pr.marks) ? pr.marks : [], coachMarks: pr.coach && Array.isArray(pr.coach.marks) ? pr.coach.marks : [], hasCoachVideo: !!(pr.coach && pr.coach.replyCfUid) }; }
    if ((fb.kind === 'REFERENCE' || fb.kind === 'COMBO') && fb.referenceExerciseId) {
      const ex: any = await db.exercise.findUnique({ where: { id: fb.referenceExerciseId }, select: { id: true, name: true, videoUrl: true } }).catch(() => null);
      it.reference = ex ? { exerciseId: ex.id, name: ex.name, videoUrl: ex.videoUrl || null } : { exerciseId: fb.referenceExerciseId, name: fb.referenceName || null, videoUrl: null };
    }
    items.push(it);
  }
  return {
    id: video.id, userId: video.userId, exerciseId: video.exerciseId, exerciseName: video.exerciseName, workoutId: video.workoutId, day: video.day, setNumber: video.setNumber,
    studentNote: video.studentNote, status: video.status, durationSec: video.durationSec, priority: video.priority, requestId: video.requestId, createdAt: video.createdAt, expiresAt: video.expiresAt,
    coachViewedAt: video.coachViewedAt, playback: playback ? { hls: playback.hls, thumb: playback.thumb, ready: playback.ready } : null, feedbacks: items,
  };
}

/** Linha leve para listas (sem link e sem respostas inteiras). */
export function summarize(video: any, fb: { total: number; unread: number } = { total: 0, unread: 0 }) {
  return { id: video.id, userId: video.userId, exerciseId: video.exerciseId, exerciseName: video.exerciseName, day: video.day, status: video.status, durationSec: video.durationSec, studentNote: video.studentNote, priority: video.priority, requestId: video.requestId, createdAt: video.createdAt, expiresAt: video.expiresAt, coachViewedAt: video.coachViewedAt, feedbackCount: fb.total, unreadFeedback: fb.unread };
}

export async function feedbackCounts(db: any, videoIds: string[]): Promise<Map<string, { total: number; unread: number }>> {
  const out = new Map<string, { total: number; unread: number }>();
  if (!videoIds.length) return out;
  const rows: any[] = await db.videoFeedback.findMany({ where: { videoId: { in: videoIds } }, select: { videoId: true, studentReadAt: true } });
  for (const r of rows) { const c = out.get(r.videoId) || { total: 0, unread: 0 }; c.total++; if (!r.studentReadAt) c.unread++; out.set(r.videoId, c); }
  return out;
}

/**
 * Varredura (roda junto do cron da agenda, de 5 em 5 minutos): (1) vídeos que o aluno enviou mas fechou o app antes de avisar viram prontos; (2) envio parado há horas vira FALHOU
 * e é apagado da Cloudflare; (3) vídeos com mais de 90 dias (e as respostas em vídeo do coach) são apagados. Em lotes pequenos.
 */
export async function sweepExecVideos(db: any, cf: CfCfg | null, now: Date = new Date(), o: { f?: FetchLike; send?: any } = {}) {
  const out = { refreshed: 0, failed: 0, expired: 0 };
  if (!cf) return out;
  const staleBefore = new Date(now.getTime() - STALE_UPLOAD_HOURS * HOUR);
  const pending: any[] = await db.executionVideo.findMany({ where: { status: 'UPLOADING' }, orderBy: { createdAt: 'asc' }, take: SWEEP_BATCH });
  for (const v of pending) {
    const after = await refreshStatus(db, cf, v, { f: o.f, send: o.send, now });
    if (after && after.status === 'READY') { out.refreshed++; continue; }
    if (new Date(v.createdAt) < staleBefore) {
      await removeVideo(cf, v.cfUid, o.f);
      await db.executionVideo.updateMany({ where: { id: v.id, status: 'UPLOADING' }, data: { status: 'FAILED', deletedAt: now } });
      out.failed++;
    }
  }
  const old: any[] = await db.executionVideo.findMany({ where: { expiresAt: { lte: now }, status: { in: ['READY', 'UPLOADING', 'FAILED'] } }, orderBy: { expiresAt: 'asc' }, take: SWEEP_BATCH });
  for (const v of old) {
    const replies: any[] = await db.videoFeedback.findMany({ where: { videoId: v.id, replyCfUid: { not: null } }, select: { replyCfUid: true } });
    const ok = await removeVideo(cf, v.cfUid, o.f);
    for (const r of replies) await removeVideo(cf, r.replyCfUid, o.f);
    if (ok) { await db.executionVideo.updateMany({ where: { id: v.id }, data: { status: 'DELETED', deletedAt: now } }); out.expired++; }
  }
  return out;
}

export { prisma, MAX_UPLOAD_SECONDS };
