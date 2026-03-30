// app/api/upload/route.ts
import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  try {
    const formData = await req.formData();
    const file = formData.get('file') as File;
    const title = formData.get('title') as string || 'Media_FIT_OS';

    if (!file) {
      return NextResponse.json({ error: "Nenhum arquivo foi recebido." }, { status: 400 });
    }

    // 🔥 TRAVA DE SEGURANÇA BACKEND (AGORA ACEITA ÁUDIO TAMBÉM)
    const fileName = file.name.toLowerCase();
    const isValidFormat = fileName.match(/\.(mp4|mov|avi|mp3|wav|m4a|aac)$/i);

    if (!isValidFormat) {
      return NextResponse.json({ 
          error: "Formato inválido. O servidor aceita .mp4, .mov, .avi, .mp3, .wav, .m4a ou .aac" 
      }, { status: 400 });
    }

    const libraryId = process.env.BUNNY_LIBRARY_ID;
    const apiKey = process.env.BUNNY_API_KEY;
    const pullZone = process.env.BUNNY_PULL_ZONE; 

    if (!libraryId || !apiKey || !pullZone) {
      return NextResponse.json({ error: "Chaves da Bunny.net incompletas no servidor." }, { status: 500 });
    }

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
      throw new Error("Falha ao criar mídia na Bunny.net");
    }

    const videoData = await createVideoResponse.json();
    const videoGuid = videoData.guid;

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

    const videoUrl = `https://${pullZone}/${videoGuid}/playlist.m3u8`;
    
    return NextResponse.json({ 
      success: true, 
      videoUrl, 
      guid: videoGuid,
      message: "Upload concluído! A Bunny está processando."
    });

  } catch (error: any) {
    console.error("ERRO NO UPLOAD PARA BUNNY:", error);
    return NextResponse.json({ error: "Erro interno no upload", details: error.message }, { status: 500 });
  }
}