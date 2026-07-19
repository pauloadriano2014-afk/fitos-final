// app/api/admin/diet/route.ts — v3
// v3: valida que o coach tem acesso ao aluno antes de salvar a dieta
import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const MASTER_IDS = [
    '3c82f763-66b4-48da-836e-16817d4f57c0', // Paulo
    'b7c0c181-41fd-4156-b8fe-963a267759a3', // Adri
];

export async function POST(req: Request) {
    try {
        const body = await req.json();
        const {
            userId, adminId, // ← v3: adminId para validação
            name, goal,
            totalKcal, totalProtein, totalCarbs, totalFats,
            waterIntake, generalNotes, meals,
        } = body;

        if (!userId || userId === '[object Object]' || userId === 'undefined') {
            return NextResponse.json({ error: 'ID do usuário inválido.' }, { status: 400 });
        }

        // ← v3: validação de ownership
        if (adminId && !MASTER_IDS.includes(adminId)) {
            const target = await prisma.user.findUnique({
                where:  { id: userId },
                select: { coachId: true, nutritionistId: true },
            });
            const isOwner = target?.coachId === adminId || target?.nutritionistId === adminId;
            if (!isOwner) {
                return NextResponse.json({ error: 'Acesso negado.' }, { status: 403 });
            }
        }

        const newDiet = await prisma.$transaction(async (tx) => {
            // 1. Inativa dietas anteriores
            await tx.diet.updateMany({
                where: { userId, isActive: true },
                data:  { isActive: false },
            });

            // 2. Cria a nova dieta
            return await tx.diet.create({
                data: {
                    userId:       String(userId),
                    name:         name         || 'Plano Alimentar',
                    goal:         goal         || 'Não definido',
                    totalKcal:    Number(totalKcal)    || 0,
                    totalProtein: Number(totalProtein) || 0,
                    totalCarbs:   Number(totalCarbs)   || 0,
                    totalFats:    Number(totalFats)    || 0,
                    waterIntake:  waterIntake  || 'Não definido',
                    generalNotes: generalNotes || '',
                    isActive:     true,
                    meals: {
                        create: (meals || []).map((meal: any, mIndex: number) => ({
                            name:               meal.name    || 'Refeição',
                            time:               meal.time    || '00:00',
                            order:              mIndex,
                            notes:              meal.notes   || '',
                            dayType:            meal.dayType || 'TREINO',
                            alternativeGroupId: meal.alternativeGroupId || null,
                            isMainVersion:      meal.isMainVersion !== false,
                            alternativeLabel:   meal.alternativeLabel   || null,
                            items: {
                                create: (meal.items || []).map((item: any) => {
                                    const groupId = item.groupId || item.substitutionGroupId;
                                    return {
                                        name:                item.name || 'Alimento',
                                        amount:              Number(item.amount)           || 0,
                                        unit:                item.unit || 'g',
                                        calories:            Number(item.calories_per_100) || Number(item.calories) || 0,
                                        protein:             Number(item.p)                || Number(item.protein)  || 0,
                                        carbs:               Number(item.c)                || Number(item.carbs)    || 0,
                                        fats:                Number(item.f)                || Number(item.fats)     || 0,
                                        substitutionGroupId: groupId ? String(groupId) : null,
                                    };
                                }),
                            },
                        })),
                    },
                },
                include: { meals: { include: { items: true } } },
            });
        });

        console.log(`✅ DIETA SALVA: ${userId}`);
        return NextResponse.json(newDiet);

    } catch (error: any) {
        console.error('❌ ERRO CRÍTICO NO PRISMA:', error.message);
        return NextResponse.json({ error: 'Erro no Banco de Dados', details: error.message }, { status: 500 });
    }
}