// app/api/admin/system-technique-videos/route.ts
import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

const prisma = (global as any).prisma || new PrismaClient();
if (process.env.NODE_ENV === 'development') (global as any).prisma = prisma;
export const dynamic = 'force-dynamic';

const MASTER_IDS = [
  '3c82f763-66b4-48da-836e-16817d4f57c0', // Paulo
  'b7c0c181-41fd-4156-b8fe-963a267759a3', // Adri
];
const MASTER_TEAM_ID = 'MASTER_TEAM';

function getTeamId(coachId: string) {
  return MASTER_IDS.includes(coachId) ? MASTER_TEAM_ID : coachId;
}

// Helper para anexar cabeçalhos CORS limpos nas respostas
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

// GET retorna os vídeos do time daquele coach
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const coachId = searchParams.get('coachId');

    if (!coachId) {
      return corsResponse({ error: 'coachId é obrigatório.' }, 400);
    }

    const teamId = getTeamId(coachId);

    const videos = await prisma.systemTechniqueVideo.findMany({
      where: { teamId }
    });

    return corsResponse(videos);
  } catch (error) {
    console.error("Erro GET system-technique-videos:", error);
    return corsResponse({ error: "Erro ao buscar vídeos das técnicas" }, 500);
  }
}

// POST cria ou atualiza o vídeo de uma técnica fixa, escopado ao time do coach
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { key, videoUrl, coachId } = body;

    if (!key) return corsResponse({ error: "key é obrigatória" }, 400);
    if (!videoUrl || !videoUrl.trim()) return corsResponse({ error: "videoUrl é obrigatória" }, 400);
    if (!coachId) return corsResponse({ error: "coachId é obrigatório" }, 400);

    const teamId = getTeamId(coachId);
    const cleanUrl = videoUrl.trim();

    let saved;
    try {
      // Tenta atualizar ou criar com a constraint composta nativa key_teamId
      saved = await prisma.systemTechniqueVideo.upsert({
        where: { key_teamId: { key, teamId } },
        update: { videoUrl: cleanUrl },
        create: { key, teamId, videoUrl: cleanUrl },
      });
    } catch (upsertError) {
      console.log("Falha no upsert por constraint composta. Executando estratégia de limpeza/recriação...");
      
      // Fallback robusto se houver inconsistência nas constraints antigas do banco
      await prisma.systemTechniqueVideo.deleteMany({
        where: { key, teamId }
      }).catch(() => null);

      saved = await prisma.systemTechniqueVideo.create({
        data: { key, teamId, videoUrl: cleanUrl }
      });
    }

    return corsResponse({ success: true, video: saved });
  } catch (error: any) {
    console.error("Erro POST system-technique-videos:", error);
    return corsResponse({ error: error.message || "Erro interno ao salvar vídeo" }, 500);
  }
}

// DELETE remove o vídeo de uma técnica fixa, escopado ao time do coach
export async function DELETE(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const key = searchParams.get('key');
    const coachId = searchParams.get('coachId');

    if (!key) return corsResponse({ error: "key é obrigatória" }, 400);
    if (!coachId) return corsResponse({ error: "coachId é obrigatório" }, 400);

    const teamId = getTeamId(coachId);

    // Usa deleteMany para evitar estouro de erro 500 caso o registro exato não seja encontrado
    await prisma.systemTechniqueVideo.deleteMany({
      where: { key, teamId }
    });

    return corsResponse({ success: true });
  } catch (error: any) {
    console.error("Erro DELETE system-technique-videos:", error);
    return corsResponse({ error: error.message || "Erro interno ao deletar vídeo" }, 500);
  }
}