// app/api/admin/coach-requests/route.ts — v2
// v2: salva coachPlan na aprovação
import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function generateInviteCode(name: string): Promise<string> {
    const base = (name || 'COACH')
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-zA-Z]/g, '').toUpperCase()
        .split(' ')[0].substring(0, 8) || 'COACH';
    for (let i = 0; i < 10; i++) {
        const candidate = `${base}${Math.floor(100 + Math.random() * 900)}`;
        const exists = await prisma.user.findFirst({ where: { inviteCode: candidate } as any });
        if (!exists) return candidate;
    }
    return `${base}${Date.now().toString().slice(-5)}`;
}

export async function GET() {
    try {
        const pending = await prisma.user.findMany({
            where: { role: 'COACH', accountStatus: { in: ['PENDING_APPROVAL', 'REJECTED'] } } as any,
            select: {
                id: true, name: true, email: true, phone: true, cpf: true,
                accountStatus: true, coachRequestInfo: true, coachPlan: true, // ← v2
                createdAt: true,
            } as any,
            orderBy: { createdAt: 'desc' },
        });
        return NextResponse.json(pending);
    } catch (error: any) {
        console.error('[coach-requests GET]', error?.message);
        return NextResponse.json({ error: 'Erro ao listar solicitações' }, { status: 500 });
    }
}

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const { coachId, action, inviteCode, coachPlan } = body; // ← v2: coachPlan

        if (!coachId || !['APPROVE', 'REJECT'].includes(action)) {
            return NextResponse.json({ error: 'coachId e action são obrigatórios.' }, { status: 400 });
        }

        const coach = await prisma.user.findUnique({ where: { id: coachId } });
        if (!coach || coach.role !== 'COACH') {
            return NextResponse.json({ error: 'Coach não encontrado.' }, { status: 404 });
        }

        if (action === 'REJECT') {
            await prisma.user.update({ where: { id: coachId }, data: { accountStatus: 'REJECTED' } as any });
            return NextResponse.json({ success: true, status: 'REJECTED' });
        }

        // APPROVE
        let finalCode = (inviteCode || '').trim().toUpperCase();
        if (finalCode) {
            const exists = await prisma.user.findFirst({
                where: { inviteCode: finalCode, NOT: { id: coachId } } as any,
            });
            if (exists) {
                return NextResponse.json({ error: `O código "${finalCode}" já está em uso.` }, { status: 400 });
            }
        } else {
            finalCode = await generateInviteCode(coach.name || 'COACH');
        }

        // Valida e aplica coachPlan (Paulo pode alterar na aprovação)
        const validPlans = ['PERSONAL', 'NUTRICIONISTA', 'ELITE'];
        const safePlan   = validPlans.includes(coachPlan) ? coachPlan : ((coach as any).coachPlan ?? 'PERSONAL');

        const updated = await prisma.user.update({
            where: { id: coachId },
            data: {
                accountStatus: 'ACTIVE',
                inviteCode:    finalCode,
                coachPlan:     safePlan, // ← v2: confirma ou altera o plano
            } as any,
        });

        try {
            if (updated.pushToken) {
                const planLabel: Record<string, string> = {
                    PERSONAL:     'Personal Trainer',
                    NUTRICIONISTA:'Nutricionista',
                    ELITE:        'Personal + Nutricionista',
                };
                await fetch('https://exp.host/--/api/v2/push/send', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        to:    updated.pushToken,
                        sound: 'default',
                        title: '🎉 Você foi aprovado!',
                        body:  `Acesso liberado como ${planLabel[safePlan]}. Código de convite: ${finalCode}`,
                    }),
                });
            }
        } catch (e) { /* não-crítico */ }

        return NextResponse.json({
            success: true, status: 'ACTIVE',
            inviteCode: finalCode, coachPlan: safePlan,
            coach: { id: updated.id, name: updated.name, email: updated.email },
        });

    } catch (error: any) {
        console.error('[coach-requests POST]', error?.message);
        return NextResponse.json({ error: 'Erro ao processar solicitação' }, { status: 500 });
    }
}