// lib/workoutSharePayload.ts
// 🔗 Monta o payload PÚBLICO de um link do treino (o mesmo que a página /t lê). Antes vivia dentro de app/api/treino-publico/[code]/route.ts; foi separado (5 out 2026)
// para o RELATÓRIO DO TESTE GRÁTIS do coach usar exatamente os mesmos dados (nomes, plano de séries, trocas, códigos dos exercícios) que a pessoa viu.
import prisma from '@/lib/prisma';
import { MASTER_IDS } from '@/lib/masterIds';
import { buildPublicWorkout, MASTER_TEAM_ID, parseQuickData, quickExerciseIds, quickRows, quickSubstituteNames } from '@/lib/workoutShare';

export type SharePayloadResult =
  | { ok: true; payload: ReturnType<typeof buildPublicWorkout>; coachId: string | null; studentName: string | null; workoutName: string }
  | { ok: false };

/** `share` = linha de WorkoutShare (já lida do banco; quem chama confere o status). Devolve ok:false quando o treino do link não existe mais. */
export async function loadSharePayload(share: any): Promise<SharePayloadResult> {
  // 1) as linhas do treino, de onde quer que venham (treino de aluno ou treino avulso do coach)
  let rows: any[] = [];
  let workoutName = 'Treino';
  let studentName: string | null = null;
  let coachId: string | null = null;
  let subNamesFallback: Record<string, string> = {};

  if (share.quickWorkoutId) {
    const quick = await prisma.quickWorkout.findUnique({ where: { id: share.quickWorkoutId } });
    if (!quick) return { ok: false };
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
    if (!workout) return { ok: false };
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
      if (!ids.length) return [] as { id: string; name: string; videoUrl?: string | null }[];
      return prisma.exercise.findMany({ where: { id: { in: ids } }, select: { id: true, name: true, videoUrl: true } });      // nome e vídeo de cada troca (o botão TROCAR da página mostra o vídeo do substituto)
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
  const substituteVideos: Record<string, string | null> = {};
  (subs as any[]).forEach((s) => { substituteNames[s.id] = s.name; substituteVideos[s.id] = s.videoUrl || null; });

  const payload = buildPublicWorkout({
    workoutName,
    rows,
    substituteNames,
    substituteVideos,
    share: { code: share.code, showName: share.showName, displayName: share.displayName, days: share.days || [], expiresAt: share.expiresAt, notifyDone: !!share.notifyDone, trial: !!share.trial },
    studentName,
    coach,
    customTechniques: techs as any[],
    systemVideos,
  });
  return { ok: true, payload, coachId, studentName, workoutName };
}
