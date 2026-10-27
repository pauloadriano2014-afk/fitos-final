import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuth } from '@/lib/auth';
import { obsMode, ensureSeeded, restoreDefaults } from '@/lib/obsOwner';

// 🗂️ (27 out 2026) RESTAURAR PADRÃO (só coach parceiro): devolve as categorias e frases do padrão que o coach apagou. Não mexe em nada que ele criou ou mudou.
export async function POST(req: Request) {
  try {
    const auth = requireAuth(req);
    if ('response' in auth) return auth.response;
    if (obsMode(auth.user) !== 'PARTNER') return NextResponse.json({ error: "O padrão é só para coaches parceiros." }, { status: 400 });
    const coachId = auth.user.id;
    await ensureSeeded(coachId);
    const result = await restoreDefaults(coachId);
    const categories = await prisma.observationCategory.findMany({ where: { coachId }, orderBy: [{ position: 'asc' }, { createdAt: 'asc' }] });
    const presets = await prisma.observationPreset.findMany({ where: { coachId }, orderBy: { createdAt: 'desc' } });
    return NextResponse.json({ ...result, categories, presets });
  } catch (error) {
    return NextResponse.json({ error: "Falha ao restaurar o padrão." }, { status: 500 });
  }
}
