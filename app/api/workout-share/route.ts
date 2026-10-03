// app/api/workout-share/route.ts
// 🔗 (2 out 2026) LINK DO TREINO EM PÁGINA -- lado do COACH (precisa de login). O link aponta para o treino salvo de um ALUNO (workoutId)
// ou para um treino AVULSO do coach (quickWorkoutId, ver /api/quick-workout):
//   POST   { workoutId | quickWorkoutId, showName?, displayName?, days?, expiresInHours | expiresInDays }   cria um link  -> { share }
//   GET    ?workoutId=... | ?quickWorkoutId=...   lista os links daquele treino + os dias que ele tem hoje -> { shares, days }
//   PATCH  { code, extendHours }                   renova: soma horas ao tempo que falta (ou a partir de agora, se já venceu) -> { share }
//   DELETE ?code=... (ou { code })                desativa um link (some na hora, o endereço deixa de abrir)
// A página que o aluno abre é a rota pública /api/treino-publico/[code]. Regras em lib/workoutShare.ts.
import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuth, canActAsCoach } from '@/lib/auth';
import { checkRateLimit } from '@/lib/rateLimit';
import { generateShareCode, parseShareOptions, computeExpiresAt, shareStatus, isValidShareCode, parseQuickData, quickAvailableDays, parseRenewBody, renewExpiry } from '@/lib/workoutShare';

export const dynamic = 'force-dynamic';

const MAX_LINKS_PER_WORKOUT = 30;

const publicShare = (s: any) => ({
  code: s.code,
  workoutId: s.workoutId || null,
  quickWorkoutId: s.quickWorkoutId || null,
  showName: !!s.showName,
  displayName: s.displayName || null,
  days: Array.isArray(s.days) ? s.days : [],
  expiresAt: s.expiresAt ? new Date(s.expiresAt).toISOString() : null,
  revokedAt: s.revokedAt ? new Date(s.revokedAt).toISOString() : null,
  status: shareStatus(s),
  viewCount: s.viewCount || 0,
  lastViewedAt: s.lastViewedAt ? new Date(s.lastViewedAt).toISOString() : null,
  createdAt: s.createdAt ? new Date(s.createdAt).toISOString() : null,
  notifyOpen: !!s.notifyOpen,
  notifyDone: !!s.notifyDone,
  doneCount: s.doneCount || 0,
  lastDoneAt: s.lastDoneAt ? new Date(s.lastDoneAt).toISOString() : null,
});

type Target = { kind: 'workout'; id: string } | { kind: 'quick'; id: string };

// o alvo do link: treino de aluno (só o coach do aluno ou o time master) ou treino avulso (só o dono ou o time master)
async function loadTarget(auth: { user: any }, t: Target) {
  if (t.kind === 'quick') {
    const quick = await prisma.quickWorkout.findUnique({ where: { id: t.id }, select: { id: true, coachId: true, data: true } });
    if (!quick) return { error: NextResponse.json({ error: 'Treino avulso não encontrado.' }, { status: 404 }) };
    if (!canActAsCoach(auth.user, quick.coachId)) return { error: NextResponse.json({ error: 'Acesso negado.' }, { status: 403 }) };
    const parsed = parseQuickData(quick.data);
    return { availableDays: parsed.ok ? quickAvailableDays(parsed.days) : [] };
  }
  const workout = await prisma.workout.findUnique({ where: { id: t.id }, select: { id: true, userId: true } });
  if (!workout) return { error: NextResponse.json({ error: 'Treino não encontrado.' }, { status: 404 }) };
  const owner = await prisma.user.findUnique({ where: { id: workout.userId }, select: { coachId: true } });
  if (!canActAsCoach(auth.user, owner?.coachId)) return { error: NextResponse.json({ error: 'Acesso negado.' }, { status: 403 }) };
  // dias que existem hoje no treino salvo, na ordem do treino (o coach só pode escolher entre eles)
  const dayRows = await prisma.workoutExercise.findMany({ where: { workoutId: t.id }, select: { day: true }, orderBy: { order: 'asc' } });
  const availableDays: string[] = [];
  dayRows.forEach((r: any) => { const d = String(r.day); if (!availableDays.includes(d)) availableDays.push(d); });
  return { availableDays };
}

const whereShare = (t: Target) => (t.kind === 'quick' ? { quickWorkoutId: t.id } : { workoutId: t.id });

function targetFrom(src: { workoutId?: unknown; quickWorkoutId?: unknown }): Target | null {
  const w = typeof src.workoutId === 'string' ? src.workoutId : '';
  const q = typeof src.quickWorkoutId === 'string' ? src.quickWorkoutId : '';
  if (!!w === !!q) return null;                                   // exatamente um dos dois
  return w ? { kind: 'workout', id: w } : { kind: 'quick', id: q };
}

