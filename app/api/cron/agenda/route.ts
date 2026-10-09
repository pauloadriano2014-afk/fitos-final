// app/api/cron/agenda/route.ts
// ⏰ (6 out 2026) Avisos da agenda (ver lib/agendaCron.ts). Quem chama é um Cron Job do Render (curl) a cada 5 minutos, não o app.
//   POST/GET /api/cron/agenda?task=all|reminders|summary|workouts|videos   (padrão all; workouts = lembrar o aluno de finalizar o treino; videos = varredura dos vídeos de execução:
//   confirma envios, descarta os parados e apaga os de mais de 90 dias)
//   Autenticação: "Authorization: Bearer <CRON_SECRET>". Sem a variável no ambiente, a rota fica DESLIGADA (503).
import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { checkCron } from '@/lib/cronAuth';
import { sendPushToUser } from '@/app/utils/sendNotification';
import { runAgendaCron } from '@/lib/agendaCron';
import { isMissingTable } from '@/lib/agendaStore';
import { cfConfig } from '@/lib/videoStream';
import { sweepExecVideos } from '@/lib/execVideoService';

export const dynamic = 'force-dynamic';

async function handle(req: Request) {
  const denied = checkCron(req);
  if (denied) return denied;
  const task = new URL(req.url).searchParams.get('task') || 'all';
  if (!['all', 'reminders', 'summary', 'workouts', 'videos'].includes(task)) return NextResponse.json({ error: 'task deve ser all, reminders, summary, workouts ou videos.' }, { status: 400 });
  try {
    const base: any = task === 'videos' ? {} : await runAgendaCron(task, { db: prisma, sendToUser: sendPushToUser });
    let videos: any = undefined;
    if (task === 'all' || task === 'videos') {
      try { videos = await sweepExecVideos(prisma, cfConfig()); }
      catch (e: any) { if (!isMissingTable(e)) console.error('Erro varredura de vídeos:', e?.message || e); }
    }
    return NextResponse.json({ ok: true, ...base, ...(videos ? { videos } : {}) });
  } catch (e: any) {
    if (isMissingTable(e)) return NextResponse.json({ ok: false, skipped: 'tabelas da agenda ainda não criadas (npx prisma db push)' });
    console.error('Erro cron agenda:', e);
    return NextResponse.json({ error: 'Erro ao rodar a agenda.' }, { status: 500 });
  }
}
export async function GET(req: Request) { return handle(req); }
export async function POST(req: Request) { return handle(req); }
