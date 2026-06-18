// app/api/admin/system-technique-videos/route.ts
import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
export const dynamic = 'force-dynamic';

// GET: retorna todos os overrides de vídeo cadastrados (são globais, não
// filtrados por coach). O app monta um dicionário { key: videoUrl } a
// partir disso e faz merge com o TECH_GUIDE fixo do código.
export async function GET() {
  try {
    const videos = await prisma.systemTechniqueVideo.findMany();
    return NextResponse.json(videos);
  } catch (error) {
    console.error("Erro GET system-technique-videos:", error);
    return NextResponse.json({ error: "Erro ao buscar vídeos das técnicas" }, { status: 500 });
  }
}

// POST: cria ou atualiza o vídeo de uma técnica fixa, identificada por `key`.
// Usa upsert porque a tela do admin sempre vai mandar a key (DROPSET, GVT...)
// sem se preocupar se já existe um registro ou não.
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { key, videoUrl } = body;

    if (!key) return NextResponse.json({ error: "key é obrigatória" }, { status: 400 });
    if (!videoUrl || !videoUrl.trim()) return NextResponse.json({ error: "videoUrl é obrigatória" }, { status: 400 });

    const saved = await prisma.systemTechniqueVideo.upsert({
      where: { key },
      update: { videoUrl: videoUrl.trim() },
      create: { key, videoUrl: videoUrl.trim() },
    });

    return NextResponse.json({ success: true, video: saved });
  } catch (error: any) {
    console.error("Erro POST system-technique-videos:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// DELETE: remove o vídeo de uma técnica fixa (volta a não ter vídeo).
// Recebe a key via query string: ?key=DROPSET
export async function DELETE(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const key = searchParams.get('key');
    if (!key) return NextResponse.json({ error: "key é obrigatória" }, { status: 400 });

    await prisma.systemTechniqueVideo.delete({ where: { key } }).catch(() => null);
    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("Erro DELETE system-technique-videos:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}