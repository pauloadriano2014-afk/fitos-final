// lib/stopBilling.ts
// 🛑 (26 out 2026) "PARAR DE COBRAR" um aluno: acha tudo o que a Asaas ainda vai cobrar dele e cancela.
// Por quê: marcar o aluno como INATIVO no painel de finanças só muda uma marca no nosso banco; a assinatura (que gera uma cobrança nova todo ciclo)
// e as cobranças pendentes continuam vivas na Asaas. Aqui a busca é feita NA ASAAS (por cliente, CPF e e-mail), porque a cobrança pode ter sido criada
// direto no painel da Asaas e o app nem saber dela. Dois passos: `collect` (só olha, para o coach conferir) e `execute` (cancela).
import { cancelSubscription, cancelCheckout, deletePayment, findCustomersBy, listCustomerPayments, listCustomerSubscriptions } from '@/lib/asaas';

export type StopSub = { id: string; value: number | null; cycle: string | null; nextDueDate: string | null; description: string | null };
export type StopPay = { id: string; value: number | null; dueDate: string | null; status: string | null; billingType: string | null; description: string | null; subscription: string | null };
export type StopPlan = { customers: string[]; subscriptions: StopSub[]; checkouts: { id: string }[]; payments: StopPay[]; warnings: string[] };

const onlyDigits = (v: any) => String(v ?? '').replace(/\D/g, '');
const num = (v: any) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const str = (v: any) => (v == null ? null : String(v));
const msg = (e: any) => (e && e.message) || String(e);

/** O que ainda vai ser cobrado desse aluno. Nunca lança: o que não deu para consultar vira aviso. */
export async function collectBilling(
  user: { asaasCustomerId?: string | null; cpf?: string | null; email?: string | null },
  localSubs: { asaasCustomerId?: string | null; asaasSubscriptionId?: string | null; asaasCheckoutId?: string | null; value?: number | null; cycle?: string | null; planName?: string | null; nextDueDate?: any }[],
  localPayments: { asaasPaymentId: string; value?: number | null; dueDate?: any; status?: string | null; billingType?: string | null }[],
  apiKey?: string,
): Promise<StopPlan> {
  const warnings: string[] = [];
  const customers = new Set<string>();
  if (user.asaasCustomerId) customers.add(user.asaasCustomerId);
  for (const s of localSubs) if (s.asaasCustomerId) customers.add(s.asaasCustomerId);

  const cpf = onlyDigits(user.cpf);
  const email = String(user.email || '').trim().toLowerCase();
  const lookups: { cpfCnpj?: string; email?: string }[] = [];
  if (cpf.length === 11 || cpf.length === 14) lookups.push({ cpfCnpj: cpf });
  if (email.includes('@')) lookups.push({ email });
  for (const f of lookups) {
    try { for (const c of await findCustomersBy(f, apiKey)) if (c && c.id) customers.add(String(c.id)); }
    catch (e) { warnings.push(`Não consegui procurar o cliente na Asaas (${f.cpfCnpj ? 'CPF' : 'e-mail'}): ${msg(e)}`); }
  }

  const subs = new Map<string, StopSub>();
  const pays = new Map<string, StopPay>();
  for (const cid of customers) {
    try {
      for (const s of await listCustomerSubscriptions(cid, apiKey)) if (s && s.id) subs.set(String(s.id), { id: String(s.id), value: num(s.value), cycle: str(s.cycle), nextDueDate: str(s.nextDueDate), description: str(s.description) });
    } catch (e) { warnings.push(`Não consegui listar as assinaturas na Asaas: ${msg(e)}`); }
    for (const st of ['PENDING', 'OVERDUE'] as const) {
      try {
        for (const p of await listCustomerPayments(cid, st, apiKey)) if (p && p.id) pays.set(String(p.id), { id: String(p.id), value: num(p.value), dueDate: str(p.dueDate), status: str(p.status), billingType: str(p.billingType), description: str(p.description), subscription: str(p.subscription) });
      } catch (e) { warnings.push(`Não consegui listar as cobranças ${st === 'PENDING' ? 'pendentes' : 'vencidas'} na Asaas: ${msg(e)}`); }
    }
  }

  // o que só o nosso banco conhece (e a busca acima não trouxe)
  const checkouts = new Map<string, { id: string }>();
  for (const s of localSubs) {
    if (s.asaasSubscriptionId) { if (!subs.has(s.asaasSubscriptionId)) subs.set(s.asaasSubscriptionId, { id: s.asaasSubscriptionId, value: num(s.value), cycle: str(s.cycle), nextDueDate: s.nextDueDate ? new Date(s.nextDueDate).toISOString().slice(0, 10) : null, description: str(s.planName) }); }
    else if (s.asaasCheckoutId) checkouts.set(s.asaasCheckoutId, { id: s.asaasCheckoutId });
  }
  for (const p of localPayments) {
    if (p.asaasPaymentId && !pays.has(p.asaasPaymentId)) pays.set(p.asaasPaymentId, { id: p.asaasPaymentId, value: num(p.value), dueDate: p.dueDate ? new Date(p.dueDate).toISOString().slice(0, 10) : null, status: str(p.status), billingType: str(p.billingType), description: null, subscription: null });
  }

  return { customers: [...customers], subscriptions: [...subs.values()], checkouts: [...checkouts.values()], payments: [...pays.values()], warnings };
}

export type StopResult = { cancelled: { subscriptions: number; checkouts: number; payments: number }; deletedPaymentIds: string[]; failed: { kind: 'subscription' | 'checkout' | 'payment'; id: string; error: string }[] };

// 404 = a Asaas já não tem mais isso (cancelou junto com a assinatura): conta como feito
const gone = (e: any) => e && e.status === 404;

/** Cancela, nesta ordem: assinaturas (para não nascer cobrança nova), checkouts pendentes e por fim as cobranças ainda abertas. Uma falha não impede as outras. */
export async function executeStop(plan: StopPlan, apiKey?: string): Promise<StopResult> {
  const out: StopResult = { cancelled: { subscriptions: 0, checkouts: 0, payments: 0 }, deletedPaymentIds: [], failed: [] };
  for (const s of plan.subscriptions) {
    try { await cancelSubscription(s.id, apiKey); out.cancelled.subscriptions++; }
    catch (e) { if (gone(e)) out.cancelled.subscriptions++; else out.failed.push({ kind: 'subscription', id: s.id, error: msg(e) }); }
  }
  for (const c of plan.checkouts) {
    try { await cancelCheckout(c.id, apiKey); out.cancelled.checkouts++; }
    catch (e) { if (gone(e)) out.cancelled.checkouts++; else out.failed.push({ kind: 'checkout', id: c.id, error: msg(e) }); }
  }
  for (const p of plan.payments) {
    try { await deletePayment(p.id, apiKey); out.cancelled.payments++; out.deletedPaymentIds.push(p.id); }
    catch (e) { if (gone(e)) { out.cancelled.payments++; out.deletedPaymentIds.push(p.id); } else out.failed.push({ kind: 'payment', id: p.id, error: msg(e) }); }
  }
  return out;
}
