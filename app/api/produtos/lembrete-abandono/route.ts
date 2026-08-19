// app/api/produtos/lembrete-abandono/route.ts
// 🌐 ROTA DE MANUTENÇÃO — não é chamada pelo app, e sim por um agendador
// EXTERNO batendo nela periodicamente (sugestão: Render Cron Job, ou um
// serviço grátis tipo cron-job.org, a cada 30-60min). Protegida por um
// secret simples via query string (?secret=...) — sem isso, qualquer um
// poderia disparar e-mail em massa pros clientes.
//
// 🔥 RECUPERAÇÃO DE CARRINHO ABANDONADO: acha vendas PENDENTE que já
// esperaram pelo menos 1h (dá tempo do PIX/boleto compensar sozinho sem
// incomodar à toa) mas ainda não passaram de 24h (evita mandar um lembrete
// "velho" se o agendador ficar off-line por dias), manda um e-mail com o
// PIX/cartão já prontos de novo (sem precisar gerar cobrança nova na Asaas),
// e marca `lembreteAbandonoEnviado` pra nunca reenviar a mesma venda.
import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export const dynamic = 'force-dynamic';

const CRON_SECRET = process.env.CRON_SECRET || '';
const APP_URL = process.env.APP_URL || 'https://www.pauloadrianoteam.com.br';
const RESEND_API_KEY = process.env.RESEND_API_KEY || '';
const FROM_EMAIL = process.env.RESEND_FROM || 'PA TEAM ELITE <onboarding@resend.dev>';

function buildLembreteEmailHtml(
    nomeCliente: string,
    produtoNome: string,
    valorTotal: number,
    pixQrCode: string | null,
    pixCopyPaste: string | null,
    invoiceUrl: string | null,
    acompanharLink: string
): string {
    const firstName = (nomeCliente || 'Atleta').split(' ')[0];
    const valorFormatado = valorTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 });

    const qrImg = pixQrCode
        ? `<img src="${pixQrCode.startsWith('data:') ? pixQrCode : `data:image/png;base64,${pixQrCode}`}" alt="QR Code PIX" style="width:180px;height:180px;display:block;margin:0 auto 16px auto;border-radius:12px;background:#FFF;" />`
        : '';

    const copyBlock = pixCopyPaste
        ? `<div style="background:#0a0a0a;border:1px dashed #8B5CF6;border-radius:10px;padding:12px;margin-bottom:16px;word-break:break-all;color:#C4B5FD;font-size:11px;font-family:monospace;">${pixCopyPaste}</div>`
        : '';

    const cardBtn = invoiceUrl
        ? `<a href="${invoiceUrl}"
             style="display:block;background-color:#8B5CF6;color:#FFFFFF;text-decoration:none;text-align:center;padding:14px;border-radius:12px;font-weight:bold;font-size:13px;letter-spacing:0.3px;margin-bottom:16px;">
             PAGAR COM CARTÃO OU BOLETO
           </a>`
        : '';

    return `
  <div style="background-color:#0a0a0a;padding:40px 20px;font-family:Arial,Helvetica,sans-serif;">
    <div style="max-width:480px;margin:0 auto;background-color:#1E1E1E;border-radius:16px;padding:35px 30px;border:1px solid #333;">
      <h1 style="color:#8B5CF6;font-size:20px;letter-spacing:1px;margin:0 0 8px 0;">⏰ SEU PEDIDO ESTÁ TE ESPERANDO</h1>
      <p style="color:#FFFFFF;font-size:15px;line-height:24px;margin:20px 0 8px 0;">
        Fala, <strong>${firstName}</strong>! Vimos que você começou a comprar <strong>${produtoNome}</strong>, mas o pagamento de <strong>R$ ${valorFormatado}</strong> ainda não foi confirmado.
      </p>
      <p style="color:#AAAAAA;font-size:14px;line-height:22px;margin:0 0 20px 0;">
        Seu pedido continua reservado — é só finalizar pelo PIX abaixo ou pelo cartão:
      </p>
      ${qrImg}
      ${copyBlock}
      ${cardBtn}
      <p style="color:#777777;font-size:12px;line-height:19px;margin:20px 0 0 0;">
        Prefere finalizar pelo site? <a href="${acompanharLink}" style="color:#C4B5FD;">${acompanharLink}</a>
      </p>
      <hr style="border:none;border-top:1px solid #333;margin:25px 0;" />
      <p style="color:#555555;font-size:11px;text-align:center;margin:0;">
        PA TEAM ELITE — pauloadrianoteam.com.br
      </p>
    </div>
  </div>`;
}

export async function GET(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url);
        const secret = searchParams.get('secret') || '';

        // Sem CRON_SECRET configurado no ambiente, a rota fica travada por
        // segurança (nunca "aberta por padrão") — precisa configurar a env
        // var no Render antes de apontar o agendador pra cá.
        if (!CRON_SECRET || secret !== CRON_SECRET) {
            return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
        }

        if (!RESEND_API_KEY) {
            return NextResponse.json({ error: 'RESEND_API_KEY não configurada' }, { status: 500 });
        }

        const agora = new Date();
        const umaHoraAtras = new Date(agora.getTime() - 60 * 60 * 1000);
        const vinteQuatroHorasAtras = new Date(agora.getTime() - 24 * 60 * 60 * 1000);

        const vendasAbandonadas = await prisma.produtoVenda.findMany({
            where: {
                status: 'PENDENTE',
                lembreteAbandonoEnviado: false,
                createdAt: { lte: umaHoraAtras, gte: vinteQuatroHorasAtras },
            },
            include: { produto: { select: { nome: true, slug: true } } },
        });

        let enviados = 0;
        for (const venda of vendasAbandonadas) {
            try {
                const acompanharLink = `${APP_URL}/Produto?id=${encodeURIComponent(venda.produto.slug)}&venda=${encodeURIComponent(venda.id)}`;
                const html = buildLembreteEmailHtml(
                    venda.nomeCliente,
                    venda.produto.nome,
                    venda.valorTotal,
                    venda.pixQrCode,
                    venda.pixCopyPaste,
                    venda.invoiceUrl,
                    acompanharLink
                );
                const firstName = (venda.nomeCliente || 'Atleta').split(' ')[0];

                const emailRes = await fetch('https://api.resend.com/emails', {
                    method: 'POST',
                    headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        from: FROM_EMAIL,
                        to: [venda.emailCliente],
                        subject: `⏰ ${firstName}, seu pedido ainda está esperando!`,
                        html,
                    }),
                });

                if (!emailRes.ok) {
                    const errBody = await emailRes.json().catch(() => ({}));
                    console.error('[lembrete-abandono] Erro do Resend:', emailRes.status, errBody, venda.id);
                } else {
                    enviados++;
                }

                // Marca como enviado mesmo se o Resend falhar (e-mail inválido,
                // por exemplo) — evita ficar tentando pra sempre a mesma venda.
                await prisma.produtoVenda.update({
                    where: { id: venda.id },
                    data: { lembreteAbandonoEnviado: true },
                });
            } catch (e) {
                console.error('[lembrete-abandono] Erro ao processar venda', venda.id, e);
            }
        }

        return NextResponse.json({ verificadas: vendasAbandonadas.length, enviados });
    } catch (error) {
        console.error('[produtos/lembrete-abandono][GET]', error);
        return NextResponse.json({ error: 'Erro ao verificar carrinhos abandonados' }, { status: 500 });
    }
}
