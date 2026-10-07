// app/api/workout/finish/route.ts

import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuth, canAccessStudent } from '@/lib/auth';

// 🔥 IMPORTAMOS O CÉREBRO DA NOSSA IA 🔥
import { analyzeWorkoutEvolution } from '@/app/utils/analyzeEvolution';
import { sendPushToUser } from '@/app/utils/sendNotification';
import { cleanWeight, isPerSide } from '@/lib/exerciseLoad';
import { autoClientKey, cleanDay, cleanWorkoutId, findExistingFinish, isUniqueViolation, sanitizeClientKey } from '@/lib/finishWorkout';
import { cleanDuration, cleanCardio } from '@/lib/workoutDuration';
import { closeSessions } from '@/lib/workoutSessions';
import { cleanEffort } from '@/lib/loadSuggest';
import { cleanExerciseStatus, cleanLoggedAt, notDoneNames } from '@/lib/exerciseStatus';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { userId, workoutName, day, workoutId, exercisesData, duration, rpe, feedback } = body;

    if (!userId) return NextResponse.json({ error: "User ID missing" }, { status: 400 });

    // 🔒 Só o próprio aluno pode finalizar o treino dele (ou coach/master).
    const auth = requireAuth(req);
    if ('response' in auth) return auth.response;
    const targetUser = await prisma.user.findUnique({ where: { id: userId }, select: { coachId: true } });
    if (!canAccessStudent(auth.user, userId, targetUser?.coachId)) {
      return NextResponse.json({ error: 'Acesso negado.' }, { status: 403 });
    }

    // `cleanWeight` (vírgula -> ponto, garante número) e `isPerSide` ficam em lib/exerciseLoad.ts. `weight` é SEMPRE a carga TOTAL; `perSide` só marca que o aluno anotou "cada lado".

    const exercises: any[] = Array.isArray(exercisesData) ? exercisesData : [];

    // 🔒 (1 out 2026) NÃO DUPLICAR: o mesmo treino finalizado várias vezes (internet lenta + vários toques, ou reenvio depois de falha) grava UM só.
    // Ver lib/finishWorkout.ts. Mesma chave = devolve o resultado do que já foi gravado, sem XP, sem aviso ao coach, sem nova contagem.
    const now = new Date();
    const dayClean = cleanDay(day);
    const workoutIdClean = cleanWorkoutId(workoutId);
    const providedKey = sanitizeClientKey(body.clientKey);
    const clientKey = providedKey ?? autoClientKey({ workoutId: workoutIdClean, day: dayClean, workoutName, now });
    const finishLookup = { userId, clientKey, auto: !providedKey, workoutId: workoutIdClean, day: dayClean, workoutName: String(workoutName || ''), now };

    // 🔔 (7 out 2026) o treino foi finalizado: fecha a sessão aberta no INICIAR (para o servidor parar de lembrar o aluno). Melhor esforço (a tabela pode ainda não existir).
    const closeOpenSessions = () => closeSessions(prisma, userId, { clientKey, workoutId: workoutIdClean, day: dayClean }).catch((e: any) => { if (!/does not exist|P2021|P2022/i.test(String(e?.code || '') + String(e?.message || ''))) console.error('Erro ao fechar sessão de treino:', e?.message || e); });

    const duplicateResponse = async (existing: { id: string; xpEarned: number }) => {
        await closeOpenSessions();
        const current = await prisma.user.findUnique({ where: { id: userId }, select: { currentXP: true } });
        return NextResponse.json({ success: true, duplicate: true, xpGained: existing.xpEarned, newTotalXP: current?.currentXP ?? 0 });
    };

    const already = await findExistingFinish(prisma, finishLookup);
    if (already) return duplicateResponse(already);

    // ⏱️ (6 out 2026) "Deu tempo de fazer tudo?" (opcional). App antigo / sem resposta = null. Só vale `true` / `false` de verdade.
    const timeOk: boolean | null = body.timeOk === true ? true : body.timeOk === false ? false : null;
    const timeNote: string | null = timeOk === false ? (String(body.timeNote || '').replace(/\s+/g, ' ').trim().slice(0, 300) || null) : null;
    // o coach recebe UM aviso de "sem tempo" por aluno a cada 7 dias (o registro continua sendo gravado sempre): quem repete a resposta não vira spam
    let timeAlreadyFlagged = false;
    if (timeOk === false) {
        try {
            timeAlreadyFlagged = (await prisma.workoutHistory.count({ where: { userId, timeOk: false, date: { gte: new Date(now.getTime() - 7 * 86400000) } } })) > 0;
        } catch (e) { console.error('Erro checando aviso de tempo:', e); }
    }

    // 🧾 (7 out 2026) o que o aluno disse dos exercícios sem registro (pulou / não fez / fez parte / fez sem marcar). Opcional; app antigo = null.
    const exerciseStatus = cleanExerciseStatus(body.exerciseStatus);

    let xpBase = 150; 
    let xpBonus = 0;
    
    // Calcula XP Bonus (Lógica simplificada para garantir funcionamento)
    if (exercises.length > 0) {
        xpBonus = exercises.length * 5; // 5 XP por exercício feito
    }

    const totalXp = xpBase + xpBonus;

    // Salva Histórico + XP do aluno JUNTOS (uma transação: se um falhar, o outro não fica pela metade, e uma nova tentativa com a mesma chave
    // não perde o XP). O índice único (userId, clientKey) segura dois pedidos idênticos chegando no mesmo instante.
    // 🔥 (17 set 2026) `include: { details: true }` — precisamos do id de volta
    // pra poder linkar o push de "comentário no exercício" direto pra essa
    // observação específica (ver bloco de notificação mais abaixo).
    let workoutHistoryRecord: any;
    let user: any;
    try {
        [workoutHistoryRecord, user] = await prisma.$transaction([
            prisma.workoutHistory.create({
                data: {
                    userId,
                    name: workoutName,
                    // 🔥 (1 out 2026) qual dia/ficha foi feito -- o feedback da semana usa pra dizer "faltou o Treino C"
                    day: dayClean,
                    workoutId: workoutIdClean,
                    clientKey,
                    timeOk,
                    timeNote,
                    ...(exerciseStatus ? { exerciseStatus: exerciseStatus as any } : {}),
                    xpEarned: totalXp,
                    duration: cleanDuration(duration),
                    rpe: rpe ? Number(rpe) : null,
                    feedback: feedback || null,
                    details: {
                        create: exercises.flatMap((ex: any) => {
                            // Pega a última série válida para registrar a carga final
                            const sets: any[] = Array.isArray(ex.sets) ? ex.sets : [];

                            // 🔥 Observação do aluno por exercício (opcional). Salva
                            // repetida em cada série do mesmo jeito que exerciseName já
                            // é -- na leitura (WorkoutLogCard.js) só olhamos a primeira
                            // ocorrência não-vazia por exercício.
                            const noteClean = ex.note ? String(ex.note).trim().slice(0, 500) : '';
                            // 🏋️ "como foi?" (FACIL / OK / PESADO), igual em todas as séries do exercício; vazio ou fora da lista = sem resposta (lib/loadSuggest.ts)
                            const effortClean = cleanEffort(ex.effort);

                            return sets.map((s: any) => ({
                                exerciseId: ex.exerciseId,
                                exerciseName: ex.name,
                                setNumber: s.index,
                                weight: cleanWeight(s.weight), // <--- USO DA FUNÇÃO DE LIMPEZA (sempre o TOTAL: "20 cada lado" já chega aqui como 40)
                                perSide: isPerSide(s),         // ⚖️ (3 out 2026) o aluno anotou "cada lado" (só para mostrar do jeito dele)
                                reps: String(s.reps || "0"),
                                // 🚴 cardio feito de verdade (cardio guiado ou digitado): tempo em segundos e calorias; nulo quando não é cardio
                                ...cleanCardio(s),
                                loggedAt: cleanLoggedAt(s.at, now),   // 🕒 quando a série foi marcada no app (nulo se o app não mandou)
                                note: noteClean || null,
                                effort: effortClean,
                            }));
                        })
                    }
                },
                include: { details: true }
            }),
            // Atualiza XP do Usuário e resgata dados do Treinador para Notificação
            prisma.user.update({
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
            }),
        ]);
    } catch (e: any) {
        // dois pedidos iguais chegaram juntos: o outro gravou primeiro -> devolve o resultado dele (sem gravar de novo)
        if (isUniqueViolation(e)) {
            const first = await findExistingFinish(prisma, { ...finishLookup, auto: false });
            if (first) return duplicateResponse(first);
        }
        throw e;
    }

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
        const noteDetail = workoutHistoryRecord.details.find((d: any) => d.note);

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
        // ⏱️ (7 out 2026) o coach passa a ver QUANTO TEMPO o aluno levou (minutos do cronômetro do treino), quando o app mandou
        const mins = cleanDuration(duration);
        let pushBody = `${displayName} finalizou o treino "${dayLabel}"${mins > 0 ? ` · ${mins} min` : ''}`;
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

        // ⏱️ (6 out 2026) Aluno avisou que NÃO deu tempo de fazer tudo: o aviso vira "sem tempo" (o toque abre o mesmo lugar de antes) e a pendência
        // aparece no A FAZER do coach. Só no 1º aviso dos últimos 7 dias; depois disso segue o aviso normal de treino concluído.
        if (timeOk === false && !timeAlreadyFlagged) {
            pushTitle = '⏱️ Sem tempo para terminar o treino';
            pushBody = timeNote
                ? `${displayName} (${dayLabel}): "${timeNote.slice(0, 100)}"`
                : `${displayName} finalizou "${dayLabel}", mas disse que não deu tempo de fazer tudo`;
            // 🧾 e já diz o que ficou de fora (só o que o aluno confirmou que pulou/não fez)
            const skippedNames = notDoneNames(exerciseStatus);
            if (skippedNames.length) pushBody = `${pushBody} · Não fez: ${skippedNames.slice(0, 3).join(', ')}${skippedNames.length > 3 ? ` +${skippedNames.length - 3}` : ''}`.slice(0, 220);
        }

        sendPushToUser(user.coach, pushTitle, pushBody, pushData).catch((pushError) => console.error("Erro ao enviar push de treino finalizado:", pushError));
    }

    await closeOpenSessions();

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