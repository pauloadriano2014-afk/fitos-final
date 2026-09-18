// app/api/admin/diet-adherence/[userId]/route.ts
// 🔥 Visão do coach sobre o diário alimentar do aluno (16 set 2026) — junta o
// diário por refeição (DietMealLog) com o biofeedback diário (DailyCheckin)
// dos últimos N dias, pra dar sinal de aderência real sem ter obrigado o
// aluno a preencher nada. Dia sem nenhum registro aparece como "sem registro"
// (não é tratado como falha automática).
//
// GET ?days=14 (default 14)

import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuth, canAccessStudent } from '@/lib/auth';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

function toDateOnly(d: Date): string {
  return d.toISOString().split('T')[0];
}

export async function GET(req: Request, { params }: { params: { userId: string } }) {
  try {
    const auth = requireAuth(req);
    if ('response' in auth) return auth.response;

    const userId = params.userId.trim();
    const { searchParams } = new URL(req.url);
    const days = Math.min(Math.max(parseInt(searchParams.get('days') || '14', 10) || 14, 1), 60);

    const targetUser = await prisma.user.findUnique({ where: { id: userId }, select: { coachId: true } });
    if (!targetUser) {
      return NextResponse.json({ error: 'Aluno não encontrado' }, { status: 404 });
    }
    if (!canAccessStudent(auth.user, userId, targetUser.coachId)) {
      return NextResponse.json({ error: 'Acesso negado.' }, { status: 403 });
    }

    const since = new Date();
    since.setHours(0, 0, 0, 0);
    since.setDate(since.getDate() - (days - 1));
    const sinceStr = toDateOnly(since);

    const [mealLogs, checkins] = await Promise.all([
      prisma.dietMealLog.findMany({
        where: { userId, date: { gte: sinceStr } },
        orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
      }),
      prisma.dailyCheckin.findMany({
        where: { studentId: userId, date: { gte: sinceStr } },
        orderBy: { date: 'desc' },
      }),
    ]);

    // ─── Monta um mapa por dia com o que existe de registro ───────────────────
    const byDay: Record<string, { hasAnyRecord: boolean; meals: typeof mealLogs; checkin: (typeof checkins)[number] | null }> = {};
    for (let i = 0; i < days; i++) {
      const d = new Date(since);
      d.setDate(d.getDate() + i);
      const key = toDateOnly(d);
      byDay[key] = { hasAnyRecord: false, meals: [], checkin: null };
    }
    for (const log of mealLogs) {
      if (!byDay[log.date]) byDay[log.date] = { hasAnyRecord: false, meals: [], checkin: null };
      byDay[log.date].meals.push(log);
      byDay[log.date].hasAnyRecord = true;
    }
    for (const c of checkins) {
      if (!byDay[c.date]) byDay[c.date] = { hasAnyRecord: false, meals: [], checkin: null };
      byDay[c.date].checkin = c;
      if (c.dietAdherence || c.dietNote) byDay[c.date].hasAnyRecord = true;
    }

    const dayKeys = Object.keys(byDay).sort();
    const daysWithRecord = dayKeys.filter((k) => byDay[k].hasAnyRecord).length;
    const substitutions = mealLogs.filter((m) => m.status === 'SUBSTITUIU').sort((a, b) => (a.date < b.date ? 1 : -1));
    const substitutionsCount = substitutions.length;
    const freeMeals = mealLogs.filter((m) => m.status === 'LIVRE').sort((a, b) => (a.date < b.date ? 1 : -1));

    return NextResponse.json({
      days: dayKeys.map((k) => ({
        date: k,
        hasRecord: byDay[k].hasAnyRecord,
        meals: byDay[k].meals.map((m) => ({
          id: m.id,
          mealId: m.mealId,
          mealName: m.mealName,
          status: m.status,
          substitutionLabel: m.substitutionLabel,
          note: m.note,
          photoUrl: m.photoUrl,
          // 🔥 (18 set 2026) opção de refeição livre marcada pelo aluno (se houver)
          freeMealOptionLabel: m.freeMealOptionLabel,
          coachObservation: m.coachObservation,
        })),
        dietAdherence: byDay[k].checkin?.dietAdherence ?? null,
        dietNote: byDay[k].checkin?.dietNote ?? null,
      })),
      summary: {
        totalDays: dayKeys.length,
        daysWithRecord,
        substitutionsCount,
        freeMealsCount: freeMeals.length,
        // 🔥 (18 set 2026) inclui `id` (pra o coach conseguir salvar uma
        // observação nesse registro específico) e o que foi marcado —
        // freeMealOptionLabel quando o aluno escolheu uma opção cadastrada
        // pelo coach, ou só `note`/`photoUrl` quando descreveu por texto livre.
        recentFreeMeals: freeMeals.slice(0, 5).map((m) => ({
          id: m.id,
          date: m.date,
          note: m.note,
          photoUrl: m.photoUrl,
          freeMealOptionLabel: m.freeMealOptionLabel,
          coachObservation: m.coachObservation,
        })),
        // 🔥 (17 set 2026) Paulo pediu pra saber especificamente o que foi trocado
        // por quê (antes só existia a contagem) — ver CleanMealCard.js no mobile
        recentSubstitutions: substitutions.slice(0, 8).map((m) => ({
          date: m.date,
          mealName: m.mealName,
          substitutionLabel: m.substitutionLabel,
          note: m.note,
        })),
      },
    });
  } catch (error: any) {
    console.error('[admin/diet-adherence] Erro:', error?.message || error);
    return NextResponse.json({ error: 'Erro ao buscar aderência do aluno' }, { status: 500 });
  }
}
