// app/api/exec-video/quick-replies/route.ts
// 🎥 Respostas prontas do coach para feedback de vídeo. GET -> { replies } · POST { text } -> cria · DELETE ?id= -> apaga (só as dele)
import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuth } from '@/lib/auth';
import { isCoachRole } from '@/lib/agendaAuth';

export const dynamic = 'force-dynamic';
const missing = (e: any) => /does not exist|P2021|P2022/i.test(String(e?.code || '') + String(e?.message || ''));
const MAX = 60;

export async function GET(req: Request) {
  try {
    const auth = requireAuth(req);
    if ('response' in auth) return auth.response;
    if (!isCoachRole(auth.user)) return NextResponse.json({ error: 'Acesso negado.' }, { status: 403 });
    return NextResponse.json({ replies: await prisma.videoQuickReply.findMany({ where: { coachId: auth.user.id }, orderBy: { createdAt: 'desc' }, take: MAX }) });
  } catch (e: any) {
    if (missing(e)) return NextResponse.json({ replies: [], unavailable: true });
    console.error('[GET /api/exec-video/quick-replies]', e);
    return NextResponse.json({ error: 'Erro ao carregar as respostas prontas.' }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const auth = requireAuth(req);
    if ('response' in auth) return auth.response;
    if (!isCoachRole(auth.user)) return NextResponse.json({ error: 'Acesso negado.' }, { status: 403 });
    const b = await req.json().catch(() => null);
    const text = String(b?.text ?? '').trim().slice(0, 500);
    if (!text) return NextResponse.json({ error: 'Escreva a resposta.' }, { status: 400 });
    const same = await prisma.videoQuickReply.findFirst({ where: { coachId: auth.user.id, text } });
    if (same) return NextResponse.json({ success: true, reply: same });
    if ((await prisma.videoQuickReply.count({ where: { coachId: auth.user.id } })) >= MAX) return NextResponse.json({ error: `Você já tem ${MAX} respostas prontas. Apague alguma.` }, { status: 409 });
    return NextResponse.json({ success: true, reply: await prisma.videoQuickReply.create({ data: { coachId: auth.user.id, text } }) });
  } catch (e: any) {
    if (missing(e)) return NextResponse.json({ error: 'Indisponível.', unavailable: true }, { status: 503 });
    console.error('[POST /api/exec-video/quick-replies]', e);
    return NextResponse.json({ error: 'Erro ao salvar a resposta pronta.' }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    const auth = requireAuth(req);
    if ('response' in auth) return auth.response;
    if (!isCoachRole(auth.user)) return NextResponse.json({ error: 'Acesso negado.' }, { status: 403 });
    const id = new URL(req.url).searchParams.get('id') || '';
    if (!id) return NextResponse.json({ error: 'id obrigatório.' }, { status: 400 });
    await prisma.videoQuickReply.deleteMany({ where: { id, coachId: auth.user.id } });
    return NextResponse.json({ success: true });
  } catch (e: any) {
    if (missing(e)) return NextResponse.json({ error: 'Indisponível.', unavailable: true }, { status: 503 });
    console.error('[DELETE /api/exec-video/quick-replies]', e);
    return NextResponse.json({ error: 'Erro ao apagar a resposta pronta.' }, { status: 500 });
  }
}
