// lib/autoPlanKinds.ts
// 🤖 (3 out 2026) Quais planos têm montagem automática de treino + dieta (ver lib/autoPlan.ts). Arquivo leve, sem dependências, para rotas simples
// (ex.: cadastro) poderem perguntar "esse plano é automático?" sem puxar toda a cadeia de IA.
export type AutoPlanKind = 'FICHA_8S' | 'CHALLENGE_21';
export const AUTO_PLANS: AutoPlanKind[] = ['FICHA_8S', 'CHALLENGE_21'];
export const isAutoPlan = (plan?: string | null): plan is AutoPlanKind => !!plan && (AUTO_PLANS as string[]).includes(plan);
