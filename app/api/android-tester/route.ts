// app/api/android-tester/route.ts
// 🤖 O próprio aluno entra (ou sai) da lista de testadores do app Android (aviso "Tenho Android").
//   GET    -> { email, at } do e-mail que ele já deixou (ou { email: null })
//   POST   { email } -> grava o e-mail da conta Google dele (trocar o e-mail zera o "já está na Play")
//   DELETE -> sai da lista
import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuth } from '@/lib/auth';
import { normalizeTesterEmail } from '@/lib/androidTester';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
    const auth = requireAuth(req);
    if ('response' in auth) return auth.response;
    try {
        const u: any = await prisma.user.findUnique({ where: { id: auth.user.id }, select: { androidTesterEmail: true, androidTesterAt: true } as any });
        return NextResponse.json({ email: u?.androidTesterEmail ?? null, at: u?.androidTesterAt ?? null });
    } catch (e: any) {
        console.error('[android-tester GET]', e?.message);
        return NextResponse.json({ error: 'Erro ao consultar.' }, { status: 500 });
    }
}

export async function POST(req: Request) {
    const auth = requireAuth(req);
    if ('response' in auth) return auth.response;
    try {
        const body = await req.json().catch(() => ({}));
        const r = normalizeTesterEmail(body?.email);
        if (!r.ok) return NextResponse.json({ error: r.error }, { status: 400 });
        const cur: any = await prisma.user.findUnique({ where: { id: auth.user.id }, select: { androidTesterEmail: true, androidTesterAt: true, androidTesterAddedAt: true } as any });
        if (!cur) return NextResponse.json({ error: 'Usuário não encontrado.' }, { status: 404 });
        const same = cur.androidTesterEmail === r.email;
        await prisma.user.update({
            where: { id: auth.user.id },
            data: same ? {} : { androidTesterEmail: r.email, androidTesterAt: new Date(), androidTesterAddedAt: null } as any,
        });
        return NextResponse.json({ ok: true, email: r.email, google: r.google, changed: !same });
    } catch (e: any) {
        console.error('[android-tester POST]', e?.message);
        return NextResponse.json({ error: 'Erro ao salvar o e-mail.' }, { status: 500 });
    }
}

export async function DELETE(req: Request) {
    const auth = requireAuth(req);
    if ('response' in auth) return auth.response;
    try {
        await prisma.user.update({ where: { id: auth.user.id }, data: { androidTesterEmail: null, androidTesterAt: null, androidTesterAddedAt: null } as any });
        return NextResponse.json({ ok: true });
    } catch (e: any) {
        console.error('[android-tester DELETE]', e?.message);
        return NextResponse.json({ error: 'Erro ao sair da lista.' }, { status: 500 });
    }
}
