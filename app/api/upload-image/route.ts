import { NextResponse } from 'next/server';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';

// Cria a conexão direta com o Cloudflare R2
const s3Client = new S3Client({
  region: 'auto',
  endpoint: `https://${process.env.CLOUDFLARE_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID || '',
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY || '',
  },
});

export async function POST(req: Request) {
  try {
    const formData = await req.formData();
    const file = formData.get('file') as File;

    if (!file) {
      return NextResponse.json({ error: "Nenhuma imagem recebida." }, { status: 400 });
    }

    const fileName = (file.name || 'profile.jpg').toLowerCase();
    const isValidFormat = fileName.match(/\.(jpg|jpeg|png|webp)$/i);

    if (!isValidFormat) {
      return NextResponse.json({ error: "Formato inválido. Use JPG, PNG ou WEBP." }, { status: 400 });
    }

    // Limpa o nome do arquivo e adiciona timestamp
    const cleanFileName = fileName.replace(/[^a-z0-9.]/g, '_');
    const uniqueFileName = `profiles/${Date.now()}_${cleanFileName}`; 

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // 🔥 Dispara para o Cloudflare R2
    // O nome do bucket 'fitos-fotos' foi inserido direto aqui para não depender do Render!
    await s3Client.send(
      new PutObjectCommand({
        Bucket: 'fitos-fotos', 
        Key: uniqueFileName,
        Body: buffer,
        ContentType: file.type || 'image/jpeg',
      })
    );

    // Monta a URL pública (usando a R2_PUBLIC_URL que você configurou no Render)
    const publicUrl = process.env.R2_PUBLIC_URL?.replace(/\/$/, ''); 
    const imageUrl = `${publicUrl}/${uniqueFileName}`;
    
    return NextResponse.json({ success: true, imageUrl });

  } catch (error: any) {
    console.error("ERRO NO UPLOAD CLOUDFLARE R2:", error);
    return NextResponse.json({ 
        error: "Erro no servidor ao processar a imagem no R2", 
        details: error.message 
    }, { status: 500 });
  }
}