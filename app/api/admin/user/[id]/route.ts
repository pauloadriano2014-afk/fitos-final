// app/api/admin/user/[id]/route.ts
import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { MASTER_IDS } from '@/lib/masterIds';
import { requireAuth, isMasterId, type AuthUser } from '@/lib/auth';

// 🔒 A ownership agora é decidida pelo usuário REAL do token (authUser), nunca
// pelo `adminId` que o cliente manda no body/query — esse `adminId` é
// completamente forjável e por isso não é mais usado na decisão de acesso.
async function checkOwnership(userId: string, authUser: AuthUser | null) {
    if (!authUser) return false;
    if (isMasterId(authUser.id)) return true;
    if (authUser.id === userId) return true;
    const targetUser = await prisma.user.findUnique({
        where: { id: userId },
        select: { coachId: true, nutritionistId: true }
    });
    if (!targetUser) return false;
    return targetUser.coachId === authUser.id || targetUser.nutritionistId === authUser.id;
}

// 🔥 Tratamento de CORS GLOBAL para evitar bloqueios na PWA
function corsResponse(body: any, status = 200) {
    return NextResponse.json(body, {
        status,
        headers: {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, PATCH, PUT, DELETE, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        },
    });
}

export async function OPTIONS() {
    return corsResponse({});
}

export async function GET(req: Request, { params }: { params: { id: string } }) {
    try {
        const userId = params.id;
        const { searchParams } = new URL(req.url);

        const auth = requireAuth(req);
        if ('response' in auth) return auth.response;
        const isOwner = await checkOwnership(userId, auth.user);
        if (!isOwner) return corsResponse({ error: 'Acesso não autorizado a este aluno.' }, 403);

        // 🔥 PERFORMANCE: caller pode pedir pra omitir relações pesadas que não vai usar
        // (ex: tela só quer a logo white-label, ou já descarta diets/workouts/anamneses
        // localmente logo após o fetch). Sem ?omit=, comportamento é 100% igual a antes.
        const omit = new Set((searchParams.get('omit') || '').split(',').map(s => s.trim()).filter(Boolean));

        const select: any = {
            id: true,
            name: true,
            email: true,
            gender: true,
            strategyNotes: true,
            lastContactDate: true,
            weeklyChecks: true,
            phone: true,
            photoUrl: true,
            role: true,
            plan: true,
            active: true,
            currentWeight: true,
            currentXP: true,
            nextCheckInDate: true,
            evaluationUrl: true,
            disableCheckIn: true,
            dietGoal: true,
            dietModule: true,
            runningModule: true,
            goal: true,
            level: true,
            inviteCode: true,
            accountStatus: true,
            contractType: true,
            contractValue: true,
            paymentDueDate: true,
            isFinanceActive: true,
            nextWorkoutUpdate: true,
            paymentClaimedAt: true,
            paymentClaimStatus: true,
            paymentClaimCycleDueDate: true,
            isMenstruating: true,
            menstruationStartDate: true,
            onboardingCompleted: true,
            onboardingStep:      true,
            coachPlan:           true,

            // 🔥 AS DUAS LINHAS QUE FALTAVAM E QUE RESOLVEM TUDO 🔥
            brandLogoUrl:        true,
            brandLogoSize:       true,
        };

        // 🔥 "studentModules" foi removido daqui pois não existe na tabela e dava Erro 500!
        if (!omit.has('anamneses')) select.anamneses = { orderBy: { createdAt: 'desc' }, take: 1 };
        if (!omit.has('workouts'))  select.workouts  = { where: { archived: false }, orderBy: { createdAt: 'desc' }, take: 1 };
        if (!omit.has('diets')) {
            select.diets = {
                where: { isActive: true },
                orderBy: { createdAt: 'desc' },
                take: 1,
                include: { meals: { orderBy: { order: 'asc' }, include: { items: true } } }
            };
        }

        const user = await prisma.user.findUnique({
            where: { id: userId },
            select
        });

        if (!user) return corsResponse({ error: 'Usuário não encontrado' }, 404);

        return corsResponse(user);

    } catch (error) {
        console.error('Erro GET Admin User ID:', error);
        return corsResponse({ error: 'Erro ao buscar usuário' }, 500);
    }
}

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
    try {
        const body = await req.json();
        const userId = params.id;

        const auth = requireAuth(req);
        if ('response' in auth) return auth.response;
        const isOwner = await checkOwnership(userId, auth.user);
        if (!isOwner) return corsResponse({ error: 'Acesso não autorizado.' }, 403);

        const dataToUpdate = { ...body };
        delete dataToUpdate.adminId;

        const user = await prisma.user.update({ where: { id: userId }, data: dataToUpdate });
        return corsResponse(user);
    } catch (error) {
        console.error('Erro PATCH Admin User:', error);
        return corsResponse({ error: 'Erro ao atualizar usuário' }, 500);
    }
}

export async function PUT(req: Request, { params }: { params: { id: string } }) {
    try {
        const body = await req.json();
        const userId = params.id;

        const auth = requireAuth(req);
        if ('response' in auth) return auth.response;
        const isOwner = await checkOwnership(userId, auth.user);
        if (!isOwner) return corsResponse({ error: 'Acesso não autorizado.' }, 403);

        const dataToUpdate = { ...body };
        delete dataToUpdate.adminId;

        const user = await prisma.user.update({ where: { id: userId }, data: dataToUpdate });

        if (body.isMenstruating === true) {
            const deloadEnd = new Date();
            deloadEnd.setDate(deloadEnd.getDate() + 5);
            await prisma.workout.updateMany({
                where: { userId, archived: false },
                data: { intensityMultiplier: 0.8, intensityEndDate: deloadEnd }
            });
        } else if (body.isMenstruating === false) {
            await prisma.workout.updateMany({
                where: { userId, archived: false },
                data: { intensityMultiplier: 1.0, intensityEndDate: null }
            });
        }

        return corsResponse(user);
    } catch (error) {
        console.error('Erro PUT Admin User:', error);
        return corsResponse({ error: 'Erro ao atualizar usuário' }, 500);
    }
}

export async function DELETE(req: Request, { params }: { params: { id: string } }) {
    try {
        const id = params.id;

        if (!id) return corsResponse({ error: 'User ID is required' }, 400);

        const auth = requireAuth(req);
        if ('response' in auth) return auth.response;
        const isOwner = await checkOwnership(id, auth.user);
        if (!isOwner) return corsResponse({ error: 'Apenas o Coach responsável pode apagar este aluno.' }, 403);

        await prisma.user.delete({ where: { id } });
        return corsResponse({ success: true });
    } catch (error: any) {
        console.error('Erro ao apagar utilizador:', error);
        return corsResponse({ error: 'Falha ao eliminar utilizador.' }, 500);
    }
}