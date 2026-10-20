// app/api/admin/coach-ai-usage/route.ts
// 💰 Painel do time master: quanto a IA do servidor custou por coach no mês (estimativa, a partir do AiLog).
//   GET ?month=AAAA-MM   (padrão: mês atual em Brasília)
//   -> { month, brlPerUsd, totals: { count, usd, brl, partnersBrl }, coaches: [ { coachId, name, plan, master, count, usd, brl, categories: [...], limits: { treino, dieta, voz, perguntas, checkin } (cada um { used, limit }; null no time master) } ], notMeasured: [...] }
import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireMaster, isMasterId } from '@/lib/auth';
import { aggregate, toCategories, BRL_PER_USD, NOT_MEASURED, type CoachCost } from '@/lib/aiCost';
import { capLimit } from '@/lib/coachMonthlyCaps';
import { monthStartBR, nextMonthStartBR, limitsFor } from '@/lib/coachAi';

export const dynamic = 'force-dynamic';
const round = (x: number, d: number) => Math.round(x * 10 ** d) / 10 ** d;

export async function GET(req: Request) {
  try {
    const auth = requireMaster(req);
    if ('response' in auth) return auth.response;
    const url = new URL(req.url);
    const m = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(String(url.searchParams.get('month') || ''));
    const ref = m ? new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, 15, 12)) : new Date();
    const from = monthStartBR(ref), to = nextMonthStartBR(ref);
    const br = new Date(from.getTime() - 3 * 3600 * 1000);
    const month = `${br.getUTCFullYear()}-${String(br.getUTCMonth() + 1).padStart(2, '0')}`;

    const rows: any[] = await prisma.aiLog.findMany({ where: { createdAt: { gte: from, lt: to } }, select: { userId: true, question: true, answer: true } });
    const userIds = Array.from(new Set(rows.map((r) => r.userId)));
    const users: any[] = userIds.length ? await prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, role: true, coachId: true } }) : [];
    const byId = new Map(users.map((u) => [u.id, u]));
    // linha de coach/admin é do próprio; linha de aluno (chat, feedback) é do coach dele
    const ownerOf = (uid: string): string | null => {
      const u = byId.get(uid);
      if (!u) return null;
      return u.role === 'USER' ? (u.coachId || null) : u.id;
    };
    const agg = aggregate(rows, ownerOf);

    const ids = Array.from(agg.keys()).filter((k): k is string => !!k);
    const coaches: any[] = ids.length ? await prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, name: true, coachPlan: true } }) : [];
    const info = new Map(coaches.map((c) => [c.id, c]));
    const list: CoachCost[] = [];
    for (const [owner, per] of agg) {
      const categories = toCategories(per);
      const usd = categories.reduce((s, c) => s + c.usd, 0), count = categories.reduce((s, c) => s + c.count, 0);
      const c = owner ? info.get(owner) : null;
      list.push({ coachId: owner, name: owner ? (c?.name || 'Coach sem nome') : 'Alunos sem coach', plan: c?.coachPlan ?? null, master: !!owner && isMasterId(owner), count, usd: round(usd, 4), brl: round(usd * BRL_PER_USD, 2), categories });
    }
    list.sort((a, b) => b.usd - a.usd);
    const withLimits = list.map((c) => {
      const lim = limitsFor(c.plan);
      const used = (k: string) => c.categories.find((x) => x.category === k)?.count || 0;
      return { ...c, limits: c.master ? null : { treino: { used: used('treino'), limit: lim.treino }, dieta: { used: used('dieta'), limit: lim.dieta }, voz: { used: used('ditado'), limit: capLimit('voz') }, perguntas: { used: used('pergunta'), limit: capLimit('perguntas') }, checkin: { used: used('checkin'), limit: capLimit('checkin') } } };
    });
    const usd = list.reduce((s, c) => s + c.usd, 0);
    return NextResponse.json({ month, brlPerUsd: BRL_PER_USD, totals: { count: list.reduce((s, c) => s + c.count, 0), usd: round(usd, 4), brl: round(usd * BRL_PER_USD, 2), partnersBrl: round(list.filter((c) => !c.master).reduce((s, c) => s + c.usd, 0) * BRL_PER_USD, 2) }, coaches: withLimits, notMeasured: NOT_MEASURED });
  } catch (e: any) {
    console.error('[GET /api/admin/coach-ai-usage]', e);
    return NextResponse.json({ error: 'Erro ao calcular o custo de IA.' }, { status: 500 });
  }
}
