// app/api/admin/android-testers/route.ts
// 🤖 Relatório dos testadores do app Android (só master). A Play Console pede uma lista de e-mails (mínimo de 12 testadores no teste fechado).
//   GET   -> { summary, items: [{ id, name, accountEmail, phone, testerEmail, at, addedAt, duplicate }] }
//   PATCH { all: true | userIds: string[], added: boolean } -> marca "já coloquei na lista da Play" (all+true só mexe em quem ainda não estava marcado)
import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireMaster } from '@/lib/auth';
import { testerSummary } from '@/lib/androidTester';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
    const auth = requireMaster(req);
    if ('response' in auth) return auth.response;
    try {
        const rows: any[] = await prisma.user.findMany({
            where: { androidTesterEmail: { not: null } } as any,
            select: { id: true, name: true, email: true, phone: true, androidTesterEmail: true, androidTesterAt: true, androidTesterAddedAt: true } as any,
            orderBy: { androidTesterAt: 'asc' } as any,
        });
        const seen = new Set<string>();
        const items = rows.map((r) => {
            const key = String(r.androidTesterEmail).toLowerCase(); const duplicate = seen.has(key); seen.add(key);
            return { id: r.id, name: r.name, accountEmail: r.email, phone: r.phone ?? null, testerEmail: r.androidTesterEmail, at: r.androidTesterAt, addedAt: r.androidTesterAddedAt, duplicate };
        });
        return NextResponse.json({ summary: testerSummary(rows), items });
    } catch (e: any) {
        console.error('[admin/android-testers GET]', e?.message);
        return NextResponse.json({ error: 'Erro ao listar os testadores.' }, { status: 500 });
    }
}

export async function PATCH(req: NextRequest) {
    const auth = requireMaster(req);
    if ('response' in auth) return auth.response;
    try {
        const body = await req.json().catch(() => ({}));
        if (typeof body?.added !== 'boolean') return NextResponse.json({ error: 'Informe added: true ou false.' }, { status: 400 });
        const ids = Array.isArray(body?.userIds) ? body.userIds.filter((x: any) => typeof x === 'string' && x) : [];
        if (body?.all !== true && ids.length === 0) return NextResponse.json({ error: 'Informe all: true ou userIds.' }, { status: 400 });
        const where: any = { androidTesterEmail: { not: null }, ...(body?.all === true ? {} : { id: { in: ids } }), ...(body.added && body?.all === true ? { androidTesterAddedAt: null } : {}) };
        const r: any = await prisma.user.updateMany({ where, data: { androidTesterAddedAt: body.added ? new Date() : null } as any });
        return NextResponse.json({ ok: true, count: r?.count ?? 0 });
    } catch (e: any) {
        console.error('[admin/android-testers PATCH]', e?.message);
        return NextResponse.json({ error: 'Erro ao atualizar.' }, { status: 500 });
    }
}
