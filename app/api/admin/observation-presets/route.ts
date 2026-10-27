import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuth } from '@/lib/auth';
import { OBS_FIXED_KEYS, obsMode, obsOwner, ensureSeeded } from '@/lib/obsOwner';

// 🗂️ (27 out 2026) Frases prontas do recado. Time master (Paulo e Adri): lista compartilhada de sempre (coachId nulo).
// Coach parceiro: lista PRÓPRIA (coachId dele), com o padrão na primeira vez; só ele vê e muda.
// Categoria: texto = válida, null = sem categoria, undefined = inválida. O time master pode usar as 6 fixas ou as categorias que criou; o parceiro, só as dele.
const cleanText = (v: any) => String(v == null ? '' : v).replace(/\r/g, '').trim().slice(0, 500);
const cleanCategory = async (v: any, owner: string | null, master: boolean): Promise<string | null | undefined> => {
  if (v === undefined) return undefined;
  if (v === null || v === '') return null;
  if (typeof v !== 'string') return undefined;
  const up = v.toUpperCase();
  if (master && OBS_FIXED_KEYS.includes(up)) return up;
  const mine: any[] = await prisma.observationCategory.findMany({ where: { coachId: owner } });
  return mine.some((c) => c.id === v) ? v : undefined;
};
const findMine = async (id: any, owner: string | null) => (await prisma.observationPreset.findMany({ where: { coachId: owner } })).find((p: any) => p.id === id);

// BUSCAR AS OBSERVAÇÕES RÁPIDAS DE QUEM CHAMOU
export async function GET(req: Request) {
  try {
    const auth = requireAuth(req);
    if ('response' in auth) return auth.response;
    const mode = obsMode(auth.user);
    if (mode === 'NONE') return NextResponse.json({ presets: [] });
    if (mode === 'PARTNER') await ensureSeeded(auth.user.id);
    const presets = await prisma.observationPreset.findMany({ where: { coachId: obsOwner(auth.user) }, orderBy: { createdAt: 'desc' } });
    return NextResponse.json({ presets });
  } catch (error) {
    return NextResponse.json({ error: "Falha ao buscar as observações rápidas." }, { status: 500 });
  }
}

// SALVAR UMA NOVA OBSERVAÇÃO RÁPIDA
export async function POST(req: Request) {
  try {
    const auth = requireAuth(req);
    if ('response' in auth) return auth.response;
    const mode = obsMode(auth.user);
    if (mode === 'NONE') return NextResponse.json({ error: "Sem permissão." }, { status: 403 });
    const owner = obsOwner(auth.user);
    if (mode === 'PARTNER') await ensureSeeded(auth.user.id);
    const body = await req.json();
    const text = cleanText(body.text);
    if (!text) return NextResponse.json({ error: "Texto é obrigatório." }, { status: 400 });
    const category = await cleanCategory(body.category, owner, mode === 'MASTER');
    if (body.category && category === undefined) return NextResponse.json({ error: "Categoria inválida." }, { status: 400 });
    const preset = await prisma.observationPreset.create({ data: { text, coachId: owner, ...(category ? { category } : {}) } });
    return NextResponse.json(preset);
  } catch (error) {
    return NextResponse.json({ error: "Falha ao gravar a observação no banco." }, { status: 500 });
  }
}

// MUDAR O TEXTO E/OU A CATEGORIA DE UMA OBSERVAÇÃO RÁPIDA
export async function PATCH(req: Request) {
  try {
    const auth = requireAuth(req);
    if ('response' in auth) return auth.response;
    const mode = obsMode(auth.user);
    if (mode === 'NONE') return NextResponse.json({ error: "Sem permissão." }, { status: 403 });
    const owner = obsOwner(auth.user);
    const body = await req.json();
    if (!body.id) return NextResponse.json({ error: "ID em falta." }, { status: 400 });
    const data: any = {};
    if (body.text !== undefined) { data.text = cleanText(body.text); if (!data.text) return NextResponse.json({ error: "Texto é obrigatório." }, { status: 400 }); }
    if (body.category !== undefined) {
      const category = await cleanCategory(body.category, owner, mode === 'MASTER');
      if (category === undefined) return NextResponse.json({ error: "Categoria inválida." }, { status: 400 });
      data.category = category;
    }
    if (!Object.keys(data).length) return NextResponse.json({ error: "Nada para mudar." }, { status: 400 });
    if (!(await findMine(body.id, owner))) return NextResponse.json({ error: "Frase não encontrada." }, { status: 404 });
    const preset = await prisma.observationPreset.update({ where: { id: body.id }, data });
    return NextResponse.json(preset);
  } catch (error) {
    return NextResponse.json({ error: "Falha ao mudar a observação.", }, { status: 500 });
  }
}

// APAGAR UMA OBSERVAÇÃO RÁPIDA
export async function DELETE(req: Request) {
  try {
    const auth = requireAuth(req);
    if ('response' in auth) return auth.response;
    if (obsMode(auth.user) === 'NONE') return NextResponse.json({ error: "Sem permissão." }, { status: 403 });
    const owner = obsOwner(auth.user);
    const id = new URL(req.url).searchParams.get('id');
    if (!id) return NextResponse.json({ error: "ID em falta." }, { status: 400 });
    if (!(await findMine(id, owner))) return NextResponse.json({ error: "Frase não encontrada." }, { status: 404 });
    await prisma.observationPreset.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: "Falha ao apagar." }, { status: 500 });
  }
}
