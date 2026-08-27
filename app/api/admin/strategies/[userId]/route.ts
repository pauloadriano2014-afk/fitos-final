// app/api/admin/strategies/[userId]/route.ts
// CRUD de estratégias de dieta para um aluno específico
import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuth, canAccessStudent } from '@/lib/auth';

export const dynamic = 'force-dynamic';


// ─── GET — lista todas as estratégias + dieta base do aluno ──────────────────
export async function GET(
  req: Request,
  { params }: { params: { userId: string } }
) {
  try {
    const { userId } = params;

    // 🔒 Só o próprio aluno, o coach dono dele, ou o time master.
    const auth = requireAuth(req);
    if ('response' in auth) return auth.response;
    const targetUser = await prisma.user.findUnique({ where: { id: userId }, select: { coachId: true } });
    if (!canAccessStudent(auth.user, userId, targetUser?.coachId)) {
      return NextResponse.json({ error: 'Acesso negado.' }, { status: 403 });
    }

    const diets = await prisma.diet.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      include: {
        meals: {
          orderBy: { order: 'asc' },
          include: { items: true },
        },
      },
    });

    const baseDiets     = diets.filter(d => !d.isStrategy);
    const strategies    = diets.filter(d => d.isStrategy);

    return NextResponse.json({ baseDiets, strategies });

  } catch (error) {
    console.error('GET strategies error:', error);
    return NextResponse.json({ error: 'Erro ao buscar estratégias' }, { status: 500 });
  }
}

// ─── POST — cria nova estratégia (copia a dieta base ou começa do zero) ──────
export async function POST(
  req: Request,
  { params }: { params: { userId: string } }
) {
  try {
    const { userId } = params;
    const body = await req.json();

    const {
      strategyName,           // obrigatório — ex: "Low Carb", "Finalização"
      goal,
      waterIntake,
      generalNotes,
      strategyStartDate,      // null = manual
      strategyEndDate,        // null = sem data de fim
      activateNow = false,    // se true, já ativa ao criar
      strategyExclusive = false, // 🔥 se true, substitui totalmente a dieta base pro aluno; se false, aluno escolhe
      copyFromDietId,         // se informado, copia refeições da dieta base
      meals = [],             // refeições passadas diretamente (opcional)
    } = body;

    if (!strategyName) {
      return NextResponse.json({ error: 'Nome da estratégia é obrigatório' }, { status: 400 });
    }

    // 🔒 Só o próprio aluno, o coach dono dele, ou o time master pode criar
    // uma estratégia para esse aluno.
    const auth = requireAuth(req);
    if ('response' in auth) return auth.response;
    const targetUser = await prisma.user.findUnique({ where: { id: userId }, select: { coachId: true } });
    if (!canAccessStudent(auth.user, userId, targetUser?.coachId)) {
      return NextResponse.json({ error: 'Acesso negado.' }, { status: 403 });
    }

    // Se ativar agora, desativa outras estratégias do aluno
    if (activateNow) {
      await prisma.diet.updateMany({
        where: { userId, isStrategy: true, strategyActive: true },
        data:  { strategyActive: false },
      });
    }

    // Determina os dados base
    let baseMeals = meals;

    if (copyFromDietId) {
      // Copia refeições da dieta indicada
      const sourceDiet = await prisma.diet.findUnique({
        where: { id: copyFromDietId },
        include: { meals: { include: { items: true } } },
      });

      // 🔒 A dieta-fonte precisa pertencer a ESTE MESMO aluno — sem isso, um
      // coach poderia copiar refeições da dieta de um aluno de OUTRO coach
      // (copyFromDietId é um id arbitrário vindo do corpo da requisição).
      if (sourceDiet && sourceDiet.userId !== userId) {
        return NextResponse.json({ error: 'Acesso negado: dieta de origem não pertence a este aluno.' }, { status: 403 });
      }

      if (sourceDiet) {
        baseMeals = sourceDiet.meals.map(meal => ({
          name:              meal.name,
          time:              meal.time,
          order:             meal.order,
          notes:             meal.notes,
          dayType:           meal.dayType,
          alternativeGroupId: meal.alternativeGroupId,
          isMainVersion:     meal.isMainVersion,
          alternativeLabel:  meal.alternativeLabel,
          items: meal.items.map(item => ({
            name:               item.name,
            amount:             item.amount,
            unit:               item.unit,
            protein:            item.protein,
            carbs:              item.carbs,
            fats:               item.fats,
            calories:           item.calories,
            substitutionGroupId: item.substitutionGroupId,
          })),
        }));
      }
    }

    // Cria a estratégia
    const strategy = await prisma.diet.create({
      data: {
        userId,
        name:             `Estratégia: ${strategyName}`,
        goal:             goal || null,
        waterIntake:      waterIntake || null,
        generalNotes:     generalNotes || null,
        isActive:         true,
        isStrategy:       true,
        strategyName,
        strategyActive:   activateNow,
        strategyExclusive: !!strategyExclusive,
        strategyStartDate: strategyStartDate ? new Date(strategyStartDate) : null,
        strategyEndDate:   strategyEndDate   ? new Date(strategyEndDate)   : null,
        meals: {
          create: baseMeals.map((meal: any) => ({
            name:              meal.name,
            time:              meal.time,
            order:             meal.order ?? 0,
            notes:             meal.notes,
            dayType:           meal.dayType ?? 'TREINO',
            alternativeGroupId: meal.alternativeGroupId,
            isMainVersion:     meal.isMainVersion ?? true,
            alternativeLabel:  meal.alternativeLabel,
            items: {
              create: (meal.items ?? []).map((item: any) => ({
                name:               item.name,
                amount:             item.amount,
                unit:               item.unit,
                protein:            item.protein,
                carbs:              item.carbs,
                fats:               item.fats,
                calories:           item.calories,
                substitutionGroupId: item.substitutionGroupId,
              })),
            },
          })),
        },
      },
      include: {
        meals: { include: { items: true } },
      },
    });

    return NextResponse.json(strategy, { status: 201 });

  } catch (error: any) {
    console.error('POST strategy error:', error);
    return NextResponse.json({ error: 'Erro ao criar estratégia', details: error.message }, { status: 500 });
  }
}