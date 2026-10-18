// app/api/insights/group/route.ts
// 🧠 (18 out 2026) POST { refresh?, onlyCached? } -> a VISÃO GERAL dos treinos que os alunos do coach de fato fizeram, por gênero e nível, com a leitura da IA e a metodologia sugerida
// (lib/insightGroup.ts), COM MEMÓRIA (sem alunos/rotinas novas, devolve a leitura guardada sem gastar IA). As contas por grupo vêm sempre, mesmo sem IA.
// Mesma trava da análise: chave `perguntasVoz`. Só a carteira do coach.
import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { checkRateLimit } from '@/lib/rateLimit';
import { requireAskCoach } from '@/lib/coachNotesStore';
import { groupInsights } from '@/lib/insightGroup';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function POST(req: Request) {
  const auth = await requireAskCoach(req);
  if ('response' in auth) return auth.response;
  try {
    const body = await req.json().catch(() => ({}));
    const onlyCached = body?.onlyCached === true;
    if (!onlyCached) {
      const rl = checkRateLimit(`insight-group:${auth.user.id}`, { max: 10, windowMs: 60 * 60 * 1000 });
      if (!rl.allowed) return NextResponse.json({ error: 'Muitos pedidos seguidos. Aguarde um pouco.' }, { status: 429 });
    }
    return NextResponse.json(await groupInsights(prisma, auth.user.id, { refresh: body?.refresh === true, onlyCached }));
  } catch (e: any) {
    console.error('Erro POST insights/group:', e?.message || e);
    return NextResponse.json({ error: 'Não consegui gerar a visão geral agora. Tente de novo em instantes.' }, { status: 502 });
  }
}
