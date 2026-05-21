import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  try {
    const formData = await req.formData();
    const file = formData.get('file') as File;

    if (!file) {
      return NextResponse.json({ error: "Nenhum arquivo enviado." }, { status: 400 });
    }

    const fileName = file.name.toLowerCase();
    const isValidFormat = fileName.match(/\.(jpg|jpeg|png|webp|mp4|mov|avi|mp3|wav|m4a|aac|mkv)$/i);

if (!isValidFormat) {
  return NextResponse.json({ 
      error: "Formato inválido. Aceitos: .jpg, .jpeg, .png, .webp, .mp4, .mov, .avi, .mp3, .wav, .m4a, .aac, .mkv" 
  }, { status: 400 });
}

    const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
    const apiToken = process.env.CLOUDFLARE_API_TOKEN;

    if (!accountId || !apiToken) {
      return NextResponse.json({ error: "Configuração da Cloudflare ausente no servidor." }, { status: 500 });
    }

    // 🔥 PREPARAÇÃO DE SEGURANÇA PARA O FORM DATA 🔥
    const cfFormData = new FormData();
    // Garantimos o envio do arquivo com o nome correto
    cfFormData.append('file', file, file.name);

    // 🔥 EXECUÇÃO DO UPLOAD COM FETCH 🔥
    const response = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${accountId}/stream`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiToken}`,
          // NUNCA defina o 'Content-Type' aqui. O fetch fará isso para incluir o boundary corretamente.
        },
        body: cfFormData,
      }
    );

    const data = await response.json();

    if (!response.ok || !data.success) {
      console.error("ERRO CLOUDFLARE STREAM:", JSON.stringify(data, null, 2));
      return NextResponse.json({ 
          error: data.errors?.[0]?.message || "Falha no upload para Cloudflare Stream",
          details: data.errors
      }, { status: response.status });
    }

    // 🔥 DADOS DO VÍDEO PROCESSADO 🔥
    const videoGuid = data.result.uid;
    const hlsUrl = data.result.playback.hls;
    const dashUrl = data.result.playback.dash;
    
    return NextResponse.json({ 
      success: true, 
      videoUrl: hlsUrl, // Link HLS principal para o player
      dashUrl: dashUrl,
      guid: videoGuid,
      message: "Upload enviado com sucesso! O processamento começou."
    });

  } catch (error: any) {
    console.error("ERRO NO UPLOAD (CATCH):", error);
    return NextResponse.json({ 
        error: "Erro interno no servidor ao processar o upload", 
        details: error.message 
    }, { status: 500 });
  }
}