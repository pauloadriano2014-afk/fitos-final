// app/api/upload-image/route.ts
import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  try {
    const formData = await req.formData();
    const file = formData.get('file') as File;

    if (!file) {
      return NextResponse.json({ error: "Nenhuma imagem recebida." }, { status: 400 });
    }

    // 🔥 TRAVA DE SEGURANÇA: Só aceita imagens
    const fileName = file.name.toLowerCase();
    const isValidFormat = fileName.match(/\.(jpg|jpeg|png|webp)$/i);

    if (!isValidFormat) {
      return NextResponse.json({ error: "Formato inválido. Use JPG, PNG ou WEBP." }, { status: 400 });
    }

    const storageName = process.env.BUNNY_STORAGE_NAME;
    const storagePass = process.env.BUNNY_STORAGE_PASS;
    const pullZone = process.env.BUNNY_STORAGE_PULL;

    if (!storageName || !storagePass || !pullZone) {
      return NextResponse.json({ error: "Chaves da Storage não configuradas no servidor." }, { status: 500 });
    }

    // Limpa o nome do arquivo para evitar bugs na URL (tira espaços, acentos, etc)
    const cleanFileName = fileName.replace(/[^a-z0-9.]/g, '_');
    const uniqueFileName = `${Date.now()}_${cleanFileName}`;

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // 🔥 Enviando direto para o Servidor do Brasil (br.storage)
    const uploadResponse = await fetch(`https://br.storage.bunnycdn.com/${storageName}/${uniqueFileName}`, {
      method: 'PUT',
      headers: {
        'AccessKey': storagePass,
        'Content-Type': 'application/octet-stream',
      },
      body: buffer
    });

    if (!uploadResponse.ok) {
      throw new Error("Falha ao enviar a imagem para a Storage Bunny.");
    }

    // Monta a URL final bonita e rápida
    const imageUrl = `https://${pullZone}/${uniqueFileName}`;
    
    return NextResponse.json({ success: true, imageUrl });

  } catch (error: any) {
    console.error("ERRO NO UPLOAD DE IMAGEM:", error);
    return NextResponse.json({ error: "Erro interno", details: error.message }, { status: 500 });
  }
}