// lib/coachPlanLink.ts
// 🧩 (15 out 2026) PLANOS DO COACH PARCEIRO ligados ao que o aluno vê no app.
//
// Antes: o coach parceiro criava planos (nome, valor, meses, link de pagamento), mas eles eram só texto e preço. O aluno que se cadastrava pelo link
// de um plano acabava com o ID do plano gravado no campo `plan` (um código que nenhuma tela reconhece), e a aba "Acesso" mostrava os produtos fixos
// do Paulo (Elite, Performance, Ficha 8 semanas...) em vez dos planos dele.
//
// Agora: cada plano do coach tem `modules` (TREINO | DIETA | AMBOS). Quando o aluno entra num plano (cadastro pelo link ou troca na aba Acesso):
//   • `coachPlanId`   guarda QUAL plano é (o Perfil mostra o nome e a descrição que o coach escreveu);
//   • `studentModules` + `dietModule` ligam as abas Treinos / Dieta (é o que o app do aluno já lê);
//   • `plan` recebe um valor INTERNO compatível (PERFORMANCE = só treino, ELITE = com dieta), pra tudo que já checa o plano seguir funcionando.
// Os produtos do time master (ELITE, PERFORMANCE, FICHA_8S, LOW_COST, CHALLENGE_21...) não mudam: continuam só do Paulo e da Adri.
import prisma from '@/lib/prisma';
import { isMasterId } from '@/lib/auth';

export type PlanModules = 'TREINO' | 'DIETA' | 'AMBOS';
export const PLAN_MODULES: PlanModules[] = ['TREINO', 'DIETA', 'AMBOS'];

/** Planos internos do sistema (produtos do time master). Valor fora desta lista, no cadastro, não é gravado como está. */
export const SYSTEM_STUDENT_PLANS = ['ELITE', 'VIP', 'PREMIUM', 'PERFORMANCE', 'LOW_COST', 'FICHA_8S', 'CHALLENGE_21'];
export const isSystemPlan = (v: unknown): boolean => typeof v === 'string' && SYSTEM_STUDENT_PLANS.includes(v);

export function normalizeModules(v: unknown): PlanModules {
  const s = String(v ?? '').toUpperCase();
  return (PLAN_MODULES as string[]).includes(s) ? (s as PlanModules) : 'TREINO';
}

/** O que cada tipo de coach pode oferecer: Personal só treino, Nutri só dieta, Elite (os dois) qualquer um. Master: tudo. */
export function allowedModulesFor(coachType: string | null | undefined, isMaster = false): PlanModules[] {
  if (isMaster) return ['TREINO', 'DIETA', 'AMBOS'];
  switch (String(coachType ?? 'PERSONAL').toUpperCase()) {
    case 'NUTRICIONISTA': return ['DIETA'];
    case 'ELITE': return ['TREINO', 'DIETA', 'AMBOS'];
    default: return ['TREINO'];
  }
}

/** Ajusta o módulo pedido ao que o tipo de coach pode oferecer (pedir algo fora do permitido cai no permitido mais próximo). */
export function clampModules(requested: unknown, coachType: string | null | undefined, isMaster = false): PlanModules {
  const want = normalizeModules(requested);
  const ok = allowedModulesFor(coachType, isMaster);
  if (ok.includes(want)) return want;
  if (want === 'AMBOS') return ok.includes('TREINO') ? 'TREINO' : ok[0];
  return ok[0];
}

/** Valor interno de `plan` que mantém as telas que já olham o plano funcionando: com dieta = ELITE, só treino = PERFORMANCE. */
export function internalPlanForModules(modules: unknown): 'ELITE' | 'PERFORMANCE' {
  return normalizeModules(modules) === 'TREINO' ? 'PERFORMANCE' : 'ELITE';
}

export interface StudentPlanFields {
  plan: 'ELITE' | 'PERFORMANCE';
  studentModules: PlanModules;
  dietModule: boolean;
  coachPlanId: string;
}

/** Campos do aluno que mudam quando ele entra num plano do coach. */
export function studentFieldsFromCoachPlan(cp: { id: string; modules?: string | null }): StudentPlanFields {
  const modules = normalizeModules(cp.modules);
  return {
    plan: internalPlanForModules(modules),
    studentModules: modules,
    dietModule: modules !== 'TREINO',
    coachPlanId: cp.id,
  };
}

/** Plano ATIVO que pertence a ESSE coach (nunca de outro): é o único que pode ser atribuído a um aluno dele. */
export async function findOwnedActiveCoachPlan(coachId: string | null | undefined, planId: unknown) {
  if (!coachId || typeof planId !== 'string' || !planId || planId.length > 64) return null;
  return prisma.coachPlan.findFirst({ where: { id: planId, coachId, isActive: true } });
}

export interface CoachPlanInfo { id: string; name: string; description: string | null; modules: PlanModules }

/** Nome/descrição/módulos do plano do aluno, para o Perfil dele. Null se não tem plano do coach (ou o plano foi apagado). */
export async function coachPlanInfoFor(coachPlanId: string | null | undefined): Promise<CoachPlanInfo | null> {
  if (!coachPlanId) return null;
  const cp = await prisma.coachPlan.findUnique({ where: { id: coachPlanId }, select: { id: true, name: true, description: true, modules: true } });
  if (!cp) return null;
  return { id: cp.id, name: cp.name, description: cp.description ?? null, modules: normalizeModules(cp.modules) };
}

/** true se o aluno é de um coach parceiro (não do time master). */
export const belongsToPartnerCoach = (coachId: string | null | undefined): boolean => !!coachId && !isMasterId(coachId);
