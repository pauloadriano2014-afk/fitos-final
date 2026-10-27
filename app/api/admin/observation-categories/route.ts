import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuth } from '@/lib/auth';

// 🗂️ (27 out 2026) Categorias criadas pelo coach para as frases prontas do recado (as 6 fixas ficam só no app).
// Valem para todos, como as frases (a tabela de frases também não tem dono).
const FIXED_LABELS = ['técnica', 'cuidados', 'contagem', 'como fazer', 'carga', 'outras'];
const MAX_CATEGORIES = 20;
const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
const FIXED_NORM = FIXED_LABELS.map(norm);
const cleanName = (v: any) => String(v == null ? '' : v).replace(/\s+/g, ' ').trim().slice(0, 30);
const cleanColor = (v: any) => (typeof v === 'string' && /^#[0-9A-Fa-f]{6}$/.test(v) ? v.toUpperCase() : null);
const nameTaken = (name: string, all: any[], exceptId?: string) => FIXED_NORM.includes(norm(name)) || all.some((c) => c.id !== exceptId && norm(c.name) === norm(name));

// LISTAR AS CATEGORIAS DO COACH
export async function GET(req: Request) {
  try {
    const auth = requireAuth(req);
    if ('response' in auth) return auth.response;
    const categories = await prisma.observationCategory.findMany({ orderBy: { createdAt: 'asc' } });
    return NextResponse.json({ categories });
  } catch (error) {
    return NextResponse.json({ error: "Falha ao buscar as categorias." }, { status: 500 });
  }
}

// CRIAR UMA CATEGORIA
export async function POST(req: Request) {
  try {
    const auth = requireAuth(req);
    if ('response' in auth) return auth.response;
    const body = await req.json();
    const name = cleanName(body.name);
    if (!name) return NextResponse.json({ error: "Dê um nome para a categoria." }, { status: 400 });
    const all = await prisma.observationCategory.findMany({});
    if (all.length >= MAX_CATEGORIES) return NextResponse.json({ error: `Limite de ${MAX_CATEGORIES} categorias.` }, { status: 400 });
    if (nameTaken(name, all)) return NextResponse.json({ error: "Já existe uma categoria com esse nome." }, { status: 409 });
    const category = await prisma.observationCategory.create({ data: { name, color: cleanColor(body.color) } });
    return NextResponse.json(category);
  } catch (error) {
    return NextResponse.json({ error: "Falha ao criar a categoria." }, { status: 500 });
  }
}

// RENOMEAR UMA CATEGORIA
export async function PATCH(req: Request) {
  try {
    const auth = requireAuth(req);
    if ('response' in auth) return auth.response;
    const body = await req.json();
    if (!body.id) return NextResponse.json({ error: "ID em falta." }, { status: 400 });
    const name = cleanName(body.name);
    if (!name) return NextResponse.json({ error: "Dê um nome para a categoria." }, { status: 400 });
    const all = await prisma.observationCategory.findMany({});
    if (!all.some((c: any) => c.id === body.id)) return NextResponse.json({ error: "Categoria não encontrada." }, { status: 404 });
    if (nameTaken(name, all, body.id)) return NextResponse.json({ error: "Já existe uma categoria com esse nome." }, { status: 409 });
    const category = await prisma.observationCategory.update({ where: { id: body.id }, data: { name } });
    return NextResponse.json(category);
  } catch (error) {
    return NextResponse.json({ error: "Falha ao renomear a categoria." }, { status: 500 });
  }
}

// APAGAR UMA CATEGORIA: as frases dela ficam sem categoria (o app volta a classificar sozinho). Nenhuma frase é apagada.
export async function DELETE(req: Request) {
  try {
    const auth = requireAuth(req);
    if ('response' in auth) return auth.response;
    const id = new URL(req.url).searchParams.get('id');
    if (!id) return NextResponse.json({ error: "ID em falta." }, { status: 400 });
    const [moved] = await prisma.$transaction([
      prisma.observationPreset.updateMany({ where: { category: id }, data: { category: null } }),
      prisma.observationCategory.delete({ where: { id } }),
    ]);
    return NextResponse.json({ success: true, moved: (moved as any)?.count ?? 0 });
  } catch (error) {
    return NextResponse.json({ error: "Falha ao apagar a categoria." }, { status: 500 });
  }
}