export async function POST(req: Request) {
  try {
    const auth = requireAuth(req);
    if ('response' in auth) return auth.response;
    const body = await req.json().catch(() => ({}));
    const target = targetFrom(body || {});
    if (!target) return NextResponse.json({ error: 'Informe workoutId ou quickWorkoutId (um só).' }, { status: 400 });

    const rl = checkRateLimit(`wshare-create:${auth.user.id}`, { max: 60, windowMs: 60 * 60 * 1000 });
    if (!rl.allowed) return NextResponse.json({ error: 'Muitos links criados em pouco tempo. Tente de novo em alguns minutos.' }, { status: 429 });

    const found = await loadTarget(auth, target);
    if ('error' in found) return found.error;
    const availableDays = found.availableDays;
    if (availableDays.length === 0) return NextResponse.json({ error: 'Este treino ainda não tem exercícios salvos.' }, { status: 400 });

    const parsed = parseShareOptions(body, availableDays);
    if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
    // treino avulso não tem aluno: para mostrar o nome, o coach precisa digitar um
    if (target.kind === 'quick' && parsed.value.showName && !parsed.value.displayName) return NextResponse.json({ error: 'Digite o nome que vai aparecer na página.' }, { status: 400 });

    const existing = await prisma.workoutShare.count({ where: { ...whereShare(target), revokedAt: null } });
    if (existing >= MAX_LINKS_PER_WORKOUT) return NextResponse.json({ error: `Este treino já tem ${MAX_LINKS_PER_WORKOUT} links ativos. Desative algum antes de criar outro.` }, { status: 400 });

    const { showName, displayName, days, expiresInHours, notifyOpen, notifyDone } = parsed.value;
    let share: any = null;
    for (let attempt = 0; attempt < 5 && !share; attempt++) {                       // código repetido é raríssimo; tenta de novo
      try {
        share = await prisma.workoutShare.create({
          data: { code: generateShareCode(), ...whereShare(target), createdById: auth.user.id, showName, displayName, days, notifyOpen, notifyDone, expiresAt: computeExpiresAt(expiresInHours) },
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
    const sp = new URL(req.url).searchParams;
    const target = targetFrom({ workoutId: sp.get('workoutId') || '', quickWorkoutId: sp.get('quickWorkoutId') || '' });
    if (!target) return NextResponse.json({ error: 'Informe workoutId ou quickWorkoutId (um só).' }, { status: 400 });
    const found = await loadTarget(auth, target);
    if ('error' in found) return found.error;
    const shares = await prisma.workoutShare.findMany({ where: whereShare(target), orderBy: { createdAt: 'desc' }, take: 50 });
    return NextResponse.json({ shares: shares.map(publicShare), days: found.availableDays });
  } catch (error) {
    console.error('Erro GET workout-share:', error);
    return NextResponse.json({ error: 'Erro ao listar os links.' }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  try {
    const auth = requireAuth(req);
    if ('response' in auth) return auth.response;
    const parsed = parseRenewBody(await req.json().catch(() => ({})));
    if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
    if (!checkRateLimit(`wshare-renew:${auth.user.id}`, { max: 120, windowMs: 60 * 60 * 1000 }).allowed) return NextResponse.json({ error: 'Muitas renovações em pouco tempo. Tente de novo em alguns minutos.' }, { status: 429 });

    const share = await prisma.workoutShare.findUnique({ where: { code: parsed.code } });
    if (!share) return NextResponse.json({ error: 'Link não encontrado.' }, { status: 404 });
    const target: Target | null = share.quickWorkoutId ? { kind: 'quick', id: share.quickWorkoutId } : share.workoutId ? { kind: 'workout', id: share.workoutId } : null;
    if (!target) return NextResponse.json({ error: 'Link não encontrado.' }, { status: 404 });
    const found = await loadTarget(auth, target);
    if ('error' in found) return found.error;

    if (share.revokedAt) return NextResponse.json({ error: 'Este link foi desativado e não pode ser renovado. Crie um novo.' }, { status: 400 });
    const renewed = renewExpiry(share.expiresAt, parsed.extendHours);
    if (!renewed.ok) return NextResponse.json({ error: renewed.error }, { status: 400 });
    const updated = await prisma.workoutShare.update({ where: { code: parsed.code }, data: { expiresAt: renewed.expiresAt } });
    return NextResponse.json({ share: publicShare(updated) });
  } catch (error) {
    console.error('Erro PATCH workout-share:', error);
    return NextResponse.json({ error: 'Erro ao renovar o link.' }, { status: 500 });
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
    const target: Target | null = share.quickWorkoutId ? { kind: 'quick', id: share.quickWorkoutId } : share.workoutId ? { kind: 'workout', id: share.workoutId } : null;
    if (!target) return NextResponse.json({ error: 'Link não encontrado.' }, { status: 404 });
    const found = await loadTarget(auth, target);
    if ('error' in found) return found.error;

    const updated = share.revokedAt ? share : await prisma.workoutShare.update({ where: { code }, data: { revokedAt: new Date() } });
    return NextResponse.json({ share: publicShare(updated) });
  } catch (error) {
    console.error('Erro DELETE workout-share:', error);
    return NextResponse.json({ error: 'Erro ao desativar o link.' }, { status: 500 });
  }
}
