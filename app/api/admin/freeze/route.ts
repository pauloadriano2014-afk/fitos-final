// app/api/admin/freeze/route.ts
// ❄️ CONGELAR / DESCONGELAR O PLANO DE UM ALUNO (botão do painel de finanças e da ficha do aluno).
//   POST { userId, action: 'FREEZE', until?, reason?, cancelBilling? }                 -> sem `confirm`: só CONFERE (o que vai acontecer), sem mexer em nada
//   POST { userId, action: 'FREEZE', ..., confirm: true }                               -> congela (e cancela a cobrança automática na Asaas, se `cancelBilling` != false)
//   POST { userId, action: 'UNFREEZE' }  /  { ..., confirm: true }                      -> confere / descongela e empurra as datas pelos dias parados
// Só o coach dono do aluno (ou a nutri dele, ou o time master). Aluno que paga por fora da Asaas também funciona: a parte da Asaas só age se houver o que cancelar.
import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuth, canActAsCoach } from '@/lib/auth';
import { collectBilling, executeStop } from '@/lib/stopBilling';
import { parseFreezeBody, planUnfreeze, applyFreeze, applyUnfreeze, frozenDays, isFrozen } from '@/lib/freeze';
import { sendPushToUser } from '@/app/utils/sendNotification';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const auth = requireAuth(req);
    if ('response' in auth) return auth.response;
    let body: any = {};
    try { body = await req.json(); } catch { body = {}; }
    const now = new Date();
    const parsed = parseFreezeBody(body, now);
    if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
    const input = parsed.value;

    const user: any = await prisma.user.findUnique({
      where: { id: input.userId },
      select: { id: true, name: true, email: true, cpf: true, role: true, coachId: true, nutritionistId: true, asaasCustomerId: true, plan: true, pushToken: true, isFinanceActive: true, paymentDueDate: true, nextCheckInDate: true, frozenAt: true, frozenUntil: true, frozenReason: true, frozenFinanceWasActive: true },
    });
    if (!user) return NextResponse.json({ error: 'Aluno não encontrado' }, { status: 404 });
    if (user.role !== 'USER') return NextResponse.json({ error: 'Só dá para congelar alunos.' }, { status: 400 });
    const allowed = canActAsCoach(auth.user, user.coachId) || (!!user.nutritionistId && auth.user.id === user.nutritionistId);
    if (!allowed) return NextResponse.json({ error: 'Acesso negado.' }, { status: 403 });
    const student = { id: user.id, name: user.name };

    if (input.action === 'FREEZE') {
      if (isFrozen(user)) return NextResponse.json({ error: 'Este aluno já está congelado.' }, { status: 409 });
      // mesma regra do "parar de cobrar": chave própria do coach, senão a da conta principal
      let apiKey: string | undefined = process.env.ASAAS_API_KEY || undefined;
      if (user.coachId) {
        const coach: any = await prisma.user.findUnique({ where: { id: user.coachId }, select: { coachAsaasApiKey: true } });
        if (coach && coach.coachAsaasApiKey) apiKey = String(coach.coachAsaasApiKey);
      }
      let plan: any = null;
      if (input.cancelBilling) {
        const localSubs = await prisma.subscription.findMany({ where: { userId: user.id, status: { in: ['ACTIVE', 'PENDING_CHECKOUT'] } } });
        const localPayments = await prisma.payment.findMany({ where: { userId: user.id, status: { in: ['PENDING', 'OVERDUE'] } } });
        plan = await collectBilling(user, localSubs as any[], localPayments as any[], apiKey);
      }
      const found = plan ? plan.subscriptions.length + plan.checkouts.length + plan.payments.length : 0;
      if (!input.confirm) {
        return NextResponse.json({ ok: true, dryRun: true, action: 'FREEZE', student, until: input.until?.toISOString() || null, reason: input.reason, billing: plan ? { found, subscriptions: plan.subscriptions, checkouts: plan.checkouts, payments: plan.payments, warnings: plan.warnings } : null });
      }
      let billing: any = null;
      if (plan) {
        const result = await executeStop(plan, apiKey);
        if (found && (await prisma.subscription.count({ where: { userId: user.id, status: { in: ['ACTIVE', 'PENDING_CHECKOUT'] } } })) > 0) {
          await prisma.subscription.updateMany({ where: { userId: user.id, status: { in: ['ACTIVE', 'PENDING_CHECKOUT'] } }, data: { status: 'CANCELLED' } });
        }
        if (result.deletedPaymentIds.length) await prisma.payment.deleteMany({ where: { userId: user.id, asaasPaymentId: { in: result.deletedPaymentIds } } });
        billing = { found, cancelled: result.cancelled, failed: result.failed, warnings: plan.warnings };
      }
      await applyFreeze(prisma, user, { until: input.until, reason: input.reason }, now);
      return NextResponse.json({ ok: !billing || billing.failed.length === 0, dryRun: false, action: 'FREEZE', student, frozenAt: now.toISOString(), until: input.until?.toISOString() || null, reason: input.reason, billing });
    }

    // UNFREEZE
    if (!isFrozen(user)) return NextResponse.json({ error: 'Este aluno não está congelado.' }, { status: 409 });
    const workouts: any[] = await prisma.workout.findMany({ where: { userId: user.id, archived: false }, select: { id: true, name: true, startDate: true, endDate: true, archived: true } });
    const plan = planUnfreeze(user, workouts, now);
    const base = { action: 'UNFREEZE', student, frozenAt: new Date(user.frozenAt).toISOString(), until: user.frozenUntil ? new Date(user.frozenUntil).toISOString() : null, reason: user.frozenReason || null, days: frozenDays(user.frozenAt, now), plan };
    if (!input.confirm) return NextResponse.json({ ok: true, dryRun: true, ...base });
    await applyUnfreeze(prisma, user, plan);
    try { await sendPushToUser(user, '✅ Seu plano foi reativado', plan.days > 0 ? `Bem-vindo de volta! Os ${plan.days} ${plan.days === 1 ? 'dia' : 'dias'} parados foram somados ao seu prazo.` : 'Bem-vindo de volta! Seu plano está ativo.', { screen: 'Início' }); } catch { /* o aviso é um extra */ }
    return NextResponse.json({ ok: true, dryRun: false, ...base, financeReactivated: user.frozenFinanceWasActive !== false });
  } catch (error: any) {
    console.error('[admin/freeze] Erro:', error?.message || error);
    return NextResponse.json({ error: 'Erro ao congelar/descongelar.' }, { status: 500 });
  }
}
