// app/api/coach-assistant/voz/route.ts
// 🔊 POST { text, voice? } -> { ok, audio (base64 mp3), mime, voice, cached, used?, limit? }   (só o time master)
// Voz natural da OpenAI para o botão OUVIR. Falhas devolvem erro simples e o app cai na voz do aparelho: nunca fica mudo.
//   403 não é do time master · 400 texto vazio/longo · 429 limite por hora ou do mês (`budget: true`) · 503 sem chave da OpenAI · 502 a OpenAI falhou
import { NextResponse } from 'next/server';
import OpenAI from 'openai';
import prisma from '@/lib/prisma';
import { checkRateLimit } from '@/lib/rateLimit';
import { requireActiveCoach } from '@/lib/coachNotesStore';
import { isMasterCoachId } from '@/lib/coachAssistant';
import { DEFAULT_VOICE, MAX_TTS_CHARS, TTS_INSTRUCTIONS, TTS_MODEL, cacheGet, cacheKey, cacheSet, cleanTtsText, isVoice, logUsage, monthlyLimit, usedThisMonth } from '@/lib/assistantVoice';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function POST(req: Request) {
  try {
    const auth = await requireActiveCoach(req);
    if ('response' in auth) return auth.response;
    if (!isMasterCoachId(auth.user.id)) return NextResponse.json({ error: 'A voz natural ainda não está liberada para a sua conta.', locked: true }, { status: 403 });
    const body = await req.json().catch(() => ({}));
    const text = cleanTtsText(body?.text);
    if (text.length < 2) return NextResponse.json({ error: 'Nada para falar.' }, { status: 400 });
    if (text.length > MAX_TTS_CHARS) return NextResponse.json({ error: `Texto longo demais para a voz natural (máx. ${MAX_TTS_CHARS} letras).` }, { status: 400 });
    const voice = isVoice(body?.voice) ? body.voice : DEFAULT_VOICE;

    const key = cacheKey(voice, text);
    const hit = cacheGet(key);
    if (hit) return NextResponse.json({ ok: true, audio: hit, mime: 'audio/mpeg', voice, cached: true });

    const rl = checkRateLimit(`coach-voz:${auth.user.id}`, { max: 120, windowMs: 60 * 60 * 1000 });
    if (!rl.allowed) return NextResponse.json({ error: 'Muitas falas seguidas. Aguarde um pouco.' }, { status: 429 });
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) return NextResponse.json({ error: 'Voz natural indisponível (chave não configurada no servidor).' }, { status: 503 });
    const limit = monthlyLimit(), used = await usedThisMonth(prisma);
    if (used + text.length > limit) return NextResponse.json({ error: 'O limite mensal da voz natural acabou. Usando a voz do aparelho.', budget: true, used, limit }, { status: 429 });

    const openai = new OpenAI({ apiKey, timeout: 40_000, maxRetries: 1 });
    const t0 = Date.now();
    const resp: any = await openai.audio.speech.create({ model: TTS_MODEL, voice, input: text, instructions: TTS_INSTRUCTIONS, response_format: 'mp3' } as any);
    const b64 = Buffer.from(await resp.arrayBuffer()).toString('base64');
    if (!b64) return NextResponse.json({ error: 'A voz natural não devolveu áudio.' }, { status: 502 });
    cacheSet(key, b64);
    await logUsage(prisma, auth.user.id, voice, text.length);
    console.info(`[voz] ok voice=${voice} chars=${text.length} ms=${Date.now() - t0} mes=${used + text.length}/${limit}`);
    return NextResponse.json({ ok: true, audio: b64, mime: 'audio/mpeg', voice, cached: false, used: used + text.length, limit });
  } catch (e: any) {
    console.error('[POST /api/coach-assistant/voz]', e?.message || e);
    return NextResponse.json({ error: 'Falha ao gerar a voz. Usando a voz do aparelho.' }, { status: 502 });
  }
}
