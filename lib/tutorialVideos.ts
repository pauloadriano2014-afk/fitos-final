// lib/tutorialVideos.ts
// 🎓 (10 out 2026) Regras puras dos vídeos do tutorial do app (sem banco, para testar): quais abas existem, o que é um link válido e como limpar capítulos e nomes que vêm da tela do master.
export const TUTORIAL_TABS = ['Início', 'Treinos', 'Dieta', 'Evolução', 'Histórico', 'Check-in', 'Biblioteca', 'Assistente', 'Perfil'] as const;
export const MAX_CHAPTERS = 30;
const MAX_SECONDS = 4 * 3600;

export const isTab = (t: any): boolean => typeof t === 'string' && (TUTORIAL_TABS as readonly string[]).includes(t);

/** Só https e só dos players que o app abre (Cloudflare Stream HLS/iframe, mp4 público). Vazio = limpar. `undefined` = não mexer. */
export function cleanUrl(v: any): string | null | undefined {
  if (v === undefined) return undefined;
  if (v === null || String(v).trim() === '') return null;
  const s = String(v).trim().slice(0, 600);
  if (!/^https:\/\/[^\s<>"']+$/i.test(s)) throw new Error('O link do vídeo precisa começar com https://');
  let host = '';
  try { host = new URL(s).hostname.toLowerCase(); } catch { throw new Error('Link de vídeo inválido.'); }
  const okHost = host.endsWith('.cloudflarestream.com') || host === 'cloudflarestream.com' || host.endsWith('.videodelivery.net') || host === 'videodelivery.net';
  const isMp4 = /\.mp4(\?|$)/i.test(s);
  if (!okHost && !isMp4) throw new Error('Use o link do vídeo na Cloudflare Stream (ou um .mp4).');
  return s;
}

export function cleanText(v: any, max: number): string | null | undefined {
  if (v === undefined) return undefined;
  if (v === null) return null;
  const s = String(v).replace(/[\u0000-\u001f<>]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
  return s === '' ? null : s;
}

export const cleanGuid = (v: any): string | null | undefined => (v === undefined ? undefined : v === null || v === '' ? null : /^[a-f0-9]{32}$/i.test(String(v)) ? String(v).toLowerCase() : (() => { throw new Error('GUID inválido.'); })());

/** Capítulos: [{ id, title, start, end? }]. Descarta o que não tem título ou início; ordena pelo início; limita a quantidade; `id` vazio vira c1, c2… */
export function cleanChapters(raw: any): { id: string; title: string; start: number; end?: number }[] | undefined {
  if (raw === undefined) return undefined;
  if (!Array.isArray(raw)) throw new Error('Capítulos inválidos.');
  const list = raw.filter((c) => c && typeof c === 'object').map((c) => {
    const title = cleanText(c.title, 60); const start = Number(c.start);
    const end = c.end === undefined || c.end === null || c.end === '' ? undefined : Number(c.end);
    return { id: String(c.id || '').toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, 30), title, start, end };
  }).filter((c) => c.title && Number.isFinite(c.start) && c.start >= 0 && c.start <= MAX_SECONDS)
    .sort((a, b) => a.start - b.start).slice(0, MAX_CHAPTERS);
  const used = new Set<string>();
  return list.map((c, i) => {
    let id = c.id || `c${i + 1}`; while (used.has(id)) id += '_'; used.add(id);
    const out: { id: string; title: string; start: number; end?: number } = { id, title: c.title as string, start: Math.round(c.start * 10) / 10 };
    if (c.end !== undefined && Number.isFinite(c.end) && c.end > c.start && c.end <= MAX_SECONDS) out.end = Math.round(c.end * 10) / 10;
    return out;
  });
}

/** O que o master mandou virou o que vai ao banco (só os campos presentes). Lança Error com texto em português se algo for inválido. */
export function buildUpdate(body: any): Record<string, any> {
  const b = body && typeof body === 'object' ? body : {};
  const out: Record<string, any> = {};
  const set = (k: string, v: any) => { if (v !== undefined) out[k] = v; };
  set('url', cleanUrl(b.url)); set('guid', cleanGuid(b.guid)); set('title', cleanText(b.title, 40)); set('partnerTitle', cleanText(b.partnerTitle, 40)); set('subtitle', cleanText(b.subtitle, 80));
  set('chapters', cleanChapters(b.chapters));
  if (b.durationSec !== undefined) { const d = Number(b.durationSec); out.durationSec = Number.isFinite(d) && d > 0 && d < MAX_SECONDS ? d : null; }
  return out;
}

/** Linha do banco -> o que o app recebe. */
export function toPublic(r: any) {
  const ch = Array.isArray(r?.chapters) ? r.chapters : null;   // null = o app usa os capítulos padrão
  return { tab: r.tab, url: r.url || null, title: r.title || null, partnerTitle: r.partnerTitle || null, subtitle: r.subtitle || null, chapters: ch, durationSec: r.durationSec ?? null, updatedAt: r.updatedAt || null };
}
