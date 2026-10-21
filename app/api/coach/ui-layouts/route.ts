// app/api/coach/ui-layouts/route.ts
// 🎨 "Personalizar o app": o desenho (A, B ou C) que o coach escolheu para cada tela do painel.
//   GET                                -> { layouts: { alunos: 'B', ... }, unavailable?: true }
//   PUT { screen, variant }            -> troca UMA tela        -> { layouts }
//   PUT { layouts: { alunos: 'B', … } } -> grava várias (o app manda tudo o que tinha só no aparelho) -> { layouts }
// Só coach ativo (ou master) e só os próprios: o id vem do login, nunca do corpo. Se a tabela ainda não existe (falta `npx prisma db push`): GET responde vazio
// com `unavailable` (o app usa o que guardou no aparelho) e PUT responde 503.
import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuth } from '@/lib/auth';
import { isActiveCoach, coachOnly } from '@/lib/aiAccess';
import { isUiScreen, isUiVariant, sanitizeLayouts } from '@/lib/uiLayouts';

export const dynamic = 'force-dynamic';
const missing = (e: any) => /does not exist|P2021|P2022/i.test(String(e?.code || '') + String(e?.message || ''));

export async function GET(req: Request) {
  try {
    const auth = requireAuth(req);
    if ('response' in auth) return auth.response;
    if (!(await isActiveCoach(prisma, auth.user))) return coachOnly();
    try {
      const row: any = await (prisma as any).coachUiLayout.findUnique({ where: { coachId: auth.user.id } });
      return NextResponse.json({ layouts: sanitizeLayouts(row?.layouts) });
    } catch (e: any) {
      if (missing(e)) return NextResponse.json({ layouts: {}, unavailable: true });
      throw e;
    }
  } catch (e: any) {
    console.error('[GET /api/coach/ui-layouts]', e);
    return NextResponse.json({ error: 'Não foi possível carregar as suas escolhas.' }, { status: 500 });
  }
}

export async function PUT(req: Request) {
  try {
    const auth = requireAuth(req);
    if ('response' in auth) return auth.response;
    if (!(await isActiveCoach(prisma, auth.user))) return coachOnly();
    const b = await req.json().catch(() => null);
    if (!b || typeof b !== 'object') return NextResponse.json({ error: 'Corpo inválido.' }, { status: 400 });

    let patch: Record<string, string> = {};
    if (b.layouts !== undefined) {
      patch = sanitizeLayouts(b.layouts) as Record<string, string>;
      if (!Object.keys(patch).length && b.layouts && Object.keys(b.layouts).length) return NextResponse.json({ error: 'Nenhuma tela ou desenho válido.' }, { status: 400 });
    } else {
      if (!isUiScreen(b.screen)) return NextResponse.json({ error: 'Tela inválida.' }, { status: 400 });
      if (!isUiVariant(b.variant)) return NextResponse.json({ error: 'Desenho inválido (use A, B, C ou D).' }, { status: 400 });
      patch = { [b.screen]: b.variant };
    }

    try {
      const cur: any = await (prisma as any).coachUiLayout.findUnique({ where: { coachId: auth.user.id } });
      const layouts = { ...sanitizeLayouts(cur?.layouts), ...patch };
      await (prisma as any).coachUiLayout.upsert({ where: { coachId: auth.user.id }, create: { coachId: auth.user.id, layouts }, update: { layouts } });
      return NextResponse.json({ layouts });
    } catch (e: any) {
      if (missing(e)) return NextResponse.json({ error: 'As escolhas ainda não podem ser salvas no servidor (falta criar a tabela nova: npx prisma db push).', unavailable: true }, { status: 503 });
      throw e;
    }
  } catch (e: any) {
    console.error('[PUT /api/coach/ui-layouts]', e);
    return NextResponse.json({ error: 'Não foi possível salvar a sua escolha.' }, { status: 500 });
  }
}
