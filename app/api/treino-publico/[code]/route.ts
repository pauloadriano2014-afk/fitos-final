// app/api/treino-publico/[code]/route.ts
// 🔗 (2 out 2026) PÁGINA PÚBLICA DO TREINO: lida por elitefitapp.com.br/t/?c=<code>. SEM login: quem tem o código vê o treino, nas escolhas que o coach
// fez ao criar o link (nome do aluno sim/não, dias, validade). Só sai o que o aluno já vê no app (lib/workoutShare.ts: buildPublicWorkout).
// Link inexistente = 404; desativado ou vencido = 410. Limite de pedidos por IP contra tentativa de adivinhar códigos.
import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { MASTER_IDS } from '@/lib/masterIds';
import { checkRateLimit, getClientIp } from '@/lib/rateLimit';
import { isValidShareCode, shareStatus, buildPublicWorkout, MASTER_TEAM_ID } from '@/lib/workoutShare';

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

    const workout = await prisma.workout.findUnique({
      where: { id: share.workoutId },
      include: { exercises: { include: { exercise: true }, orderBy: { order: 'asc' } } },
    });
    if (!workout) return reply({ error: 'not_found' }, 404);

    const [student, subs, techs] = await Promise.all([
      prisma.user.findUnique({ where: { id: workout.userId }, select: { name: true, coachId: true } }),
      (async () => {
        const ids = Array.from(new Set(workout.exercises.flatMap((e: any) => [...(Array.isArray(e.substitutes) ? e.substitutes : []), ...(e.substituteId ? [e.substituteId] : [])]))) as string[];
        if (!ids.length) return [] as { id: string; name: string }[];
        return prisma.exercise.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } });
      })(),
      (async () => {
        // técnicas personalizadas citadas nos blocos (o app guarda o id dentro do JSON da coluna `technique`)
        const ids = new Set<string>();
        workout.exercises.forEach((e: any) => {
          if (e.customTechniqueId) ids.add(String(e.customTechniqueId));
          if (typeof e.technique === 'string' && e.technique.trim().startsWith('{')) {
            try { const p = JSON.parse(e.technique); (Array.isArray(p?.b) ? p.b : []).forEach((b: any) => { if (b?.customTechniqueId) ids.add(String(b.customTechniqueId)); }); } catch { /* ignora */ }
          }
        });
        if (!ids.size) return [];
        return prisma.technique.findMany({ where: { id: { in: Array.from(ids) } }, select: { id: true, name: true, description: true, steps: true, videoUrl: true } });
      })(),
    ]);

    const coachId = student?.coachId || null;
    const coach = coachId ? await prisma.user.findUnique({ where: { id: coachId }, select: { name: true, brandLogoUrl: true, brandLogoSize: true } }) : null;

    // vídeos das técnicas do sistema: do time do coach, com herança do time master (mesmo critério do app)
    const teamId = coachId && !MASTER_IDS.includes(coachId) ? coachId : MASTER_TEAM_ID;
    const sysRows = await prisma.systemTechniqueVideo.findMany({ where: { teamId: { in: [MASTER_TEAM_ID, teamId] } } });
    const systemVideos: Record<string, string> = {};
    sysRows.filter((r: any) => r.teamId === MASTER_TEAM_ID).forEach((r: any) => { systemVideos[r.key] = r.videoUrl; });
    sysRows.filter((r: any) => r.teamId !== MASTER_TEAM_ID).forEach((r: any) => { systemVideos[r.key] = r.videoUrl; });

    const substituteNames: Record<string, string> = {};
    (subs as any[]).forEach((s) => { substituteNames[s.id] = s.name; });

    const payload = buildPublicWorkout({
      workoutName: workout.name,
      rows: workout.exercises,
      substituteNames,
      share: { showName: share.showName, days: share.days || [], expiresAt: share.expiresAt },
      studentName: student?.name || null,
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
