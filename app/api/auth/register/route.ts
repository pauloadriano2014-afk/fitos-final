// app/api/auth/register/route.ts — v2
// v2: campo coachPlan no fluxo COACH (PERSONAL | NUTRICIONISTA | ELITE)
import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

const PAULO_EMAIL = 'paulo_adriano2014@live.com';
const ADRI_EMAIL  = 'adri.personal@hotmail.com';

async function notifyMaster(title: string, bodyText: string) {
    try {
        const master = await prisma.user.findUnique({
            where: { email: PAULO_EMAIL },
            select: { pushToken: true },
        });
        if (master?.pushToken) {
            await fetch('https://exp.host/--/api/v2/push/send', {
                method: 'POST',
                headers: { Accept: 'application/json', 'Accept-encoding': 'application/json', 'Content-Type': 'application/json' },
                body: JSON.stringify({ to: master.pushToken, sound: 'default', title, body: bodyText }),
            });
        }
    } catch (e) { console.error('Erro push master:', e); }
}

export async function POST(req: Request) {
    try {
        const body = await req.json();
        const {
            email, password, name, birthDate, phone, gender,
            inviteCode, plan,
            accountType = 'STUDENT',
            cpf, instagram,
            coachPlan = 'PERSONAL', // ← v2: PERSONAL | NUTRICIONISTA | ELITE
        } = body;

        if (!email || !password || !name) {
            return NextResponse.json({ error: 'E-mail, senha e nome são obrigatórios.' }, { status: 400 });
        }

        const existingUser = await prisma.user.findUnique({ where: { email } });
        if (existingUser) {
            return NextResponse.json({ error: 'Este e-mail já está cadastrado.' }, { status: 400 });
        }

        const hashedPassword = await bcrypt.hash(password, 10);

        // ═══════════════════════════════════════════════════════
        // 🧑‍🏫 FLUXO COACH
        // ═══════════════════════════════════════════════════════
        if (accountType === 'COACH') {
            const cpfDigits = String(cpf || '').replace(/\D/g, '');
            if (cpfDigits.length !== 11 && cpfDigits.length !== 14) {
                return NextResponse.json({ error: 'CPF ou CNPJ inválido.' }, { status: 400 });
            }

            // Valida coachPlan
            const validPlans = ['PERSONAL', 'NUTRICIONISTA', 'ELITE'];
            const safePlan   = validPlans.includes(coachPlan) ? coachPlan : 'PERSONAL';

            const coach = await prisma.user.create({
                data: {
                    email,
                    password: hashedPassword,
                    name,
                    phone:         phone || null,
                    cpf:           cpfDigits,
                    role:          'COACH',
                    accountStatus: 'PENDING_APPROVAL',
                    plan:          'PERFORMANCE',
                    coachPlan:     safePlan, // ← v2: salva o tipo escolhido
                    coachRequestInfo: {
                        instagram:   instagram || null,
                        requestedAt: new Date().toISOString(),
                        coachPlan:   safePlan, // duplicado no JSON para visibilidade no painel
                    },
                } as any,
            });

            // Notifica Paulo com o tipo de coach
            const planLabel: Record<string, string> = {
                PERSONAL:     'Personal Trainer',
                NUTRICIONISTA:'Nutricionista',
                ELITE:        'Personal + Nutricionista (ELITE)',
            };
            await notifyMaster(
                '🎯 Novo Coach quer entrar!',
                `${name}${instagram ? ` (${instagram})` : ''} se cadastrou como ${planLabel[safePlan]} e aguarda aprovação.`
            );

            const { password: _, ...coachWithoutPassword } = coach;
            return NextResponse.json(
                { message: 'Cadastro recebido! Aguardando aprovação.', pendingApproval: true, user: coachWithoutPassword },
                { status: 201 }
            );
        }

        // ═══════════════════════════════════════════════════════
        // 🏋️ FLUXO ALUNO (intacto)
        // ═══════════════════════════════════════════════════════
        if (!inviteCode) {
            return NextResponse.json({ error: 'O Código de Convite é obrigatório.' }, { status: 400 });
        }

        const code = inviteCode.trim().toUpperCase();
        let coachId: string | null = null;

        const coachByCode = await prisma.user.findFirst({
            where: { inviteCode: code } as any,
            select: { id: true, accountStatus: true } as any,
        });

        if (coachByCode) {
            if ((coachByCode as any).accountStatus && (coachByCode as any).accountStatus !== 'ACTIVE') {
                return NextResponse.json({ error: 'Este código de convite não está ativo no momento.' }, { status: 400 });
            }
            coachId = coachByCode.id;
        } else {
            if (code === 'PATEAM') {
                const paulo = await prisma.user.findUnique({ where: { email: PAULO_EMAIL } });
                if (paulo) coachId = paulo.id;
            } else if (code === 'CURVAS') {
                const adri = await prisma.user.findUnique({ where: { email: ADRI_EMAIL } });
                if (adri) coachId = adri.id;
            }
        }

        if (!coachId) {
            return NextResponse.json({ error: 'Código de convite inválido ou treinador não encontrado.' }, { status: 400 });
        }

        const studentCpf   = String(cpf || '').replace(/\D/g, '');
        const validStudentCpf = studentCpf.length === 11 || studentCpf.length === 14 ? studentCpf : null;

        const user = await prisma.user.create({
            data: {
                email, password: hashedPassword, name,
                birthDate, phone, gender,
                cpf:     validStudentCpf,
                role:    'USER',
                coachId: coachId,
                plan:    plan || 'PREMIUM',
            } as any,
        });

        try {
            const coach = await prisma.user.findUnique({ where: { id: coachId }, select: { pushToken: true } });
            if (coach?.pushToken) {
                await fetch('https://exp.host/--/api/v2/push/send', {
                    method: 'POST',
                    headers: { Accept: 'application/json', 'Accept-encoding': 'application/json', 'Content-Type': 'application/json' },
                    body: JSON.stringify({ to: coach.pushToken, sound: 'default', title: '🚀 Novo Aluno na Área!', body: `${name} acabou de se cadastrar no seu time.` }),
                });
            }
        } catch (e) { console.error('Push novo aluno:', e); }

        const { password: _, ...userWithoutPassword } = user;
        return NextResponse.json({ message: 'Usuário criado com sucesso!', user: userWithoutPassword }, { status: 201 });

    } catch (error) {
        console.error('ERRO NO REGISTRO:', error);
        return NextResponse.json({ error: 'Erro interno ao criar conta.' }, { status: 500 });
    }
}