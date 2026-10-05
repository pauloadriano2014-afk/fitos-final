// app/api/treino-publico/[code]/progresso/route.ts
// 📈 (5 out 2026) PROGRESSO DO TESTE GRÁTIS: a página pública (elitefitapp.com.br/t/) manda o que a pessoa fez (cargas por série, "Ant", exercícios marcados, trocas).
// SEM login, por isso:
//   - só vale em link de TESTE GRÁTIS (`trial`); em qualquer outro link responde 200 e NÃO guarda nada (a página também nem envia);
//   - link desativado ou vencido não recebe mais nada (410); corpo limitado a 100 mil caracteres;
//   - só entram números (carga em kg), códigos de 12 letras/dígitos e horários, tudo validado em lib/workoutShareProgress.ts; texto livre não existe aqui;
//   - fica guardado no próprio link (WorkoutShare.progress), até 3 aparelhos; o coach lê o relatório em GET /api/workout-share/progress;
//   - limites por IP e por link.
import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { checkRateLimit, getClientIp } from '@/lib/rateLimit';
import { isValidShareCode, shareStatus } from '@/lib/workoutShare';
import { parseProgressBody, mergeProgress, MAX_PROGRESS_BODY } from '@/lib/workoutShareProgress';

export const dynamic = 'force-dynamic';

const HEADERS = { 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow' };
const reply = (body: any, status = 200) => NextResponse.json(body, { status, headers: HEADERS });

export async function POST(req: Request, { params }: { params: { code: string } }) {
  try {
    if (!checkRateLimit(`tpp:${getClientIp(req)}`, { max: 240, windowMs: 60 * 60 * 1000 }).allowed) return reply({ error: 'rate_limited' }, 429);
    const code = params?.code;
    if (!isValidShareCode(code)) return reply({ error: 'not_found' }, 404);
    if (!checkRateLimit(`tpp-code:${code}`, { max: 600, windowMs: 60 * 60 * 1000 }).allowed) return reply({ error: 'rate_limited' }, 429);

    const text = await req.text().catch(() => '');
    if (text.length > MAX_PROGRESS_BODY) return reply({ error: 'too_large' }, 413);
    let body: any = null;
    try { body = text ? JSON.parse(text) : null; } catch { body = null; }
    const parsed = parseProgressBody(body);
    if (!parsed.ok) return reply({ error: 'bad_request' }, 400);

    const share = await prisma.workoutShare.findUnique({ where: { code } });
    if (!share) return reply({ error: 'not_found' }, 404);
    const status = shareStatus(share);
    if (status !== 'ACTIVE') return reply({ error: status === 'REVOKED' ? 'revoked' : 'expired' }, 410);
    if (!share.trial) return reply({ ok: true, stored: false });

    const merged = mergeProgress(share.progress, parsed.vid, parsed.value);
    await prisma.workoutShare.update({ where: { code }, data: { progress: merged.json, progressAt: new Date() } });
    return reply({ ok: true, stored: true });
  } catch (error) {
    console.error('Erro POST treino-publico/progresso:', error);
    return reply({ error: 'server_error' }, 500);
  }
}
