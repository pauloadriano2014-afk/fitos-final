// app/api/auth/login/route.ts
import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import bcrypt from 'bcryptjs';
import { signAuthToken } from '@/lib/auth';
import { checkRateLimit, getClientIp } from '@/lib/rateLimit';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  try {
    const { email, password } = await req.json();

    // 🔒 (26 set 2026) Sem limite de tentativas dava pra tentar senha
    // indefinidamente. Limita por IP+e-mail (8 tentativas / 15 min) — generoso
    // o bastante pra não travar gente que erra a senha de boa-fé, apertado o
    // bastante pra inviabilizar força bruta.
    const ip = getClientIp(req);
    const rl = checkRateLimit(`login:${ip}:${String(email || '').toLowerCase()}`, {
      max: 8,
      windowMs: 15 * 60 * 1000,
    });
    if (!rl.allowed) {
      return NextResponse.json(
        { error: 'Muitas tentativas. Aguarde alguns minutos antes de tentar de novo.' },
        { status: 429 }
      );
    }

    const user = await prisma.user.findUnique({
      where: { email },
      include: { 
        anamneses: true 
      }
    });

    if (!user) {
      return NextResponse.json({ error: 'E-mail ou senha incorretos' }, { status: 401 });
    }

    // 🗑️ Conta excluída pelo próprio usuário (ver app/api/user/delete-account)
    // — email já foi trocado nesse fluxo, então isso normalmente nem chega
    // aqui, mas fica como segunda trava.
    if ((user as any).accountStatus === 'DELETED') {
      return NextResponse.json({ error: 'E-mail ou senha incorretos' }, { status: 401 });
    }

    // 🔐 VERIFICAÇÃO COM UPGRADE-ON-LOGIN
    // Senhas novas são hash bcrypt (começam com "$2").
    // Senhas antigas estão em texto puro: se baterem, fazemos o upgrade
    // para hash na hora, de forma transparente. O banco se migra sozinho.
    let passwordOk = false;

    if (user.password?.startsWith('$2')) {
      // Já é hash bcrypt
      passwordOk = await bcrypt.compare(password, user.password);
    } else {
      // Legado: texto puro
      passwordOk = user.password === password;

      if (passwordOk) {
        // 🔥 UPGRADE: regrava com hash (não bloqueia o login se falhar)
        try {
          const hashed = await bcrypt.hash(password, 10);
          await prisma.user.update({
            where: { id: user.id },
            data: { password: hashed },
          });
        } catch (e) {
          console.error('Falha no upgrade de senha (login segue normal):', e);
        }
      }
    }

    if (passwordOk) {
      const { password: _, ...userWithoutPassword } = user;

      // 🔐 Token assinado — a partir de agora é ele que prova quem está
      // chamando cada rota, em vez do app mandar coachId/userId no corpo.
      const token = signAuthToken({
        id: user.id,
        role: (user as any).role,
        coachId: (user as any).coachId ?? null,
      });

      // 🔥 O Servidor agora devolve o usuário com a role ('ADMIN' ou 'USER')
      return NextResponse.json({ user: userWithoutPassword, token });
    }

    return NextResponse.json({ error: 'E-mail ou senha incorretos' }, { status: 401 });
  } catch (error) {
    console.error("Erro na rota de login:", error);
    return NextResponse.json({ error: 'Erro interno no servidor' }, { status: 500 });
  }
}