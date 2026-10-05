// app/api/workout-share/progress/route.ts
// 📈 (5 out 2026) RELATÓRIO DO TESTE GRÁTIS -- lado do COACH (precisa de login). GET ?code=<código do link> devolve o que a pessoa fez no link de teste:
// acessos (aberturas, último acesso), dias concluídos e quando, e, por treino e exercício, as cargas de cada série (inclusive DROP-SET, cluster, 21 e técnica personalizada),
// a variação contra o "Ant", o volume e os exercícios marcados. Os nomes e o plano de séries vêm do treino atual do link (lib/workoutSharePayload.ts), os números vêm do que
// a página enviou (lib/workoutShareProgress.ts). Só o dono do treino ou o time master lê.
import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuth, canActAsCoach } from '@/lib/auth';
import { checkRateLimit } from '@/lib/rateLimit';
import { isValidShareCode, shareStatus } from '@/lib/workoutShare';
import { loadSharePayload } from '@/lib/workoutSharePayload';
import { parseStored, buildProgressReport } from '@/lib/workoutShareProgress';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  try {
    const auth = requireAuth(req);
    if ('response' in auth) return auth.response;
    const code = new URL(req.url).searchParams.get('code') || '';
    if (!isValidShareCode(code)) return NextResponse.json({ error: 'Código inválido.' }, { status: 400 });
    if (!checkRateLimit(`wshare-progress:${auth.user.id}`, { max: 120, windowMs: 60 * 60 * 1000 }).allowed) return NextResponse.json({ error: 'Muitas consultas em pouco tempo. Tente de novo em alguns minutos.' }, { status: 429 });

    const share = await prisma.workoutShare.findUnique({ where: { code } });
    if (!share) return NextResponse.json({ error: 'Link não encontrado.' }, { status: 404 });
    const loaded = await loadSharePayload(share);
    if (!loaded.ok) return NextResponse.json({ error: 'O treino deste link não existe mais.' }, { status: 404 });
    if (!canActAsCoach(auth.user, loaded.coachId)) return NextResponse.json({ error: 'Acesso negado.' }, { status: 403 });

    const dones = await prisma.workoutShareDone.findMany({ where: { shareId: share.id }, orderBy: { createdAt: 'asc' }, take: 200 });
    const report = buildProgressReport({
      payload: loaded.payload,
      stored: parseStored(share.progress),
      dones,
      share: { ...share, status: shareStatus(share) },
    });
    return NextResponse.json({ report });
  } catch (error) {
    console.error('Erro GET workout-share/progress:', error);
    return NextResponse.json({ error: 'Erro ao montar o relatório.' }, { status: 500 });
  }
}
