// app/api/coach-assistant/rapida/route.ts
// ⚡ PERGUNTAS RÁPIDAS do coach (ver lib/coachAssistant.ts): botões prontos, SEM IA e sem custo por pergunta.
//   POST { intent, dias?, situacao?, ios? } -> { ok, answer }
// Vale para QUALQUER coach ativo (e para o time master). SÓ LÊ, só da carteira do coach. `ios: true` = o app do iPhone: cobrança/financeiro não é respondido (regra da Apple).
// RESUMO_ALUNO fica de fora (precisa de um nome falado: é da pergunta livre, que usa IA).
import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { checkRateLimit } from '@/lib/rateLimit';
import { requireActiveCoach, missing } from '@/lib/coachNotesStore';
import { QUICK_INTENTS, isQuickIntent, runIntent } from '@/lib/coachAssistant';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

export async function POST(req: Request) {
  try {
    const auth = await requireActiveCoach(req);
    if ('response' in auth) return auth.response;
    const body = await req.json().catch(() => ({}));
    if (!isQuickIntent(body?.intent)) return NextResponse.json({ error: 'Pergunta rápida inválida.', allowed: QUICK_INTENTS }, { status: 400 });
    const rl = checkRateLimit(`coach-rapida:${auth.user.id}`, { max: 240, windowMs: 60 * 60 * 1000 });
    if (!rl.allowed) return NextResponse.json({ error: 'Muitas consultas seguidas. Aguarde um pouco.' }, { status: 429 });
    const answer = await runIntent(prisma, auth.user.id, body.intent, { dias: body.dias, situacao: body.situacao }, { noFinance: body.ios === true });
    return NextResponse.json({ ok: true, answer, ai: false });
  } catch (e: any) {
    if (missing(e)) return NextResponse.json({ error: 'Não foi possível consultar agora.', unavailable: true }, { status: 503 });
    console.error('[POST /api/coach-assistant/rapida]', e);
    return NextResponse.json({ error: 'Erro ao consultar.' }, { status: 500 });
  }
}
