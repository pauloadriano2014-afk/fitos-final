// app/api/upload/route.ts
import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  try {
    const formData = await req.formData();
    const file = formData.get('file') as File;

    if (!file) {
      return NextResponse.json({ error: "Nenhum arquivo enviado." }, { status: 400 });
    }

    // 🔥 SEGURANÇA: Bloqueia formatos que não são mídia
    const fileName = file.name.toLowerCase();
    const isValidFormat = fileName.match(/\.(mp4|mov|avi|mp3|wav|m4a|aac)$/i);

    if (!isValidFormat) {
      return NextResponse.json({ 
          error: "Formato inválido. O servidor aceita .mp4, .mov, .avi, .mp3, .wav, .m4a ou .aac" 
      }, { status: 400 });
    }

    // 🔥 PUXA AS CHAVES DO RENDER (Environment Variables)
    const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
    const apiToken = process.env.CLOUDFLARE_API_TOKEN;

    if (!accountId || !apiToken) {
      return NextResponse.json({ error: "Configuração da Cloudflare ausente no servidor." }, { status: 500 });
    }

    const cfFormData = new FormData();
    cfFormData.append('file', file);

    // 🔥 UPLOAD PARA CLOUDFLARE STREAM
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
    
    // 🔥 A CORREÇÃO: Pega a URL real devolvida pela Cloudflare com o seu subdomínio correto (customer-eoi27zv...)
    const hlsUrl = data.result.playback.hls; 

    // Transforma o link HLS no link de download MP4 universal
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