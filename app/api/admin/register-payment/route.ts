// app/api/admin/register-payment/route.ts
// 💵 "JÁ PAGOU" direto da pendência (aba A FAZER da agenda): dá a BAIXA da mensalidade de um aluno ou cliente offline numa chamada só —
// avança o vencimento para o próximo ciclo (mesma regra do botão PAGO do financeiro), grava o recebimento (valor + data + forma, que entra no
// Relatório Financeiro) e, se o aluno tinha avisado "já paguei", confirma o aviso. Tudo vale junto ou nada vale (transação).
// Os dados do contrato vêm do banco (não do app), então o app não precisa mandar nada além de quem pagou e o recebimento.
// POST { kind: 'student' | 'offline', id, value?, method?, receivedAt?, note?, expectedDueDate?, claim? }
//  - expectedDueDate: o vencimento que o app estava vendo; se já mudou (alguém deu baixa antes) a rota recusa com 409 para não pagar duas vezes
//  - claim: true quando a pendência é "informou que pagou"; recusa com 409 se o aviso já foi resolvido

import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { MASTER_IDS } from '@/lib/masterIds';
import { requireAuth, isMasterId } from '@/lib/auth';

export const dynamic = 'force-dynamic';

const VALID_METHODS = ['PIX', 'CARTAO', 'DINHEIRO', 'TRANSFERENCIA', 'OUTRO'];

/** Mesma regra de utils/financeUtils.js (calcularProximaData) no app: o vencimento sai da data atual de vencimento + a duração do contrato. */
function nextDueDate(base: Date, contractType?: string | null): Date {
  const d = new Date(base.getTime());
  switch (contractType) {
    case 'Trimestral': d.setUTCMonth(d.getUTCMonth() + 3); break;
    case 'Semestral': d.setUTCMonth(d.getUTCMonth() + 6); break;
    case 'Anual': d.setUTCFullYear(d.getUTCFullYear() + 1); break;
    case 'Projeto 90 Dias': d.setUTCDate(d.getUTCDate() + 90); break;
    case 'Ficha 8 Semanas': case '8 Semanas': d.setUTCDate(d.getUTCDate() + 56); break;
    case '21 Dias': d.setUTCDate(d.getUTCDate() + 21); break;
    default: d.setUTCMonth(d.getUTCMonth() + 1); // Mensal e qualquer outro
  }
  return d;
}

export async function POST(req: NextRequest) {
  try {
    const auth = requireAuth(req);
    if ('response' in auth) return auth.response;
    const authId = auth.user.id;
    const master = isMasterId(authId);

    const body: any = await req.json().catch(() => ({}));
    const kind = body.kind === 'offline' ? 'offline' : body.kind === 'student' ? 'student' : null;
    const id = typeof body.id === 'string' ? body.id : '';
    if (!kind || !id) return NextResponse.json({ error: 'Informe quem pagou.' }, { status: 400 });

    const rec: any = kind === 'offline'
      ? await prisma.offlineClient.findUnique({ where: { id }, select: { id: true, name: true, coachId: true, contractType: true, contractValue: true, paymentDueDate: true, isFinanceActive: true } })
      : await prisma.user.findUnique({ where: { id }, select: { id: true, name: true, role: true, coachId: true, nutritionistId: true, contractType: true, contractValue: true, paymentDueDate: true, isFinanceActive: true, paymentClaimStatus: true } });
    if (!rec) return NextResponse.json({ error: 'Cadastro não encontrado.' }, { status: 404 });

    // 🔒 quem pode: Paulo/Adri em qualquer um; coach parceiro só nos próprios (mesma regra do update-contract)
    const allowed = master || (kind === 'offline' ? rec.coachId === authId : (rec.coachId === authId || rec.nutritionistId === authId));
    if (!allowed || (kind === 'student' && (rec.role === 'ADMIN' || rec.role === 'COACH'))) {
      return NextResponse.json({ error: 'Acesso negado.' }, { status: 403 });
    }
    if (rec.isFinanceActive === false) {
      return NextResponse.json({ error: 'O financeiro deste cadastro está desativado.' }, { status: 409 });
    }

    // já deram baixa neste vencimento? (o app ainda mostrava a cobrança antiga)
    if (body.expectedDueDate) {
      const exp = new Date(body.expectedDueDate);
      if (!isNaN(exp.getTime()) && (!rec.paymentDueDate || Math.abs(new Date(rec.paymentDueDate).getTime() - exp.getTime()) > 1000)) {
        return NextResponse.json({ error: 'Esse vencimento já foi alterado (talvez a baixa já tenha sido dada). Atualize a lista.' }, { status: 409 });
      }
    }
    const claimPending = kind === 'student' && rec.paymentClaimStatus === 'PENDING';
    if (body.claim === true && !claimPending) {
      return NextResponse.json({ error: 'O aviso de pagamento já foi resolvido. Atualize a lista.' }, { status: 409 });
    }

    const asked = parseFloat(String(body.value ?? '').replace(',', '.'));
    const value = asked > 0 ? asked : Number(rec.contractValue);
    if (!(value > 0)) return NextResponse.json({ error: 'Valor inválido.' }, { status: 400 });

    // 'AAAA-MM-DD' vira meio-dia UTC: à meia-noite UTC o dia apareceria um a menos no horário de Brasília
    const rawDate = typeof body.receivedAt === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.receivedAt) ? `${body.receivedAt}T12:00:00Z` : body.receivedAt;
    const receivedAt = rawDate ? new Date(rawDate) : new Date();
    if (isNaN(receivedAt.getTime())) return NextResponse.json({ error: 'Data de recebimento inválida.' }, { status: 400 });
    const method = VALID_METHODS.includes(body.method) ? body.method : 'PIX';
    const note = typeof body.note === 'string' && body.note.trim() ? body.note.trim().slice(0, 300) : null;

    // o recebimento é de quem cuida do aluno: master registra no nome do dono (Paulo ou Adri); parceiro, no próprio
    const receiptCoachId = master ? (rec.coachId && MASTER_IDS.includes(rec.coachId) ? rec.coachId : authId) : authId;
    const next = nextDueDate(rec.paymentDueDate ? new Date(rec.paymentDueDate) : new Date(), rec.contractType);

    const updateRec: any = kind === 'offline'
      ? prisma.offlineClient.update({ where: { id }, data: { paymentDueDate: next } })
      : prisma.user.update({ where: { id }, data: { paymentDueDate: next, ...(claimPending ? { paymentClaimStatus: null, paymentClaimedAt: null, paymentClaimCycleDueDate: null } : {}) } });
    const createReceipt: any = prisma.manualReceipt.create({
      data: { coachId: receiptCoachId, studentId: kind === 'student' ? id : null, studentName: rec.name || (kind === 'student' ? 'Aluno' : 'Cliente'), value, method, receivedAt, note },
    });
    const results: any[] = await prisma.$transaction([updateRec, createReceipt]);

    return NextResponse.json({ success: true, paymentDueDate: next.toISOString(), receiptId: results[1]?.id || null, claimConfirmed: claimPending });
  } catch (error: any) {
    console.error('[admin/register-payment] Erro:', error?.message || error);
    return NextResponse.json({ error: 'Erro ao registrar o pagamento.' }, { status: 500 });
  }
}
