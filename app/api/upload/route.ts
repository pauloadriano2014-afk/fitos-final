// app/api/upload/route.ts
import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  try {
    const formData = await req.formData();
    const file = formData.get('file') as File;
    const title = formData.get('title') as string || 'Video_FIT_OS';

    if (!file) {
      return NextResponse.json({ error: "Nenhum arquivo de vídeo foi recebido." }, { status: 400 });
    }

    const libraryId = process.env.BUNNY_LIBRARY_ID;
    const apiKey = process.env.BUNNY_API_KEY;

    if (!libraryId || !apiKey) {
      return NextResponse.json({ error: "Chaves da Bunny.net não configuradas no servidor." }, { status: 500 });
    }

    // 1. Cria o 'esqueleto' do vídeo na Bunny para receber o arquivo
    const createVideoResponse = await fetch(`https://video.bunnycdn.com/library/${libraryId}/videos`, {
      method: 'POST',
      headers: {
        'AccessKey': apiKey,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify({ title })
    });

    if (!createVideoResponse.ok) {
      throw new Error("Falha ao criar o vídeo na Bunny.net");
    }

    const videoData = await createVideoResponse.json();
    const videoGuid = videoData.guid;

    // 2. Converte o arquivo para envio binário pesado (Upload real)
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const uploadResponse = await fetch(`https://video.bunnycdn.com/library/${libraryId}/videos/${videoGuid}`, {
      method: 'PUT',
      headers: {
        'AccessKey': apiKey,
        'Content-Type': 'application/octet-stream',
      },
      body: buffer
    });

    if (!uploadResponse.ok) {
      throw new Error("Falha ao enviar o arquivo para a Bunny.net");
    }

    // 3. Monta o link do player de Elite da Bunny
    const videoUrl = `https://iframe.mediadelivery.net/play/${libraryId}/${videoGuid}`;
    
    return NextResponse.json({ 
      success: true, 
      videoUrl,
      guid: videoGuid,
      message: "Upload concluído com sucesso!"
    });

  } catch (error: any) {
    console.error("ERRO NO UPLOAD PARA BUNNY:", error);
    return NextResponse.json({ error: "Erro interno no upload", details: error.message }, { status: 500 });
  }
}