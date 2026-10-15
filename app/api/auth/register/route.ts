// app/api/auth/register/route.ts — v2
// v2: campo coachPlan no fluxo COACH (PERSONAL | NUTRICIONISTA | ELITE)
import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import bcrypt from 'bcryptjs';
import { signAuthToken } from '@/lib/auth';
import { sendPushToUser } from '@/app/utils/sendNotification';
import { isAutoPlan } from '@/lib/autoPlanKinds';
import { isSystemPlan, findOwnedActiveCoachPlan, studentFieldsFromCoachPlan, coachPlanInfoFor } from '@/lib/coachPlanLink';


const PAULO_EMAIL = 'paulo_adriano2014@live.com';
const ADRI_EMAIL  = 'adri.personal@hotmail.com';

async function notifyMaster(title: string, bodyText: string, data: any = {}) {
    try {
        const master = await prisma.user.findUnique({
            where: { email: PAULO_EMAIL },
            select: { id: true, pushToken: true, webPushSubscription: true },
        });
        if (master) {
            await sendPushToUser(master, title, bodyText, data);
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
            coachPlan: coachPlanBody, // ← v2: PERSONAL | NUTRICIONISTA | ELITE
            platform: platformBody,   // ← 14 out 2026: de onde veio o cadastro (o app manda Platform.OS: 'ios' | 'android' | 'web')
        } = body;
        // 🐛 (1 out 2026) versões antigas do app mandavam o plano do coach em `plan` (e não em `coachPlan`), então todo coach entrava como PERSONAL.
        // Aceita os dois; no fluxo de coach `plan` só pode ser um plano de coach (a validação abaixo derruba qualquer outro valor).
        const coachPlan = coachPlanBody ?? (accountType === 'COACH' ? plan : undefined) ?? 'PERSONAL';

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
            // Só 'ios' | 'android' | 'web' (qualquer outra coisa vira nada): serve para medir quantos coaches chegam por cada porta (pergunta COACHES_ORIGEM do assistente)
            const platform = ['ios', 'android', 'web'].includes(String(platformBody)) ? String(platformBody) : null;

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
                        platform,
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
                `${name}${instagram ? ` (${instagram})` : ''} se cadastrou como ${planLabel[safePlan]}${platform === 'ios' ? ' pelo app do iPhone' : platform === 'android' ? ' pelo app do Android' : platform === 'web' ? ' pelo site' : ''} e aguarda aprovação.`,
                { type: 'new_coach_request', coachId: coach.id }
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

        // 🧩 (15 out 2026) O link de um PLANO DO COACH PARCEIRO manda o ID do plano em `plan` (não um dos planos do sistema). Antes esse ID era gravado no campo
        // `plan` (um código que nenhuma tela entende). Agora: se o ID é de um plano ativo DESSE coach, o aluno entra nele (nome pro Perfil + módulos de treino/dieta);
        // qualquer outro valor desconhecido nunca é gravado como está (cai no padrão de sempre).
        let studentPlan: string = plan || 'PREMIUM';
        let planFields: Record<string, any> = {};
        let linkedCoachPlan: any = null;
        if (!isSystemPlan(plan)) {
            linkedCoachPlan = await findOwnedActiveCoachPlan(coachId, plan);
            if (linkedCoachPlan) {
                const f = studentFieldsFromCoachPlan(linkedCoachPlan);
                studentPlan = f.plan;
                planFields = { studentModules: f.studentModules, dietModule: f.dietModule, coachPlanId: f.coachPlanId };
            } else {
                studentPlan = 'PREMIUM';
            }
        }

        const user = await prisma.user.create({
            data: {
                email, password: hashedPassword, name,
                birthDate, phone, gender,
                cpf:     validStudentCpf,
                role:    'USER',
                coachId: coachId,
                plan:    studentPlan,
                ...planFields,
                // 🤖 (3 out 2026) Planos com montagem automática (ficha 8 semanas / desafio 21 dias): o plano só nasce depois da anamnese. Quem fecha o
                // app no meio dela fica "pendente" e a home mostra o banner pra terminar (a gravação da anamnese desliga o campo).
                ...(isAutoPlan(studentPlan) ? { anamnesePendente: true } : {}),
            } as any,
        });

        try {
            const coach = await prisma.user.findUnique({ where: { id: coachId }, select: { id: true, pushToken: true, webPushSubscription: true } });
            if (coach) {
                await sendPushToUser(coach, '🚀 Novo Aluno na Área!', `${name} acabou de se cadastrar no seu time.`, { type: 'new_student', studentId: user.id });
            }
        } catch (e) { console.error('Push novo aluno:', e); }

        const { password: _, ...userWithoutPassword } = user;
        const token = signAuthToken({ id: user.id, role: (user as any).role, coachId: (user as any).coachId ?? null });
        const coachPlanInfo = linkedCoachPlan ? await coachPlanInfoFor(linkedCoachPlan.id) : null;
        return NextResponse.json({ message: 'Usuário criado com sucesso!', user: { ...userWithoutPassword, coachPlanInfo }, token }, { status: 201 });

    } catch (error) {
        console.error('ERRO NO REGISTRO:', error);
        return NextResponse.json({ error: 'Erro interno ao criar conta.' }, { status: 500 });
    }
}