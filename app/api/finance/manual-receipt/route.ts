// app/api/finance/manual-receipt/route.ts
// 💵 REGISTRO DE RECEBIMENTO MANUAL (fora da Asaas) — PIX direto, dinheiro,
// transferência etc. Usado quando o coach marca um aluno como "pago" no
// FinanceStudentList e o pagamento não passou pela Asaas: em vez de só
// avançar a data de vencimento (como já acontecia), também fica salvo um
// registro real (valor + data + forma) que entra no relatório de Imposto de
// Renda dele (ver app/api/finance/report). Só vale dali pra frente — não
// existe backfill automático de recebimentos antigos nunca registrados.

import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuth, isMasterId, canActAsCoach } from '@/lib/auth';

export const dynamic = 'force-dynamic';

const VALID_METHODS = ['PIX', 'CARTAO', 'DINHEIRO', 'TRANSFERENCIA', 'OUTRO'];

export async function POST(req: NextRequest) {
  try {
    const auth = requireAuth(req);
    if ('response' in auth) return auth.response;

    const body = await req.json();
    const { studentId, studentName, value, method, receivedAt, note, coachId: bodyCoachId } = body;

    if (!studentName || typeof studentName !== 'string') {
      return NextResponse.json({ error: 'Nome do aluno é obrigatório.' }, { status: 400 });
    }
    const parsedValue = parseFloat(value);
    if (!parsedValue || parsedValue <= 0) {
      return NextResponse.json({ error: 'Valor inválido.' }, { status: 400 });
    }
    const parsedDate = receivedAt ? new Date(receivedAt) : new Date();
    if (isNaN(parsedDate.getTime())) {
      return NextResponse.json({ error: 'Data de recebimento inválida.' }, { status: 400 });
    }
    const finalMethod = VALID_METHODS.includes(method) ? method : 'PIX';

    // 🔒 Mesmo padrão de isolamento das outras rotas financeiras: master
    // pode registrar em nome de qualquer coach (ver ex.: coachFilter no
    // painel — Paulo/Adri alternam entre os próprios alunos), coach
    // parceiro só registra recebimento pra ele mesmo.
    let coachId: string;
    if (isMasterId(auth.user.id)) {
      if (!bodyCoachId) {
        return NextResponse.json({ error: 'coachId é obrigatório.' }, { status: 400 });
      }
      coachId = bodyCoachId;
    } else {
      if (bodyCoachId && !canActAsCoach(auth.user, bodyCoachId)) {
        return NextResponse.json({ error: 'Acesso negado.' }, { status: 403 });
      }
      coachId = auth.user.id;
    }

    const receipt = await prisma.manualReceipt.create({
      data: {
        coachId,
        studentId: studentId || null,
        studentName,
        value: parsedValue,
        method: finalMethod,
        receivedAt: parsedDate,
        note: note || null,
      },
    });

    return NextResponse.json({ success: true, receipt });
  } catch (error: any) {
    console.error('[finance/manual-receipt] Erro:', error?.message || error);
    return NextResponse.json({ error: 'Erro ao registrar recebimento manual' }, { status: 500 });
  }
}
