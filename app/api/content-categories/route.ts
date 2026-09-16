// app/api/content-categories/route.ts
// 🔥 Categorias do PA FLIX / ELITE FLIX, agora por coach (ver ContentCategory
// em prisma/schema/content.prisma). Mesmo padrão de "pool" já usado em
// /api/contents: Paulo e Adri (MASTER_IDS) compartilham um pool (coachId
// null/''/MASTER_IDS), cada coach parceiro tem o dele (coachId = seu id).
import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuth, canActAsCoach } from '@/lib/auth';
import { MASTER_IDS } from '@/lib/masterIds';

export const dynamic = 'force-dynamic';

// Lista padrão usada só na primeira vez que um pool (PA FLIX ou o de um coach
// parceiro específico) é consultado e ainda não tem nenhuma categoria salva —
// aí a gente semeia essas 7 no banco pra manter a experiência de antes (eram
// hardcoded no app) e depois cada coach edita à vontade a partir daí.
const DEFAULT_CATEGORIES = [
  'Biomecânica e Execução',
  'Treinos na Prática',
  'Mentalidade',
  'E-books de Treino',
  'E-books de Dieta',
  'Receitas Fit',
  'Audiobooks',
];

function resolveWhere(targetCoachId: string | null) {
  if (!targetCoachId || MASTER_IDS.includes(targetCoachId)) {
    return { OR: [{ coachId: null }, { coachId: '' }, { coachId: { in: MASTER_IDS } }] };
  }
  return { coachId: targetCoachId };
}

// GET: lista as categorias do pool do coach (semeando os padrões na primeira vez)
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const adminId = searchParams.get('adminId');

    const auth = requireAuth(request);
    if ('response' in auth) return auth.response;
    if (adminId && adminId !== 'null' && adminId !== 'undefined' && !canActAsCoach(auth.user, adminId)) {
      return NextResponse.json({ error: 'Acesso negado.' }, { status: 403 });
    }

    const targetCoachId = adminId && adminId !== 'null' && adminId !== 'undefined' ? adminId : null;
    const where = resolveWhere(targetCoachId);

    let categories = await prisma.contentCategory.findMany({ where, orderBy: { createdAt: 'asc' } });

    if (categories.length === 0) {
      // Primeira vez que esse pool é acessado — semeia os padrões.
      const seedCoachId = targetCoachId && !MASTER_IDS.includes(targetCoachId) ? targetCoachId : null;
      await prisma.contentCategory.createMany({
        data: DEFAULT_CATEGORIES.map((name) => ({ name, coachId: seedCoachId })),
      });
      categories = await prisma.contentCategory.findMany({ where, orderBy: { createdAt: 'asc' } });
    }

    return NextResponse.json(categories);
  } catch (error) {
    console.error('Erro Categorias PA FLIX (GET):', error);
    return NextResponse.json({ error: 'Erro ao buscar categorias' }, { status: 500 });
  }
}

// POST: cria uma nova categoria no pool do coach
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { name, adminId } = body;

    if (!name || !name.trim()) {
      return NextResponse.json({ error: 'Nome da categoria é obrigatório' }, { status: 400 });
    }

    const auth = requireAuth(request);
    if ('response' in auth) return auth.response;
    if (adminId && !canActAsCoach(auth.user, adminId)) {
      return NextResponse.json({ error: 'Acesso negado.' }, { status: 403 });
    }

    const seedCoachId = adminId && !MASTER_IDS.includes(adminId) ? adminId : null;
    const newCategory = await prisma.contentCategory.create({
      data: { name: name.trim(), coachId: seedCoachId },
    });

    return NextResponse.json(newCategory);
  } catch (error) {
    console.error('Erro Categorias PA FLIX (POST):', error);
    return NextResponse.json({ error: 'Erro ao criar categoria' }, { status: 500 });
  }
}
