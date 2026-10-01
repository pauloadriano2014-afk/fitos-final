// lib/coachPayments.ts
// 💰 Efeitos de um pagamento CONFIRMADO da mensalidade do coach, num lugar só (webhook do Asaas):
//   - coachBillingPaidValue: quanto foi realmente pago neste período (o upgrade calcula o crédito proporcional em cima disso, não do preço cheio);
//   - coachFirstPaidAt: 1º pagamento de verdade (quem já pagou não é mais "novo" e não pode receber a promoção de lançamento);
//   - promoConfirmed: a cobrança era a da promoção de lançamento, então a vaga vira USADA (lib/launchPromo.ts).
// Recebe o `db` (Prisma) por parâmetro para testar sem banco.
import { confirmPromo } from '@/lib/launchPromo';

export async function markCoachPaid(db: any, coachId: string, o: { paidValue?: number; promoConfirmed?: boolean; now?: Date }): Promise<void> {
    const now = o.now ?? new Date();
    const prev = await db.user.findUnique({ where: { id: coachId }, select: { coachFirstPaidAt: true } });
    const data: any = {};
    if (!prev?.coachFirstPaidAt) data.coachFirstPaidAt = now;
    const v = Number(o.paidValue);
    if (Number.isFinite(v) && v > 0) data.coachBillingPaidValue = Math.round(v * 100) / 100;
    if (Object.keys(data).length) await db.user.update({ where: { id: coachId }, data });
    if (o.promoConfirmed) await confirmPromo(db, coachId);
}
