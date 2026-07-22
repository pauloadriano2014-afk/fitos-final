// app/api/admin/system-technique-videos/route.ts
import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

const prisma = (global as any).prisma || new PrismaClient();
if (process.env.NODE_ENV === 'development') (global as any).prisma = prisma;
export const dynamic = 'force-dynamic';

// 🔥 Time Master — Paulo e Adri compartilham os mesmos vídeos de técnica.
const MASTER_IDS = [
  '3c82f763-66b4-48da-836e-16817d4f57c0', // Paulo
  'b7c0c181-41fd-4156-b8fe-963a267759a3', // Adri
];
const MASTER_TEAM_ID = 'MASTER_TEAM';

function getTeamId(coachId: string) {
  return MASTER_IDS.includes(coachId) ? MASTER_TEAM_ID : coachId;
}

function corsResponse(body: any, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  });
}

export async function OPTIONS() {
  return corsResponse({});
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const coachId = searchParams.get('coachId');

    if (!coachId) return corsResponse({ error: 'coachId é obrigatório.' }, 400);

    const teamId = getTeamId(coachId);

    // 🔥 Busca TANTO os vídeos do seu time MASTER quanto os do time do Parceiro
    const videos = await prisma.systemTechniqueVideo.findMany({
      where: {
        teamId: { in: [MASTER_TEAM_ID, teamId] }
      }
    });

    // 🔥 LÓGICA DE HERANÇA (Fallback)
    const videoMap = new Map();

    // 1º: Preenche o mapa com todos os vídeos do MASTER (Paulo/Adri)
    videos.forEach(v => {
      if (v.teamId === MASTER_TEAM_ID) {
        videoMap.set(v.key, v);
      }
    });

    // 2º: Se o Coach for parceiro e tiver vídeos próprios, eles sobrescrevem os do MASTER
    if (teamId !== MASTER_TEAM_ID) {
      videos.forEach(v => {
        if (v.teamId === teamId) {
          videoMap.set(v.key, v);
        }
      });
    }

    // Retorna a lista mesclada (onde o parceiro tem prioridade sobre o master)
    return corsResponse(Array.from(videoMap.values()));
  } catch (error) {
    console.error("Erro GET system-technique-videos:", error);
    return corsResponse({ error: "Erro ao buscar vídeos das técnicas" }, 500);
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { key, videoUrl, coachId } = body;

    if (!key || !videoUrl || !coachId) return corsResponse({ error: "Dados inválidos" }, 400);

    const teamId = getTeamId(coachId);
    const cleanUrl = videoUrl.trim();

    const existing = await prisma.systemTechniqueVideo.findFirst({
      where: { key, teamId }
    });

    let saved;
    if (existing) {
      saved = await prisma.systemTechniqueVideo.update({
        where: { id: existing.id },
        data: { videoUrl: cleanUrl }
      });
    } else {
      saved = await prisma.systemTechniqueVideo.create({
        data: { key, teamId, videoUrl: cleanUrl }
      });
    }

    return corsResponse({ success: true, video: saved });
  } catch (error: any) {
    console.error("Erro POST:", error);
    return corsResponse({ error: error.message }, 500);
  }
}

export async function DELETE(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const key = searchParams.get('key');
    const coachId = searchParams.get('coachId');

    if (!key || !coachId) return corsResponse({ error: "Dados inválidos" }, 400);

    const teamId = getTeamId(coachId);

    await prisma.systemTechniqueVideo.deleteMany({
      where: { key, teamId }
    });

    return corsResponse({ success: true });
  } catch (error: any) {
    console.error("Erro DELETE:", error);
    return corsResponse({ error: error.message }, 500);
  }
}