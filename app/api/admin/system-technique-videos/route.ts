// app/api/admin/system-technique-videos/route.ts
import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

const prisma = (global as any).prisma || new PrismaClient();
if (process.env.NODE_ENV === 'development') (global as any).prisma = prisma;
export const dynamic = 'force-dynamic';

// 🔥 Time Master — Paulo e Adri compartilham os mesmos vídeos de técnica.
// Qualquer outro coachId (ex: parceiro) forma o seu próprio time, isolado.
const MASTER_IDS = [
  '3c82f763-66b4-48da-836e-16817d4f57c0', // Paulo
  'b7c0c181-41fd-4156-b8fe-963a267759a3', // Adri
];
const MASTER_TEAM_ID = 'MASTER_TEAM';

function getTeamId(coachId: string) {
  return MASTER_IDS.includes(coachId) ? MASTER_TEAM_ID : coachId;
}

export async function OPTIONS() {
  return NextResponse.json({}, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  });
}

// GET agora exige coachId e retorna só os vídeos do time daquele coach
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const coachId = searchParams.get('coachId');

    if (!coachId) {
      return NextResponse.json({ error: 'coachId é obrigatório.' }, { status: 400 });
    }

    const teamId = getTeamId(coachId);

    const videos = await prisma.systemTechniqueVideo.findMany({
      where: { teamId }
    });

    return NextResponse.json(videos);
  } catch (error) {
    console.error("Erro GET system-technique-videos:", error);
    return NextResponse.json({ error: "Erro ao buscar vídeos das técnicas" }, { status: 500 });
  }
}

// POST cria ou atualiza o vídeo de uma técnica fixa, escopado ao time do coach
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { key, videoUrl, coachId } = body;

    if (!key) return NextResponse.json({ error: "key é obrigatória" }, { status: 400 });
    if (!videoUrl || !videoUrl.trim()) return NextResponse.json({ error: "videoUrl é obrigatória" }, { status: 400 });
    if (!coachId) return NextResponse.json({ error: "coachId é obrigatório" }, { status: 400 });

    const teamId = getTeamId(coachId);

    const saved = await prisma.systemTechniqueVideo.upsert({
      where: { key_teamId: { key, teamId } },
      update: { videoUrl: videoUrl.trim() },
      create: { key, teamId, videoUrl: videoUrl.trim() },
    });

    return NextResponse.json({ success: true, video: saved });
  } catch (error: any) {
    console.error("Erro POST system-technique-videos:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// DELETE remove o vídeo de uma técnica fixa, escopado ao time do coach
export async function DELETE(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const key = searchParams.get('key');
    const coachId = searchParams.get('coachId');

    if (!key) return NextResponse.json({ error: "key é obrigatória" }, { status: 400 });
    if (!coachId) return NextResponse.json({ error: "coachId é obrigatório" }, { status: 400 });

    const teamId = getTeamId(coachId);

    await prisma.systemTechniqueVideo.delete({
      where: { key_teamId: { key, teamId } }
    }).catch(() => null);

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("Erro DELETE system-technique-videos:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}