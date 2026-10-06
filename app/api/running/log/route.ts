// app/api/running/log/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth, canAccessStudent } from '@/lib/auth';
import { SESSION_KEYS } from '@/lib/runningPlans';
import { loadUserLogs, syncProgress } from '@/lib/runningStore';
import { notifyCoachProgress } from '@/lib/runningNotify';

const FREE = 'AVULSO';

/** Número opcional dentro de uma faixa: null se vier vazio, NaN se vier inválido. */
function num(v: any, min: number, max: number, int: boolean): number | null {
  if (v === undefined || v === null || v === '') return null;
  const n = Number(String(v).replace(',', '.'));
  if (!Number.isFinite(n) || n < min || n > max) return NaN;
  return int ? Math.round(n) : n;
}

// POST — registra uma corrida: um treino do protocolo (QUARTA/SEXTA/DOMINGO) ou uma corrida avulsa (AVULSO).
// 🏃 (6 out 2026) Quem manda na semana é o SERVIDOR: o treino do protocolo é carimbado com a semana/bloco atuais (o app não decide mais). A corrida avulsa salva
// mesmo sem protocolo ativo (antes o banco exigia protocolo e ela falhava). A resposta já traz o andamento novo.
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== 'object') return NextResponse.json({ error: 'Corpo inválido.' }, { status: 400 });
    const { userId, sessionDay, avgPace, notes } = body;

    if (!userId || !sessionDay) {
      return NextResponse.json({ error: 'userId e sessionDay são obrigatórios' }, { status: 400 });
    }
    const day = String(sessionDay).toUpperCase();
    const isFree = day === FREE;
    if (!isFree && !(SESSION_KEYS as readonly string[]).includes(day)) {
      return NextResponse.json({ error: 'sessionDay inválido.' }, { status: 400 });
    }

    // 🔒 Só o próprio aluno pode logar a corrida dele (ou o coach/master).
    const auth = requireAuth(req);
    if ('response' in auth) return auth.response;
    const targetUser = await prisma.user.findUnique({ where: { id: userId }, select: { coachId: true, name: true } });
    if (!canAccessStudent(auth.user, userId, targetUser?.coachId)) {
      return NextResponse.json({ error: 'Acesso negado.' }, { status: 403 });
    }

    const durationMinutes = num(body.durationMinutes, 1, 1440, true);
    const distanceKm = num(body.distanceKm, 0.1, 250, false);
    const rpe = num(body.rpe, 1, 10, true);
    if ([durationMinutes, distanceKm, rpe].some((n) => Number.isNaN(n))) {
      return NextResponse.json({ error: 'Duração, distância ou esforço (1 a 10) com valor inválido.' }, { status: 400 });
    }

    const protocol = await prisma.runningProtocol.findFirst({ where: { userId, isActive: true }, orderBy: { createdAt: 'desc' } });
    if (!isFree && !protocol) {
      return NextResponse.json({ error: 'Você não tem um protocolo de corrida ativo.' }, { status: 400 });
    }

    let week = 0, block = 0;
    let beforeView: any = null;
    if (protocol) {
      const before = await syncProgress(prisma, protocol, await loadUserLogs(prisma, userId));
      if (!isFree && before.view.status === 'COMPLETED') {
        return NextResponse.json({ error: 'Seu protocolo já foi concluído. Fale com seu coach para o próximo desafio.' }, { status: 400 });
      }
      week = before.view.week; block = before.view.block; beforeView = before.view;
    }

    const log = await prisma.runningLog.create({
      data: {
        userId,
        protocolId: protocol ? protocol.id : null,
        week,
        block,
        sessionDay: day,
        durationMinutes,
        distanceKm: distanceKm === null ? null : Math.round(distanceKm * 100) / 100,
        avgPace: avgPace ? String(avgPace).slice(0, 20) : null,
        notes: notes ? String(notes).slice(0, 1000) : null,
        rpe,
      },
    });

    let progress = null;
    if (protocol) {
      const after = await syncProgress(prisma, protocol, await loadUserLogs(prisma, userId));
      progress = after.view;
      // 🔔 o treino fechou a semana, repetiu, avançou ou concluiu o protocolo: avisa o coach (melhor esforço, só quando muda; corrida avulsa nunca muda)
      if (!isFree && beforeView && targetUser) {
        notifyCoachProgress(prisma, { id: userId, name: targetUser.name, coachId: targetUser.coachId }, beforeView, after.view, auth.user.id).catch(() => {});
      }
    }

    return NextResponse.json({ success: true, log, progress, currentWeek: progress ? progress.week : undefined, currentBlock: progress ? progress.block : undefined });

  } catch (error) {
    console.error('[running-log-post]', error);
    return NextResponse.json({ error: 'Erro interno no servidor' }, { status: 500 });
  }
}
