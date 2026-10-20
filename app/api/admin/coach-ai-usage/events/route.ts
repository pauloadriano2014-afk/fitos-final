// app/api/admin/coach-ai-usage/events/route.ts
// 🔎 Histórico detalhado do custo de IA (só master): cada uso, com data e hora (Brasília), tipo, quem usou, custo e um resumo (motor, tokens, tempo, fotos).
//   GET ?coachId=<id | sem-coach>&month=AAAA-MM&category=<opcional>&before=<ISO da última linha da página anterior>
//   -> { month, coachId, category, items: [ { id, at, category, label, usd, brl, estimated, by: { id, name, role } | null, detail, question? } ], next: ISO | null }
// "question" (o texto que o aluno perguntou) só vem quando o coach dono é do time master; de aluno de coach parceiro nunca.
import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireMaster, isMasterId } from '@/lib/auth';
import { CATEGORY_LABEL, BRL_PER_USD, costOfRow, describeRow, chatQuestion, type CostCategory } from '@/lib/aiCost';
import { monthStartBR, nextMonthStartBR } from '@/lib/coachAi';

export const dynamic = 'force-dynamic';
const PAGE = 40, SCAN = 1500;
const round = (x: number, d: number) => Math.round(x * 10 ** d) / 10 ** d;

export async function GET(req: Request) {
  try {
    const auth = requireMaster(req);
    if ('response' in auth) return auth.response;
    const url = new URL(req.url);
    const coachId = String(url.searchParams.get('coachId') || '').trim();
    if (!coachId) return NextResponse.json({ error: 'Informe o coach.' }, { status: 400 });
    const m = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(String(url.searchParams.get('month') || ''));
    const ref = m ? new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, 15, 12)) : new Date();
    const from = monthStartBR(ref), to = nextMonthStartBR(ref);
    const br = new Date(from.getTime() - 3 * 3600 * 1000);
    const month = `${br.getUTCFullYear()}-${String(br.getUTCMonth() + 1).padStart(2, '0')}`;
    const cat = String(url.searchParams.get('category') || '');
    const category = (Object.keys(CATEGORY_LABEL) as CostCategory[]).includes(cat as CostCategory) ? (cat as CostCategory) : null;
    const beforeRaw = url.searchParams.get('before'); const before = beforeRaw ? new Date(beforeRaw) : null;
    const upper = before && !isNaN(before.getTime()) && before < to ? before : to;

    // quem entra: o próprio coach e os alunos dele (ou, em "sem-coach", os alunos sem coach)
    const owner = coachId === 'sem-coach' ? null : coachId;
    const people: any[] = await prisma.user.findMany({ where: owner ? { OR: [{ id: owner }, { coachId: owner }] } : { role: 'USER', coachId: null }, select: { id: true, name: true, role: true } });
    const byId = new Map(people.map((p) => [p.id, p]));
    if (!people.length) return NextResponse.json({ month, coachId, category, items: [], next: null });
    const rows: any[] = await prisma.aiLog.findMany({ where: { userId: { in: people.map((p) => p.id) }, createdAt: { gte: from, lt: upper } }, orderBy: { createdAt: 'desc' }, take: SCAN, select: { id: true, userId: true, question: true, answer: true, createdAt: true } });

    const showQuestion = !!owner && isMasterId(owner);
    const items: any[] = []; let next: string | null = null;
    for (const r of rows) {
      const c = costOfRow(r.question, r.answer);
      if (!c || (category && c.category !== category)) continue;
      if (items.length >= PAGE) { next = new Date(items[items.length - 1].at).toISOString(); break; }
      const who = byId.get(r.userId);
      items.push({
        id: r.id, at: new Date(r.createdAt).toISOString(), category: c.category, label: CATEGORY_LABEL[c.category], usd: round(c.usd, 5), brl: round(c.usd * BRL_PER_USD, 3), estimated: c.estimated,
        by: who ? { id: who.id, name: who.name || 'Sem nome', role: who.role } : null, detail: describeRow(r.question, r.answer),
        ...(c.category === 'chat' && showQuestion ? { question: chatQuestion(r.question) } : {}),
      });
    }
    // a página seguinte recomeça "antes" do instante da última linha mostrada (duas linhas gravadas no mesmo milissegundo exato poderiam ficar de fora; na prática não acontece)
    return NextResponse.json({ month, coachId, category, items, next });
  } catch (e: any) {
    console.error('[GET /api/admin/coach-ai-usage/events]', e);
    return NextResponse.json({ error: 'Erro ao carregar o histórico.' }, { status: 500 });
  }
}
