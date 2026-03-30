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

    // 🔥 1. FAZ O UPLOAD RÁPIDO PARA A CLOUDFLARE
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
    
    // 2. MONTA O LINK MP4 DEFINITIVO
    const hlsUrl = data.result.playback.hls; 
    const videoUrl = hlsUrl.replace('/manifest/video.m3u8', '/downloads/default.mp4');

    // 🔥 3. O TRABALHADOR FANTASMA (Roda no background sem travar o aplicativo)
    // Ele vai ficar vigiando e vai "apertar o botão azul" sozinho pra você!
    triggerMp4GenerationBackground(accountId, apiToken, videoGuid);
    
    // 4. Libera o aplicativo NA HORA (em 5 segundos) para você salvar o exercício
    return NextResponse.json({ 
      success: true, 
      videoUrl, 
      guid: videoGuid,
      message: "Upload instantâneo! O servidor está gerando o MP4 nos bastidores."
    });

  } catch (error: any) {
    console.error("ERRO NO UPLOAD:", error);
    return NextResponse.json({ error: "Erro interno no servidor", details: error.message }, { status: 500 });
  }
}

// ============================================================================
// 🔥 FUNÇÃO DO TRABALHADOR FANTASMA (Não bloqueia a resposta principal)
// ============================================================================
function triggerMp4GenerationBackground(accountId: string, apiToken: string, guid: string) {
  // Checa de 10 em 10 segundos
  const checkInterval = setInterval(async () => {
    try {
      const statusRes = await fetch(
        `https://api.cloudflare.com/client/v4/accounts/${accountId}/stream/${guid}`,
        { headers: { 'Authorization': `Bearer ${apiToken}` } }
      );
      
      const statusData = await statusRes.json();
      
      // Se a Cloudflare terminou o processamento principal
      if (statusData?.result?.status?.state === 'ready') {
        // 🔥 CLICA NO BOTÃO AZUL POR VOCÊ VIA API
        await fetch(
          `https://api.cloudflare.com/client/v4/accounts/${accountId}/stream/${guid}/downloads`,
          { 
            method: 'POST', 
            headers: { 'Authorization': `Bearer ${apiToken}`, 'Content-Type': 'application/json' } 
          }
        );
        console.log(`[SUCESSO FANTASMA] MP4 gerado sozinho para o vídeo: ${guid}`);
        
        // Missão cumprida, desliga o vigia
        clearInterval(checkInterval);
      } else if (statusData?.result?.status?.state === 'error') {
        // Se der erro de arquivo corrompido, ele para de tentar
        clearInterval(checkInterval);
      }
    } catch (e) {
      console.error("Erro no trabalhador fantasma:", e);
    }
  }, 10000); // 10000ms = 10 segundos

  // Trava de segurança: Se a Cloudflare travar e não responder em 15 minutos, o fantasma desliga para não gastar memória
  setTimeout(() => {
    clearInterval(checkInterval);
  }, 15 * 60 * 1000); 
}