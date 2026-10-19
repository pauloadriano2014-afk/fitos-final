// app/api/gen-prefs/preview/route.ts
// 🎛️ (19 out 2026) POST { userId, rules, trainingEnvironment?, days? } -> quantos exercícios a IA vai poder usar com estes filtros, o que cada filtro tirou e se algum grupo do plano ficaria
// com poucas opções. Conta EXATAMENTE a mesma biblioteca da geração (lib/genLibrary.ts + aparelhos que o aluno não tem + risco articular que o plano pedir). Só lê.
import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuth, canAccessStudent, canActAsCoach } from '@/lib/auth';
import { loadAdminLibrary } from '@/lib/genLibrary';
import { applyRules, cleanRules, describeRules, removedSummary } from '@/lib/genRules';
import { unavailableExerciseIds, filterUnavailable } from '@/lib/equipment';
import { aliasesOf, jointFilterIssues } from '@/lib/autoPlanQuality';

export const dynamic = 'force-dynamic';
const tgt = (ex: any) => String(ex.tags?.target || ex.category || '').toUpperCase();

export async function POST(req: Request) {
  try {
    const auth = requireAuth(req); if ('response' in auth) return auth.response;
    const body = await req.json().catch(() => ({}));
    const userId = body?.userId ? String(body.userId) : null;
    if (!userId) return NextResponse.json({ error: 'userId obrigatório' }, { status: 400 });
    const student = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, coachId: true } });
    if (!student) return NextResponse.json({ error: 'Aluno não encontrado' }, { status: 404 });
    if (auth.user.id === userId || !canAccessStudent(auth.user, userId, student.coachId)) return NextResponse.json({ error: 'Acesso negado.' }, { status: 403 });
    const adminId = body.adminId ? String(body.adminId) : auth.user.id;
    if (!canActAsCoach(auth.user, adminId)) return NextResponse.json({ error: 'Acesso negado.' }, { status: 403 });

    const rules = cleanRules(body.rules);
    const env = body.trainingEnvironment ? String(body.trainingEnvironment) : null;
    const library = await loadAdminLibrary(prisma, adminId, env, rules.includeEnvironments);
    const banned = new Set<string>(await unavailableExerciseIds(userId).catch(() => [] as string[]));
    const safe = filterUnavailable(library, banned).list;
    const applied = applyRules(safe as any, rules);
    const names = new Map(library.map((e) => [e.id, e.name]));

    const days: Array<{ name: string; groups: Array<{ id: string; qty: number }> }> = Array.isArray(body.days) ? body.days : [];
    const groupIds = [...new Set(days.flatMap((d) => (d.groups || []).map((g) => String(g.id))).filter((g) => g !== 'CARDIO' && g !== 'MOBILIDADE'))];
    const count = (list: any[], g: string) => list.filter((e) => aliasesOf(g).includes(tgt(e))).length;
    const coverage = groupIds.map((g) => ({ group: g, before: count(safe, g), after: count(applied.list, g), need: Math.max(0, ...days.map((d) => Number((d.groups || []).find((x) => x.id === g)?.qty) || 0)) }));
    const issues = days.length ? jointFilterIssues(days as any, safe.map(tgt), applied.list.map(tgt)) : [];

    return NextResponse.json({
      total: library.length, afterSafety: safe.length, allowed: applied.list.length,
      removed: applied.removed, removedTotal: applied.removedTotal, removedText: removedSummary(applied.removed), summary: describeRules(rules),
      pinned: applied.pinned.map((id) => ({ id, name: names.get(id) || id })), droppedPins: applied.droppedPins.map((id) => ({ id, name: names.get(id) || id })),
      coverage, issues, ok: issues.length === 0,
    });
  } catch (e) {
    console.error('Erro na prévia dos filtros:', e);
    return NextResponse.json({ error: 'Não foi possível contar os exercícios agora.' }, { status: 500 });
  }
}
