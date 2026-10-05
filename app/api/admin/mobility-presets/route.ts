// app/api/admin/mobility-presets/route.ts
// 🔥 (5 out 2026) Combos de mobilidade/alongamento -- PRIVADOS por coach.
// Cada coach só lê/cria/apaga os próprios (coachId vem do token, nunca do body).
import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuth } from '@/lib/auth';

const MAX_NAME = 60;
const MAX_EXERCISES = 12;
const MAX_BLOCKS = 6;
const MAX_PRESETS_PER_COACH = 100;

const clean = (v: any, max: number) => String(v ?? '').trim().slice(0, max);

// Valida e normaliza a lista de exercícios vinda do app. Retorna null se inválida.
function sanitizeExercises(input: any) {
  if (!Array.isArray(input) || input.length === 0 || input.length > MAX_EXERCISES) return null;
  const out: any[] = [];
  for (const ex of input) {
    const exerciseId = clean(ex?.exerciseId, 100);
    if (!exerciseId) return null;
    const rawBlocks = Array.isArray(ex?.blocks) ? ex.blocks.slice(0, MAX_BLOCKS) : [];
    if (rawBlocks.length === 0) return null;
    out.push({
      exerciseId,
      title: clean(ex?.title, 120),
      observation: clean(ex?.observation, 500),
      blocks: rawBlocks.map((b: any) => ({
        sets: clean(b?.sets, 4) || '1',
        reps: clean(b?.reps, 40) || '30 segundos',
        restTime: clean(b?.restTime, 4) || '0',
      })),
    });
  }
  return out;
}

// LISTAR os combos do coach logado
export async function GET(req: Request) {
  try {
    const auth = requireAuth(req);
    if ('response' in auth) return auth.response;

    const presets = await prisma.mobilityPreset.findMany({
      where: { coachId: auth.user.id },
      orderBy: { createdAt: 'desc' },
    });
    return NextResponse.json({ presets });
  } catch (error) {
    return NextResponse.json({ error: 'Falha ao buscar os combos de mobilidade.' }, { status: 500 });
  }
}

// CRIAR um combo novo
export async function POST(req: Request) {
  try {
    const auth = requireAuth(req);
    if ('response' in auth) return auth.response;

    const body = await req.json();
    const name = clean(body?.name, MAX_NAME);
    if (!name) return NextResponse.json({ error: 'Dê um nome para o combo.' }, { status: 400 });

    const exercises = sanitizeExercises(body?.exercises);
    if (!exercises) {
      return NextResponse.json({ error: `O combo precisa ter de 1 a ${MAX_EXERCISES} exercícios válidos.` }, { status: 400 });
    }

    const total = await prisma.mobilityPreset.count({ where: { coachId: auth.user.id } });
    if (total >= MAX_PRESETS_PER_COACH) {
      return NextResponse.json({ error: 'Limite de combos atingido. Apague algum para criar outro.' }, { status: 400 });
    }

    const preset = await prisma.mobilityPreset.create({
      data: { coachId: auth.user.id, name, exercises: exercises as any },
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

    const result = await prisma.mobilityPreset.deleteMany({ where: { id, coachId: auth.user.id } });
    if (result.count === 0) return NextResponse.json({ error: 'Combo não encontrado.' }, { status: 404 });
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: 'Falha ao apagar o combo.' }, { status: 500 });
  }
}
