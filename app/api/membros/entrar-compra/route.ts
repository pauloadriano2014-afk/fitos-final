// app/api/membros/entrar-compra/route.ts
// 🔐 ÁREA DE MEMBROS — login automático logo depois de pagar no checkout próprio: { vendaId, retirada } -> sessão.
// A "retirada" é um segredo que só o navegador de quem iniciou o pedido recebeu (resposta de /api/produtos/comprar).
// Vale uma vez, só com a venda PAGA e até 48 h depois do pagamento. Quem fechou a página, pagou em outro aparelho
// ou usa boleto entra pelo link do e-mail da compra ou pedindo um código — nada aqui depende de a pessoa voltar.
import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { checkRateLimit, getClientIp } from '@/lib/rateLimit';
import { garantirMembro, criarSessao } from '@/lib/membros';
import { conferirRetirada } from '@/lib/checkoutTracking';

export const dynamic = 'force-dynamic';

const NEGADO = { error: 'Não foi possível entrar direto. Use o link ou o código enviado para o seu e-mail.' };
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const ip = getClientIp(request);
    if (!checkRateLimit(`membros-entrar-compra:${ip}`, { max: 15, windowMs: 15 * 60 * 1000 }).allowed) {
      return NextResponse.json({ error: 'Muitas tentativas. Aguarde alguns minutos e tente de novo.' }, { status: 429 });
    }

    const vendaId = body?.vendaId;
    if (typeof vendaId !== 'string' || !UUID_RE.test(vendaId)) return NextResponse.json(NEGADO, { status: 401 });

    const venda = await prisma.produtoVenda.findUnique({ where: { id: vendaId } });
    if (!venda) return NextResponse.json(NEGADO, { status: 401 });

    const r = conferirRetirada(venda, body?.retirada);
    if (!r.ok) return NextResponse.json(NEGADO, { status: 401 });

    // Uso único mesmo com dois toques ao mesmo tempo: só passa quem trocar o tracking que acabou de ler pelo marcado como usado.
    const gasto = await prisma.produtoVenda.updateMany({ where: { id: venda.id, tracking: venda.tracking }, data: { tracking: r.marcado } });
    if (gasto.count !== 1) return NextResponse.json(NEGADO, { status: 401 });

    const membro = await garantirMembro(prisma, { email: venda.emailCliente, nome: venda.nomeCliente, telefone: venda.telefoneCliente, origem: 'COMPRA' });
    const sessao = await criarSessao(prisma, membro, request.headers.get('user-agent'));
    return NextResponse.json({
      token: sessao.token,
      expiraEm: sessao.expiraEm.toISOString(),
      membro: { nome: membro.nome ?? null, email: membro.email },
    });
  } catch (error) {
    console.error('[membros/entrar-compra][POST]', error);
    return NextResponse.json({ error: 'Não foi possível entrar agora. Tente de novo em instantes.' }, { status: 500 });
  }
}
