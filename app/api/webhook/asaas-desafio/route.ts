// fitos-api-nova/app/api/webhooks/asaas-desafio/route.ts
//
// POST /api/webhooks/asaas-desafio
//
// Endpoint que a ASAAS chama automaticamente quando o status de um
// pagamento muda. É isso que libera o link do grupo sem você precisar
// fazer nada manualmente — assim que o PIX cai, a Asaas avisa aqui, e a
// gente marca a inscrição como PAGA. A tela de status (que a aluna está
// olhando) detecta essa mudança no próximo polling e mostra o link.
//
// ⚠️ IMPORTANTE — LEIA ANTES DE SUBIR:
// 1. AJUSTE o import do Prisma abaixo para o caminho real do seu singleton.
// 2. Se vocês JÁ TÊM um webhook geral da Asaas (pra Subscription/Payment
//    dos alunos normais), o ideal é MESCLAR esta lógica de busca de
//    DesafioInscricao dentro dele, em vez de manter dois webhooks
//    separados. Só use esta rota isolada se ainda não existir nenhum.
// 3. Configure essa URL (https://seu-dominio/api/webhooks/asaas-desafio)
//    no painel da Asaas em Integrações > Webhooks, marcando pelo menos os
//    eventos PAYMENT_RECEIVED e PAYMENT_CONFIRMED.
// 4. Se você configurou um "token de autenticação" no webhook da Asaas,
//    descomente a validação do header abaixo e coloque o valor certo.

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

const EVENTOS_PAGAMENTO_CONFIRMADO = ['PAYMENT_RECEIVED', 'PAYMENT_CONFIRMED'];

export async function POST(request: NextRequest) {
    try {
        // 🔒 Mesma verificação de token usada em payments/webhook — só é
        // aplicada se ASAAS_WEBHOOK_TOKEN estiver configurado no Render.
        const expectedWebhookToken = process.env.ASAAS_WEBHOOK_TOKEN;
        if (expectedWebhookToken) {
            const tokenRecebido = request.headers.get('asaas-access-token');
            if (tokenRecebido !== expectedWebhookToken) {
                return NextResponse.json({ error: 'Token inválido' }, { status: 401 });
            }
        }

        const body = await request.json();
        const evento = body?.event;
        const asaasPaymentId = body?.payment?.id;

        if (!asaasPaymentId) {
            // Corpo sem payment.id — provavelmente não é um evento de
            // pagamento (Asaas manda outros tipos de webhook também).
            // Responde 200 mesmo assim pra Asaas não ficar retentando.
            return NextResponse.json({ ok: true, ignored: true });
        }

        if (!EVENTOS_PAGAMENTO_CONFIRMADO.includes(evento)) {
            return NextResponse.json({ ok: true, ignored: true });
        }

        const inscricao = await prisma.desafioInscricao.findUnique({
            where: { asaasPaymentId },
        });

        if (!inscricao) {
            // Pagamento não é de um Desafio (provavelmente é de uma
            // Subscription/Payment normal) — ignora silenciosamente.
            return NextResponse.json({ ok: true, ignored: true });
        }

        // Idempotência: só atualiza se ainda não estava marcada como paga
        // (evita reprocessar caso a Asaas reenvie o mesmo webhook).
        if (inscricao.status !== 'PAGO') {
            await prisma.desafioInscricao.update({
                where: { id: inscricao.id },
                data: {
                    status: 'PAGO',
                    paymentDate: new Date(),
                },
            });
        }

        return NextResponse.json({ ok: true });
    } catch (error) {
        console.error('[webhooks/asaas-desafio][POST]', error);
        // Retorna 200 mesmo em erro interno pra evitar retentativas em
        // loop da Asaas — o erro já foi logado pra investigação manual.
        return NextResponse.json({ ok: false }, { status: 200 });
    }
}