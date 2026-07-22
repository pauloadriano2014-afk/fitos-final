// app/api/admin/user/[id]/route.ts — v3 (Blindado)
import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

const prisma = (global as any).prisma || new PrismaClient();
if (process.env.NODE_ENV === 'development') (global as any).prisma = prisma;

const MASTER_IDS = [
    '3c82f763-66b4-48da-836e-16817d4f57c0',
    'b7c0c181-41fd-4156-b8fe-963a267759a3'
];

async function checkOwnership(userId: string, adminId: string | null) {
    if (!adminId) return false;
    if (MASTER_IDS.includes(adminId)) return true;
    const targetUser = await prisma.user.findUnique({
        where: { id: userId },
        select: { coachId: true, nutritionistId: true }
    });
    if (!targetUser) return false;
    return targetUser.coachId === adminId || targetUser.nutritionistId === adminId;
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
        const adminId = searchParams.get('adminId');

        if (adminId) {
            const isOwner = await checkOwnership(userId, adminId);
            if (!isOwner) return corsResponse({ error: 'Acesso não autorizado a este aluno.' }, 403);
        }

        const user = await prisma.user.findUnique({
            where: { id: userId },
            select: {
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
                // 🔥 "studentModules" foi removido daqui pois não existe na tabela e dava Erro 500!
                anamneses: { orderBy: { createdAt: 'desc' }, take: 1 },
                workouts:  { where: { archived: false }, orderBy: { createdAt: 'desc' }, take: 1 },
                diets: {
                    where: { isActive: true },
                    orderBy: { createdAt: 'desc' },
                    take: 1,
                    include: { meals: { orderBy: { order: 'asc' }, include: { items: true } } }
                }
            }
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
        const { adminId } = body;

        if (adminId) {
            const isOwner = await checkOwnership(userId, adminId);
            if (!isOwner) return corsResponse({ error: 'Acesso não autorizado.' }, 403);
        }

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
        const { adminId } = body;

        if (adminId) {
            const isOwner = await checkOwnership(userId, adminId);
            if (!isOwner) return corsResponse({ error: 'Acesso não autorizado.' }, 403);
        }

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
        const { searchParams } = new URL(req.url);
        const adminId = searchParams.get('adminId');

        if (!id) return corsResponse({ error: 'User ID is required' }, 400);

        if (adminId) {
            const isOwner = await checkOwnership(id, adminId);
            if (!isOwner) return corsResponse({ error: 'Apenas o Coach responsável pode apagar este aluno.' }, 403);
        }

        await prisma.user.delete({ where: { id } });
        return corsResponse({ success: true });
    } catch (error: any) {
        console.error('Erro ao apagar utilizador:', error);
        return corsResponse({ error: 'Falha ao eliminar utilizador.' }, 500);
    }
}