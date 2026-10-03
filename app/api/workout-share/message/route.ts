// app/api/workout-share/message/route.ts
// 🔗 (3 out 2026) Texto do WhatsApp que o coach manda junto com o link do treino (um por coach, vale em todos os aparelhos dele).
//   GET            -> { message }   (null = usa o texto padrão do app)
//   PUT { message } -> { message }   (vazio/null = volta ao padrão)
// O texto pode ter {nome}, {treino}, {validade} e {link}; o app troca por cada link na hora de enviar (src/utils/workoutShare.js).
import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuth, isMasterId } from '@/lib/auth';
import { checkRateLimit } from '@/lib/rateLimit';
import { cleanShareMessage } from '@/lib/workoutShare';

export const dynamic = 'force-dynamic';

const isCoachUser = (u: { id: string; role: string }) => u.role === 'ADMIN' || isMasterId(u.id);

export async function GET(req: Request) {
  try {
    const auth = requireAuth(req);
    if ('response' in auth) return auth.response;
    if (!isCoachUser(auth.user)) return NextResponse.json({ error: 'Acesso negado.' }, { status: 403 });
    const user = await prisma.user.findUnique({ where: { id: auth.user.id }, select: { shareMessage: true } });
    return NextResponse.json({ message: user?.shareMessage || null });
  } catch (error) {
    console.error('Erro GET workout-share/message:', error);
    return NextResponse.json({ error: 'Erro ao ler a mensagem.' }, { status: 500 });
  }
}

export async function PUT(req: Request) {
  try {
    const auth = requireAuth(req);
    if ('response' in auth) return auth.response;
    if (!isCoachUser(auth.user)) return NextResponse.json({ error: 'Acesso negado.' }, { status: 403 });
    if (!checkRateLimit(`wshare-msg:${auth.user.id}`, { max: 60, windowMs: 60 * 60 * 1000 }).allowed) return NextResponse.json({ error: 'Muitas alterações em pouco tempo. Tente de novo em alguns minutos.' }, { status: 429 });
    const body = await req.json().catch(() => ({}));
    const cleaned = cleanShareMessage(body?.message);
    if (!cleaned.ok) return NextResponse.json({ error: cleaned.error }, { status: 400 });
    await prisma.user.update({ where: { id: auth.user.id }, data: { shareMessage: cleaned.value } });
    return NextResponse.json({ message: cleaned.value });
  } catch (error) {
    console.error('Erro PUT workout-share/message:', error);
    return NextResponse.json({ error: 'Erro ao salvar a mensagem.' }, { status: 500 });
  }
}
