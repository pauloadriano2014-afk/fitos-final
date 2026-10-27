import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuth } from '@/lib/auth';
import { OBS_FIXED_LABELS, OBS_MAX_CATEGORIES, obsMode, obsOwner, obsNorm, ensureSeeded } from '@/lib/obsOwner';

// 🗂️ (27 out 2026) Categorias das frases prontas do recado.
// Time master (Paulo e Adri): lista compartilhada de sempre; as 6 fixas ficam no app e aqui só entram as que eles criam.
// Coach parceiro: lista PRÓPRIA, já com o padrão na primeira vez (lib/obsDefaults.ts); todas editáveis e só ele vê.
const cleanName = (v: any) => String(v == null ? '' : v).replace(/\s+/g, ' ').trim().slice(0, 30);
const cleanColor = (v: any) => (typeof v === 'string' && /^#[0-9A-Fa-f]{6}$/.test(v) ? v.toUpperCase() : null);
const fixedNorm = OBS_FIXED_LABELS.map(obsNorm);
const nameTaken = (name: string, all: any[], master: boolean, exceptId?: string) => (master && fixedNorm.includes(obsNorm(name))) || all.some((c) => c.id !== exceptId && obsNorm(c.name) === obsNorm(name));
const list = (coachId: string | null) => prisma.observationCategory.findMany({ where: { coachId }, orderBy: [{ position: 'asc' }, { createdAt: 'asc' }] });

// LISTAR AS CATEGORIAS (e dizer ao app se é a lista do time master ou a própria do coach)
export async function GET(req: Request) {
  try {
    const auth = requireAuth(req);
    if ('response' in auth) return auth.response;
    const mode = obsMode(auth.user);
    if (mode === 'NONE') return NextResponse.json({ categories: [], mode });
    if (mode === 'PARTNER') await ensureSeeded(auth.user.id);
    return NextResponse.json({ categories: await list(obsOwner(auth.user)), mode });
  } catch (error) {
    return NextResponse.json({ error: "Falha ao buscar as categorias." }, { status: 500 });
  }
}

// CRIAR UMA CATEGORIA
export async function POST(req: Request) {
  try {
    const auth = requireAuth(req);
    if ('response' in auth) return auth.response;
    const mode = obsMode(auth.user);
    if (mode === 'NONE') return NextResponse.json({ error: "Sem permissão." }, { status: 403 });
    const owner = obsOwner(auth.user);
    if (mode === 'PARTNER') await ensureSeeded(auth.user.id);   // o padrão chega antes de qualquer criação, para um nome novo não bater com ele depois
    const body = await req.json();
    const name = cleanName(body.name);
    if (!name) return NextResponse.json({ error: "Dê um nome para a categoria." }, { status: 400 });
    const all: any[] = await list(owner);
    if (all.length >= OBS_MAX_CATEGORIES) return NextResponse.json({ error: `Limite de ${OBS_MAX_CATEGORIES} categorias.` }, { status: 400 });
    if (nameTaken(name, all, mode === 'MASTER')) return NextResponse.json({ error: "Já existe uma categoria com esse nome." }, { status: 409 });
    const position = all.reduce((m, c) => Math.max(m, c.position ?? 0), -1) + 1;
    const category = await prisma.observationCategory.create({ data: { name, color: cleanColor(body.color), position, coachId: owner } });
    return NextResponse.json(category);
  } catch (error) {
    return NextResponse.json({ error: "Falha ao criar a categoria." }, { status: 500 });
  }
}

// RENOMEAR E/OU TROCAR A COR DE UMA CATEGORIA
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
    if (body.name !== undefined) { data.name = cleanName(body.name); if (!data.name) return NextResponse.json({ error: "Dê um nome para a categoria." }, { status: 400 }); }
    if (body.color !== undefined) { if (body.color !== null && !cleanColor(body.color)) return NextResponse.json({ error: "Cor inválida." }, { status: 400 }); data.color = body.color === null ? null : cleanColor(body.color); }
    if (!Object.keys(data).length) return NextResponse.json({ error: "Nada para mudar." }, { status: 400 });
    const all: any[] = await list(owner);
    if (!all.some((c) => c.id === body.id)) return NextResponse.json({ error: "Categoria não encontrada." }, { status: 404 });
    if (data.name && nameTaken(data.name, all, mode === 'MASTER', body.id)) return NextResponse.json({ error: "Já existe uma categoria com esse nome." }, { status: 409 });
    const category = await prisma.observationCategory.update({ where: { id: body.id }, data });
    return NextResponse.json(category);
  } catch (error) {
    return NextResponse.json({ error: "Falha ao mudar a categoria." }, { status: 500 });
  }
}

// APAGAR UMA CATEGORIA: as frases dela ficam sem categoria. Nenhuma frase é apagada.
export async function DELETE(req: Request) {
  try {
    const auth = requireAuth(req);
    if ('response' in auth) return auth.response;
    if (obsMode(auth.user) === 'NONE') return NextResponse.json({ error: "Sem permissão." }, { status: 403 });
    const owner = obsOwner(auth.user);
    const id = new URL(req.url).searchParams.get('id');
    if (!id) return NextResponse.json({ error: "ID em falta." }, { status: 400 });
    const all: any[] = await list(owner);
    if (!all.some((c) => c.id === id)) return NextResponse.json({ error: "Categoria não encontrada." }, { status: 404 });
    const [moved] = await prisma.$transaction([
      prisma.observationPreset.updateMany({ where: { category: id, coachId: owner }, data: { category: null } }),
      prisma.observationCategory.delete({ where: { id } }),
    ]);
    return NextResponse.json({ success: true, moved: (moved as any)?.count ?? 0 });
  } catch (error) {
    return NextResponse.json({ error: "Falha ao apagar a categoria." }, { status: 500 });
  }
}
