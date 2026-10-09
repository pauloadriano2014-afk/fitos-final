// lib/videoStream.ts
// 🎥 (9 out 2026) Conversa com a Cloudflare Stream para o VÍDEO DE EXECUÇÃO: pedir um envio direto (o app manda o arquivo DIRETO para a Cloudflare, sem passar pelo Render), consultar o
// processamento, assinar o link de reprodução e apagar. O vídeo nasce PRIVADO (`requireSignedURLs`): sem o link assinado ele não toca. Nada aqui lança erro de rede para fora: devolve
// `null`/`false` e o chamador decide (o envio do aluno nunca pode derrubar o app).
export interface CfCfg { base: string; apiToken: string }
export type FetchLike = (url: string, init?: any) => Promise<{ ok: boolean; json: () => Promise<any> }>;

export function cfConfig(env: Record<string, string | undefined> = process.env): CfCfg | null {
  const accountId = env.CLOUDFLARE_ACCOUNT_ID, apiToken = env.CLOUDFLARE_API_TOKEN;
  if (!accountId || !apiToken) return null;
  return { base: `https://api.cloudflare.com/client/v4/accounts/${accountId}/stream`, apiToken };
}

const headers = (cf: CfCfg) => ({ Authorization: `Bearer ${cf.apiToken}`, 'Content-Type': 'application/json' });

/** Pede um link de envio de uso único. O vídeo é privado e a Cloudflare recusa arquivos mais longos que `maxDurationSeconds`. */
export async function createDirectUpload(cf: CfCfg, o: { creator: string; maxDurationSeconds: number; name?: string }, f: FetchLike = fetch as any): Promise<{ uid: string; uploadURL: string } | null> {
  try {
    const res = await f(`${cf.base}/direct_upload`, { method: 'POST', headers: headers(cf), body: JSON.stringify({ maxDurationSeconds: o.maxDurationSeconds, creator: o.creator, requireSignedURLs: true, ...(o.name ? { meta: { name: o.name } } : {}) }) });
    const data = await res.json();
    if (!res.ok || !data?.success || !data?.result?.uid || !data?.result?.uploadURL) { console.error('[videoStream] direct_upload:', JSON.stringify(data?.errors || data)); return null; }
    return { uid: String(data.result.uid), uploadURL: String(data.result.uploadURL) };
  } catch (e) { console.error('[videoStream] direct_upload falhou:', (e as any)?.message || e); return null; }
}

export interface VideoInfo { state: string | null; ready: boolean; duration: number | null; hls: string | null; thumbnail: string | null }

export async function getVideoInfo(cf: CfCfg, uid: string, f: FetchLike = fetch as any): Promise<VideoInfo | null> {
  try {
    const res = await f(`${cf.base}/${uid}`, { headers: headers(cf) });
    const data = await res.json();
    if (!res.ok || !data?.success) return null;
    const r = data.result || {};
    const state = r.status?.state ?? null;
    const dur = Number(r.duration);
    return { state, ready: state === 'ready' || r.readyToStream === true, duration: Number.isFinite(dur) && dur > 0 ? dur : null, hls: r.playback?.hls ?? null, thumbnail: r.thumbnail ?? null };
  } catch (e) { return null; }
}

/** Token de reprodução (vale `ttlSec`). */
export async function signToken(cf: CfCfg, uid: string, ttlSec = 3600, f: FetchLike = fetch as any): Promise<string | null> {
  try {
    const res = await f(`${cf.base}/${uid}/token`, { method: 'POST', headers: headers(cf), body: JSON.stringify({ exp: Math.floor(Date.now() / 1000) + ttlSec }) });
    const data = await res.json();
    return res.ok && data?.success && data?.result?.token ? String(data.result.token) : null;
  } catch (e) { return null; }
}

/** Troca o id do vídeo pelo token nos links que a Cloudflare devolveu (é assim que o link assinado funciona). */
export function withToken(url: string | null | undefined, uid: string, token: string): string | null {
  if (!url || !uid || !token) return null;
  return String(url).split(`/${uid}/`).join(`/${token}/`);
}

export async function removeVideo(cf: CfCfg, uid: string, f: FetchLike = fetch as any): Promise<boolean> {
  try {
    const res = await f(`${cf.base}/${uid}`, { method: 'DELETE', headers: headers(cf) });
    if (res.ok) return true;
    const data: any = await res.json().catch(() => null);
    return /not\s*found|10003|10005/i.test(JSON.stringify(data?.errors || '')) || false;   // já não existe lá: conta como apagado
  } catch (e) { return false; }
}

/** Links prontos para o app tocar: HLS e miniatura assinados. `null` se a Cloudflare não respondeu. */
export async function playbackFor(cf: CfCfg | null, uid: string, f: FetchLike = fetch as any): Promise<{ hls: string | null; thumb: string | null; ready: boolean; duration: number | null } | null> {
  if (!cf) return null;
  const info = await getVideoInfo(cf, uid, f);
  if (!info) return null;
  if (!info.ready) return { hls: null, thumb: null, ready: false, duration: info.duration };
  const token = await signToken(cf, uid, 3600, f);
  if (!token) return null;
  return { hls: withToken(info.hls, uid, token), thumb: withToken(info.thumbnail, uid, token), ready: true, duration: info.duration };
}
