// fitos-api-nova/app/api/desafios/inscrever/route.ts
//
// POST /api/desafios/inscrever
// Body: { desafioId, nome, dataNascimento, email, telefone, cpf }
//
// Fluxo:
// 1. Valida o desafio (existe e está ativo)
// 2. Busca a PaymentGatewayAccount do coach dono do desafio (pra pegar a API key da Asaas)
// 3. Cria (ou reaproveita) um Customer na Asaas
// 4. Cria uma cobrança PIX avulsa (não assinatura)
// 5. Busca o QR Code / copia-e-cola dessa cobrança
// 6. Salva tudo em DesafioInscricao com status PENDENTE
//
// ⚠️ AJUSTE:
// - O import do Prisma abaixo para o caminho real do seu singleton
// - ASAAS_BASE_URL se você usa sandbox em vez de produção
// - Se já existe uma função utilitária de "criar cobrança Asaas" no seu
//   código, prefira reaproveitá-la em vez desta implementação isolada —
//   esta aqui foi escrita para funcionar de forma independente, assumindo
//   que vocês ainda não tinham cobrança avulsa (não-assinatura) pronta.

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

const ASAAS_BASE_URL = 'https://api.asaas.com/v3'; // troque para sandbox se for testar antes

function onlyDigits(value: string): string {
    return (value || '').replace(/\D/g, '');
}

function formatDateYYYYMMDD(date: Date): string {
    return date.toISOString().split('T')[0];
}

export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { desafioId, nome, dataNascimento, email, telefone, cpf } = body;

        if (!desafioId || !nome || !dataNascimento || !email || !telefone || !cpf) {
            return NextResponse.json(
                { error: 'Preencha todos os campos: nome, data de nascimento, e-mail, telefone e CPF.' },
                { status: 400 }
            );
        }

        // 1. Valida o desafio
        const desafio = await prisma.desafioConfig.findUnique({ where: { id: desafioId } });
        if (!desafio || !desafio.ativo) {
            return NextResponse.json({ error: 'Desafio não encontrado ou inativo.' }, { status: 404 });
        }

        // 2. Busca a conta de pagamento (API key) do coach dono do desafio
        const gatewayAccount = await prisma.paymentGatewayAccount.findUnique({
            where: { coachId: desafio.coachId },
        });
        if (!gatewayAccount || !gatewayAccount.isActive) {
            return NextResponse.json(
                { error: 'Conta de pagamento do coach não configurada. Fale com o suporte.' },
                { status: 500 }
            );
        }

        const asaasHeaders = {
            'Content-Type': 'application/json',
            access_token: gatewayAccount.asaasApiKey,
        };

        // 3. Cria o Customer na Asaas
        const customerRes = await fetch(`${ASAAS_BASE_URL}/customers`, {
            method: 'POST',
            headers: asaasHeaders,
            body: JSON.stringify({
                name: nome,
                email,
                mobilePhone: onlyDigits(telefone),
                cpfCnpj: onlyDigits(cpf),
            }),
        });
        const customerData = await customerRes.json();
        if (!customerRes.ok) {
            console.error('[desafios/inscrever] Erro ao criar customer Asaas', customerData);
            return NextResponse.json(
                { error: customerData?.errors?.[0]?.description || 'Erro ao processar seus dados de pagamento.' },
                { status: 400 }
            );
        }
        const asaasCustomerId = customerData.id;

        // 4. Cria a cobrança PIX avulsa
        const dueDate = formatDateYYYYMMDD(new Date());
        const paymentRes = await fetch(`${ASAAS_BASE_URL}/payments`, {
            method: 'POST',
            headers: asaasHeaders,
            body: JSON.stringify({
                customer: asaasCustomerId,
                billingType: 'PIX',
                value: desafio.valor,
                dueDate,
                description: `${desafio.nome} — inscrição`,
            }),
        });
        const paymentData = await paymentRes.json();
        if (!paymentRes.ok) {
            console.error('[desafios/inscrever] Erro ao criar payment Asaas', paymentData);
            return NextResponse.json(
                { error: paymentData?.errors?.[0]?.description || 'Erro ao gerar a cobrança PIX.' },
                { status: 400 }
            );
        }
        const asaasPaymentId = paymentData.id;

        // 5. Busca o QR Code do PIX dessa cobrança
        const pixRes = await fetch(`${ASAAS_BASE_URL}/payments/${asaasPaymentId}/pixQrCode`, {
            method: 'GET',
            headers: asaasHeaders,
        });
        const pixData = await pixRes.json();
        if (!pixRes.ok) {
            console.error('[desafios/inscrever] Erro ao buscar PIX QR Code', pixData);
            return NextResponse.json({ error: 'Erro ao gerar o QR Code do PIX.' }, { status: 400 });
        }

        // 6. Salva a inscrição
        const inscricao = await prisma.desafioInscricao.create({
            data: {
                desafioId: desafio.id,
                nome,
                dataNascimento: new Date(dataNascimento),
                email,
                telefone,
                cpf: onlyDigits(cpf),
                status: 'PENDENTE',
                asaasCustomerId,
                asaasPaymentId,
                pixQrCode: pixData.encodedImage || null,
                pixCopyPaste: pixData.payload || null,
                invoiceUrl: paymentData.invoiceUrl || null,
                isLeadFuturo: true,
            },
        });

        return NextResponse.json({
            inscricaoId: inscricao.id,
            pixQrCode: inscricao.pixQrCode,
            pixCopyPaste: inscricao.pixCopyPaste,
            valor: desafio.valor,
        }, { status: 201 });

    } catch (error) {
        console.error('[desafios/inscrever][POST]', error);
        return NextResponse.json({ error: 'Erro ao processar inscrição.' }, { status: 500 });
    }
}
