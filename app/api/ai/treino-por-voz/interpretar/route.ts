// app/api/ai/treino-por-voz/interpretar/route.ts
// 🎙️ (30 set 2026) Montar treino por voz -- passo 2: texto -> exercícios.
//
// Recebe o TEXTO (já transcrito e, se o coach quis, corrigido na mão) e devolve
// uma lista de exercícios prontos pra tela de revisão do Montar Treino:
//   fala -> IA extrai a estrutura -> este código casa com a biblioteca do coach
//   -> normaliza blocos/padrões -> o coach CONFERE e só então adiciona ao dia.
//
// Só masters (Paulo/Adri) por enquanto. A trava é aqui no servidor, não só no
// botão do app.
import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuth, canActAsCoach, isMasterId } from '@/lib/auth';
import { checkRateLimit } from '@/lib/rateLimit';
import { buildIndex } from '@/lib/voiceWorkout/match';
import { buildReviewItems } from '@/lib/voiceWorkout/pipeline';
import { extractWorkout } from '@/lib/voiceWorkout/extract';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const MAX_TEXT = 4000;

export async function POST(req: Request) {
  try {
    const auth = requireAuth(req);
    if ('response' in auth) return auth.response;
    if (!isMasterId(auth.user.id)) {
      return NextResponse.json({ error: 'Recurso disponível apenas para o time master.' }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const adminId: string = body?.adminId || auth.user.id;
    const text: string = typeof body?.text === 'string' ? body.text.trim() : '';

    if (!canActAsCoach(auth.user, adminId)) {
      return NextResponse.json({ error: 'Acesso negado.' }, { status: 403 });
    }
    if (text.length < 3) {
      return NextResponse.json({ error: 'Descreva o treino (por voz ou texto) antes de interpretar.' }, { status: 400 });
    }
    if (text.length > MAX_TEXT) {
      return NextResponse.json({ error: `Texto muito longo (máx. ${MAX_TEXT} caracteres). Divida por dia de treino.` }, { status: 400 });
    }

    const rl = checkRateLimit(`voz-interpretar:${auth.user.id}`, { max: 60, windowMs: 60 * 60 * 1000 });
    if (!rl.allowed) {
      return NextResponse.json({ error: 'Muitas interpretações seguidas. Aguarde um pouco.' }, { status: 429 });
    }

    // Mesma regra de escopo da biblioteca que GET /api/exercise usa pra master:
    // os exercícios dele + os globais (sem dono).
    const library = await prisma.exercise.findMany({
      where: { OR: [{ coachId: adminId }, { coachId: null }] },
      select: { id: true, name: true, category: true, subCategory: true, videoUrl: true, coachId: true },
    });
    if (!library.length) {
      return NextResponse.json({ error: 'Nenhum exercício encontrado na biblioteca.' }, { status: 404 });
    }
    const index = buildIndex(library, adminId);

    let extracted;
    try {
      extracted = await extractWorkout(text);
    } catch (e: any) {
      console.error('[treino-por-voz/interpretar] falha na IA:', e?.message || e);
      return NextResponse.json({ error: 'Não consegui interpretar agora. Tente de novo em instantes.' }, { status: 502 });
    }

    const { usage } = extracted;
    console.info(`[treino-por-voz] model=${usage.model} fallback=${usage.usedFallback} in=${usage.inputTokens} out=${usage.outputTokens} ms=${usage.ms} exercicios=${extracted.parsed.exercises.length}`);

    const items = buildReviewItems(extracted.parsed.exercises, index);

    return NextResponse.json({
      ok: true,
      text,
      items,
      warnings: extracted.parsed.warnings,
    });
  } catch (error: any) {
    console.error('[treino-por-voz/interpretar]', error?.message || error);
    return NextResponse.json({ error: 'Erro interno ao interpretar o treino.' }, { status: 500 });
  }
}
