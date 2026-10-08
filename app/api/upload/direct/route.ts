// app/api/upload/direct/route.ts
// 🎬 (8 out 2026) UPLOAD DIRETO para a Cloudflare Stream (usado pelo "Upload de vídeos em lote" da Biblioteca).
//
// POR QUE: o /api/upload recebe o vídeo inteiro no servidor (Render) e só depois repassa à Cloudflare. Com dezenas de vídeos isso pesa na memória e no tempo de
// resposta do servidor. Aqui o servidor só pede à Cloudflare um LINK DE ENVIO de uso único e o navegador manda o arquivo DIRETO para ela. O vídeo nunca passa pelo Render.
//
//   POST { name?, maxDurationSeconds? }  -> { success, uploadURL, guid }     (o app envia o arquivo, em multipart campo "file", para uploadURL)
//   GET  ?guid=...                       -> { success, videoUrl, state, ready } (o link HLS do player, igual ao que o /api/upload devolve)
//
// Só Paulo e Adri (time master): o custo de armazenamento da Cloudflare é da conta deles.
import { NextResponse } from 'next/server';
import { requireMaster } from '@/lib/auth';

export const dynamic = 'force-dynamic';

const GUID_RE = /^[a-f0-9]{32}$/i;

function cfConfig() {
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  const apiToken = process.env.CLOUDFLARE_API_TOKEN;
  if (!accountId || !apiToken) return null;
  return { base: `https://api.cloudflare.com/client/v4/accounts/${accountId}/stream`, apiToken };
}

export async function POST(req: Request) {
  try {
    const auth = requireMaster(req);
    if ('response' in auth) return auth.response;

    const cf = cfConfig();
    if (!cf) return NextResponse.json({ error: 'Configuração da Cloudflare ausente no servidor.' }, { status: 500 });

    let body: any = {};
    try { body = await req.json(); } catch { body = {}; }
    const name = String(body?.name || '').trim().slice(0, 200);
    // vídeo de execução de exercício é curto; o teto evita subir por engano um vídeo enorme (padrão 5 min, máximo 10 min)
    const maxDurationSeconds = Math.min(600, Math.max(10, Number(body?.maxDurationSeconds) || 300));

    const res = await fetch(`${cf.base}/direct_upload`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${cf.apiToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ maxDurationSeconds, creator: auth.user.id, ...(name ? { meta: { name } } : {}) }),
    });
    const data = await res.json();
    if (!res.ok || !data?.success || !data?.result?.uploadURL || !data?.result?.uid) {
      console.error('ERRO CLOUDFLARE direct_upload:', JSON.stringify(data, null, 2));
      return NextResponse.json({ error: data?.errors?.[0]?.message || 'Falha ao preparar o envio na Cloudflare.' }, { status: 502 });
    }
    return NextResponse.json({ success: true, uploadURL: data.result.uploadURL, guid: data.result.uid });
  } catch (error: any) {
    console.error('ERRO upload/direct POST:', error);
    return NextResponse.json({ error: 'Erro interno ao preparar o envio.' }, { status: 500 });
  }
}

export async function GET(req: Request) {
  try {
    const auth = requireMaster(req);
    if ('response' in auth) return auth.response;

    const cf = cfConfig();
    if (!cf) return NextResponse.json({ error: 'Configuração da Cloudflare ausente no servidor.' }, { status: 500 });

    const guid = new URL(req.url).searchParams.get('guid') || '';
    if (!GUID_RE.test(guid)) return NextResponse.json({ error: 'GUID inválido.' }, { status: 400 });

    const res = await fetch(`${cf.base}/${guid}`, { headers: { Authorization: `Bearer ${cf.apiToken}` } });
    const data = await res.json();
    if (!res.ok || !data?.success) {
      return NextResponse.json({ error: data?.errors?.[0]?.message || 'Vídeo não encontrado na Cloudflare.' }, { status: 502 });
    }
    const state = data.result?.status?.state || null;
    const videoUrl = data.result?.playback?.hls || null;
    return NextResponse.json({ success: true, videoUrl, state, ready: state === 'ready' });
  } catch (error: any) {
    console.error('ERRO upload/direct GET:', error);
    return NextResponse.json({ error: 'Erro interno ao consultar o vídeo.' }, { status: 500 });
  }
}
