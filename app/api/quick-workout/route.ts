// app/api/quick-workout/route.ts
// 🔗 (2 out 2026) TREINO AVULSO do coach: um treino que NÃO é de nenhum aluno (montado do zero, ou importado de uma base / de um aluno) só para virar um
// link de página (ver /api/workout-share). Fica numa tabela própria (QuickWorkout): não aparece em Meus Templates nem nas telas dos alunos.
//   GET              lista os avulsos do coach logado, com um resumo dos links de cada um -> { items }
//   GET    ?id=...   um avulso completo (com o JSON do editor) para abrir na tela de montar treino -> { quick }
//   POST   { id?, name, data }   cria (sem id) ou atualiza (com id) -> { quick }
//   DELETE ?id=...   apaga o avulso (os links dele somem junto)
//   DELETE ?expired=1   apaga os avulsos que já tiveram link e hoje só têm links vencidos/desativados -> { deleted }
// `data` = JSON do editor {"A":[exercícios], "B":[...]} (mesmo formato dos templates). Regras em lib/workoutShare.ts.
import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuth, canActAsCoach, isMasterId } from '@/lib/auth';
import { checkRateLimit } from '@/lib/rateLimit';
import { parseQuickData, quickAvailableDays, shareStatus, MAX_QUICK_NAME } from '@/lib/workoutShare';

export const dynamic = 'force-dynamic';

const MAX_QUICK_PER_COACH = 200;
const iso = (d: any) => (d ? new Date(d).toISOString() : null);

const isCoachUser = (u: { id: string; role: string }) => u.role === 'ADMIN' || isMasterId(u.id);

const linkSummary = (s: any) => ({
  code: s.code,
  displayName: s.displayName || null,
  status: shareStatus(s),
  expiresAt: iso(s.expiresAt),
  viewCount: s.viewCount || 0,
  createdAt: iso(s.createdAt),
});

function summary(q: any) {
  const parsed = parseQuickData(q.data);
  const days = parsed.ok ? quickAvailableDays(parsed.days) : [];
  const count = parsed.ok ? Object.values(parsed.days).reduce((n: number, l: any) => n + l.length, 0) : 0;
  const shares: any[] = (Array.isArray(q.shares) ? q.shares : []).slice().sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  const links = shares.map(linkSummary);
  return {
    id: q.id,
    name: q.name,
    days,
    exerciseCount: count,
    createdAt: iso(q.createdAt),
    updatedAt: iso(q.updatedAt),
    activeLinks: links.filter((l) => l.status === 'ACTIVE').length,
    totalLinks: links.length,
    views: links.reduce((n, l) => n + l.viewCount, 0),
    links: links.slice(0, 10),
  };
}

