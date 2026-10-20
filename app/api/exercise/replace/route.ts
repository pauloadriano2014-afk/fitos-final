// app/api/exercise/replace/route.ts
// 🔁 (20 out 2026) EXCLUIR EXERCÍCIO TROCANDO POR OUTRO.
//   GET  ?id=&adminId=   → onde o exercício está sendo usado (treinos/alunos/listas de troca) + quem pode substituir (o MESMO exercício, se já existir, e os parecidos).
//   POST { id, replaceWithId, adminId, keepHistory? } → passa tudo para o exercício escolhido e só então apaga o antigo, numa transação só (ou vai tudo, ou nada).
// Só o dono do exercício (ou o time master) apaga; o substituto tem que ser da mesma biblioteca (mesmo dono), para ninguém ficar com exercício de outro coach na ficha.
// Sem mudança de banco: usa só as tabelas que já existem.
import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { MASTER_IDS } from '@/lib/masterIds';
import { requireAuth, canActAsCoach } from '@/lib/auth';
import { rankReplacements, isSameExercise, replaceInList, swapTitle, replaceIdInText, replaceIdInJson } from '@/lib/exerciseReplace';

export const dynamic = 'force-dynamic';

const LIBRARY_SELECT = { id: true, name: true, category: true, subCategory: true, videoUrl: true, tags: true, coachId: true };

async function guard(req: Request, adminId: string | null) {
  const auth = requireAuth(req);
  if ('response' in auth) return { response: auth.response };
  if (!canActAsCoach(auth.user, adminId)) return { response: NextResponse.json({ error: 'Acesso negado.' }, { status: 403 }) };
  return { adminId: adminId as string };
}
const isOwner = (ex: { coachId: string | null }, adminId: string) => MASTER_IDS.includes(adminId) || ex.coachId === adminId;

