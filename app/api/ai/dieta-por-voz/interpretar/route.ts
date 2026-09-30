// app/api/ai/dieta-por-voz/interpretar/route.ts
// 🎙️ (30 set 2026) Montar dieta por voz -- texto -> refeições e alimentos.
//
// Recebe o TEXTO (já transcrito e, se o coach quis, corrigido na mão) e devolve as
// refeições prontas pra tela de conferência da Dieta:
//   fala -> IA extrai a estrutura -> este código casa cada alimento com o catálogo
//   (TACO + os do coach; "Do Aluno" primeiro) -> normaliza unidades -> o coach
//   CONFERE e só então adiciona ao dia aberto.
//
// A transcrição do áudio é a mesma rota do treino (/api/ai/treino-por-voz/transcrever,
// com context=dieta). Só masters por enquanto; a trava é aqui no servidor.
import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuth, canActAsCoach, isMasterId } from '@/lib/auth';
import { checkRateLimit } from '@/lib/rateLimit';
import { buildFoodIndex } from '@/lib/voiceDiet/match';
import { buildDietReview } from '@/lib/voiceDiet/pipeline';
import { extractDiet } from '@/lib/voiceDiet/extract';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const MAX_TEXT = 6000;
const MAX_FAVORITES = 300;
const MASTER_TEAM = 'MASTER_TEAM';

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
    // Alimentos que o ALUNO marcou na anamnese (aba "Do Aluno"). Só servem pra
    // ordenar/priorizar o que casa; um id inválido simplesmente não casa com nada.
    const favoriteIds: string[] = Array.isArray(body?.favoriteFoodIds)
      ? body.favoriteFoodIds.filter((x: unknown) => typeof x === 'string').slice(0, MAX_FAVORITES)
      : [];

    if (!canActAsCoach(auth.user, adminId)) {
      return NextResponse.json({ error: 'Acesso negado.' }, { status: 403 });
    }
    if (text.length < 3) {
      return NextResponse.json({ error: 'Descreva a dieta (por voz ou texto) antes de interpretar.' }, { status: 400 });
    }
    if (text.length > MAX_TEXT) {
      return NextResponse.json({ error: `Texto muito longo (máx. ${MAX_TEXT} caracteres). Divida por tipo de dia.` }, { status: 400 });
    }

    const rl = checkRateLimit(`dieta-voz-interpretar:${auth.user.id}`, { max: 60, windowMs: 60 * 60 * 1000 });
    if (!rl.allowed) {
      return NextResponse.json({ error: 'Muitas interpretações seguidas. Aguarde um pouco.' }, { status: 429 });
    }

    // Mesmo escopo do GET /api/food/search: TACO (global) + os alimentos do time do coach.
    const teamId = isMasterId(adminId) ? MASTER_TEAM : adminId;
    const rows = await prisma.food.findMany({
      where: {
        isActive: true,
        OR: [{ source: 'TACO', teamId: null }, { source: 'CUSTOM', teamId }],
      },
      select: {
        id: true, source: true, name: true, category: true, subcategory: true, baseUnit: true,
        kcal: true, protein: true, carbs: true, fat: true, fiber: true,
        isLactoseFree: true, conversionFactor: true, isFavorite: true,
      },
    });
    if (!rows.length) {
      return NextResponse.json({ error: 'Nenhum alimento encontrado no catálogo.' }, { status: 404 });
    }
    const index = buildFoodIndex(rows as any, favoriteIds);

    let extracted;
    try {
      extracted = await extractDiet(text);
    } catch (e: any) {
      console.error('[dieta-por-voz/interpretar] falha na IA:', e?.message || e);
      return NextResponse.json({ error: 'Não consegui interpretar agora. Tente de novo em instantes.' }, { status: 502 });
    }

    const { usage } = extracted;
    const foodsCount = extracted.parsed.meals.reduce((n, m) => n + m.foods.length, 0);
    console.info(`[dieta-por-voz] model=${usage.model} fallback=${usage.usedFallback} in=${usage.inputTokens} out=${usage.outputTokens} ms=${usage.ms} refeicoes=${extracted.parsed.meals.length} alimentos=${foodsCount}`);

    const meals = buildDietReview(extracted.parsed.meals, index);

    return NextResponse.json({ ok: true, text, meals, warnings: extracted.parsed.warnings });
  } catch (error: any) {
    console.error('[dieta-por-voz/interpretar]', error?.message || error);
    return NextResponse.json({ error: 'Erro interno ao interpretar a dieta.' }, { status: 500 });
  }
}
