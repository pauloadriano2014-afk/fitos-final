// app/api/produtos/comprar/route.ts
// 🌐 ROTA PÚBLICA — sem login. Gera a cobrança PIX/cartão pra uma venda de
// Produto Digital (checkout público, com Order Bump opcional). Diferente da
// compra de Conteúdo (Biblioteca), aqui NÃO existe um User logado — é um
// checkout de convidada: os dados (nome/email/telefone/cpf) vêm direto do
// formulário e viram um ProdutoVenda + um Customer novo/existente na Asaas.
import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { findOrCreateCustomer, createPayment, getPixQrCode } from '@/lib/asaas';
import { checkRateLimit, getClientIp } from '@/lib/rateLimit';
import { isValidEmail, membrosBaseUrl } from '@/lib/membros';
import { montarTracking } from '@/lib/checkoutTracking';
import { montarPedido } from '@/lib/produtoPedido';
import { avaliarCupom, carregarCupom, contarUsos, mensagemDoMotivo, round2 } from '@/lib/cupom';
import { carregarIndicador } from '@/lib/indicacao';

export const dynamic = 'force-dynamic';

function toDateOnly(d: Date): string {
    return d.toISOString().split('T')[0];
}

export async function POST(request: NextRequest) {
    try {
        // 🔒 Cada pedido cria um cliente e uma cobrança na Asaas: limita por IP para ninguém lotar o painel com pedidos falsos.
        if (!checkRateLimit(`produtos-comprar:${getClientIp(request)}`, { max: 20, windowMs: 10 * 60 * 1000 }).allowed) {
            return NextResponse.json({ error: 'Muitas tentativas. Aguarde alguns minutos e tente de novo.' }, { status: 429 });
        }

        const body = await request.json();
        const { produtoId, nome, email, telefone, cpf, itensBumpIds, cupom: cupomDigitado } = body;

        if (!produtoId || !nome || !email || !telefone || !cpf) {
            return NextResponse.json({ error: 'Preencha todos os campos obrigatórios.' }, { status: 400 });
        }

        const cpfDigits = String(cpf).replace(/\D/g, '');
        if (cpfDigits.length !== 11) {
            return NextResponse.json({ error: 'CPF inválido. Verifique os números.' }, { status: 400 });
        }
        if (!isValidEmail(String(email).trim().toLowerCase())) {
            return NextResponse.json({ error: 'E-mail inválido.' }, { status: 400 });
        }
        const telefoneDigits = String(telefone).replace(/\D/g, '');
        if (telefoneDigits.length < 10 || telefoneDigits.length > 13) {
            return NextResponse.json({ error: 'Telefone inválido. Informe o DDD e o número.' }, { status: 400 });
        }

        const produto = await prisma.produtoDigital.findUnique({ where: { id: produtoId } });
        if (!produto || !produto.ativo) {
            return NextResponse.json({ error: 'Produto não encontrado ou indisponível.' }, { status: 404 });
        }

        // 🔒 Nunca confia nos ids/valores mandados pelo cliente pra decidir o valor cobrado (ver lib/produtoPedido.ts): os extras são filtrados contra
        // a lista que o admin configurou pra ESTE produto e o valor de cada um vem do banco.
        const { bumpProdutos, valorTotal: valorBruto } = await montarPedido(prisma, produto, itensBumpIds);

        // 🎟️ CUPOM (opcional): o servidor confere TUDO de novo (validade, produto, limite de usos, "uma vez por cliente") e recalcula o valor. Se o cupom não
        // vale mais, a compra é recusada com o motivo (nunca cobra o preço cheio escondido de quem viu o preço com desconto).
        const emailLimpo = String(email).trim();
        let cupom: any = null;
        let valorTotal = valorBruto;
        let descontoValor = 0;
        if (typeof cupomDigitado === 'string' && cupomDigitado.trim()) {
            cupom = await carregarCupom(prisma, cupomDigitado);
            const usos = cupom ? await contarUsos(prisma, cupom.id, { cpf: cpfDigits, email: emailLimpo }) : { total: 0, cliente: 0 };
            const indicador = await carregarIndicador(prisma, cupom);   // 🤝 código de indicação: o dono não usa o próprio (mesmo e-mail ou CPF)
            const r = avaliarCupom(cupom, { now: new Date(), produto, total: valorBruto, usosTotal: usos.total, usosCliente: usos.cliente, indicador, comprador: { email: emailLimpo, cpf: cpfDigits } });
            if (!r.ok) return NextResponse.json({ error: r.mensagem, cupomInvalido: true, motivo: r.motivo }, { status: 400 });
            valorTotal = r.final;
            descontoValor = r.desconto;
        }

        const customer = await findOrCreateCustomer({
            name: nome,
            cpfCnpj: cpfDigits,
            email,
            mobilePhone: telefone,
        });

        // Cria a venda PENDENTE antes de chamar a Asaas, pra já ter um id
        // pronto pro externalReference da cobrança (webhook usa esse id pra
        // achar a venda de volta e marcar como PAGO).
        // 🛒 Do checkout próprio vem também de onde a pessoa chegou (anúncio, cookies do pixel) e a "retirada", o segredo que
        // só este navegador recebe e que mais tarde troca o pagamento por login automático (ver /api/membros/entrar-compra).
        const { tracking, retirada } = montarTracking(body?.tracking, {
            ip: getClientIp(request),
            ua: request.headers.get('user-agent'),
        });

        const venda = await prisma.produtoVenda.create({
            data: {
                produtoId: produto.id,
                nomeCliente: nome,
                emailCliente: emailLimpo,
                telefoneCliente: telefone,
                cpfCliente: cpfDigits,
                status: 'PENDENTE',
                valorTotal,
                ...(cupom ? { cupomId: cupom.id, cupomCodigo: cupom.codigo, valorOriginal: valorBruto, descontoValor } : {}),
                itensBumpIds: bumpProdutos.length > 0 ? JSON.stringify(bumpProdutos.map((p) => p.id)) : null,
                asaasCustomerId: customer.id,
                tracking: JSON.stringify(tracking),
            },
        });

        // 🎟️ Duas pessoas podem ter conferido o último uso ao mesmo tempo: depois de criar a venda (que já segura 1 uso) confere de novo e, se estourou o
        // limite (ou o mesmo cliente criou 2 pedidos juntos), desfaz ESTA venda e recusa.
        if (cupom && (cupom.usoMaximo !== null && cupom.usoMaximo !== undefined || cupom.umaVezPorCliente !== false)) {
            const agora = await contarUsos(prisma, cupom.id, { cpf: cpfDigits, email: emailLimpo });
            const estourou = cupom.usoMaximo !== null && cupom.usoMaximo !== undefined && agora.total > cupom.usoMaximo;
            const repetiu = cupom.umaVezPorCliente !== false && agora.cliente > 1;
            if (estourou || repetiu) {
                await prisma.produtoVenda.delete({ where: { id: venda.id } }).catch(() => {});
                const motivo = estourou ? 'ESGOTADO' : 'JA_USOU';
                return NextResponse.json({ error: mensagemDoMotivo(motivo), cupomInvalido: true, motivo }, { status: 400 });
            }
        }

        try {
            const descricao = bumpProdutos.length > 0
                ? `${produto.nome} + ${bumpProdutos.length} item(ns) extra(s)`
                : produto.nome;

            const cobranca = {
                customer: customer.id,
                billingType: 'UNDEFINED' as const, // cliente escolhe PIX/cartão
                value: valorTotal,
                dueDate: toDateOnly(new Date()),
                description: cupom ? `${descricao} (cupom ${cupom.codigo})` : descricao,
                externalReference: `produto:${venda.id}`,
            };

            // Depois de pagar na fatura (cartão) a Asaas devolve a pessoa ao checkout. Só funciona com o domínio cadastrado na
            // conta Asaas; se ela recusar, a cobrança sai igual, sem o retorno automático (a venda é confirmada pelo webhook).
            const base = membrosBaseUrl();
            let asaasPayment: any;
            if (base) {
                try {
                    asaasPayment = await createPayment({
                        ...cobranca,
                        callback: { successUrl: `${base}/comprar/?v=${venda.id}`, autoRedirect: true },
                    });
                } catch (callbackError: any) {
                    // Só tenta de novo se a Asaas RESPONDEU recusando o pedido (400). Erro de rede ou tempo esgotado pode ter criado a
                    // cobrança do mesmo jeito: repetir poderia cobrar em dobro.
                    if (callbackError?.status !== 400) throw callbackError;
                    console.warn('[produtos/comprar] Asaas recusou o retorno automático, seguindo sem ele:', callbackError?.message);
                }
            }
            if (!asaasPayment) asaasPayment = await createPayment(cobranca);

            let pixQrCode: string | null = null;
            let pixCopyPaste: string | null = null;
            try {
                const pix = await getPixQrCode(asaasPayment.id);
                pixQrCode = pix?.encodedImage || null;
                pixCopyPaste = pix?.payload || null;
            } catch { /* fatura cobre o PIX */ }

            await prisma.produtoVenda.update({
                where: { id: venda.id },
                data: {
                    asaasPaymentId: asaasPayment.id,
                    pixQrCode,
                    pixCopyPaste,
                    invoiceUrl: asaasPayment.invoiceUrl || null,
                },
            });

            return NextResponse.json(
                { vendaId: venda.id, pixQrCode, pixCopyPaste, invoiceUrl: asaasPayment.invoiceUrl || null, retirada, valorTotal, ...(cupom ? { cupomCodigo: cupom.codigo, valorOriginal: valorBruto, desconto: round2(descontoValor) } : {}) },
                { status: 201 }
            );
        } catch (asaasError: any) {
            // A cobrança falhou na Asaas — apaga a venda órfã pra não poluir
            // o painel do admin com "vendas" que nunca geraram um PIX.
            await prisma.produtoVenda.delete({ where: { id: venda.id } }).catch(() => {});
            throw asaasError;
        }
    } catch (error: any) {
        console.error('[produtos/comprar][POST] Erro:', error?.message || error);
        return NextResponse.json(
            { error: error?.message || 'Erro ao gerar o pagamento' },
            { status: 500 }
        );
    }
}
