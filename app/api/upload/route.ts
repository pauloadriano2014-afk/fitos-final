// app/api/upload/route.ts
import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  try {
    const formData = await req.formData();
    const file = formData.get('file') as File;

    if (!file) {
      return NextResponse.json({ error: "Nenhum arquivo enviado." }, { status: 400 });
    }

    const fileName = file.name.toLowerCase();
    const isValidFormat = fileName.match(/\.(mp4|mov|avi|mp3|wav|m4a|aac)$/i);

    if (!isValidFormat) {
      return NextResponse.json({ 
          error: "Formato inválido. O servidor aceita .mp4, .mov, .avi, .mp3, .wav, .m4a ou .aac" 
      }, { status: 400 });
    }

    const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
    const apiToken = process.env.CLOUDFLARE_API_TOKEN;

    if (!accountId || !apiToken) {
      return NextResponse.json({ error: "Configuração da Cloudflare ausente no servidor." }, { status: 500 });
    }

    const cfFormData = new FormData();
    cfFormData.append('file', file);

    // 🔥 1. FAZ O UPLOAD DO VÍDEO
    const response = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${accountId}/stream`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiToken}`,
        },
        body: cfFormData,
      }
    );

    const data = await response.json();

    if (!response.ok || !data.success) {
      console.error("ERRO CLOUDFLARE:", data);
      throw new Error(data.errors?.[0]?.message || "Falha no upload para Cloudflare Stream");
    }

    const videoGuid = data.result.uid;

    // 🔥 2. A MÁGICA: "Clica" no botão de gerar MP4 automaticamente via API!
    await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${accountId}/stream/${videoGuid}/downloads`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiToken}`,
          'Content-Type': 'application/json'
        }
      }
    );
    
    // 3. Monta o link direto do MP4
    const hlsUrl = data.result.playback.hls; 
    const videoUrl = hlsUrl.replace('/manifest/video.m3u8', '/downloads/default.mp4');
    
    return NextResponse.json({ 
      success: true, 
      videoUrl, 
      guid: videoGuid,
      message: "Upload concluído com sucesso via Cloudflare Stream!"
    });

  } catch (error: any) {
    console.error("ERRO NO UPLOAD:", error);
    return NextResponse.json({ error: "Erro interno no servidor", details: error.message }, { status: 500 });
  }
}