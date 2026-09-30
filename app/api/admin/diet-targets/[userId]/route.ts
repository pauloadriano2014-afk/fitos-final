// app/api/admin/diet-targets/[userId]/route.ts
// 🎯 (30 set 2026) Metas do nutricionista/coach para um aluno.
//   GET  -> { ok, config | null, updatedAt, available }   (config null = usa o cálculo padrão do app)
//   PUT  { config }  -> valida e grava (upsert)             { reset: true } -> apaga (volta ao padrão)
// Quem pode: o time master, o coach ou o nutricionista DO aluno. Tabela nova (StudentDietTargets): se ainda
// não existe no banco, o GET responde `available: false` (o app segue no padrão) e o PUT responde 503.
import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuth, isMasterId } from '@/lib/auth';
import { sanitizeTargets } from '@/lib/dietTargets';

export const dynamic = 'force-dynamic';

const MAX_BODY = 8000;   // bytes de JSON aceitos (a configuração real tem ~600)
const missingTable = (e: any) => e?.code === 'P2021' || e?.code === 'P2022' || /does not exist/i.test(String(e?.message || ''));

async function canAccess(authUserId: string, userId: string): Promise<boolean> {
  if (isMasterId(authUserId)) return true;
  const target = await prisma.user.findUnique({ where: { id: userId }, select: { coachId: true, nutritionistId: true } });
  return !!target && (target.coachId === authUserId || target.nutritionistId === authUserId);
}

export async function GET(req: Request, { params }: { params: { userId: string } }) {
  try {
    const auth = requireAuth(req);
    if ('response' in auth) return auth.response;
    if (!(await canAccess(auth.user.id, params.userId))) return NextResponse.json({ error: 'Acesso negado.' }, { status: 403 });
    try {
      const row = await (prisma as any).studentDietTargets.findUnique({ where: { userId: params.userId } });
      return NextResponse.json({ ok: true, available: true, config: row ? sanitizeTargets(row.config) : null, updatedAt: row?.updatedAt ?? null });
    } catch (e: any) {
      if (missingTable(e) || /studentDietTargets/i.test(String(e?.message || ''))) {
        return NextResponse.json({ ok: true, available: false, config: null, updatedAt: null });
      }
      throw e;
    }
  } catch (error: any) {
    console.error('[diet-targets GET]', error?.message || error);
    return NextResponse.json({ error: 'Erro interno ao ler as metas.' }, { status: 500 });
  }
}

export async function PUT(req: Request, { params }: { params: { userId: string } }) {
  try {
    const auth = requireAuth(req);
    if ('response' in auth) return auth.response;
    if (!(await canAccess(auth.user.id, params.userId))) return NextResponse.json({ error: 'Acesso negado.' }, { status: 403 });

    const raw = await req.text();
    if (raw.length > MAX_BODY) return NextResponse.json({ error: 'Configuração grande demais.' }, { status: 413 });
    let body: any = {};
    try { body = raw ? JSON.parse(raw) : {}; } catch { return NextResponse.json({ error: 'JSON inválido.' }, { status: 400 }); }

    try {
      if (body?.reset === true) {
        await (prisma as any).studentDietTargets.deleteMany({ where: { userId: params.userId } });
        return NextResponse.json({ ok: true, config: null });
      }
      if (!body?.config || typeof body.config !== 'object') return NextResponse.json({ error: 'Envie { config }.' }, { status: 400 });
      const config = sanitizeTargets(body.config);
      const row = await (prisma as any).studentDietTargets.upsert({
        where: { userId: params.userId },
        create: { userId: params.userId, config, updatedById: auth.user.id },
        update: { config, updatedById: auth.user.id },
      });
      return NextResponse.json({ ok: true, config, updatedAt: row.updatedAt });
    } catch (e: any) {
      if (missingTable(e) || /studentDietTargets/i.test(String(e?.message || ''))) {
        return NextResponse.json({ error: 'As metas personalizadas ainda não foram ativadas no servidor (falta rodar a atualização do banco).' }, { status: 503 });
      }
      throw e;
    }
  } catch (error: any) {
    console.error('[diet-targets PUT]', error?.message || error);
    return NextResponse.json({ error: 'Erro interno ao gravar as metas.' }, { status: 500 });
  }
}
