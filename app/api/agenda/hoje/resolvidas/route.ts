// app/api/agenda/hoje/resolvidas/route.ts
// ✅ (9 out 2026) Pendências RESOLVIDAS da central HOJE.
//   GET  ?coachId=&q=&type=&limit=  -> as resolvidas (mais recentes primeiro), com o resultado do aviso ao aluno ("o ajuste funcionou?") e a lista de tipos para filtrar
//   POST { coachId, taskKey, task, note?, resolution?, notify? }  -> marca como RESOLVIDA (some da lista) e, se vier `notify`, manda a mensagem ao aluno na mesma chamada
//   POST { coachId, taskKey, action: 'reopen' }  -> REABRIR: a pendência volta se a condição continuar valendo
import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { canAccessStudent } from '@/lib/auth';
import { requireAgendaCoach, UNAVAILABLE } from '@/lib/agendaAuth';
import { isMissingTable } from '@/lib/agendaStore';
import { cleanMessage, createStudentMessage, settleAdjustment } from '@/lib/studentMessages';

export const dynamic = 'force-dynamic';
const DAY = 86400000;
/** As resolvidas ficam guardadas por tanto tempo; as mais antigas são apagadas aos poucos. */
const KEEP_DAYS = 365;
const MAX = { key: 120, type: 40, title: 200, subtitle: 300, name: 120, note: 300, resolution: 300 };
const cut = (v: any, n: number) => String(v ?? '').trim().slice(0, n);

