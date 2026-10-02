// app/api/treino-publico/[code]/route.ts
// 🔗 (2 out 2026) PÁGINA PÚBLICA DO TREINO: lida por elitefitapp.com.br/t/?c=<code>. SEM login: quem tem o código vê o treino, nas escolhas que o coach
// fez ao criar o link (nome sim/não, dias, validade). O link aponta para o treino salvo de um aluno OU para um treino avulso do coach. Só sai o que o aluno já vê no app (lib/workoutShare.ts: buildPublicWorkout).
// Link inexistente = 404; desativado ou vencido = 410. Limite de pedidos por IP contra tentativa de adivinhar códigos.
import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { MASTER_IDS } from '@/lib/masterIds';
import { checkRateLimit, getClientIp } from '@/lib/rateLimit';
import { isValidShareCode, shareStatus, buildPublicWorkout, MASTER_TEAM_ID, parseQuickData, quickExerciseIds, quickRows, quickSubstituteNames } from '@/lib/workoutShare';

export const dynamic = 'force-dynamic';

const HEADERS = { 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow' };
const reply = (body: any, status = 200) => NextResponse.json(body, { status, headers: HEADERS });

export async function GET(req: Request, { params }: { params: { code: string } }) {
  try {
    const ip = getClientIp(req);
    if (!checkRateLimit(`tp:${ip}`, { max: 120, windowMs: 60 * 1000 }).allowed) return reply({ error: 'rate_limited' }, 429);

    const code = params?.code;
    if (!isValidShareCode(code)) {
      if (!checkRateLimit(`tp-miss:${ip}`, { max: 20, windowMs: 10 * 60 * 1000 }).allowed) return reply({ error: 'rate_limited' }, 429);
      return reply({ error: 'not_found' }, 404);
    }

    const share = await prisma.workoutShare.findUnique({ where: { code } });
    if (!share) {
      if (!checkRateLimit(`tp-miss:${ip}`, { max: 20, windowMs: 10 * 60 * 1000 }).allowed) return reply({ error: 'rate_limited' }, 429);
      return reply({ error: 'not_found' }, 404);
    }
    const status = shareStatus(share);
    if (status === 'REVOKED') return reply({ error: 'revoked' }, 410);
    if (status === 'EXPIRED') return reply({ error: 'expired', expiredAt: share.expiresAt ? new Date(share.expiresAt).toISOString() : null }, 410);

    // 1) as linhas do treino, de onde quer que venham (treino de aluno ou treino avulso do coach)
    let rows: any[] = [];
    let workoutName = 'Treino';
    let studentName: string | null = null;
    let coachId: string | null = null;
    let subNamesFallback: Record<string, string> = {};

    if (share.quickWorkoutId) {
      const quick = await prisma.quickWorkout.findUnique({ where: { id: share.quickWorkoutId } });
      if (!quick) return reply({ error: 'not_found' }, 404);
      const parsedQuick = parseQuickData(quick.data);
      const days = parsedQuick.ok ? parsedQuick.days : {};
      const exs = await prisma.exercise.findMany({ where: { id: { in: quickExerciseIds(days) } }, select: { id: true, name: true, category: true, videoUrl: true } });
      const catalog: Record<string, any> = {};
      exs.forEach((e: any) => { catalog[e.id] = e; });
      rows = quickRows(days, catalog);
      subNamesFallback = quickSubstituteNames(days);
      exs.forEach((e: any) => { subNamesFallback[e.id] = e.name; });
      workoutName = quick.name;
      coachId = quick.coachId;
    } else {
      const workout = share.workoutId ? await prisma.workout.findUnique({
        where: { id: share.workoutId },
        include: { exercises: { include: { exercise: true }, orderBy: { order: 'asc' } } },
      }) : null;
      if (!workout) return reply({ error: 'not_found' }, 404);
      const student = await prisma.user.findUnique({ where: { id: workout.userId }, select: { name: true, coachId: true } });
      rows = workout.exercises;
      workoutName = workout.name;
      studentName = student?.name || null;
      coachId = student?.coachId || null;
    }

    // 2) nomes das trocas e técnicas personalizadas citadas nos blocos (o app guarda o id dentro do JSON da coluna `technique`)
    const [subs, techs] = await Promise.all([
      (async () => {
        const ids = Array.from(new Set(rows.flatMap((e: any) => [...(Array.isArray(e.substitutes) ? e.substitutes : []), ...(e.substituteId ? [e.substituteId] : [])]))) as string[];
        const missing = ids.filter((id) => !subNamesFallback[id]);
        if (!missing.length) return [] as { id: string; name: string }[];
        return prisma.exercise.findMany({ where: { id: { in: missing } }, select: { id: true, name: true } });
      })(),
      (async () => {
        const ids = new Set<string>();
        rows.forEach((e: any) => {
          if (e.customTechniqueId) ids.add(String(e.customTechniqueId));
          if (typeof e.technique === 'string' && e.technique.trim().startsWith('{')) {
            try { const p = JSON.parse(e.technique); (Array.isArray(p?.b) ? p.b : []).forEach((b: any) => { if (b?.customTechniqueId) ids.add(String(b.customTechniqueId)); }); } catch { /* ignora */ }
          }
        });
        if (!ids.size) return [];
        return prisma.technique.findMany({ where: { id: { in: Array.from(ids) } }, select: { id: true, name: true, description: true, steps: true, videoUrl: true } });
      })(),
    ]);

    const coach = coachId ? await prisma.user.findUnique({ where: { id: coachId }, select: { name: true, brandLogoUrl: true, brandLogoSize: true } }) : null;

    // vídeos das técnicas do sistema: do time do coach, com herança do time master (mesmo critério do app)
    const teamId = coachId && !MASTER_IDS.includes(coachId) ? coachId : MASTER_TEAM_ID;
    const sysRows = await prisma.systemTechniqueVideo.findMany({ where: { teamId: { in: [MASTER_TEAM_ID, teamId] } } });
    const systemVideos: Record<string, string> = {};
    sysRows.filter((r: any) => r.teamId === MASTER_TEAM_ID).forEach((r: any) => { systemVideos[r.key] = r.videoUrl; });
    sysRows.filter((r: any) => r.teamId !== MASTER_TEAM_ID).forEach((r: any) => { systemVideos[r.key] = r.videoUrl; });

    const substituteNames: Record<string, string> = { ...subNamesFallback };
    (subs as any[]).forEach((s) => { substituteNames[s.id] = s.name; });

    const payload = buildPublicWorkout({
      workoutName,
      rows,
      substituteNames,
      share: { code: share.code, showName: share.showName, displayName: share.displayName, days: share.days || [], expiresAt: share.expiresAt },
      studentName,
      coach,
      customTechniques: techs as any[],
      systemVideos,
    });

    // conta a visualização sem atrasar nem derrubar a resposta
    prisma.workoutShare.update({ where: { code }, data: { viewCount: { increment: 1 }, lastViewedAt: new Date() } }).catch(() => {});

    return reply({ ok: true, ...payload });
  } catch (error) {
    console.error('Erro GET treino-publico:', error);
    return reply({ error: 'server_error' }, 500);
  }
}
