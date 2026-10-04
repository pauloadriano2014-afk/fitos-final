// app/api/membros/codigo/route.ts
// 🔐 ÁREA DE MEMBROS — Passo 1 do login: recebe { email } e manda um código de 6 dígitos por e-mail.
//
// SEGURANÇA: a resposta é SEMPRE a mesma, tenha o e-mail conta/compra ou não (ninguém descobre quem é cliente).
// Só manda código para quem já é membro ou tem uma compra PAGA com esse e-mail; e-mail desconhecido não cria conta.
import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { checkRateLimit, getClientIp } from '@/lib/rateLimit';
import { normalizeEmail, isValidEmail, garantirMembro, vendaPagaDoEmail, emitirCodigo, enviarCodigoPorEmail } from '@/lib/membros';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const email = normalizeEmail(body?.email);
    if (!isValidEmail(email)) return NextResponse.json({ error: 'Digite um e-mail válido.' }, { status: 400 });

    const ip = getClientIp(request);
    if (!checkRateLimit(`membros-codigo-ip:${ip}`, { max: 20, windowMs: 15 * 60 * 1000 }).allowed) {
      return NextResponse.json({ error: 'Muitas tentativas. Aguarde alguns minutos e tente de novo.' }, { status: 429 });
    }
    // por e-mail: no máximo 4 códigos a cada 10 minutos; passou disso, a resposta continua igual, mas nada é enviado
    const podeEnviar = checkRateLimit(`membros-codigo-email:${email}`, { max: 4, windowMs: 10 * 60 * 1000 }).allowed;

    if (podeEnviar) {
      let membro = await prisma.membro.findUnique({ where: { email } });
      if (!membro) {
        const venda = await vendaPagaDoEmail(prisma, email);
        if (venda) membro = await garantirMembro(prisma, { email, nome: venda.nomeCliente, telefone: venda.telefoneCliente, origem: 'COMPRA' });
      }
      if (membro) {
        const codigo = await emitirCodigo(prisma, membro);
        await enviarCodigoPorEmail(membro, codigo);
      }
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('[membros/codigo][POST]', error);
    return NextResponse.json({ error: 'Não foi possível enviar o código agora. Tente de novo em instantes.' }, { status: 500 });
  }
}
