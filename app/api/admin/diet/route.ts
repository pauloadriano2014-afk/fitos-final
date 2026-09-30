// app/api/admin/diet/route.ts — v4
// v4: agora trata `strategyId` — quando presente, ATUALIZA a estratégia existente
//     (apaga e recria as refeições dela) em vez de criar um registro novo e
//     desativar tudo, que é o que causava o bug de "salva mas não persiste"
import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { randomUUID } from 'crypto';
import { requireAuth, isMasterId } from '@/lib/auth';
import { saveItemMetas, type ItemMetaInput } from '@/lib/foodMeasures';
import { saveDayScheme, loadDayScheme, sanitizeDayScheme, allowedKeys, isExtended, daySchemeAvailable } from '@/lib/dayScheme';
import { sendPushToUser } from '@/app/utils/sendNotification';


export async function POST(req: Request) {
    try {
        const auth = requireAuth(req);
        if ('response' in auth) return auth.response;

        const body = await req.json();
        const {
            userId, strategyId, // 🔥 strategyId agora é tratado de verdade
            name, goal,
            totalKcal, totalProtein, totalCarbs, totalFats,
            waterIntake, generalNotes, meals,
            // 🔥 Aviso pro aluno (17 set 2026): NUNCA automático — o coach
            // decide, save a save, se esse salvamento é a versão final pra
            // avisar ("tô sempre alterando" era exatamente o motivo de não
            // notificar em toda edição). Vem marcado só quando o app manda
            // notifyStudent:true de propósito (toggle "avisar aluno" ligado).
            notifyStudent,
            // 🏷️ abas da dieta (nomes, tipos e até 7 abas). undefined = não mexer: herda o esquema da versão anterior
            dayScheme,
            // 🏷️ o app que salvou conhece as abas extras (EXTRA_5..7)? Um editor antigo não pode sobrescrever uma dieta com
            // mais de 4 abas: ele não enxerga as extras e as apagaria.
            daysV2,
        } = body;

        if (!userId || userId === '[object Object]' || userId === 'undefined') {
            return NextResponse.json({ error: 'ID do usuário inválido.' }, { status: 400 });
        }

        // validação de ownership — agora baseada no usuário autenticado pelo
        // token, nunca no que o cliente alega no body (adminId era forjável)
        if (!isMasterId(auth.user.id)) {
            const target = await prisma.user.findUnique({
                where:  { id: userId },
                select: { coachId: true, nutritionistId: true },
            });
            const isOwner = target?.coachId === auth.user.id || target?.nutritionistId === auth.user.id;
            if (!isOwner) {
                return NextResponse.json({ error: 'Acesso negado.' }, { status: 403 });
            }
        }

        // 🏷️ abas extras: trava editor antigo, tabela ausente e refeição numa aba que o esquema não tem
        const incomingScheme = dayScheme === undefined ? undefined : sanitizeDayScheme(dayScheme);
        const checkDayTabs = async (currentDietId: string | null) => {
            const current = await loadDayScheme(currentDietId);
            if (daysV2 !== true && isExtended(current)) {
                return NextResponse.json({ error: 'Esta dieta usa mais de 4 abas. Atualize o app para editá-la (senão as abas extras seriam apagadas).' }, { status: 409 });
            }
            if (isExtended(incomingScheme ?? null) && !(await daySchemeAvailable())) {
                return NextResponse.json({ error: 'As abas extras ainda não estão ativas no servidor (falta rodar "prisma db push").' }, { status: 503 });
            }
            const resulting = incomingScheme === undefined ? current : incomingScheme;
            const allowed = allowedKeys(resulting);
            const orphan = (meals || []).find((m: any) => /^EXTRA_\d$/.test(String(m?.dayType || '')) && !allowed.includes(m.dayType));
            if (orphan) {
                return NextResponse.json({ error: 'Há refeições numa aba que não existe mais nesta dieta.' }, { status: 400 });
            }
            return null;
        };

        // 🥄 (30 set 2026) Cada item nasce com id nosso, pra gravar à parte (FoodItemMeta) o alimento do
        // catálogo e as medidas vigentes -- sem depender da ordem em que o banco devolve os itens.
        const metaQueue: ItemMetaInput[] = [];

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
                        const id = randomUUID();
                        metaQueue.push({ foodItemId: id, foodId: item.foodId, portions: item.portions });
                        return {
                            id,
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

            const tabsProblem = await checkDayTabs(strategyId);
            if (tabsProblem) return tabsProblem;

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

            await saveItemMetas(metaQueue);
            await saveDayScheme(updatedStrategy.id, dayScheme, updatedStrategy.id);
            console.log(`✅ ESTRATÉGIA ATUALIZADA: ${strategyId} (aluno ${userId})`);

            if (notifyStudent) {
                const student = await prisma.user.findUnique({
                    where: { id: userId },
                    select: { id: true, pushToken: true, webPushSubscription: true },
                });
                if (student) {
                    sendPushToUser(
                        student,
                        '🎯 Estratégia de dieta atualizada!',
                        `"${updatedStrategy.name}" foi atualizada pelo seu coach. Toque para conferir.`,
                        { type: 'diet_updated', dietId: updatedStrategy.id }
                    ).catch(() => {});
                }
            }

            return NextResponse.json(updatedStrategy);
        }

        // 🔥 Pra decidir a mensagem certa (dieta "pronta" na primeira vez vs
        // "atualizada" depois) — precisa contar ANTES de criar a nova versão.
        const existingBaseDietsCount = notifyStudent
            ? await prisma.diet.count({ where: { userId, isStrategy: false } })
            : 0;

        // 🏷️ versão base anterior (de onde herdar os nomes das abas se o app não mandar `dayScheme`)
        const previousBase = await prisma.diet.findFirst({
            where: { userId: String(userId), isActive: true, isStrategy: false },
            select: { id: true },
        });

        const tabsProblemBase = await checkDayTabs(previousBase?.id ?? null);
        if (tabsProblemBase) return tabsProblemBase;

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

        await saveItemMetas(metaQueue);
        await saveDayScheme(newDiet.id, dayScheme, previousBase?.id ?? null);
        console.log(`✅ DIETA SALVA: ${userId}`);

        if (notifyStudent) {
            const student = await prisma.user.findUnique({
                where: { id: userId },
                select: { id: true, pushToken: true, webPushSubscription: true },
            });
            if (student) {
                const title = existingBaseDietsCount === 0 ? '🍽️ Sua dieta está pronta!' : '🍽️ Dieta atualizada!';
                const dietPushType = existingBaseDietsCount === 0 ? 'diet_ready' : 'diet_updated';
                sendPushToUser(student, title, 'Seu coach preparou seu plano alimentar. Toque para conferir.', { type: dietPushType, dietId: newDiet.id }).catch(() => {});
            }
        }

        return NextResponse.json(newDiet);

    } catch (error: any) {
        console.error('❌ ERRO CRÍTICO NO PRISMA:', error.message);
        return NextResponse.json({ error: 'Erro no Banco de Dados', details: error.message }, { status: 500 });
    }
}