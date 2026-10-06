// app/api/admin/cardio-presets/route.ts
// 🚴 (7 out 2026) Combos de cardio -- PRIVADOS por coach (igual aos combos de mobilidade).
// Cada coach só lê/cria/apaga os próprios (coachId vem do token, nunca do body).
import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuth } from '@/lib/auth';
import { parseCardioPresetInput, MAX_PRESETS_PER_COACH } from '@/lib/cardioPresets';

// LISTAR os combos do coach logado
export async function GET(req: Request) {
  try {
    const auth = requireAuth(req);
    if ('response' in auth) return auth.response;

    const presets = await prisma.cardioPreset.findMany({
      where: { coachId: auth.user.id },
      orderBy: { createdAt: 'desc' },
    });
    return NextResponse.json({ presets });
  } catch (error) {
    return NextResponse.json({ error: 'Falha ao buscar os combos de cardio.' }, { status: 500 });
  }
}

// CRIAR um combo novo
export async function POST(req: Request) {
  try {
    const auth = requireAuth(req);
    if ('response' in auth) return auth.response;

    const body = await req.json().catch(() => null);
    const parsed = parseCardioPresetInput(body);
    if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });

    const total = await prisma.cardioPreset.count({ where: { coachId: auth.user.id } });
    if (total >= MAX_PRESETS_PER_COACH) {
      return NextResponse.json({ error: 'Limite de combos atingido. Apague algum para criar outro.' }, { status: 400 });
    }

    const preset = await prisma.cardioPreset.create({
      data: { coachId: auth.user.id, name: parsed.name, goal: parsed.goal, exercises: parsed.exercises as any },
    });
    return NextResponse.json(preset);
  } catch (error) {
    return NextResponse.json({ error: 'Falha ao gravar o combo no banco.' }, { status: 500 });
  }
}

// APAGAR um combo (só se for do coach logado)
export async function DELETE(req: Request) {
  try {
    const auth = requireAuth(req);
    if ('response' in auth) return auth.response;

    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');
    if (!id) return NextResponse.json({ error: 'ID em falta.' }, { status: 400 });

    const result = await prisma.cardioPreset.deleteMany({ where: { id, coachId: auth.user.id } });
    if (result.count === 0) return NextResponse.json({ error: 'Combo não encontrado.' }, { status: 404 });
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: 'Falha ao apagar o combo.' }, { status: 500 });
  }
}
