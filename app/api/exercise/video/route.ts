// app/api/exercise/video/route.ts
// 🎬 (8 out 2026) Troca SÓ o vídeo de um exercício (usado pelo "Upload de vídeos em lote" da Biblioteca).
// O PUT de /api/exercise regrava o cadastro inteiro (descrição, substitutos, ambientes, tags...); para o lote isso seria arriscado, então aqui muda apenas `videoUrl`.
//
//   POST { id, videoUrl } -> { success, id, videoUrl }
//
// Só Paulo e Adri, e só em exercício que é do próprio coach logado ou global (o mesmo recorte que a lista da Biblioteca mostra para eles).
import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireMaster } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  try {
    const auth = requireMaster(req);
    if ('response' in auth) return auth.response;

    const body = await req.json();
    const id = typeof body?.id === 'string' ? body.id : '';
    const videoUrl = typeof body?.videoUrl === 'string' ? body.videoUrl.trim() : '';
    if (!id) return NextResponse.json({ error: 'ID do exercício obrigatório.' }, { status: 400 });
    if (!/^https:\/\/\S+$/.test(videoUrl) || videoUrl.length > 500) return NextResponse.json({ error: 'Link de vídeo inválido.' }, { status: 400 });

    const exercise = await prisma.exercise.findUnique({ where: { id }, select: { id: true, coachId: true } });
    if (!exercise) return NextResponse.json({ error: 'Exercício não encontrado.' }, { status: 404 });
    if (exercise.coachId && exercise.coachId !== auth.user.id) {
      return NextResponse.json({ error: 'Esse exercício é de outro coach.' }, { status: 403 });
    }

    const updated = await prisma.exercise.update({ where: { id }, data: { videoUrl }, select: { id: true, videoUrl: true } });
    return NextResponse.json({ success: true, id: updated.id, videoUrl: updated.videoUrl });
  } catch (error: any) {
    console.error('ERRO exercise/video POST:', error);
    return NextResponse.json({ error: 'Erro ao salvar o vídeo do exercício.' }, { status: 500 });
  }
}
