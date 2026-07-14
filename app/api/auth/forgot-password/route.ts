// app/api/auth/forgot-password/route.ts
// 🔑 ESQUECI MINHA SENHA — Passo 1
//
// Recebe { email }, gera um token aleatório de uso único (1h de validade),
// guarda no banco apenas o HASH do token (se o banco vazar, os tokens não
// servem pra nada) e envia o link de redefinição por e-mail via Resend.
//
// SEGURANÇA: a resposta é SEMPRE a mesma, exista o e-mail ou não.
// Isso impede que alguém use esta rota para descobrir e-mails cadastrados.

import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import crypto from 'crypto';

const prisma = new PrismaClient();
export const dynamic = 'force-dynamic';

const APP_URL = process.env.APP_URL || 'https://www.pauloadrianoteam.com.br';
const RESEND_API_KEY = process.env.RESEND_API_KEY || '';
// Enquanto o domínio não estiver verificado no Resend, use 'onboarding@resend.dev'
const FROM_EMAIL = process.env.RESEND_FROM || 'PA TEAM ELITE <onboarding@resend.dev>';

const GENERIC_RESPONSE = {
  message: 'Se este e-mail estiver cadastrado, você receberá as instruções de redefinição em instantes.',
};

function buildEmailHtml(name: string, resetLink: string): string {
  const firstName = (name || 'Atleta').split(' ')[0];
  return `
  <div style="background-color:#0a0a0a;padding:40px 20px;font-family:Arial,Helvetica,sans-serif;">
    <div style="max-width:480px;margin:0 auto;background-color:#1E1E1E;border-radius:16px;padding:35px 30px;border:1px solid #333;">
      <h1 style="color:#8BC34A;font-size:20px;letter-spacing:1px;margin:0 0 8px 0;">🔑 REDEFINIÇÃO DE SENHA</h1>
      <p style="color:#FFFFFF;font-size:15px;line-height:24px;margin:20px 0 8px 0;">
        Fala, <strong>${firstName}</strong>! 👊
      </p>
      <p style="color:#AAAAAA;font-size:14px;line-height:22px;margin:0 0 25px 0;">
        Recebemos um pedido para redefinir a senha da sua conta. Toque no botão abaixo para criar uma nova senha:
      </p>
      <a href="${resetLink}"
         style="display:block;background-color:#8BC34A;color:#000000;text-decoration:none;text-align:center;padding:16px;border-radius:12px;font-weight:bold;font-size:14px;letter-spacing:1px;">
        CRIAR NOVA SENHA
      </a>
      <p style="color:#777777;font-size:12px;line-height:19px;margin:25px 0 0 0;">
        ⏰ Este link expira em <strong style="color:#AAAAAA;">1 hora</strong> e só pode ser usado uma vez.<br/><br/>
        Se você não pediu esta redefinição, ignore este e-mail — sua senha continua a mesma e ninguém consegue alterá-la sem acesso a esta caixa de entrada.
      </p>
      <hr style="border:none;border-top:1px solid #333;margin:25px 0;" />
      <p style="color:#555555;font-size:11px;text-align:center;margin:0;">
        PA TEAM ELITE — pauloadrianoteam.com.br
      </p>
    </div>
  </div>`;
}

export async function POST(req: Request) {
  try {
    const { email } = await req.json();

    if (!email || typeof email !== 'string') {
      return NextResponse.json(GENERIC_RESPONSE);
    }

    const user = await prisma.user.findUnique({
      where: { email: email.trim().toLowerCase() },
    });

    // E-mail não cadastrado → mesma resposta genérica (sem denunciar nada)
    if (!user) {
      return NextResponse.json(GENERIC_RESPONSE);
    }

    // ---- Gera o token ----
    const rawToken = crypto.randomBytes(32).toString('hex'); // vai no e-mail
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex'); // vai no banco
    const expiry = new Date(Date.now() + 60 * 60 * 1000); // 1 hora

    await prisma.user.update({
      where: { id: user.id },
      data: {
        resetToken: tokenHash,
        resetTokenExpiry: expiry,
      } as any,
    });

    const resetLink = `${APP_URL}/redefinir-senha?token=${rawToken}`;

    // ---- Envia via Resend (API REST, sem SDK) ----
    const emailRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: FROM_EMAIL,
        to: [user.email],
        subject: '🔑 Redefinição de senha — PA TEAM ELITE',
        html: buildEmailHtml(user.name || 'Atleta', resetLink),
      }),
    });

    if (!emailRes.ok) {
      const errBody = await emailRes.json().catch(() => ({}));
      console.error('[forgot-password] Erro do Resend:', emailRes.status, errBody);
      // Mesmo com falha de envio, resposta genérica (o log fica pra você investigar)
    }

    return NextResponse.json(GENERIC_RESPONSE);
  } catch (error) {
    console.error('[forgot-password] Erro:', error);
    // Resposta genérica até em erro interno — nunca vaza informação
    return NextResponse.json(GENERIC_RESPONSE);
  }
}