// app/api/upload/route.ts
import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  try {
    const formData = await req.formData();
    const file = formData.get('file') as File;

    if (!file) {
      return NextResponse.json({ error: "Nenhum ficheiro foi recebido." }, { status: 400 });
    }

    // 🔥 TRAVA DE SEGURANÇA BACKEND E EXTRAÇÃO DE EXTENSÃO
    const fileName = file.name.toLowerCase();
    const ext = fileName.split('.').pop() || '';
    const isValidFormat = fileName.match(/\.(mp4|mov|avi|mp3|wav|m4a|aac)$/i);

    if (!isValidFormat) {
      return NextResponse.json({ 
          error: "Formato inválido. O servidor aceita .mp4, .mov, .avi, .mp3, .wav, .m4a ou .aac" 
      }, { status: 400 });
    }

    // 🔥 MAPEAMENTO CIRÚRGICO DE MIME TYPE (Ignora o file.type falho do celular)
    let mimeType = 'application/octet-stream';
    if (ext === 'mp4') mimeType = 'video/mp4';
    else if (ext === 'mov') mimeType = 'video/quicktime';
    else if (ext === 'avi') mimeType = 'video/x-msvideo';
    else if (ext === 'mp3') mimeType = 'audio/mpeg';
    else if (ext === 'wav') mimeType = 'audio/wav';
    else if (ext === 'm4a') mimeType = 'audio/mp4';
    else if (ext === 'aac') mimeType = 'audio/aac';

    // 🔥 AQUI ESTÁ A MUDANÇA: Usando a Storage Zone (igual ao Cloudfront)
    const storageName = process.env.BUNNY_STORAGE_NAME;
    const storagePass = process.env.BUNNY_STORAGE_PASS;
    const pullZone = process.env.BUNNY_STORAGE_PULL; 

    if (!storageName || !storagePass || !pullZone) {
      return NextResponse.json({ error: "Chaves da Storage incompletas no servidor." }, { status: 500 });
    }

    const cleanFileName = fileName.replace(/[^a-z0-9.]/g, '_');
    const uniqueFileName = `media_${Date.now()}_${cleanFileName}`;

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Envia direto pro Brasil sem re-renderizar nada (preserva a qualidade e os metadados intactos)
    const uploadResponse = await fetch(`https://br.storage.bunnycdn.com/${storageName}/${uniqueFileName}`, {
      method: 'PUT',
      headers: {
        'AccessKey': storagePass,
        'Content-Type': mimeType, // 🔥 Forçando a etiqueta correta e blindada aqui
      },
      body: buffer
    });

    if (!uploadResponse.ok) {
        throw new Error("Falha ao enviar para a Bunny Storage.");
    }

    // O link gerado será idêntico na estrutura ao do Cloudfront
    const videoUrl = `https://${pullZone}/${uniqueFileName}`;
    
    return NextResponse.json({ 
      success: true, 
      videoUrl, 
      message: "Upload concluído com sucesso!"
    });

  } catch (error: any) {
    console.error("ERRO NO UPLOAD:", error);
    return NextResponse.json({ error: "Erro interno no upload", details: error.message }, { status: 500 });
  }
}