export async function GET(req: Request) {
  try {
    const sp = new URL(req.url).searchParams;
    const coachId = sp.get('coachId');
    const auth = requireAgendaCoach(req, coachId);
    if ('response' in auth) return auth.response;
    const q = (sp.get('q') || '').trim().toLowerCase();
    const type = (sp.get('type') || '').trim();
    const limit = Math.min(Math.max(parseInt(sp.get('limit') || '60', 10) || 60, 1), 200);

    const all: any[] = await prisma.agendaTaskResolved.findMany({ where: { coachId: coachId!, resolvedAt: { gte: new Date(Date.now() - KEEP_DAYS * DAY) } }, orderBy: { resolvedAt: 'desc' }, take: 400 });
    const types = [...new Set(all.map((r) => r.type))].sort();
    let rows = all;
    if (type) rows = rows.filter((r) => r.type === type);
    if (q) rows = rows.filter((r) => [r.title, r.subtitle, r.personName, r.note].some((x) => String(x || '').toLowerCase().includes(q)));
    const total = rows.length;
    rows = rows.slice(0, limit);

    // aviso ao aluno ligado a cada uma (e o resultado, quando for um ajuste de treino)
    const ids = rows.map((r) => r.messageId).filter(Boolean);
    const msgs: any[] = ids.length ? await prisma.studentCoachMessage.findMany({ where: { id: { in: ids } } }) : [];
    const settled = new Map<string, { outcome: string | null; outcomeAt: Date | null }>();
    for (const m of msgs) { try { settled.set(m.id, await settleAdjustment(m)); } catch (e) { settled.set(m.id, { outcome: m.outcome || null, outcomeAt: m.outcomeAt || null }); } }
    const byMsg = new Map(msgs.map((m) => [m.id, m]));

    const items = rows.map((r) => {
      const m = r.messageId ? byMsg.get(r.messageId) : null;
      const s = m ? settled.get(m.id) : null;
      return {
        id: r.id, taskKey: r.taskKey, type: r.type, title: r.title, subtitle: r.subtitle, note: r.note || null, resolvedAt: r.resolvedAt,
        person: r.personId ? { kind: r.personKind || 'student', id: r.personId, name: r.personName } : null,
        message: m ? { id: m.id, kind: m.kind, title: m.title, body: m.body, sentAt: m.createdAt, readAt: m.readAt || null, outcome: s ? s.outcome : null, outcomeAt: s ? s.outcomeAt : null } : null,
      };
    });
    return NextResponse.json({ items, total, types });
  } catch (e: any) {
    if (isMissingTable(e)) return NextResponse.json(UNAVAILABLE, { status: 503 });
    console.error('[GET /api/agenda/hoje/resolvidas]', e);
    return NextResponse.json({ error: 'Erro ao carregar as pendências resolvidas.' }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => null);
    const coachId = body && typeof body.coachId === 'string' ? body.coachId : null;
    const auth = requireAgendaCoach(req, coachId);
    if ('response' in auth) return auth.response;
    const taskKey = typeof body.taskKey === 'string' ? body.taskKey.trim() : '';
    if (!taskKey || taskKey.length > MAX.key) return NextResponse.json({ error: 'taskKey inválida.' }, { status: 400 });

    if (body.action === 'reopen') {
      const gone = await prisma.agendaTaskResolved.deleteMany({ where: { coachId: coachId!, taskKey } });
      await prisma.agendaTaskSnooze.deleteMany({ where: { coachId: coachId!, taskKey } });
      await reopenSource(taskKey);
      return NextResponse.json({ success: true, reopened: gone.count > 0 });
    }

    if (taskKey.endsWith(':mais')) return NextResponse.json({ error: 'Essa linha junta várias pendências: resolva uma de cada vez.' }, { status: 400 });
    const t = body.task && typeof body.task === 'object' ? body.task : {};
    const person = t.person && typeof t.person === 'object' ? t.person : null;
    const note = cut(body.note, MAX.note), resolution = cut(body.resolution, MAX.resolution);

    // aviso ao aluno (opcional): valida ANTES de resolver, para não resolver e perder a mensagem
    let message: any = null, pushed = false;
    if (body.notify && typeof body.notify === 'object') {
      const studentId = String(body.notify.studentId || '');
      const student: any = studentId ? await prisma.user.findUnique({ where: { id: studentId }, select: { id: true, role: true, coachId: true } }) : null;
      if (!student || student.role !== 'USER') return NextResponse.json({ error: 'Aluno não encontrado para o aviso.' }, { status: 404 });
      if (auth.user.id === studentId || !canAccessStudent(auth.user, studentId, student.coachId)) return NextResponse.json({ error: 'Acesso negado.' }, { status: 403 });
      const clean = cleanMessage({ ...body.notify, sourceTaskKey: taskKey });
      if (!clean.ok) return NextResponse.json({ error: clean.error }, { status: 400 });
      const made = await createStudentMessage(auth.user.id, studentId, clean.value);
      message = made.row; pushed = made.pushed;
    }

    const data = {
      type: cut(t.type, MAX.type) || taskKey.split(':')[0], title: cut(t.title, MAX.title) || 'Pendência resolvida', subtitle: cut(t.subtitle, MAX.subtitle) || null,
      personKind: person ? cut(person.kind, 20) || null : null, personId: person ? cut(person.id, 80) || null : null, personName: person ? cut(person.name, MAX.name) || null : null,
      snapshot: sanitizeSnapshot(t), note: note || (resolution || null), messageId: message ? message.id : null,
    };
    const row = await prisma.agendaTaskResolved.upsert({ where: { coachId_taskKey: { coachId: coachId!, taskKey } }, update: { ...data, resolvedAt: new Date() }, create: { coachId: coachId!, taskKey, ...data } });
    await prisma.agendaTaskSnooze.deleteMany({ where: { coachId: coachId!, taskKey } });
    await resolveSource(taskKey, resolution || note);
    // limpeza das muito antigas (não deixa a tabela crescer para sempre)
    await prisma.agendaTaskResolved.deleteMany({ where: { coachId: coachId!, resolvedAt: { lt: new Date(Date.now() - KEEP_DAYS * DAY) } } }).catch(() => undefined);
    return NextResponse.json({ success: true, resolved: row, message, pushed });
  } catch (e: any) {
    if (isMissingTable(e)) return NextResponse.json(UNAVAILABLE, { status: 503 });
    console.error('[POST /api/agenda/hoje/resolvidas]', e);
    return NextResponse.json({ error: 'Erro ao resolver a pendência.' }, { status: 500 });
  }
}

/** Guarda só os campos que a aba Resolvidas usa (nada de objetos grandes do compromisso). */
function sanitizeSnapshot(t: any) {
  const out: any = {};
  for (const k of ['key', 'type', 'severity', 'dueAt', 'workoutId', 'day', 'historyId', 'reportId', 'exerciseId', 'exerciseName', 'workoutExerciseId']) if (t[k] != null) out[k] = cut(t[k], 120);
  return out;
}

// Pendências que nascem de uma linha do banco: resolver/reabrir a pendência acompanha a linha.
const reportIdOf = (taskKey: string) => (taskKey.startsWith('aparelho:') ? taskKey.slice('aparelho:'.length) : null);
async function resolveSource(taskKey: string, resolution: string) {
  const id = reportIdOf(taskKey);
  if (!id) return;
  try { await prisma.equipmentReport.updateMany({ where: { id, status: 'OPEN' }, data: { status: 'RESOLVED', resolvedAt: new Date(), ...(resolution ? { resolution } : {}) } }); } catch (e) { /* tabela ainda não criada */ }
}
async function reopenSource(taskKey: string) {
  const id = reportIdOf(taskKey);
  if (!id) return;
  try { await prisma.equipmentReport.updateMany({ where: { id, status: 'RESOLVED' }, data: { status: 'OPEN', resolvedAt: null } }); } catch (e) { /* tabela ainda não criada */ }
}
