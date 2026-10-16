// app/api/exercise/visibility/route.ts
// 🙈 (16 out 2026) Marca/desmarca "só o Paulo vê" em vários exercícios de uma vez (seleção em massa da Biblioteca).
//
//   POST { ids: string[], hidden: boolean } -> { success, count, hidden }
//
// Só Paulo e Adri, e só em exercício que é do próprio coach logado ou global (o mesmo recorte do /api/exercise/video).
// Não apaga nada e não mexe em treino montado: só liga/desliga a visibilidade para os OUTROS coaches.
import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireMaster } from '@/lib/auth';

export const dynamic = 'force-dynamic';

const MAX_IDS = 500;

export async function POST(req: Request) {
  try {
    const auth = requireMaster(req);
    if ('response' in auth) return auth.response;

    let body: any = null;
    try { body = await req.json(); } catch { body = null; }
    const hidden = body?.hidden;
    const rawIds = body?.ids;
    if (typeof hidden !== 'boolean') return NextResponse.json({ error: 'Informe hidden: true ou false.' }, { status: 400 });
    if (!Array.isArray(rawIds) || rawIds.length === 0 || rawIds.some((i: any) => typeof i !== 'string' || !i)) {
      return NextResponse.json({ error: 'Informe a lista de exercícios (ids).' }, { status: 400 });
    }
    const ids = Array.from(new Set(rawIds as string[]));
    if (ids.length > MAX_IDS) return NextResponse.json({ error: `No máximo ${MAX_IDS} exercícios por vez.` }, { status: 400 });

    const result = await prisma.exercise.updateMany({
      where: { id: { in: ids }, OR: [{ coachId: auth.user.id }, { coachId: null }] },
      data: { hiddenFromCoaches: hidden },
    });
    return NextResponse.json({ success: true, count: result.count, hidden });
  } catch (error: any) {
    console.error('ERRO exercise/visibility POST:', error);
    return NextResponse.json({ error: 'Erro ao mudar a visibilidade dos exercícios.' }, { status: 500 });
  }
}
