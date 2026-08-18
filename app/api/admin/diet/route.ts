// app/api/admin/diet/route.ts — v4
// v4: agora trata `strategyId` — quando presente, ATUALIZA a estratégia existente
//     (apaga e recria as refeições dela) em vez de criar um registro novo e
//     desativar tudo, que é o que causava o bug de "salva mas não persiste"
import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { MASTER_IDS } from '@/lib/masterIds';


export async function POST(req: Request) {
    try {
        const body = await req.json();
        const {
            userId, adminId, strategyId, // 🔥 strategyId agora é tratado de verdade
            name, goal,
            totalKcal, totalProtein, totalCarbs, totalFats,
            waterIntake, generalNotes, meals,
        } = body;

        if (!userId || userId === '[object Object]' || userId === 'undefined') {
            return NextResponse.json({ error: 'ID do usuário inválido.' }, { status: 400 });
        }

        // validação de ownership (inalterado)
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

        const buildMealsCreate = (mealsList: any[]) =>
            (mealsList || []).map((meal: any, mIndex: number) => ({
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
            }));

        // ─── 🔥 SALVANDO UMA ESTRATÉGIA — atualiza o registro existente no lugar ──
        if (strategyId) {
            const existing = await prisma.diet.findFirst({
                where: { id: strategyId, userId, isStrategy: true },
            });

            if (!existing) {
                return NextResponse.json({ error: 'Estratégia não encontrada.' }, { status: 404 });
            }

            const updatedStrategy = await prisma.$transaction(async (tx) => {
                // Apaga as refeições antigas dessa estratégia (cascade cuida dos FoodItem)
                await tx.meal.deleteMany({ where: { dietId: strategyId } });

                // Atualiza conteúdo + recria as refeições — NÃO mexe em isStrategy,
                // strategyActive, strategyExclusive, strategyStartDate/EndDate
                return await tx.diet.update({
                    where: { id: strategyId },
                    data: {
                        name:         name         || existing.name,
                        goal:         goal         ?? existing.goal,
                        totalKcal:    Number(totalKcal)    || 0,
                        totalProtein: Number(totalProtein) || 0,
                        totalCarbs:   Number(totalCarbs)   || 0,
                        totalFats:    Number(totalFats)    || 0,
                        waterIntake:  waterIntake  ?? existing.waterIntake,
                        generalNotes: generalNotes ?? existing.generalNotes,
                        meals: { create: buildMealsCreate(meals) },
                    },
                    include: { meals: { include: { items: true } } },
                });
            });

            console.log(`✅ ESTRATÉGIA ATUALIZADA: ${strategyId} (aluno ${userId})`);
            return NextResponse.json(updatedStrategy);
        }

        // ─── SALVANDO A DIETA BASE — fluxo original (cria nova versão) ───────────
        const newDiet = await prisma.$transaction(async (tx) => {
            // 1. Inativa dietas BASE anteriores — nunca mexe em estratégias
            await tx.diet.updateMany({
                where: { userId, isActive: true, isStrategy: false },
                data:  { isActive: false },
            });

            // 2. Cria a nova dieta base
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
                    isStrategy:   false,
                    meals: { create: buildMealsCreate(meals) },
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