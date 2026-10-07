// app/api/admin/short-time-context/route.ts
// GET ?studentId=...&historyId=... (ou &day=...) -> o que o coach precisa para o MODO TEMPO CURTO ser realista: quanto tempo o aluno LEVOU no treino em que disse que
// faltou tempo, quais exercícios ele chegou a fazer (e quantas séries), quanto tempo ele diz ter por sessão (anamnese) e quanto durou o mesmo dia nas últimas vezes.
// Só leitura. Com `historyId` usa esse treino finalizado; sem ele, o treino mais recente (até 30 dias) do dia indicado em `day`.
import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuth, canAccessStudent } from '@/lib/auth';

export const dynamic = 'force-dynamic';

const DAY_MS = 86400000;

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const studentId = searchParams.get('studentId') || '';
    const historyId = searchParams.get('historyId') || '';
    const dayRaw = (searchParams.get('day') || '').trim().toUpperCase().slice(0, 40);
    if (!studentId) return NextResponse.json({ error: 'Aluno não informado.' }, { status: 400 });

    const auth = requireAuth(req);
    if ('response' in auth) return auth.response;
    const student: any = await prisma.user.findUnique({ where: { id: studentId }, select: { id: true, role: true, coachId: true, nutritionistId: true } });
    if (!student || student.role !== 'USER') return NextResponse.json({ error: 'Aluno não encontrado.' }, { status: 404 });
    const allowed = auth.user.id !== studentId && (canAccessStudent(auth.user, studentId, student.coachId) || student.nutritionistId === auth.user.id);
    if (!allowed) return NextResponse.json({ error: 'Acesso negado.' }, { status: 403 });

    const select = { id: true, date: true, day: true, workoutId: true, name: true, duration: true, rpe: true, timeOk: true, timeNote: true, details: { select: { exerciseId: true, exerciseName: true, setNumber: true } } };
    let h: any = null;
    if (historyId) h = await prisma.workoutHistory.findFirst({ where: { id: historyId, userId: studentId }, select });
    if (!h && dayRaw) h = await prisma.workoutHistory.findFirst({ where: { userId: studentId, day: dayRaw, date: { gte: new Date(Date.now() - 30 * DAY_MS) } }, orderBy: { date: 'desc' }, select });

    // exercícios que o aluno chegou a fazer: uma linha por exercício, com o nº de séries registradas
    let history: any = null;
    if (h) {
      const by = new Map<string, { exerciseId: string; name: string; sets: Set<number> }>();
      (h.details || []).forEach((d: any) => {
        const cur = by.get(d.exerciseId) || { exerciseId: d.exerciseId, name: d.exerciseName, sets: new Set<number>() };
        cur.sets.add(d.setNumber); by.set(d.exerciseId, cur);
      });
      history = {
        id: h.id, date: h.date, day: h.day, workoutId: h.workoutId, name: h.name,
        durationMin: h.duration && h.duration > 0 ? h.duration : null, rpe: h.rpe ?? null, timeOk: h.timeOk ?? null, timeNote: h.timeNote || null,
        done: Array.from(by.values()).map((x) => ({ exerciseId: x.exerciseId, name: x.name, sets: x.sets.size })),
      };
    }

    // 🧾 + 🕒 (7 out 2026) o que o aluno DISSE dos exercícios sem registro (pulou / não fez / fez parte / fez sem marcar) e o HORÁRIO em que cada exercício foi marcado.
    // Consultas à parte e protegidas: se as colunas novas ainda não existirem no banco, o resto da resposta sai igual a antes.
    if (history) {
      try {
        const x: any = await prisma.workoutHistory.findUnique({ where: { id: history.id }, select: { exerciseStatus: true } });
        history.status = Array.isArray(x?.exerciseStatus)
          ? x.exerciseStatus.filter((i: any) => i && i.exerciseId && ['PULOU', 'NAO_FEZ', 'PARCIAL', 'FEZ'].includes(i.status)).map((i: any) => ({ exerciseId: String(i.exerciseId), name: String(i.name || ''), status: i.status }))
          : null;
      } catch (e) { history.status = null; }
      try {
        const rows: any[] = await prisma.exerciseHistory.findMany({ where: { workoutHistoryId: history.id, loggedAt: { not: null } }, select: { exerciseId: true, exerciseName: true, loggedAt: true } });
        if (rows.length) {
          const by = new Map<string, { exerciseId: string; name: string; first: number; last: number; n: number }>();
          rows.forEach((r) => {
            const t = new Date(r.loggedAt).getTime(); if (!Number.isFinite(t)) return;
            const cur = by.get(r.exerciseId) || { exerciseId: r.exerciseId, name: r.exerciseName, first: t, last: t, n: 0 };
            cur.first = Math.min(cur.first, t); cur.last = Math.max(cur.last, t); cur.n++; by.set(r.exerciseId, cur);
          });
          const list = Array.from(by.values()).sort((a, b) => a.first - b.first);
          // "minuto 0" = quando ele apertou INICIAR (hora de finalizar menos a duração); sem a duração, o 1º registro
          const base = history.durationMin ? new Date(history.date).getTime() - history.durationMin * 60000 : list[0].first;
          const min = (t: number) => Math.max(0, Math.round((t - base) / 60000));
          history.timeline = list.map((e) => ({ exerciseId: e.exerciseId, name: e.name, firstMin: min(e.first), lastMin: min(e.last), sets: e.n }));
          history.lastLoggedMin = Math.max(...list.map((e) => min(e.last)));
          history.timelineFromStart = !!history.durationMin;
        }
      } catch (e) { /* sem os horários */ }
    }

    // as últimas vezes que ele fez o mesmo dia (para o coach ver se 54 min foi um dia fora do normal)
    let recent: { date: Date; durationMin: number }[] = [];
    const dayForRecent = h?.day || dayRaw;
    if (dayForRecent) {
      const rows: any[] = await prisma.workoutHistory.findMany({ where: { userId: studentId, day: dayForRecent, duration: { gt: 0 } }, orderBy: { date: 'desc' }, take: 5, select: { date: true, duration: true } });
      recent = rows.map((r) => ({ date: r.date, durationMin: r.duration as number }));
    }

    const anam: any = await prisma.anamnese.findFirst({ where: { userId: studentId }, orderBy: { createdAt: 'desc' }, select: { tempoDisponivel: true } });
    const availableMin = anam && Number(anam.tempoDisponivel) > 0 ? Number(anam.tempoDisponivel) : null;

    return NextResponse.json({ history, recent, availableMin });
  } catch (error) {
    console.error('Erro GET admin/short-time-context:', error);
    return NextResponse.json({ error: 'Erro ao buscar o tempo do treino.' }, { status: 500 });
  }
}
