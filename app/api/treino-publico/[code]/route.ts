// app/api/treino-publico/[code]/route.ts
// 🔗 (2 out 2026) PÁGINA PÚBLICA DO TREINO: lida por elitefitapp.com.br/t/?c=<code>. SEM login: quem tem o código vê o treino, nas escolhas que o coach
// fez ao criar o link (nome sim/não, dias, validade). O link aponta para o treino salvo de um aluno OU para um treino avulso do coach. Só sai o que o aluno já vê no app (lib/workoutShare.ts: buildPublicWorkout).
// Link inexistente = 404; desativado ou vencido = 410. Limite de pedidos por IP contra tentativa de adivinhar códigos.
import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { checkRateLimit, getClientIp } from '@/lib/rateLimit';
import { isValidShareCode, shareStatus, openPushText } from '@/lib/workoutShare';
import { loadSharePayload } from '@/lib/workoutSharePayload';
import { pushToShareCreator, whoSees } from '@/lib/workoutShareNotify';

export const dynamic = 'force-dynamic';

const HEADERS = { 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow' };
const reply = (body: any, status = 200) => NextResponse.json(body, { status, headers: HEADERS });

export async function GET(req: Request, { params }: { params: { code: string } }) {
  try {
    const ip = getClientIp(req);
    if (!checkRateLimit(`tp:${ip}`, { max: 120, windowMs: 60 * 1000 }).allowed) return reply({ error: 'rate_limited' }, 429);

    const code = params?.code;
    if (!isValidShareCode(code)) {
      if (!checkRateLimit(`tp-miss:${ip}`, { max: 20, windowMs: 10 * 60 * 1000 }).allowed) return reply({ error: 'rate_limited' }, 429);
      return reply({ error: 'not_found' }, 404);
    }

    const share = await prisma.workoutShare.findUnique({ where: { code } });
    if (!share) {
      if (!checkRateLimit(`tp-miss:${ip}`, { max: 20, windowMs: 10 * 60 * 1000 }).allowed) return reply({ error: 'rate_limited' }, 429);
      return reply({ error: 'not_found' }, 404);
    }
    const status = shareStatus(share);
    if (status === 'REVOKED') return reply({ error: 'revoked' }, 410);
    if (status === 'EXPIRED') return reply({ error: 'expired', expiredAt: share.expiresAt ? new Date(share.expiresAt).toISOString() : null, trial: !!share.trial }, 410);   // `trial`: a página oferece o WhatsApp no lugar do aviso seco

    // o payload é montado em lib/workoutSharePayload.ts (o relatório do teste grátis do coach usa o mesmo)
    const loaded = await loadSharePayload(share);
    if (!loaded.ok) return reply({ error: 'not_found' }, 404);
    const { payload, studentName, workoutName } = loaded;

    // conta a visualização sem atrasar nem derrubar a resposta. `?preview=1` = o próprio coach conferindo o link: não conta e não avisa ninguém.
    // Na 1ª visualização de verdade (o contador chega a 1 -- a conta é atômica no banco, então nunca avisa duas vezes) o coach recebe o push.
    if (new URL(req.url).searchParams.get('preview') !== '1') {
      prisma.workoutShare.update({ where: { code }, data: { viewCount: { increment: 1 }, lastViewedAt: new Date() } })
        .then((u: any) => {
          if (share.notifyOpen && u && u.viewCount === 1) {
            const text = openPushText(whoSees(share, studentName), workoutName);
            return pushToShareCreator(share, text.title, text.body, { type: 'workout_link_opened', code, workoutId: share.workoutId || undefined, quickWorkoutId: share.quickWorkoutId || undefined });
          }
        })
        .catch(() => {});
    }

    return reply({ ok: true, ...payload });
  } catch (error) {
    console.error('Erro GET treino-publico:', error);
    return reply({ error: 'server_error' }, 500);
  }
}
