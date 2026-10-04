// app/api/membros/entrar/route.ts
// 🔐 ÁREA DE MEMBROS — Passo 2 do login: troca o código de 6 dígitos { email, codigo } ou o link do e-mail da compra { token } por uma sessão.
// Link e código valem uma vez só; erros de digitação são contados (5 e o código morre) e limitados por IP.
import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { checkRateLimit, getClientIp } from '@/lib/rateLimit';
import { normalizeEmail, validarCodigo, validarLink, criarSessao } from '@/lib/membros';

export const dynamic = 'force-dynamic';

const INVALIDO = { error: 'Código inválido ou expirado. Peça um novo código.' };

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const ip = getClientIp(request);
    const email = normalizeEmail(body?.email);

    if (!checkRateLimit(`membros-entrar:${ip}:${email || 'link'}`, { max: 10, windowMs: 15 * 60 * 1000 }).allowed) {
      return NextResponse.json({ error: 'Muitas tentativas. Aguarde alguns minutos e tente de novo.' }, { status: 429 });
    }

    const r = body?.token
      ? await validarLink(prisma, String(body.token))
      : await validarCodigo(prisma, email, String(body?.codigo ?? ''));
    if (!r.ok) return NextResponse.json(INVALIDO, { status: 401 });

    const sessao = await criarSessao(prisma, r.membro, request.headers.get('user-agent'));
    return NextResponse.json({
      token: sessao.token,
      expiraEm: sessao.expiraEm.toISOString(),
      membro: { nome: r.membro.nome ?? null, email: r.membro.email },
    });
  } catch (error) {
    console.error('[membros/entrar][POST]', error);
    return NextResponse.json({ error: 'Não foi possível entrar agora. Tente de novo em instantes.' }, { status: 500 });
  }
}
