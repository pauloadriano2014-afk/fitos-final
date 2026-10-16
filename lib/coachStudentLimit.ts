// lib/coachStudentLimit.ts
// 🔔 (15 out 2026) AVISO SUAVE DE LIMITE DE ALUNOS do plano do coach.
//
// Cada degrau do plano (Start 25, Growth 50, Scale 150, Ilimitado) tem um número máximo de alunos ativos (config/coachBillingPlans.ts). Até hoje o degrau era
// só o preço: ninguém era avisado nem bloqueado ao passar do limite. Aqui o servidor só INFORMA: quantos alunos ativos o coach tem, quanto o plano cobre e
// qual degrau cabe. NADA é bloqueado (o aluno nunca perde acesso por causa disso).
//
// Regras:
//   • só vale para coach com plano PAGO e em dia (coachBillingStatus ACTIVE): teste grátis, pendente, vencido e time master ficam sem aviso (nível NONE);
//   • aluno ativo = role USER (é assim que o aluno é gravado), do coach, accountStatus ACTIVE;
//   • NEAR = chegou a 90% do limite (ainda cabe); OVER = passou do limite;
//   • plano sem limite (Ilimitado) nunca avisa.
import { BILLING_PLANS, TIERS, resolveOfferedPlanKey, tierForStudents, type Tier } from '@/config/coachBillingPlans';

export type LimitLevel = 'NONE' | 'OK' | 'NEAR' | 'OVER';

export interface StudentLimitState {
  level: LimitLevel;
  count: number;                 // alunos ativos agora
  max: number | null;            // limite do plano (null = ilimitado ou sem plano)
  tier: Tier | null;             // degrau do plano atual
  tierLabel: string | null;
  neededTier: Tier | null;       // degrau que cabe o número atual de alunos (só preenchido quando passou do limite)
  neededTierLabel: string | null;
  neededMax: number | null;      // limite desse degrau (null = ilimitado)
}

/** Fração do limite a partir da qual o aviso "perto do limite" aparece. */
export const NEAR_FRACTION = 0.9;

const none = (count: number): StudentLimitState => ({ level: 'NONE', count, max: null, tier: null, tierLabel: null, neededTier: null, neededTierLabel: null, neededMax: null });

/** Cálculo puro (sem banco): dá o estado do aviso a partir do plano, da situação da cobrança e do número de alunos ativos. */
export function computeStudentLimit(input: { planKey?: string | null; billingStatus?: string | null; count: number }): StudentLimitState {
  const count = Math.max(0, Math.floor(Number(input.count) || 0));
  if (String(input.billingStatus || '').toUpperCase() !== 'ACTIVE') return none(count);
  const plan = BILLING_PLANS[resolveOfferedPlanKey(String(input.planKey || ''))];
  if (!plan) return none(count);

  const max = plan.maxStudents;
  const base = { count, max, tier: plan.tier, tierLabel: TIERS[plan.tier].label, neededTier: null, neededTierLabel: null, neededMax: null };
  if (max === null) return { level: 'OK', ...base };

  if (count > max) {
    const needed = tierForStudents(count);
    return { level: 'OVER', ...base, neededTier: needed, neededTierLabel: TIERS[needed].label, neededMax: TIERS[needed].maxStudents };
  }
  if (count >= Math.ceil(max * NEAR_FRACTION)) return { level: 'NEAR', ...base };
  return { level: 'OK', ...base };
}

/** Alunos ativos do coach (conta ativa, role USER). */
export async function countActiveStudents(prisma: any, coachId: string): Promise<number> {
  return prisma.user.count({ where: { coachId, role: 'USER', accountStatus: 'ACTIVE' } });
}

/** Estado do aviso de um coach (lê o plano e a situação da cobrança dele no banco). Coach inexistente = NONE. */
export async function studentLimitFor(prisma: any, coachId: string): Promise<StudentLimitState> {
  const coach = await prisma.user.findUnique({ where: { id: coachId }, select: { id: true, role: true, coachBillingPlan: true, coachBillingStatus: true } as any });
  if (!coach || (coach as any).role !== 'COACH') return none(0);
  const count = await countActiveStudents(prisma, coachId);
  return computeStudentLimit({ planKey: (coach as any).coachBillingPlan, billingStatus: (coach as any).coachBillingStatus, count });
}
