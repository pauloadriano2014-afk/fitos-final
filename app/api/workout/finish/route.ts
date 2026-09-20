// app/api/workout/finish/route.ts

import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuth, canAccessStudent } from '@/lib/auth';

// 🔥 IMPORTAMOS O CÉREBRO DA NOSSA IA 🔥
import { analyzeWorkoutEvolution } from '@/app/utils/analyzeEvolution';
import { sendPushToUser } from '@/app/utils/sendNotification';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { userId, workoutName, day, exercisesData, duration, rpe, feedback } = body;

    if (!userId) return NextResponse.json({ error: "User ID missing" }, { status: 400 });

    // 🔒 Só o próprio aluno pode finalizar o treino dele (ou coach/master).
    const auth = requireAuth(req);
    if ('response' in auth) return auth.response;
    const targetUser = await prisma.user.findUnique({ where: { id: userId }, select: { coachId: true } });
    if (!canAccessStudent(auth.user, userId, targetUser?.coachId)) {
      return NextResponse.json({ error: 'Acesso negado.' }, { status: 403 });
    }

    // Função auxiliar para limpar peso (troca virgula por ponto e garante numero)
    const cleanWeight = (val: any) => {
        if (!val) return 0;
        const strVal = String(val).replace(',', '.');
        return parseFloat(strVal) || 0;
    };

    let xpBase = 150; 
    let xpBonus = 0;
    
    // Calcula XP Bonus (Lógica simplificada para garantir funcionamento)
    if (exercisesData && exercisesData.length > 0) {
        xpBonus = exercisesData.length * 5; // 5 XP por exercício feito
    }

    const totalXp = xpBase + xpBonus;

    // Salva Histórico
    // 🔥 (17 set 2026) `include: { details: true }` — precisamos do id de volta
    // pra poder linkar o push de "comentário no exercício" direto pra essa
    // observação específica (ver bloco de notificação mais abaixo).
    const workoutHistoryRecord = await prisma.workoutHistory.create({
        data: {
            userId,
            name: workoutName,
            xpEarned: totalXp,
            duration: duration || 0,
            rpe: rpe ? Number(rpe) : null,
            feedback: feedback || null,
            details: {
                create: exercisesData.flatMap((ex: any) => {
                    // Pega a última série válida para registrar a carga final
                    const lastSet = ex.sets && ex.sets.length > 0 ? ex.sets[ex.sets.length - 1] : null;
                    
                    // 🔥 Observação do aluno por exercício (opcional). Salva
                    // repetida em cada série do mesmo jeito que exerciseName já
                    // é -- na leitura (WorkoutLogCard.js) só olhamos a primeira
                    // ocorrência não-vazia por exercício.
                    const noteClean = ex.note ? String(ex.note).trim().slice(0, 500) : '';

                    return ex.sets.map((s: any) => ({
                        exerciseId: ex.exerciseId,
                        exerciseName: ex.name,
                        setNumber: s.index,
                        weight: cleanWeight(s.weight), // <--- USO DA FUNÇÃO DE LIMPEZA
                        reps: String(s.reps || "0"),
                        note: noteClean || null,
                    }));
                })
            }
        },
        include: { details: true }
    });

    // Atualiza XP do Usuário e resgata dados do Treinador para Notificação
    const user = await prisma.user.update({
        where: { id: userId },
        data: { 
            currentXP: { increment: totalXp } 
        },
        include: {
            // 🔥 Também busca a assinatura de Web Push — sem isso o coach que
            // acessa pelo navegador (PWA) nunca recebia esse aviso.
            // 🔥 (20 set 2026) `id: true` — SEM isso, sendPushToUser(user.coach, ...)
            // recebia um objeto sem `id`, então a busca das assinaturas na tabela
            // WebPushSubscription (getWebPushSubscriptions(user?.id)) sempre voltava
            // vazia — o push do app nativo (pushToken) ia normal, mas o Web Push
            // (PWA/navegador) NUNCA disparava nesse fluxo específico de "treino
            // finalizado". Esse arquivo não fazia parte da leva de rotas corrigida
            // em 19/09 (é o único que ficou de fora).
            coach: { select: { id: true, pushToken: true, webPushSubscription: true } }
        }
    });

    // 🔥 GATILHO SILENCIOSO DA IA 🔥
    // Roda a verificação de Estagnação em background. Se achar problema, salva no banco!
    analyzeWorkoutEvolution(userId, user.coachId || undefined).catch(console.error);

    // 🔥 DISPARO DE NOTIFICAÇÃO PARA O COACH (app nativo + navegador)
    // 🔥 (17 set 2026) Se o aluno escreveu algum comentário — RPE final ou
    // observação em algum exercício — destaca isso no título/corpo do push,
    // com uma prévia do texto. Sem isso o coach só via esse comentário se
    // abrisse o histórico do aluno manualmente; agora não passa despercebido.
    if (user.coach) {
        const feedbackClean = feedback ? String(feedback).trim() : '';
        // 🔥 Primeira observação não-vazia (mesma regra de leitura do
        // WorkoutLogCard.js: só a primeira ocorrência por exercício importa).
        const noteDetail = workoutHistoryRecord.details.find((d) => d.note);

        // 🔥 (20 set 2026) Pedido do Paulo: notificação só com nome + primeiro
        // sobrenome do aluno (não o nome completo), sem "esmagou" e mostrando
        // o nome EXATO do dia de treino (ex: "Peito e Tríceps") em vez do nome
        // da rotina inteira (que pode ter várias dezenas de dias dentro).
        const shortStudentName = (fullName?: string | null) => {
            const parts = String(fullName || '').trim().split(/\s+/).filter(Boolean);
            if (parts.length === 0) return 'Um aluno';
            return parts.length === 1 ? parts[0] : `${parts[0]} ${parts[1]}`;
        };
        const displayName = shortStudentName(user.name);
        const dayLabel = day || workoutName || 'treino';

        let pushTitle = '🔥 Treino Concluído!';
        let pushBody = `${displayName} finalizou o treino "${dayLabel}"`;
        // 🔥 (17 set 2026) `data` de deep link — ao tocar, o admin abre já na
        // tela de histórico desse treino, focado no comentário certo (se
        // houver). Ver PENDING_MOBILE_DEEPLINKS.md pra como consumir isso.
        let pushData: any = { type: 'workout_finished', studentId: userId, workoutHistoryId: workoutHistoryRecord.id };

        if (feedbackClean) {
            pushTitle = '📝 Treino concluído com comentário!';
            pushBody = `${displayName}: "${feedbackClean.slice(0, 100)}"`;
            pushData = { type: 'workout_feedback', studentId: userId, workoutHistoryId: workoutHistoryRecord.id };
        } else if (noteDetail) {
            pushTitle = '📝 Treino concluído com observação!';
            pushBody = `${displayName} deixou um comentário em "${noteDetail.exerciseName}": "${(noteDetail.note || '').slice(0, 80)}"`;
            pushData = { type: 'exercise_comment', studentId: userId, workoutHistoryId: workoutHistoryRecord.id, exerciseHistoryId: noteDetail.id };
        }

        sendPushToUser(user.coach, pushTitle, pushBody, pushData).catch((pushError) => console.error("Erro ao enviar push de treino finalizado:", pushError));
    }

    return NextResponse.json({ 
        success: true, 
        xpGained: totalXp, 
        newTotalXP: user.currentXP
    });

  } catch (error: any) {
    console.error("Erro finalizar:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}