// lib/coachReplies.ts
// 💬 (1 out 2026) "Respostas do coach" que o ALUNO recebe. Antes a resposta do coach só existia como push (que some, e não chegava em
// quem não tinha o token registrado) e como texto escondido no "Histórico de treinos". Agora o sininho do aluno lista essas respostas
// como qualquer aviso: ficam até o aluno remover, acendem o ponto enquanto não abertas e levam ao treino certo.
//
// Três origens, todas viram o mesmo formato de "aviso" (id, title, content, date, ctaLabel, ctaRoute, ctaParams):
//   1. resposta/resolvido no FEEDBACK DO TREINO   -> WorkoutHistory (feedbackResolvedAt, coachReply, coachReplyAt)
//   2. resposta/resolvido numa OBSERVAÇÃO DE EXERCÍCIO do treino concluído -> ExerciseHistory (resolvedAt, coachReply, coachReplyAt)
//   3. resposta a uma observação enviada NA HORA (StudentAlert EXERCISE_NOTE) -> linha StudentAlert type COACH_REPLY do próprio aluno.
//      (Esse caso precisa existir porque a observação de um exercício sem série preenchida -- "não consegui fazer a esteira" -- nunca
//      vira ExerciseHistory, então não há onde gravar a resposta.) Sem coluna nova: reaproveita a tabela StudentAlert.
// O estado "lido/removido" fica no aparelho do aluno (igual aos avisos do coach), por isso os ids são estáveis.

export const COACH_REPLY_TYPE = 'COACH_REPLY';
const MAX_REPLIES = 20;
const QUOTE_MAX = 140;

export type ReplyItem = {
  id: string;
  kind: 'REPLY';
  title: string;
  content: string;
  date: string;
  imageUrl: null;
  ctaLabel: string | null;
  ctaRoute: string | null;
  ctaParams: Record<string, string> | null;
};

const iso = (d: Date | string | null | undefined) => (d ? new Date(d).toISOString() : '');
const quote = (t?: string | null) => {
  const s = (t || '').trim();
  return s ? `\n\nVocê escreveu: "${s.length > QUOTE_MAX ? s.slice(0, QUOTE_MAX) + '…' : s}"` : '';
};

/** Itens vindos do histórico de treinos (origens 1 e 2). `histories`: WorkoutHistory com `details` já filtrado às observações resolvidas. */
export function replyItemsFromHistory(histories: any[] | null | undefined): ReplyItem[] {
  const out: ReplyItem[] = [];
  for (const h of histories || []) {
    const workoutLabel = h.workoutName || h.name || 'treino';
    if (h.coachReplyAt || h.feedbackResolvedAt) {
      const reply = (h.coachReply || '').trim();
      out.push({
        id: `reply-w-${h.id}`,
        kind: 'REPLY',
        title: reply ? `💬 Seu coach respondeu seu feedback do treino "${workoutLabel}"` : `✅ Seu coach viu seu feedback do treino "${workoutLabel}"`,
        content: (reply || 'Seu coach leu seu comentário sobre o treino e já era o que precisava.') + quote(h.feedback),
        date: iso(h.coachReplyAt || h.feedbackResolvedAt),
        imageUrl: null,
        ctaLabel: 'VER NO HISTÓRICO',
        ctaRoute: 'UserHistory',
        ctaParams: { highlightWorkoutHistoryId: h.id },
      });
    }
    for (const d of h.details || []) {
      if (!d.resolvedAt && !d.coachReplyAt) continue;
      const reply = (d.coachReply || '').trim();
      out.push({
        id: `reply-e-${d.id}`,
        kind: 'REPLY',
        title: reply ? `💬 Seu coach respondeu sobre "${d.exerciseName}"` : `✅ Seu coach viu seu comentário em "${d.exerciseName}"`,
        content: (reply || 'Seu coach leu sua observação e já era o que precisava.') + quote(d.note),
        date: iso(d.coachReplyAt || d.resolvedAt),
        imageUrl: null,
        ctaLabel: 'VER NO HISTÓRICO',
        ctaRoute: 'UserHistory',
        ctaParams: { highlightWorkoutHistoryId: h.id, highlightExerciseHistoryId: d.id },
      });
    }
  }
  return out;
}

/** Itens vindos das respostas a observações enviadas na hora (origem 3): StudentAlert type COACH_REPLY do aluno. */
export function replyItemsFromAlerts(alerts: any[] | null | undefined): ReplyItem[] {
  return (alerts || []).map((a) => ({
    id: `reply-a-${a.id}`,
    kind: 'REPLY' as const,
    title: a.title || '💬 Seu coach respondeu',
    content: String(a.message || ''),
    date: iso(a.createdAt),
    imageUrl: null,
    ctaLabel: null,
    ctaRoute: null,
    ctaParams: null,
  }));
}

/** Tudo junto: mais novo primeiro, no máximo 20. Nunca lança erro (a Home do aluno não pode cair por causa disso). */
export async function loadCoachReplies(db: any, userId: string): Promise<ReplyItem[]> {
  let fromHistory: ReplyItem[] = [];
  let fromAlerts: ReplyItem[] = [];
  try {
    const histories = await db.workoutHistory.findMany({
      where: { userId },
      orderBy: { date: 'desc' },
      take: 60,
      select: {
        id: true, name: true, workoutName: true, feedback: true, feedbackResolvedAt: true, coachReply: true, coachReplyAt: true,
        details: {
          where: { resolvedAt: { not: null } },
          select: { id: true, exerciseName: true, note: true, resolvedAt: true, coachReply: true, coachReplyAt: true },
        },
      },
    });
    fromHistory = replyItemsFromHistory(histories);
  } catch (e: any) {
    console.error('[coachReplies] histórico indisponível:', e?.message || e);
  }
  try {
    const alerts = await db.studentAlert.findMany({
      where: { userId, type: COACH_REPLY_TYPE },
      orderBy: { createdAt: 'desc' },
      take: MAX_REPLIES,
    });
    fromAlerts = replyItemsFromAlerts(alerts);
  } catch (e: any) {
    console.error('[coachReplies] respostas às observações indisponíveis:', e?.message || e);
  }
  return [...fromHistory, ...fromAlerts]
    .filter((i) => i.date)
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    .slice(0, MAX_REPLIES);
}
