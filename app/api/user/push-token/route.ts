import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuth, canAccessStudent } from '@/lib/auth';


export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    // 🔥 (1 out 2026) O app nativo (LoginScreen) sempre mandou o campo como `pushToken`, mas esta rota só lia `token`:
    // desde a trava de login (27 ago) o salvamento voltava 400 "Dados incompletos" e o app ignorava -- quem logou depois
    // disso nunca teve o token do Expo gravado e não recebia push no app nativo (TestFlight/loja), só no PWA.
    // Agora aceita os dois nomes (versões antigas do app continuam funcionando).
    const userId = body?.userId;
    const token = body?.token ?? body?.pushToken;

    if (!userId || !token || typeof token !== 'string') {
      return NextResponse.json({ error: "Dados incompletos" }, { status: 400 });
    }
    if (!/^Expo(nent)?PushToken\[.+\]$/.test(token)) {
      return NextResponse.json({ error: "Token de push inválido" }, { status: 400 });
    }

    const auth = requireAuth(req);
    if ('response' in auth) return auth.response;
    const targetForAuth = await prisma.user.findUnique({ where: { id: userId }, select: { coachId: true } });
    if (!canAccessStudent(auth.user, userId, targetForAuth?.coachId)) {
      return NextResponse.json({ error: 'Acesso negado.' }, { status: 403 });
    }

    // Atualiza o token no cadastro do usuário
    await prisma.user.update({
      where: { id: userId },
      data: { pushToken: token }
    });

    return NextResponse.json({ success: true });

  } catch (error) {
    console.error("Erro ao salvar token:", error);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}