export async function GET(req: Request) {
  try {
    const auth = requireAuth(req);
    if ('response' in auth) return auth.response;
    if (!isCoachUser(auth.user)) return NextResponse.json({ error: 'Acesso negado.' }, { status: 403 });

    const id = new URL(req.url).searchParams.get('id') || '';
    if (id) {
      const q = await prisma.quickWorkout.findUnique({ where: { id } });
      if (!q) return NextResponse.json({ error: 'Treino avulso não encontrado.' }, { status: 404 });
      if (!canActAsCoach(auth.user, q.coachId)) return NextResponse.json({ error: 'Acesso negado.' }, { status: 403 });
      return NextResponse.json({ quick: { id: q.id, name: q.name, data: q.data, createdAt: iso(q.createdAt), updatedAt: iso(q.updatedAt) } });
    }

    const rows = await prisma.quickWorkout.findMany({
      where: { coachId: auth.user.id },
      orderBy: { updatedAt: 'desc' },
      take: MAX_QUICK_PER_COACH,
      include: { shares: { select: { code: true, displayName: true, expiresAt: true, revokedAt: true, viewCount: true, createdAt: true } } },
    });
    return NextResponse.json({ items: rows.map(summary) });
  } catch (error) {
    console.error('Erro GET quick-workout:', error);
    return NextResponse.json({ error: 'Erro ao listar os treinos avulsos.' }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const auth = requireAuth(req);
    if ('response' in auth) return auth.response;
    if (!isCoachUser(auth.user)) return NextResponse.json({ error: 'Acesso negado.' }, { status: 403 });
    if (!checkRateLimit(`quick-save:${auth.user.id}`, { max: 120, windowMs: 60 * 60 * 1000 }).allowed) return NextResponse.json({ error: 'Muitos salvamentos em pouco tempo. Tente de novo em alguns minutos.' }, { status: 429 });

    const body = await req.json().catch(() => ({}));
    const name = String(typeof body?.name === 'string' ? body.name : '').replace(/\s+/g, ' ').trim().slice(0, MAX_QUICK_NAME) || 'Treino avulso';
    const parsed = parseQuickData(body?.data);
    if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
    const data = JSON.stringify(parsed.days);                       // regrava só o que foi validado (chaves de dia já aparadas)

    const id = typeof body?.id === 'string' ? body.id : '';
    if (id) {
      const existing = await prisma.quickWorkout.findUnique({ where: { id }, select: { id: true, coachId: true } });
      if (!existing) return NextResponse.json({ error: 'Treino avulso não encontrado.' }, { status: 404 });
      if (!canActAsCoach(auth.user, existing.coachId)) return NextResponse.json({ error: 'Acesso negado.' }, { status: 403 });
      const q = await prisma.quickWorkout.update({ where: { id }, data: { name, data } });
      return NextResponse.json({ quick: { id: q.id, name: q.name, updatedAt: iso(q.updatedAt) } });
    }

    const count = await prisma.quickWorkout.count({ where: { coachId: auth.user.id } });
    if (count >= MAX_QUICK_PER_COACH) return NextResponse.json({ error: `Você já tem ${MAX_QUICK_PER_COACH} treinos avulsos. Apague alguns (ou use "Limpar vencidos") antes de criar outro.` }, { status: 400 });
    const q = await prisma.quickWorkout.create({ data: { coachId: auth.user.id, name, data } });
    return NextResponse.json({ quick: { id: q.id, name: q.name, updatedAt: iso(q.updatedAt) } }, { status: 201 });
  } catch (error) {
    console.error('Erro POST quick-workout:', error);
    return NextResponse.json({ error: 'Erro ao salvar o treino avulso.' }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    const auth = requireAuth(req);
    if ('response' in auth) return auth.response;
    if (!isCoachUser(auth.user)) return NextResponse.json({ error: 'Acesso negado.' }, { status: 403 });
    const sp = new URL(req.url).searchParams;

    if (sp.get('expired') === '1') {
      const rows = await prisma.quickWorkout.findMany({
        where: { coachId: auth.user.id },
        include: { shares: { select: { expiresAt: true, revokedAt: true } } },
        take: MAX_QUICK_PER_COACH,
      });
      // só apaga quem já teve link e hoje não tem nenhum ativo (rascunho sem link e treino com link ativo ficam)
      const ids = rows.filter((q: any) => q.shares.length > 0 && q.shares.every((s: any) => shareStatus(s) !== 'ACTIVE')).map((q: any) => q.id);
      if (ids.length) await prisma.quickWorkout.deleteMany({ where: { id: { in: ids }, coachId: auth.user.id } });
      return NextResponse.json({ deleted: ids.length });
    }

    const id = sp.get('id') || '';
    if (!id) return NextResponse.json({ error: 'Informe o id do treino avulso.' }, { status: 400 });
    const existing = await prisma.quickWorkout.findUnique({ where: { id }, select: { id: true, coachId: true } });
    if (!existing) return NextResponse.json({ error: 'Treino avulso não encontrado.' }, { status: 404 });
    if (!canActAsCoach(auth.user, existing.coachId)) return NextResponse.json({ error: 'Acesso negado.' }, { status: 403 });
    await prisma.quickWorkout.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Erro DELETE quick-workout:', error);
    return NextResponse.json({ error: 'Erro ao apagar o treino avulso.' }, { status: 500 });
  }
}
