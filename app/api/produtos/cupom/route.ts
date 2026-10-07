// app/api/produtos/cupom/route.ts
// 🌐 ROTA PÚBLICA — sem login. Confere um CUPOM DE DESCONTO antes da compra (botão "Aplicar" do checkout) e devolve o total novo. Quem manda no valor cobrado
// é /api/produtos/comprar, que confere o cupom de novo na hora da compra: esta rota só mostra a conta para a pessoa.
//   POST { produtoId, codigo, itensBumpIds?, cpf?, email? }
//   200 { valido: true, codigo, descricao, valorOriginal, desconto, valorFinal, limitado }
//   400 { valido: false, error, motivo }
// 🔒 Limita por IP (quem testa códigos até acertar é barrado) e responde igual para "não existe" e "desativado".
import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { checkRateLimit, getClientIp } from '@/lib/rateLimit';
import { montarPedido } from '@/lib/produtoPedido';
import { avaliarCupom, carregarCupom, contarUsos, descreverCupom, normalizarCodigo } from '@/lib/cupom';
import { carregarIndicador } from '@/lib/indicacao';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
    try {
        if (!checkRateLimit(`produtos-cupom:${getClientIp(request)}`, { max: 30, windowMs: 10 * 60 * 1000 }).allowed) {
            return NextResponse.json({ valido: false, error: 'Muitas tentativas. Aguarde alguns minutos e tente de novo.' }, { status: 429 });
        }

        const body = await request.json().catch(() => ({}));
        const { produtoId, codigo, itensBumpIds, cpf, email } = body || {};
        if (!produtoId || typeof produtoId !== 'string' || !normalizarCodigo(codigo)) {
            return NextResponse.json({ valido: false, error: 'Digite o código do cupom.', motivo: 'NAO_ENCONTRADO' }, { status: 400 });
        }

        const produto = await prisma.produtoDigital.findUnique({ where: { id: produtoId } });
        if (!produto || !produto.ativo) {
            return NextResponse.json({ valido: false, error: 'Produto não encontrado ou indisponível.' }, { status: 404 });
        }

        const { valorTotal } = await montarPedido(prisma, produto, itensBumpIds);
        const cupom = await carregarCupom(prisma, codigo);

        // CPF e e-mail ainda podem não estar preenchidos aqui: sem eles só dá para conferir o limite geral (o "uma vez por cliente" é conferido na compra).
        const cpfDigits = String(cpf ?? '').replace(/\D/g, '');
        const cpfOk = cpfDigits.length === 11 ? cpfDigits : null; const emailOk = typeof email === 'string' && email.includes('@') ? email : null;
        const usos = cupom ? await contarUsos(prisma, cupom.id, { cpf: cpfOk, email: emailOk }) : { total: 0, cliente: 0 };
        // 🤝 código de indicação: o próprio dono não usa (só dá para saber se a pessoa já preencheu o e-mail ou o CPF; a compra confere de novo)
        const indicador = await carregarIndicador(prisma, cupom);
        const r = avaliarCupom(cupom, { now: new Date(), produto, total: valorTotal, usosTotal: usos.total, usosCliente: usos.cliente, indicador, comprador: { email: emailOk, cpf: cpfOk } });

        if (!r.ok) return NextResponse.json({ valido: false, error: r.mensagem, motivo: r.motivo }, { status: 400 });
        return NextResponse.json({
            valido: true,
            codigo: cupom.codigo,
            descricao: descreverCupom(cupom),
            valorOriginal: r.original,
            desconto: r.desconto,
            valorFinal: r.final,
            limitado: r.limitado,
        });
    } catch (error: any) {
        console.error('[produtos/cupom][POST] Erro:', error?.message || error);
        return NextResponse.json({ valido: false, error: 'Não foi possível conferir o cupom agora. Tente de novo.' }, { status: 500 });
    }
}
