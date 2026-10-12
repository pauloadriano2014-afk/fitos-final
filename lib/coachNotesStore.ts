// lib/coachNotesStore.ts
// 🎙️ (12 out 2026) Acesso das rotas de NOTAS DO COACH: quem pode usar (coach ativo COM a chave `notasVoz`) e a lista de alunos dele para achar o nome falado.
import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuth, isMasterId, type AuthUser } from '@/lib/auth';
import { isActiveCoach, coachOnly } from '@/lib/aiAccess';
import { coachHasFeature } from '@/lib/coachFeatures';
import { ownStudentScope, studentScope } from '@/lib/agendaStore';
import type { StudentRef } from '@/lib/coachNotes';

export const missing = (e: any) => /does not exist|P2021|P2022/i.test(String(e?.code || '') + String(e?.message || ''));
export const UNAVAILABLE = { error: 'As notas por voz ainda não estão habilitadas no servidor (falta criar as tabelas novas: npx prisma db push).', unavailable: true };

/** Coach ativo e com a chave `notasVoz`. A trava é aqui no servidor (o botão some no app, mas quem manda é o servidor). */
export async function requireNotesCoach(req: Request): Promise<{ user: AuthUser } | { response: NextResponse }> {
  const auth = requireAuth(req);
  if ('response' in auth) return auth;
  if (!(await isActiveCoach(prisma, auth.user))) return { response: coachOnly() };
  if (!(await coachHasFeature(prisma, auth.user.id, 'notasVoz', { isMaster: isMasterId(auth.user.id) }))) {
    return { response: NextResponse.json({ error: 'As notas por voz não estão liberadas para a sua conta.', locked: true }, { status: 403 }) };
  }
  return { user: auth.user };
}

/** Os alunos que o coach atende (para casar o nome falado). Sem contas de teste. */
export async function loadCoachStudents(db: any, coachId: string): Promise<StudentRef[]> {
  const rows: any[] = await db.user.findMany({
    where: { role: 'USER', active: { not: false }, AND: [ownStudentScope(coachId)], NOT: [{ isTestAccount: true }] },
    select: { id: true, name: true }, orderBy: { name: 'asc' }, take: 800,
  });
  return rows.filter((r) => r.name).map((r) => ({ id: r.id, name: String(r.name) }));
}

/** O aluno é do coach (a mesma "muralha" do painel)? */
export async function studentBelongs(db: any, coachId: string, studentId: string): Promise<{ id: string; name: string } | null> {
  const r: any = await db.user.findFirst({ where: { id: studentId, role: 'USER', AND: [studentScope(coachId)] }, select: { id: true, name: true } });
  return r ? { id: r.id, name: String(r.name || '') } : null;
}
