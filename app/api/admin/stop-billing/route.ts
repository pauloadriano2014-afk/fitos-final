// app/api/admin/stop-billing/route.ts
// 🛑 PARAR DE COBRAR UM ALUNO (botão do painel de finanças).
//   POST { userId }                  -> só CONFERE: devolve o que a Asaas ainda vai cobrar (assinaturas, cobranças abertas), sem mexer em nada
//   POST { userId, confirm: true }   -> cancela tudo na Asaas, marca a recorrência local como cancelada e deixa o aluno INATIVO no financeiro
// Só o coach dono do aluno (ou nutri dele, ou o time master). O aluno continua com acesso ao app: isto só para a cobrança.
// Não mexe em pagamento já recebido (estorno é outra decisão) e não serve para cobrança do próprio coach (só alunos).
import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuth, canActAsCoach } from '@/lib/auth';
import { collectBilling, executeStop } from '@/lib/stopBilling';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const auth = requireAuth(req);
    if ('response' in auth) return auth.response;

    let body: any = {};
    try { body = await req.json(); } catch { body = {}; }
    const userId = typeof body?.userId === 'string' ? body.userId : '';
    const confirm = body?.confirm === true;
    if (!userId) return NextResponse.json({ error: 'userId é obrigatório' }, { status: 400 });

    const user: any = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, name: true, email: true, cpf: true, role: true, coachId: true, nutritionistId: true, asaasCustomerId: true },
    });
    if (!user) return NextResponse.json({ error: 'Aluno não encontrado' }, { status: 404 });
    if (user.role !== 'USER') return NextResponse.json({ error: 'Só dá para parar a cobrança de alunos.' }, { status: 400 });
    const allowed = canActAsCoach(auth.user, user.coachId) || (!!user.nutritionistId && auth.user.id === user.nutritionistId);
    if (!allowed) return NextResponse.json({ error: 'Acesso negado.' }, { status: 403 });

    // mesma regra da lixeira de cobranças: chave própria do coach, senão a da conta principal
    let apiKey: string | undefined = process.env.ASAAS_API_KEY || undefined;
    if (user.coachId) {
      const coach: any = await prisma.user.findUnique({ where: { id: user.coachId }, select: { coachAsaasApiKey: true } });
      if (coach && coach.coachAsaasApiKey) apiKey = String(coach.coachAsaasApiKey);
    }

    const localSubs = await prisma.subscription.findMany({ where: { userId, status: { in: ['ACTIVE', 'PENDING_CHECKOUT'] } } });
    const localPayments = await prisma.payment.findMany({ where: { userId, status: { in: ['PENDING', 'OVERDUE'] } } });
    const plan = await collectBilling(user, localSubs as any[], localPayments as any[], apiKey);
    const found = plan.subscriptions.length + plan.checkouts.length + plan.payments.length;
    const student = { id: user.id, name: user.name };

    if (!confirm) {
      return NextResponse.json({ ok: true, dryRun: true, student, found, subscriptions: plan.subscriptions, checkouts: plan.checkouts, payments: plan.payments, warnings: plan.warnings });
    }

    const result = await executeStop(plan, apiKey);

    if (localSubs.length) {
      await prisma.subscription.updateMany({ where: { userId, status: { in: ['ACTIVE', 'PENDING_CHECKOUT'] } }, data: { status: 'CANCELLED' } });
    }
    if (result.deletedPaymentIds.length) {
      await prisma.payment.deleteMany({ where: { userId, asaasPaymentId: { in: result.deletedPaymentIds } } });
    }
    // com ou sem o que cancelar na Asaas, o aluno sai da conta do painel (se algo falhou, o app avisa o que sobrou)
    await prisma.user.update({ where: { id: userId }, data: { isFinanceActive: false } });

    return NextResponse.json({ ok: result.failed.length === 0, dryRun: false, student, found, cancelled: result.cancelled, failed: result.failed, warnings: plan.warnings, financeDeactivated: true });
  } catch (error: any) {
    console.error('[admin/stop-billing] Erro:', error?.message || error);
    return NextResponse.json({ error: 'Erro ao parar a cobrança.' }, { status: 500 });
  }
}
