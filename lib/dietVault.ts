// lib/dietVault.ts
// 🔒 (20 out 2026) COFRE DE DIETAS e modelos de refeição: cada coach vê e mexe SÓ no que ele mesmo salvou.
// Antes as duas tabelas não tinham dono (uma lista única para todo mundo logado). Agora têm `coachId`:
//   • coach parceiro: só os dele;
//   • time master (Paulo e Adri): o acervo do time = modelos sem dono (os que já existiam) + os dos dois (como já era: eles compartilham);
//   • aluno: nada.
import { NextResponse } from 'next/server';
import { isMasterId, type AuthUser } from '@/lib/auth';
import { MASTER_IDS } from '@/lib/masterIds';

export const isCoachLike = (u: AuthUser | null | undefined) => !!u && (isMasterId(u.id) || ['ADMIN', 'COACH'].includes(String(u.role).toUpperCase()));

/** Filtro do Prisma com o que este usuário pode ver. */
export function vaultWhere(u: AuthUser): any {
  return isMasterId(u.id) ? { OR: [{ coachId: null }, { coachId: { in: MASTER_IDS } }] } : { coachId: u.id };
}

/** Este usuário pode apagar/alterar esta linha? */
export function vaultCanTouch(u: AuthUser, row: { coachId?: string | null } | null | undefined): boolean {
  if (!row) return false;
  if (isMasterId(u.id)) return row.coachId == null || MASTER_IDS.includes(row.coachId);
  return row.coachId === u.id;
}

export const vaultDenied = () => NextResponse.json({ error: 'Acesso negado.' }, { status: 403 });
