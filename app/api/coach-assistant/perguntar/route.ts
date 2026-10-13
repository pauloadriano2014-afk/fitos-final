// app/api/coach-assistant/perguntar/route.ts
// 🎙️ PERGUNTAS POR VOZ do coach (ver lib/coachAssistant.ts).
//   POST { text, ios? }                      -> { ok, answer: { intent, title, spoken, items[], total, restricted?, ambiguous? }, ai }
//   POST { intent: 'RESUMO_ALUNO', studentId } -> o resumo de um aluno já escolhido na lista de "qual deles?"
// SÓ LÊ. A IA (Haiku 5.5) escolhe a consulta pronta; o servidor busca os dados só da carteira do coach. `ios: true` = o app é o do iPhone: perguntas de cobrança/financeiro não são respondidas (regra da Apple).
// Mesma trava das notas por voz: coach ativo COM a chave `notasVoz` (a conta que grava notas por voz também pergunta).
import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { checkRateLimit } from '@/lib/rateLimit';
import { requireNotesCoach, missing } from '@/lib/coachNotesStore';
import { todayKeyBrt } from '@/lib/coachNotes';
import { MAX_QUESTION, NOT_UNDERSTOOD, aiRoute, isIntent, ruleRoute, runIntent, type Route } from '@/lib/coachAssistant';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function POST(req: Request) {
  try {
    const auth = await requireNotesCoach(req);
    if ('response' in auth) return auth.response;
    const body = await req.json().catch(() => ({}));
    const noFinance = body && body.ios === true;
    const rl = checkRateLimit(`coach-pergunta:${auth.user.id}`, { max: 120, windowMs: 60 * 60 * 1000 });
    if (!rl.allowed) return NextResponse.json({ error: 'Muitas perguntas seguidas. Aguarde um pouco.' }, { status: 429 });

    // seguimento de "qual aluno?": já vem o id (o servidor confere que é da carteira dele, dentro da consulta)
    if (body && body.intent === 'RESUMO_ALUNO' && typeof body.studentId === 'string' && body.studentId) {
      const answer = await runIntent(prisma, auth.user.id, 'RESUMO_ALUNO', {}, { noFinance, studentId: body.studentId });
      return NextResponse.json({ ok: true, answer, ai: false });
    }

    const text: string = typeof body?.text === 'string' ? body.text.replace(/\s+/g, ' ').trim() : '';
    if (text.length < 3) return NextResponse.json({ error: 'Fale ou escreva a pergunta antes de enviar.' }, { status: 400 });
    if (text.length > MAX_QUESTION) return NextResponse.json({ error: `Pergunta muito longa (máx. ${MAX_QUESTION} letras).` }, { status: 400 });

    let route: Route = { intent: 'NENHUMA', params: {} };
    let ai = false;
    try {
      const r = await aiRoute(text, todayKeyBrt());
      route = r.route; ai = true;
      console.info(`[pergunta-voz] roteou model=${r.usage.model} in=${r.usage.inputTokens} out=${r.usage.outputTokens} ms=${r.usage.ms} consulta=${route.intent}`);
    } catch (e: any) {
      console.error('[pergunta-voz] IA indisponível, usando palavras-chave:', e?.message || e);
    }
    if (route.intent === 'NENHUMA') { const rr = ruleRoute(text); if (rr.intent !== 'NENHUMA') { route = rr; ai = false; } }
    if (!isIntent(route.intent)) return NextResponse.json({ ok: true, answer: NOT_UNDERSTOOD, ai });
    const answer = await runIntent(prisma, auth.user.id, route.intent, route.params, { noFinance });
    return NextResponse.json({ ok: true, answer, ai });
  } catch (e: any) {
    if (missing(e)) return NextResponse.json({ error: 'Não foi possível consultar agora.', unavailable: true }, { status: 503 });
    console.error('[POST /api/coach-assistant/perguntar]', e);
    return NextResponse.json({ error: 'Erro ao responder a pergunta.' }, { status: 500 });
  }
}
