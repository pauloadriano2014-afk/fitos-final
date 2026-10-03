// app/api/treino-publico/[code]/concluido/route.ts
// 🔗 (3 out 2026) "Concluí o treino": a página pública (elitefitapp.com.br/t/) avisa que a pessoa terminou um dia de treino. SEM login, por isso:
//   - só vale se o coach ligou o aviso naquele link (`notifyDone`); senão responde 200 e não faz nada;
//   - o corpo é só { vid, day }: `vid` é um id aleatório do navegador (não identifica ninguém) e `day` precisa ser um dia que o link mostra;
//   - cada pessoa (vid) conta UMA vez por dia de treino (tabela WorkoutShareDone), com teto de 500 por link e limites por IP e por link;
//   - nada de texto livre vira push: o aviso usa o nome que o COACH escolheu para o link.
import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { checkRateLimit, getClientIp } from '@/lib/rateLimit';
import { isValidShareCode, shareStatus, parseDoneBody, donePushText, MAX_DONE_PER_SHARE } from '@/lib/workoutShare';
import { pushToShareCreator, loadShareContext, whoSees } from '@/lib/workoutShareNotify';

export const dynamic = 'force-dynamic';

const HEADERS = { 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow' };
const reply = (body: any, status = 200) => NextResponse.json(body, { status, headers: HEADERS });

export async function POST(req: Request, { params }: { params: { code: string } }) {
  try {
    if (!checkRateLimit(`tpd:${getClientIp(req)}`, { max: 60, windowMs: 60 * 60 * 1000 }).allowed) return reply({ error: 'rate_limited' }, 429);
    const code = params?.code;
    if (!isValidShareCode(code)) return reply({ error: 'not_found' }, 404);
    if (!checkRateLimit(`tpd-code:${code}`, { max: 200, windowMs: 60 * 60 * 1000 }).allowed) return reply({ error: 'rate_limited' }, 429);

    const parsed = parseDoneBody(await req.json().catch(() => ({})));
    if (!parsed.ok) return reply({ error: 'bad_request' }, 400);

    const share = await prisma.workoutShare.findUnique({ where: { code } });
    if (!share) return reply({ error: 'not_found' }, 404);
    const status = shareStatus(share);
    if (status !== 'ACTIVE') return reply({ error: status === 'REVOKED' ? 'revoked' : 'expired' }, 410);
    if (!share.notifyDone) return reply({ ok: true, counted: false });

    const ctx = await loadShareContext(share);
    if (!ctx) return reply({ error: 'not_found' }, 404);
    const shown = share.days && share.days.length ? ctx.days.filter((d) => share.days.includes(d)) : ctx.days;
    if (!shown.includes(parsed.day)) return reply({ error: 'bad_day' }, 400);

    if ((await prisma.workoutShareDone.count({ where: { shareId: share.id } })) >= MAX_DONE_PER_SHARE) return reply({ ok: true, counted: false });
    try {
      await prisma.workoutShareDone.create({ data: { shareId: share.id, vid: parsed.vid, day: parsed.day } });
    } catch (e: any) {
      if (e?.code === 'P2002') return reply({ ok: true, counted: false });          // a mesma pessoa já avisou este dia
      throw e;
    }
    await prisma.workoutShare.update({ where: { code }, data: { doneCount: { increment: 1 }, lastDoneAt: new Date() } });

    const text = donePushText(whoSees(share, ctx.studentName), parsed.day, ctx.workoutName);
    await pushToShareCreator(share, text.title, text.body, { type: 'workout_link_done', code, day: parsed.day, workoutId: share.workoutId || undefined, quickWorkoutId: share.quickWorkoutId || undefined });
    return reply({ ok: true, counted: true });
  } catch (error) {
    console.error('Erro POST treino-publico/concluido:', error);
    return reply({ error: 'server_error' }, 500);
  }
}
