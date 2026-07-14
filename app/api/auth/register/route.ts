// app/api/auth/register/route.ts
// 🔥 REGISTRO COM BIFURCAÇÃO: ALUNO (convite) ou COACH (aprovação manual)
//
// accountType: "STUDENT" (default) | "COACH"
//
// ALUNO  → inviteCode obrigatório. Busca o coach dono do código de forma
//          DINÂMICA (campo User.inviteCode), com fallback pros códigos
//          legados PATEAM/CURVAS. Conta nasce ACTIVE.
// COACH  → cadastro livre, mas a conta nasce PENDING_APPROVAL (sem acesso).
//          Paulo recebe push na hora para aprovar/recusar no painel.

import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

const PAULO_EMAIL = 'paulo_adriano2014@live.com';
const ADRI_EMAIL = 'adri.personal@hotmail.com';

async function notifyMaster(title: string, bodyText: string) {
  try {
    const master = await prisma.user.findUnique({
      where: { email: PAULO_EMAIL },
      select: { pushToken: true },
    });
    if (master?.pushToken) {
      await fetch('https://exp.host/--/api/v2/push/send', {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Accept-encoding': 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          to: master.pushToken,
          sound: 'default',
          title,
          body: bodyText,
        }),
      });
    }
  } catch (pushError) {
    console.error('Erro ao enviar push:', pushError);
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const {
      email, password, name, birthDate, phone, gender,
      inviteCode, plan,
      accountType = 'STUDENT',
      cpf, instagram, // campos do fluxo COACH
    } = body;

    if (!email || !password || !name) {
      return NextResponse.json(
        { error: 'E-mail, senha e nome são obrigatórios.' },
        { status: 400 }
      );
    }

    const existingUser = await prisma.user.findUnique({
      where: { email: email },
    });

    if (existingUser) {
      return NextResponse.json(
        { error: 'Este e-mail já está cadastrado.' },
        { status: 400 }
      );
    }

    // 🔐 SENHAS NOVAS JÁ NASCEM COM HASH BCRYPT
    const hashedPassword = await bcrypt.hash(password, 10);

    // ═══════════════════════════════════════════════════════════
    // 🧑‍🏫 FLUXO COACH — cadastro livre + trava de aprovação
    // ═══════════════════════════════════════════════════════════
    if (accountType === 'COACH') {
      const cpfDigits = String(cpf || '').replace(/\D/g, '');
      if (cpfDigits.length !== 11 && cpfDigits.length !== 14) {
        return NextResponse.json(
          { error: 'CPF ou CNPJ inválido. Verifique os números.' },
          { status: 400 }
        );
      }

      const coach = await prisma.user.create({
        data: {
          email,
          password: hashedPassword,
          name,
          phone: phone || null,
          cpf: cpfDigits,
          role: 'COACH',
          accountStatus: 'PENDING_APPROVAL', // 🔒 A TRAVA
          plan: 'PERFORMANCE',
          coachRequestInfo: {
            instagram: instagram || null,
            requestedAt: new Date().toISOString(),
          },
        } as any,
      });

      // 🔔 Avisa o Paulo na hora
      await notifyMaster(
        '🎯 Novo Coach quer entrar!',
        `${name}${instagram ? ` (${instagram})` : ''} se cadastrou e aguarda sua aprovação.`
      );

      const { password: _, ...coachWithoutPassword } = coach;
      return NextResponse.json(
        {
          message: 'Cadastro recebido! Aguardando aprovação.',
          pendingApproval: true,
          user: coachWithoutPassword,
        },
        { status: 201 }
      );
    }

    // ═══════════════════════════════════════════════════════════
    // 🏋️ FLUXO ALUNO — convite obrigatório (código dinâmico)
    // ═══════════════════════════════════════════════════════════
    if (!inviteCode) {
      return NextResponse.json(
        { error: 'O Código de Convite é obrigatório. Solicite ao seu treinador.' },
        { status: 400 }
      );
    }

    const code = inviteCode.trim().toUpperCase();
    let coachId: string | null = null;

    // 1º: busca dinâmica pelo campo inviteCode do coach
    const coachByCode = await prisma.user.findFirst({
      where: { inviteCode: code } as any,
      select: { id: true, accountStatus: true } as any,
    });

    if (coachByCode) {
      // Coach pendente/recusado não pode receber alunos
      if ((coachByCode as any).accountStatus && (coachByCode as any).accountStatus !== 'ACTIVE') {
        return NextResponse.json(
          { error: 'Este código de convite não está ativo no momento.' },
          { status: 400 }
        );
      }
      coachId = coachByCode.id;
    } else {
      // 2º: fallback pros códigos legados (garante retrocompatibilidade)
      if (code === 'PATEAM') {
        const paulo = await prisma.user.findUnique({ where: { email: PAULO_EMAIL } });
        if (paulo) coachId = paulo.id;
      } else if (code === 'CURVAS') {
        const adri = await prisma.user.findUnique({ where: { email: ADRI_EMAIL } });
        if (adri) coachId = adri.id;
      }
    }

    if (!coachId) {
      return NextResponse.json(
        { error: 'Código de convite inválido ou treinador não encontrado.' },
        { status: 400 }
      );
    }

    // 🔥 CPF DO ALUNO (usado nas cobranças via Asaas)
    // Aceito se vier válido; se não vier, segue null e o app coleta no 1º pagamento
    const studentCpf = String(cpf || '').replace(/\D/g, '');
    const validStudentCpf = studentCpf.length === 11 || studentCpf.length === 14 ? studentCpf : null;

    // 🔥 CRIAÇÃO DO ALUNO COM A ESTEIRA CORRETA!
    const user = await prisma.user.create({
      data: {
        email,
        password: hashedPassword,
        name,
        birthDate,
        phone,
        gender,
        cpf: validStudentCpf, // 🔥 CPF JÁ COLETADO NO CADASTRO
        role: 'USER',
        coachId: coachId, // 🔥 ATRIBUI O ALUNO AO TREINADOR CERTO!
        plan: plan || 'PREMIUM', // 🔥 SALVA O PLANO EXATO QUE VEIO DO LINK!
      } as any,
    });

    // 🔔 DISPARO DE NOTIFICAÇÃO PARA O COACH DO ALUNO
    try {
      const coach = await prisma.user.findUnique({
        where: { id: coachId },
        select: { pushToken: true },
      });

      if (coach?.pushToken) {
        await fetch('https://exp.host/--/api/v2/push/send', {
          method: 'POST',
          headers: {
            Accept: 'application/json',
            'Accept-encoding': 'application/json',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            to: coach.pushToken,
            sound: 'default',
            title: '🚀 Novo Aluno na Área!',
            body: `${name} acabou de se cadastrar no seu time. Vai pra cima!`,
          }),
        });
      }
    } catch (pushError) {
      console.error('Erro ao enviar push de novo registro:', pushError);
    }

    const { password: _, ...userWithoutPassword } = user;

    return NextResponse.json(
      {
        message: 'Usuário criado com sucesso!',
        user: userWithoutPassword,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('ERRO NO REGISTRO:', error);
    return NextResponse.json(
      { error: 'Erro interno ao criar conta.' },
      { status: 500 }
    );
  }
}