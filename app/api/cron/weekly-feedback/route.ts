// app/api/cron/weekly-feedback/route.ts
// ⏰ Aciona as tarefas agendadas do feedback da semana (ver lib/weeklyCron.ts). Quem chama é um Cron Job do Render (curl), não o app.
//   POST/GET /api/cron/weekly-feedback?task=auto|students|reminder|coaches
//   (auto = um agendamento diário só: segunda monta as perguntas e manda aos alunos, terça o resumo ao coach, quarta o lembrete)
//   Autenticação: cabeçalho "Authorization: Bearer <CRON_SECRET>" (variável de ambiente CRON_SECRET no Render). Sem a variável, a rota fica DESLIGADA (503).
import { NextResponse } from 'next/server';
import { timingSafeEqual } from 'crypto';
import prisma from '@/lib/prisma';
import { sendPushToUser, sendPushToUsers } from '@/app/utils/sendNotification';
import { runWeeklyTask, prepareQuestionSets } from '@/lib/weeklyCron';
import { ensureQuestionSet } from '@/lib/weeklyQuestionSet';
import { isMissingTable } from '@/lib/weeklyFeedback';

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
  if (!['auto', 'students', 'reminder', 'coaches'].includes(task)) return NextResponse.json({ error: 'task deve ser auto, students, reminder ou coaches.' }, { status: 400 });
  try {
    const result = await runWeeklyTask(task, {
      db: prisma, sendToUsers: sendPushToUsers, sendToUser: sendPushToUser,
      // segunda: deixa as perguntas de cada aluno prontas (dados reais + IA) antes do push; o que não der tempo é montado na 1ª abertura do card
      prepareQuestions: (students, weekStart, now) => prepareQuestionSets(students, weekStart, now, {
        ensure: (s) => ensureQuestionSet(prisma, s, { weekStart, now, ai: { timeoutMs: 15000, maxRetries: 1 } }),
      }),
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (e: any) {
    if (isMissingTable(e)) return NextResponse.json({ ok: false, error: 'Tabela WeeklyFeedback ainda não existe: rode "npx prisma db push".' }, { status: 503 });
    console.error('Erro cron weekly-feedback:', e);
    return NextResponse.json({ ok: false, error: 'Erro ao executar a tarefa.' }, { status: 500 });
  }
}

export const GET = handle;
export const POST = handle;
