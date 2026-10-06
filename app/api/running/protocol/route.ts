// app/api/running/protocol/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth, canActAsCoach } from '@/lib/auth';
import { PLAN_META, PLAN_TYPES, clampWeek, eligibleTypes, firstWeekOfBlock, normalizeTrainingDays, sanitizeSpeeds } from '@/lib/runningPlans';
import { initialPersisted } from '@/lib/runningProgress';
import { persistData } from '@/lib/runningStore';
import { notifyStudentProtocol } from '@/lib/runningNotify';

const MAX_TEXT = 2000;

/** Texto opcional: undefined = não veio; null = limpar; string = valor (cortado). ok:false = inválido. */
function text(v: any): { ok: true; value: string | null | undefined } | { ok: false } {
  if (v === undefined) return { ok: true, value: undefined };
  if (v === null) return { ok: true, value: null };
  if (typeof v !== 'string') return { ok: false };
  const t = v.trim();
  return { ok: true, value: t ? t.slice(0, MAX_TEXT) : null };
}

/** Só o coach dono do aluno (ou o time master) mexe no protocolo dele. Devolve a resposta de erro, ou null se pode. */
async function guard(req: NextRequest, userId: any): Promise<NextResponse | null> {
  if (!userId || typeof userId !== 'string') return NextResponse.json({ error: 'userId obrigatório' }, { status: 400 });
  const auth = requireAuth(req);
  if ('response' in auth) return auth.response;
  const targetUser = await prisma.user.findUnique({ where: { id: userId }, select: { coachId: true } });
  if (!targetUser) return NextResponse.json({ error: 'Aluno não encontrado.' }, { status: 404 });
  if (!canActAsCoach(auth.user, targetUser.coachId)) return NextResponse.json({ error: 'Acesso negado.' }, { status: 403 });
  return null;
}

// POST — o coach confirma e ativa um protocolo NOVO (o anterior é desativado e o andamento recomeça na semana de entrada).
// 🏃 (6 out 2026) Agora grava o TIPO (5K/10K/21K/42K), os dias de treino e o andamento inicial. O bloco é sempre o da semana de entrada (antes bloco e semana
// podiam ser escolhidos separados e se contradizer). Aluno não ativa protocolo nem para ele mesmo.
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== 'object') return NextResponse.json({ error: 'Corpo inválido.' }, { status: 400 });
    const { userId, generatedByAI, aiPromptSnapshot } = body;

    const denied = await guard(req, userId);
    if (denied) return denied;

    if (body.protocolType !== undefined && !PLAN_TYPES.includes(body.protocolType)) {
      return NextResponse.json({ error: `protocolType deve ser ${PLAN_TYPES.join(', ')}.` }, { status: 400 });
    }
    const type = (body.protocolType || '5K') as (typeof PLAN_TYPES)[number];

    let startWeek = 1;
    if (body.startWeek !== undefined && body.startWeek !== null) {
      const n = Number(body.startWeek);
      if (!Number.isInteger(n) || n < 1 || n > PLAN_META[type].weeks) return NextResponse.json({ error: `A semana de entrada do ${type} vai de 1 a ${PLAN_META[type].weeks}.` }, { status: 400 });
      startWeek = n;
    } else if (body.startBlock !== undefined && body.startBlock !== null) {
      startWeek = firstWeekOfBlock(type, body.startBlock);   // app antigo: só mandava o bloco
    }

    const days = normalizeTrainingDays(body.trainingDays);
    if (days === null) return NextResponse.json({ error: 'Os dias de treino devem ser 3 dias diferentes (SEG a DOM) ou ficar em branco.' }, { status: 400 });

    let speeds: any = null;
    if (body.customSpeeds !== undefined && body.customSpeeds !== null) {
      speeds = sanitizeSpeeds(body.customSpeeds);
      if (!speeds) return NextResponse.json({ error: 'Velocidades inválidas: z2 < z3 < z4 < z5, entre 4 e 20 km/h.' }, { status: 400 });
    }
    const customNotes = text(body.customNotes), adaptations = text(body.adaptations);
    if (!customNotes.ok || !adaptations.ok) return NextResponse.json({ error: 'As observações devem ser texto.' }, { status: 400 });

    // aviso (não bloqueia): o histórico da aluna sustenta esse protocolo?
    const warnings: string[] = [];
    if (type !== '5K') {
      const anamnese = await prisma.runningAnamnese.findUnique({ where: { userId } });
      if (!anamnese || !anamnese.filled) warnings.push(`Sem anamnese preenchida: não deu para conferir se a aluna tem base para o ${type}.`);
      else if (!eligibleTypes(anamnese).includes(type)) warnings.push(`Pela anamnese, a aluna ainda não tem base para o ${type}. Confira antes de liberar.`);
    }

    // desativa os anteriores
    const replaced = await prisma.runningProtocol.updateMany({ where: { userId, isActive: true }, data: { isActive: false } });

    const now = new Date();
    const protocol = await prisma.runningProtocol.create({
      data: {
        userId,
        name: PLAN_META[type].label,
        protocolType: type,
        trainingDays: days,
        startBlock: PLAN_META[type].blocks.findIndex(([a, b]) => clampWeek(type, startWeek) >= a && clampWeek(type, startWeek) <= b) + 1,
        startWeek,
        customSpeeds: speeds ?? undefined,
        adaptations: adaptations.value ?? null,
        customNotes: customNotes.value ?? null,
        generatedByAI: !!generatedByAI,
        aiPromptSnapshot: generatedByAI && typeof aiPromptSnapshot === 'string' ? aiPromptSnapshot.slice(0, 20000) : null,
        startDate: now,
        isActive: true,
        ...persistData(initialPersisted(type, startWeek, now)),
      },
    });

    // 🔔 avisa a aluna que o protocolo (ou o próximo desafio) está pronto; melhor esforço, não segura a resposta
    notifyStudentProtocol(prisma, userId, type, clampWeek(type, startWeek), days, !!(replaced && replaced.count > 0)).catch(() => {});

    return NextResponse.json({ success: true, protocol, warnings });

  } catch (error) {
    console.error('[running-protocol-post]', error);
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
  }
}

