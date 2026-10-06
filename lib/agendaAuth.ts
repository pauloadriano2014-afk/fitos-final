// lib/agendaAuth.ts
// 🔐 Quem pode mexer na agenda de um coach: o próprio coach (ADMIN/COACH) ou o time master. Aluno nunca (ele só vê os próprios atendimentos).
import { NextResponse } from 'next/server';
import { requireAuth, canActAsCoach, AuthUser } from '@/lib/auth';

export const isCoachRole = (u: AuthUser | null | undefined) => !!u && ['ADMIN', 'COACH'].includes(String(u.role));

export function requireAgendaCoach(req: Request, coachId: string | null | undefined): { user: AuthUser } | { response: NextResponse } {
  const auth = requireAuth(req);
  if ('response' in auth) return auth;
  if (!coachId) return { response: NextResponse.json({ error: 'coachId obrigatório.' }, { status: 400 }) };
  if (!isCoachRole(auth.user) || !canActAsCoach(auth.user, coachId)) return { response: NextResponse.json({ error: 'Acesso negado.' }, { status: 403 }) };
  return { user: auth.user };
}

/** Resposta quando as tabelas da agenda ainda não existem no banco (db push pendente). */
export const UNAVAILABLE = { error: 'A agenda ainda não está habilitada no servidor (falta criar as tabelas novas: npx prisma db push).', unavailable: true };
