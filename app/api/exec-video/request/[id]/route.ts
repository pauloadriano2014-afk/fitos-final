// app/api/exec-video/request/[id]/route.ts
// DELETE -> o coach cancela um pedido de vídeo em aberto.
import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuth } from '@/lib/auth';
import { actsAsCoach, loadStudent } from '@/lib/execVideoService';

export const dynamic = 'force-dynamic';
const missing = (e: any) => /does not exist|P2021|P2022/i.test(String(e?.code || '') + String(e?.message || ''));

export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  try {
    const auth = requireAuth(req);
    if ('response' in auth) return auth.response;
    const r: any = await prisma.videoRequest.findUnique({ where: { id: params.id } });
    if (!r) return NextResponse.json({ error: 'Pedido não encontrado.' }, { status: 404 });
    const student: any = await loadStudent(prisma, r.userId);
    if (!actsAsCoach(auth.user, student)) return NextResponse.json({ error: 'Acesso negado.' }, { status: 403 });
    if (r.status === 'OPEN') await prisma.videoRequest.update({ where: { id: r.id }, data: { status: 'CANCELED' } });
    return NextResponse.json({ success: true });
  } catch (e: any) {
    if (missing(e)) return NextResponse.json({ error: 'Indisponível.', unavailable: true }, { status: 503 });
    console.error('[DELETE /api/exec-video/request/:id]', e);
    return NextResponse.json({ error: 'Erro ao cancelar o pedido.' }, { status: 500 });
  }
}