// PATCH — ajustes no protocolo ATIVO sem recomeçar: observações, adaptações, velocidades e dias de treino. O andamento da aluna não muda.
export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== 'object') return NextResponse.json({ error: 'Corpo inválido.' }, { status: 400 });
    const denied = await guard(req, body.userId);
    if (denied) return denied;

    const data: any = {};
    if (body.customNotes !== undefined) { const t = text(body.customNotes); if (!t.ok) return NextResponse.json({ error: 'As observações devem ser texto.' }, { status: 400 }); data.customNotes = t.value; }
    if (body.adaptations !== undefined) { const t = text(body.adaptations); if (!t.ok) return NextResponse.json({ error: 'As adaptações devem ser texto.' }, { status: 400 }); data.adaptations = t.value; }
    if (body.customSpeeds !== undefined) {
      if (body.customSpeeds === null) data.customSpeeds = null;   // volta às velocidades padrão
      else { const sp = sanitizeSpeeds(body.customSpeeds); if (!sp) return NextResponse.json({ error: 'Velocidades inválidas: z2 < z3 < z4 < z5, entre 4 e 20 km/h.' }, { status: 400 }); data.customSpeeds = sp; }
    }
    if (body.trainingDays !== undefined) {
      const days = normalizeTrainingDays(body.trainingDays);
      if (days === null) return NextResponse.json({ error: 'Os dias de treino devem ser 3 dias diferentes (SEG a DOM) ou ficar em branco.' }, { status: 400 });
      data.trainingDays = days;
    }
    if (!Object.keys(data).length) return NextResponse.json({ error: 'Nada para ajustar.' }, { status: 400 });

    const active = await prisma.runningProtocol.findFirst({ where: { userId: body.userId, isActive: true }, orderBy: { createdAt: 'desc' } });
    if (!active) return NextResponse.json({ error: 'O aluno não tem protocolo ativo.' }, { status: 404 });
    const protocol = await prisma.runningProtocol.update({ where: { id: active.id }, data });
    return NextResponse.json({ success: true, protocol });

  } catch (error) {
    console.error('[running-protocol-patch]', error);
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
  }
}
