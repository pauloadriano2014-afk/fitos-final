import { NextRequest, NextResponse } from 'next/server';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';

// Cria a conexão direta com o Cloudflare R2
const s3Client = new S3Client({
  region: 'auto',
  endpoint: `https://${process.env.CLOUDFLARE_ACCOUNT_ID || process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID || '',
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY || '',
  },
});

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return NextResponse.json({ error: "Nenhuma imagem recebida." }, { status: 400 });
    }

    const fileName = (file.name || 'profile.jpg').toLowerCase();

    // 🔥 CORREÇÃO 1: Validação de formato sem usar Regex (evita o erro TS1161)
    const validExtensions = ['jpg', 'jpeg', 'png', 'webp', 'mp4', 'mov', 'avi', 'mp3', 'wav', 'm4a', 'aac', 'mkv'];
    const extension = fileName.split('.').pop() || '';
    const isValidFormat = validExtensions.includes(extension);

    if (!isValidFormat) {
      return NextResponse.json({ 
          error: "Formato inválido. Aceitos: .jpg, .jpeg, .png, .webp, .mp4, .mov, .avi, .mp3, .wav, .m4a, .aac, .mkv" 
      }, { status: 400 });
    }

    // LOG PARA DEBUGAR NO RENDER
    console.log("Arquivo recebido:", file.name, file.type, file.size);

    // Limpa o nome do arquivo e adiciona timestamp
    const nameWithoutExt = fileName.split('.').slice(0, -1).join('.');
    const cleanName = nameWithoutExt.replace(/[^a-z0-9]/gi, '_');
    const uniqueFileName = `profiles/${Date.now()}_${cleanName}.${extension}`; 

    // Transformar o stream do arquivo em buffer real da forma segura
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    // Dispara para o Cloudflare R2
    await s3Client.send(
      new PutObjectCommand({
        Bucket: 'fitos-fotos', 
        Key: uniqueFileName,
        Body: buffer,
        ContentType: file.type || 'application/octet-stream',
      })
    );

    // 🔥 CORREÇÃO 2: Monta a URL pública removendo a barra final sem usar Regex
    let publicUrl = process.env.R2_PUBLIC_URL || '';
    if (publicUrl.endsWith('/')) {
        publicUrl = publicUrl.slice(0, -1);
    }
    const url = `${publicUrl}/${uniqueFileName}`;

    // Retorna 'url' para casar com o que o Frontend espera
    return NextResponse.json({ success: true, url });

  } catch (error: any) {
    // ISSO VAI MOSTRAR O ERRO REAL NO SEU CONSOLE DO RENDER
    console.error("ERRO DETALHADO NO R2:", error);
    return NextResponse.json({ 
        error: "Erro no servidor ao processar a imagem no R2", 
        details: error.message 
    }, { status: 500 });
  }
}