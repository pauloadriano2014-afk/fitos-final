// app/api/insights/scope/route.ts
// 🧠 (18 out 2026) QUEM ENTRA NAS ANÁLISES do assistente (ver lib/insightsScope.ts). Só o coach (ou o time master) e só dos alunos DELE.
//   GET -> { includeInactive, students: [{ id, name, gender, sessions, level, mode, suspectTest, included, reason, label }], counts }
//   PUT { studentId, mode: 'INCLUDE' | 'EXCLUDE' | null }  -> decide um aluno (null = volta para a regra automática)
//   PUT { includeInactive: boolean }                          -> liga/desliga "usar também alunos inativados com muitos treinos"
//   PUT { studentIds: [...], mode }                           -> vários de uma vez (ex.: confirmar as contas de teste sugeridas)
// Sem as colunas novas (`npx prisma db push` ainda não rodou) o GET funciona pela regra automática e o PUT avisa em vez de quebrar.
import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuth } from '@/lib/auth';
import { ownStudentScope } from '@/lib/agendaStore';
import { loadInsightsPool, parseInsightsMode } from '@/lib/insightsScope';

export const dynamic = 'force-dynamic';
const MAX_BULK = 60;
const notCoach = (role: string) => String(role || '').toUpperCase() === 'USER';
const toRow = (s: any) => ({
  id: s.id, name: s.name, gender: s.gender, sessions: s.sessions, lastSession: s.lastSession,
  level: s.level ? { level: s.level.level, label: s.level.label, months: s.level.months } : null,
  mode: s.mode, suspectTest: s.suspectTest, included: s.verdict.included, reason: s.verdict.reason, label: s.verdict.label,
});

export async function GET(req: Request) {
  const auth = requireAuth(req);
  if ('response' in auth) return auth.response;
  if (notCoach(auth.user.role)) return NextResponse.json({ error: 'Acesso restrito ao coach.' }, { status: 403 });
  try {
    const pool = await loadInsightsPool(prisma, auth.user.id);
    const students = pool.students.map(toRow);
    return NextResponse.json({
      includeInactive: pool.includeInactive, students,
      counts: { total: students.length, included: students.filter((s) => s.included).length, suspectTest: students.filter((s) => s.suspectTest && !s.mode).length },
    });
  } catch (e) {
    console.error('Erro GET insights/scope:', e);
    return NextResponse.json({ error: 'Não foi possível carregar agora.' }, { status: 500 });
  }
}

export async function PUT(req: Request) {
  const auth = requireAuth(req);
  if ('response' in auth) return auth.response;
  if (notCoach(auth.user.role)) return NextResponse.json({ error: 'Acesso restrito ao coach.' }, { status: 403 });
  try {
    const body = await req.json().catch(() => ({}));
    if (typeof body?.includeInactive === 'boolean' && body.studentId === undefined && body.studentIds === undefined) {
      await prisma.user.update({ where: { id: auth.user.id }, data: { insightsIncludeInactive: body.includeInactive } });
      return NextResponse.json({ ok: true, includeInactive: body.includeInactive });
    }
    const raw = Array.isArray(body?.studentIds) ? body.studentIds : body?.studentId ? [body.studentId] : [];
    const ids = [...new Set(raw.map((x: any) => (typeof x === 'string' ? x.trim() : '')).filter(Boolean))] as string[];
    if (!ids.length || ids.length > MAX_BULK) return NextResponse.json({ error: `Envie de 1 a ${MAX_BULK} alunos.` }, { status: 400 });
    if (!('mode' in (body || {}))) return NextResponse.json({ error: 'Envie mode: INCLUDE, EXCLUDE ou null.' }, { status: 400 });
    const mode = body.mode === null ? null : parseInsightsMode(body.mode);
    if (body.mode !== null && !mode) return NextResponse.json({ error: 'mode precisa ser INCLUDE, EXCLUDE ou null.' }, { status: 400 });
    const mine: any[] = await prisma.user.findMany({ where: { id: { in: ids }, role: 'USER', AND: [ownStudentScope(auth.user.id)] }, select: { id: true } });   // aluno de outro coach responde igual a "não existe"
    const okIds = mine.map((m) => m.id);
    if (!okIds.length) return NextResponse.json({ error: 'Aluno não encontrado.' }, { status: 404 });
    await prisma.user.updateMany({ where: { id: { in: okIds } }, data: { insightsMode: mode } });
    return NextResponse.json({ ok: true, mode, updated: okIds, skipped: ids.filter((i) => !okIds.includes(i)) });
  } catch (e: any) {
    if (/P2022|does not exist|Unknown (field|argument)/i.test(String(e?.code || '') + ' ' + String(e?.message || ''))) return NextResponse.json({ error: 'Este recurso ainda está sendo ativado no servidor. Tente de novo mais tarde.', code: 'NOT_READY' }, { status: 503 });
    console.error('Erro PUT insights/scope:', e);
    return NextResponse.json({ error: 'Não foi possível salvar agora.' }, { status: 500 });
  }
}