/** O que depende deste exercício. Tudo contado por consultas simples (nada de SQL solto). */
async function usageOf(id: string) {
  const rows: any[] = await (prisma as any).workoutExercise.findMany({ where: { exerciseId: id }, select: { id: true, workoutId: true } });
  const asSubstitute: number = await (prisma as any).workoutExercise.count({ where: { substituteId: id } });
  const listed: any[] = await (prisma as any).workoutExercise.findMany({ where: { substitutes: { has: id } }, select: { id: true } });
  const defaults: number = await (prisma as any).exercise.count({ where: { defaultSubstitutes: { has: id } } });
  const workoutIds = [...new Set(rows.map((r) => r.workoutId))];
  const workouts: any[] = workoutIds.length ? await (prisma as any).workout.findMany({ where: { id: { in: workoutIds } }, select: { id: true, userId: true, archived: true } }) : [];
  const studentIds = [...new Set(workouts.map((w) => w.userId))];
  const students: any[] = studentIds.length ? await (prisma as any).user.findMany({ where: { id: { in: studentIds } }, select: { id: true, name: true } }) : [];
  return {
    rows: rows.length, workouts: workouts.length, activeWorkouts: workouts.filter((w) => !w.archived).length, students: studentIds.length,
    studentNames: students.map((s) => String(s.name || '').trim().split(/\s+/)[0]).filter(Boolean).slice(0, 8),
    asSubstitute, listed: listed.length, defaults,
  };
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id'); const g = await guard(req, searchParams.get('adminId'));
    if ('response' in g) return g.response;
    if (!id) return NextResponse.json({ error: 'ID obrigatório' }, { status: 400 });
    const ex: any = await (prisma as any).exercise.findUnique({ where: { id }, select: LIBRARY_SELECT });
    if (!ex) return NextResponse.json({ error: 'Exercício não encontrado.' }, { status: 404 });
    if (!isOwner(ex, g.adminId)) return NextResponse.json({ error: 'Acesso Negado: Apenas o criador pode excluir este exercício.' }, { status: 403 });
    const usage = await usageOf(id);
    const inUse = usage.rows > 0 || usage.asSubstitute > 0;
    const pool: any[] = await (prisma as any).exercise.findMany({ where: { coachId: ex.coachId, id: { not: id } }, select: LIBRARY_SELECT });
    const suggestions = rankReplacements(ex, pool, 8).map(({ tags, coachId, ...r }: any) => r);
    return NextResponse.json({ exercise: { id: ex.id, name: ex.name, category: ex.category, subCategory: ex.subCategory }, usage, inUse, suggestions, sameExercise: suggestions.filter((s: any) => isSameExercise(s.reason)).map((s: any) => s.id) });
  } catch (e) {
    return NextResponse.json({ error: 'Erro ao consultar o exercício.' }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body: any = await req.json().catch(() => ({}));
    const id = String(body.id || ''), newId = String(body.replaceWithId || '');
    const g = await guard(req, body.adminId ? String(body.adminId) : null);
    if ('response' in g) return g.response;
    if (!id || !newId) return NextResponse.json({ error: 'Escolha o exercício que vai substituir.' }, { status: 400 });
    if (id === newId) return NextResponse.json({ error: 'O substituto precisa ser outro exercício.' }, { status: 400 });
    const ex: any = await (prisma as any).exercise.findUnique({ where: { id }, select: LIBRARY_SELECT });
    const nw: any = await (prisma as any).exercise.findUnique({ where: { id: newId }, select: LIBRARY_SELECT });
    if (!ex || !nw) return NextResponse.json({ error: 'Exercício não encontrado.' }, { status: 404 });
    if (!isOwner(ex, g.adminId)) return NextResponse.json({ error: 'Acesso Negado: Apenas o criador pode excluir este exercício.' }, { status: 403 });
    if ((ex.coachId || null) !== (nw.coachId || null)) return NextResponse.json({ error: 'O substituto precisa ser da mesma biblioteca do exercício que será apagado.' }, { status: 400 });
    const same = isSameExercise(rankReplacements(ex, [nw], 1)[0]?.reason);
    const keepHistory = body.keepHistory === undefined ? same : !!body.keepHistory;
    const moved = { rows: 0, substituteId: 0, lists: 0, defaults: 0, history: 0, templates: 0, quick: 0, presets: 0 };

    await (prisma as any).$transaction(async (tx: any) => {
      // 1) a ficha dos alunos: o exercício (e o título, quando era o nome do antigo) passa para o novo
      const byTitle = await tx.workoutExercise.updateMany({ where: { exerciseId: id, title: { equals: ex.name, mode: 'insensitive' } }, data: { exerciseId: newId, title: nw.name } });
      const rest = await tx.workoutExercise.updateMany({ where: { exerciseId: id }, data: { exerciseId: newId } });
      moved.rows = (byTitle.count || 0) + (rest.count || 0);
      // 2) ele como "troque por" fixo e nas listas de troca
      moved.substituteId = (await tx.workoutExercise.updateMany({ where: { substituteId: id }, data: { substituteId: newId } })).count || 0;
      await tx.workoutExercise.updateMany({ where: { exerciseId: newId, substituteId: newId }, data: { substituteId: null } });
      const lists: any[] = await tx.workoutExercise.findMany({ where: { substitutes: { has: id } }, select: { id: true, exerciseId: true, substitutes: true } });
      for (const r of lists) { await tx.workoutExercise.update({ where: { id: r.id }, data: { substitutes: replaceInList(r.substitutes, id, newId, r.exerciseId) } }); moved.lists++; }
      const defs: any[] = await tx.exercise.findMany({ where: { defaultSubstitutes: { has: id } }, select: { id: true, defaultSubstitutes: true } });
      for (const d of defs) { await tx.exercise.update({ where: { id: d.id }, data: { defaultSubstitutes: replaceInList(d.defaultSubstitutes, id, newId, d.id) } }); moved.defaults++; }
      // 3) o histórico de cargas vai junto quando é o mesmo exercício (ou quando o coach pediu)
      if (keepHistory) moved.history = (await tx.exerciseHistory.updateMany({ where: { exerciseId: id }, data: { exerciseId: newId } })).count || 0;
      // 4) modelos de treino, treinos rápidos e combos de cardio/mobilidade do dono
      const owner = ex.coachId;
      if (owner) {
        const tpls: any[] = await tx.workoutTemplate.findMany({ where: { coachId: owner, data: { contains: id } }, select: { id: true, data: true } });
        for (const t of tpls) { const r = replaceIdInText(t.data, id, newId); if (r.count) { await tx.workoutTemplate.update({ where: { id: t.id }, data: { data: r.text } }); moved.templates++; } }
        const quick: any[] = await tx.quickWorkout.findMany({ where: { coachId: owner, data: { contains: id } }, select: { id: true, data: true } });
        for (const q of quick) { const r = replaceIdInText(q.data, id, newId); if (r.count) { await tx.quickWorkout.update({ where: { id: q.id }, data: { data: r.text } }); moved.quick++; } }
        for (const model of ['cardioPreset', 'mobilityPreset']) {
          const presets: any[] = await tx[model].findMany({ where: { coachId: owner }, select: { id: true, exercises: true } });
          for (const p of presets) { const r = replaceIdInJson(p.exercises, id, newId, ex.name, nw.name); if (r.count) { await tx[model].update({ where: { id: p.id }, data: { exercises: r.value } }); moved.presets++; } }
        }
      }
      // 5) por fim, apaga o antigo
      await tx.exercise.delete({ where: { id } });
    }, { timeout: 60000, maxWait: 10000 });

    return NextResponse.json({ success: true, replacedBy: { id: nw.id, name: nw.name }, keepHistory, moved });
  } catch (e: any) {
    return NextResponse.json({ error: 'Não foi possível trocar e apagar. Nada foi alterado.' }, { status: 500 });
  }
}
