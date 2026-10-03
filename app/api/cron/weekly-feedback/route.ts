// app/api/cron/weekly-feedback/route.ts
// ⏰ Aciona as tarefas agendadas do feedback da semana (ver lib/weeklyCron.ts). Quem chama é um Cron Job do Render (curl), não o app.
//   POST/GET /api/cron/weekly-feedback?task=auto|students|reminder|coaches|challenge
//   (auto = um agendamento diário só: segunda monta as perguntas e manda aos alunos, terça o resumo ao coach, quarta o lembrete)
//   Autenticação: cabeçalho "Authorization: Bearer <CRON_SECRET>" (variável de ambiente CRON_SECRET no Render). Sem a variável, a rota fica DESLIGADA (503).
import { NextResponse } from 'next/server';
import { timingSafeEqual } from 'crypto';
import prisma from '@/lib/prisma';
import { sendPushToUser, sendPushToUsers } from '@/app/utils/sendNotification';
import { runWeeklyTask, prepareQuestionSets } from '@/lib/weeklyCron';
import { ensureQuestionSet } from '@/lib/weeklyQuestionSet';
import { feedbackAiOptions } from '@/lib/aiAccess';
import { isMissingTable } from '@/lib/weeklyFeedback';
import { runChallengeMorning } from '@/lib/challengeCron';

export const dynamic = 'force-dynamic';

function authorized(req: Request, secret: string) {
  const got = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '') || req.headers.get('x-cron-secret') || '';
  const a = Buffer.from(got), b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}

async function handle(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: 'Cron desligado: defina CRON_SECRET no ambiente.' }, { status: 503 });
  if (!authorized(req, secret)) return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 });

  const task = new URL(req.url).searchParams.get('task') || '';
  if (!['auto', 'students', 'reminder', 'coaches', 'challenge'].includes(task)) return NextResponse.json({ error: 'task deve ser auto, students, reminder, coaches ou challenge.' }, { status: 400 });
  // 🔥 (3 out 2026) Lembrete diário do desafio de 21 dias (lib/challengeCron.ts): vai junto com o agendamento diário (auto) ou sozinho (challenge).
  // Nunca derruba o feedback da semana: se falhar, só aparece no log.
  const challengeStep = async () => {
    try { return await runChallengeMorning({ db: prisma, sendToUser: sendPushToUser }); }
    catch (e: any) { console.error('Erro cron desafio 21 dias:', e); return { error: String(e?.message || e) }; }
  };
  if (task === 'challenge') return NextResponse.json({ ok: true, challenge: await challengeStep() });
  // roda ANTES do feedback da semana e separado dele: se o feedback falhar (ex.: tabela ainda não criada), o lembrete do desafio sai do mesmo jeito
  const challenge = task === 'auto' ? await challengeStep() : undefined;
  try {
    const result = await runWeeklyTask(task, {
      db: prisma, sendToUsers: sendPushToUsers, sendToUser: sendPushToUser,
      // segunda: deixa as perguntas de cada aluno prontas (dados reais + IA) antes do push; o que não der tempo é montado na 1ª abertura do card
      prepareQuestions: (students, weekStart, now) => prepareQuestionSets(students, weekStart, now, {
        ensure: async (s) => ensureQuestionSet(prisma, s, { weekStart, now, ai: await feedbackAiOptions(prisma, s.coachId, { timeoutMs: 15000, maxRetries: 1 }) }),
      }),
    });
    return NextResponse.json({ ok: true, ...result, ...(challenge ? { challenge } : {}) });
  } catch (e: any) {
    if (isMissingTable(e)) return NextResponse.json({ ok: false, error: 'Tabela WeeklyFeedback ainda não existe: rode "npx prisma db push".' }, { status: 503 });
    console.error('Erro cron weekly-feedback:', e);
    return NextResponse.json({ ok: false, error: 'Erro ao executar a tarefa.' }, { status: 500 });
  }
}

export const GET = handle;
export const POST = handle;
