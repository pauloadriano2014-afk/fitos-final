// app/api/cron/agenda/route.ts
// ⏰ (6 out 2026) Avisos da agenda (ver lib/agendaCron.ts). Quem chama é um Cron Job do Render (curl) a cada 5 minutos, não o app.
//   POST/GET /api/cron/agenda?task=all|reminders|summary|workouts   (padrão all; workouts = lembrar o aluno de finalizar o treino)
//   Autenticação: "Authorization: Bearer <CRON_SECRET>". Sem a variável no ambiente, a rota fica DESLIGADA (503).
import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { checkCron } from '@/lib/cronAuth';
import { sendPushToUser } from '@/app/utils/sendNotification';
import { runAgendaCron } from '@/lib/agendaCron';
import { isMissingTable } from '@/lib/agendaStore';

export const dynamic = 'force-dynamic';

async function handle(req: Request) {
  const denied = checkCron(req);
  if (denied) return denied;
  const task = new URL(req.url).searchParams.get('task') || 'all';
  if (!['all', 'reminders', 'summary', 'workouts'].includes(task)) return NextResponse.json({ error: 'task deve ser all, reminders, summary ou workouts.' }, { status: 400 });
  try {
    return NextResponse.json({ ok: true, ...(await runAgendaCron(task, { db: prisma, sendToUser: sendPushToUser })) });
  } catch (e: any) {
    if (isMissingTable(e)) return NextResponse.json({ ok: false, skipped: 'tabelas da agenda ainda não criadas (npx prisma db push)' });
    console.error('Erro cron agenda:', e);
    return NextResponse.json({ error: 'Erro ao rodar a agenda.' }, { status: 500 });
  }
}
export async function GET(req: Request) { return handle(req); }
export async function POST(req: Request) { return handle(req); }
