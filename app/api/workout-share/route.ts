// app/api/workout-share/route.ts
// 🔗 (2 out 2026) LINK DO TREINO EM PÁGINA -- lado do COACH (precisa de login):
//   POST   { workoutId, showName?, days?, expiresInDays }  cria um link  -> { share }
//   GET    ?workoutId=...                                  lista os links daquele treino + os dias que o treino salvo tem -> { shares, days }
//   DELETE ?code=... (ou { code })                         desativa um link (some na hora, o endereço deixa de abrir)
// A página que o aluno abre é a rota pública /api/treino-publico/[code]. Regras em lib/workoutShare.ts.
import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuth, canActAsCoach } from '@/lib/auth';
import { checkRateLimit } from '@/lib/rateLimit';
import { generateShareCode, parseShareOptions, computeExpiresAt, shareStatus, isValidShareCode } from '@/lib/workoutShare';

export const dynamic = 'force-dynamic';

const MAX_LINKS_PER_WORKOUT = 30;

const publicShare = (s: any) => ({
  code: s.code,
  workoutId: s.workoutId,
  showName: !!s.showName,
  days: Array.isArray(s.days) ? s.days : [],
  expiresAt: s.expiresAt ? new Date(s.expiresAt).toISOString() : null,
  revokedAt: s.revokedAt ? new Date(s.revokedAt).toISOString() : null,
  status: shareStatus(s),
  viewCount: s.viewCount || 0,
  lastViewedAt: s.lastViewedAt ? new Date(s.lastViewedAt).toISOString() : null,
  createdAt: s.createdAt ? new Date(s.createdAt).toISOString() : null,
});

// quem é o dono do treino e o coach do aluno; só esse coach (ou o time master) mexe nos links
async function loadWorkoutForCoach(auth: { user: any }, workoutId: string) {
  const workout = await prisma.workout.findUnique({ where: { id: workoutId }, select: { id: true, userId: true } });
  if (!workout) return { error: NextResponse.json({ error: 'Treino não encontrado.' }, { status: 404 }) };
  const owner = await prisma.user.findUnique({ where: { id: workout.userId }, select: { coachId: true } });
  if (!canActAsCoach(auth.user, owner?.coachId)) return { error: NextResponse.json({ error: 'Acesso negado.' }, { status: 403 }) };
  return { workout };
}

export async function POST(req: Request) {
  try {
    const auth = requireAuth(req);
    if ('response' in auth) return auth.response;
    const body = await req.json().catch(() => ({}));
    const workoutId = typeof body?.workoutId === 'string' ? body.workoutId : '';
    if (!workoutId) return NextResponse.json({ error: 'workoutId é obrigatório.' }, { status: 400 });

    const rl = checkRateLimit(`wshare-create:${auth.user.id}`, { max: 60, windowMs: 60 * 60 * 1000 });
    if (!rl.allowed) return NextResponse.json({ error: 'Muitos links criados em pouco tempo. Tente de novo em alguns minutos.' }, { status: 429 });

    const found = await loadWorkoutForCoach(auth, workoutId);
    if ('error' in found) return found.error;

    // dias que existem hoje no treino (o coach só pode escolher entre eles)
    const dayRows = await prisma.workoutExercise.findMany({ where: { workoutId }, select: { day: true } });
    const availableDays: string[] = Array.from(new Set(dayRows.map((r: any) => String(r.day))));
    if (availableDays.length === 0) return NextResponse.json({ error: 'Este treino ainda não tem exercícios salvos.' }, { status: 400 });

    const parsed = parseShareOptions(body, availableDays);
    if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });

    const existing = await prisma.workoutShare.count({ where: { workoutId, revokedAt: null } });
    if (existing >= MAX_LINKS_PER_WORKOUT) return NextResponse.json({ error: `Este treino já tem ${MAX_LINKS_PER_WORKOUT} links ativos. Desative algum antes de criar outro.` }, { status: 400 });

    const { showName, days, expiresInDays } = parsed.value;
    let share: any = null;
    for (let attempt = 0; attempt < 5 && !share; attempt++) {                       // código repetido é raríssimo; tenta de novo
      try {
        share = await prisma.workoutShare.create({
          data: { code: generateShareCode(), workoutId, createdById: auth.user.id, showName, days, expiresAt: computeExpiresAt(expiresInDays) },
        });
      } catch (e: any) { if (e?.code !== 'P2002') throw e; }
    }
    if (!share) return NextResponse.json({ error: 'Não foi possível gerar o link. Tente de novo.' }, { status: 500 });
    return NextResponse.json({ share: publicShare(share) }, { status: 201 });
  } catch (error) {
    console.error('Erro POST workout-share:', error);
    return NextResponse.json({ error: 'Erro ao criar o link.' }, { status: 500 });
  }
}

export async function GET(req: Request) {
  try {
    const auth = requireAuth(req);
    if ('response' in auth) return auth.response;
    const workoutId = new URL(req.url).searchParams.get('workoutId') || '';
    if (!workoutId) return NextResponse.json({ error: 'workoutId é obrigatório.' }, { status: 400 });
    const found = await loadWorkoutForCoach(auth, workoutId);
    if ('error' in found) return found.error;
    const shares = await prisma.workoutShare.findMany({ where: { workoutId }, orderBy: { createdAt: 'desc' }, take: 50 });
    // dias que o treino SALVO tem hoje (a tela do coach oferece só esses na escolha de dias), na ordem da primeira aparição
    const dayRows = await prisma.workoutExercise.findMany({ where: { workoutId }, select: { day: true }, orderBy: { order: 'asc' } });
    const days: string[] = [];
    dayRows.forEach((r: any) => { const d = String(r.day); if (!days.includes(d)) days.push(d); });
    return NextResponse.json({ shares: shares.map(publicShare), days });
  } catch (error) {
    console.error('Erro GET workout-share:', error);
    return NextResponse.json({ error: 'Erro ao listar os links.' }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    const auth = requireAuth(req);
    if ('response' in auth) return auth.response;
    let code = new URL(req.url).searchParams.get('code') || '';
    if (!code) { const body = await req.json().catch(() => ({})); code = typeof body?.code === 'string' ? body.code : ''; }
    if (!isValidShareCode(code)) return NextResponse.json({ error: 'Código inválido.' }, { status: 400 });

    const share = await prisma.workoutShare.findUnique({ where: { code } });
    if (!share) return NextResponse.json({ error: 'Link não encontrado.' }, { status: 404 });
    const found = await loadWorkoutForCoach(auth, share.workoutId);
    if ('error' in found) return found.error;

    const updated = share.revokedAt ? share : await prisma.workoutShare.update({ where: { code }, data: { revokedAt: new Date() } });
    return NextResponse.json({ share: publicShare(updated) });
  } catch (error) {
    console.error('Erro DELETE workout-share:', error);
    return NextResponse.json({ error: 'Erro ao desativar o link.' }, { status: 500 });
  }
}
