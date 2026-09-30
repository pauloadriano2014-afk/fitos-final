// app/api/professional-profile/route.ts
// 🪪 (30 set 2026) Título + registro profissional de QUEM ESTÁ LOGADO (coach, nutricionista ou master), para
// assinar o PDF da dieta.
//   GET -> { ok, available, name, title, registry }
//   PUT { title, registry } -> valida e grava (upsert); { title: '', registry: '' } apaga os dois
// Aluno não tem perfil profissional. Tabela nova (ProfessionalProfile): se ainda não existe, o GET responde
// `available: false` (o app deixa digitar e assina só aquele PDF) e o PUT responde 503.
import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuth } from '@/lib/auth';
import { sanitizeProfessional } from '@/lib/professionalProfile';

export const dynamic = 'force-dynamic';

const missingTable = (e: any) => e?.code === 'P2021' || e?.code === 'P2022' || /does not exist/i.test(String(e?.message || ''));
const isStudent = (role: unknown) => String(role || '').toUpperCase() === 'USER';

export async function GET(req: Request) {
  try {
    const auth = requireAuth(req);
    if ('response' in auth) return auth.response;
    if (isStudent(auth.user.role)) return NextResponse.json({ error: 'Acesso negado.' }, { status: 403 });

    const me = await prisma.user.findUnique({ where: { id: auth.user.id }, select: { name: true } });
    try {
      const row = await (prisma as any).professionalProfile.findUnique({ where: { userId: auth.user.id } });
      return NextResponse.json({ ok: true, available: true, name: me?.name ?? null, title: row?.title ?? null, registry: row?.registry ?? null });
    } catch (e: any) {
      if (missingTable(e) || /professionalProfile/i.test(String(e?.message || ''))) {
        return NextResponse.json({ ok: true, available: false, name: me?.name ?? null, title: null, registry: null });
      }
      throw e;
    }
  } catch (error: any) {
    console.error('[professional-profile GET]', error?.message || error);
    return NextResponse.json({ error: 'Erro interno ao ler o perfil profissional.' }, { status: 500 });
  }
}

export async function PUT(req: Request) {
  try {
    const auth = requireAuth(req);
    if ('response' in auth) return auth.response;
    if (isStudent(auth.user.role)) return NextResponse.json({ error: 'Acesso negado.' }, { status: 403 });

    const raw = await req.text();
    if (raw.length > 2000) return NextResponse.json({ error: 'Conteúdo grande demais.' }, { status: 413 });
    let body: any = {};
    try { body = raw ? JSON.parse(raw) : {}; } catch { return NextResponse.json({ error: 'JSON inválido.' }, { status: 400 }); }

    const { title, registry } = sanitizeProfessional(body);
    try {
      if (!title && !registry) {
        await (prisma as any).professionalProfile.deleteMany({ where: { userId: auth.user.id } });
        return NextResponse.json({ ok: true, title: null, registry: null });
      }
      await (prisma as any).professionalProfile.upsert({
        where: { userId: auth.user.id },
        create: { userId: auth.user.id, title, registry },
        update: { title, registry },
      });
      return NextResponse.json({ ok: true, title, registry });
    } catch (e: any) {
      if (missingTable(e) || /professionalProfile/i.test(String(e?.message || ''))) {
        return NextResponse.json({ error: 'O registro profissional ainda não foi ativado no servidor (falta rodar a atualização do banco).' }, { status: 503 });
      }
      throw e;
    }
  } catch (error: any) {
    console.error('[professional-profile PUT]', error?.message || error);
    return NextResponse.json({ error: 'Erro interno ao gravar o perfil profissional.' }, { status: 500 });
  }
}
