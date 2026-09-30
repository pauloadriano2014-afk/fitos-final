// app/api/food/[id]/portions/route.ts
// 🥄 (30 set 2026) Medidas caseiras de UM alimento.
//   GET    ?coachId=            -> medidas já resolvidas pra esse time (+ de onde veio cada uma)
//   PUT    {coachId, scope, portions, default?, remove?}  -> grava/ajusta medidas
//   DELETE ?coachId=&scope=&unit=  -> remove um ajuste (unit omitida = volta tudo ao padrão)
//
// scope 'team'   (padrão): o ajuste vale SÓ pro time de quem editou -- coach e nutri ajustam a própria
//                          versão sem afetar ninguém.
// scope 'global': vale pra todos. Só o time master pode.
import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuth, canActAsCoach, isMasterId } from '@/lib/auth';
import { legacyFor, normalizeUnitKey, resolvePortions, sanitizePortions, type PortionRow } from '@/lib/foodMeasures';

export const dynamic = 'force-dynamic';

const MASTER_TEAM = 'MASTER_TEAM';
const teamOf = (coachId: string) => (isMasterId(coachId) ? MASTER_TEAM : coachId);

const missingTable = (e: any) => e?.code === 'P2021' || e?.code === 'P2022' || /does not exist|relation .* does not exist/i.test(String(e?.message || ''));
const NOT_READY = () => NextResponse.json({ error: 'Medidas personalizadas ainda não ativadas no servidor. Tente novamente após a atualização.' }, { status: 503 });

async function load(id: string, coachId: string) {
  const food = await (prisma as any).food.findUnique({ where: { id }, select: { id: true, name: true, source: true, teamId: true } });
  if (!food) return { error: NextResponse.json({ error: 'Alimento não encontrado.' }, { status: 404 }) };
  const team = teamOf(coachId);
  // alimento CUSTOM de outro time não é visível pra esse coach
  if (food.source === 'CUSTOM' && food.teamId !== team) {
    return { error: NextResponse.json({ error: 'Acesso negado.' }, { status: 403 }) };
  }
  return { food, team };
}

async function resolved(food: { id: string; name: string }, team: string) {
  const rows = (await (prisma as any).foodPortion.findMany({
    where: { foodId: food.id, scope: { in: ['GLOBAL', team] } },
    select: { foodId: true, scope: true, unit: true, grams: true, isDefault: true, defaultAmount: true, source: true },
  })) as PortionRow[];
  const r = resolvePortions(rows, team, legacyFor(food));
  return { portions: r.portions, sources: r.sources, defaultPortion: r.defaultPortion };
}

export async function GET(req: Request, { params }: { params: { id: string } }) {
  try {
    const auth = requireAuth(req);
    if ('response' in auth) return auth.response;
    const coachId = new URL(req.url).searchParams.get('coachId') ?? auth.user.id;
    if (!canActAsCoach(auth.user, coachId)) return NextResponse.json({ error: 'Acesso negado.' }, { status: 403 });

    const l = await load(params.id, coachId);
    if ('error' in l) return l.error;
    try {
      return NextResponse.json({ ok: true, food: { id: l.food.id, name: l.food.name }, ...(await resolved(l.food, l.team)) });
    } catch (e: any) {
      if (missingTable(e)) {
        // tabela nova ainda não criada: devolve só as medidas antigas, sem erro
        const r = resolvePortions([], l.team, legacyFor(l.food));
        return NextResponse.json({ ok: true, food: { id: l.food.id, name: l.food.name }, portions: r.portions, sources: r.sources, defaultPortion: r.defaultPortion, readOnly: true });
      }
      throw e;
    }
  } catch (error: any) {
    console.error('[food/portions GET]', error?.message || error);
    return NextResponse.json({ error: 'Erro ao buscar as medidas.' }, { status: 500 });
  }
}

export async function PUT(req: Request, { params }: { params: { id: string } }) {
  try {
    const auth = requireAuth(req);
    if ('response' in auth) return auth.response;
    const body = await req.json().catch(() => ({}));
    const coachId: string = body?.coachId || auth.user.id;
    if (!canActAsCoach(auth.user, coachId)) return NextResponse.json({ error: 'Acesso negado.' }, { status: 403 });

    const isGlobal = body?.scope === 'global';
    if (isGlobal && !isMasterId(auth.user.id)) {
      return NextResponse.json({ error: 'Só o time master altera medidas globais.' }, { status: 403 });
    }

    const l = await load(params.id, coachId);
    if ('error' in l) return l.error;

    const scope = isGlobal ? 'GLOBAL' : l.team;
    const source = isGlobal ? 'MANUAL' : 'COACH';
    const toSet = sanitizePortions(body?.portions);
    const toRemove: string[] = (Array.isArray(body?.remove) ? body.remove : [])
      .map((u: unknown) => normalizeUnitKey(u)).filter((u: string | null): u is string => !!u && u !== 'g' && u !== 'ml');

    let def: { unit: string; amount: number } | null | undefined = undefined;   // undefined = não mexe
    if (body?.default === null) def = null;
    else if (body?.default && typeof body.default === 'object') {
      const u = normalizeUnitKey(body.default.unit);
      const a = parseFloat(String(body.default.amount).replace(',', '.'));
      if (u && u !== 'g' && u !== 'ml' && Number.isFinite(a) && a > 0 && a <= 5000) def = { unit: u, amount: a };
    }

    if (!Object.keys(toSet).length && !toRemove.length && def === undefined) {
      return NextResponse.json({ error: 'Nada para salvar.' }, { status: 400 });
    }

    try {
      await (prisma as any).$transaction(async (tx: any) => {
        for (const [unit, grams] of Object.entries(toSet)) {
          await tx.foodPortion.upsert({
            where: { foodId_scope_unit: { foodId: l.food.id, scope, unit } },
            update: { grams, source },
            create: { foodId: l.food.id, scope, unit, grams, source },
          });
        }
        if (toRemove.length) {
          await tx.foodPortion.deleteMany({ where: { foodId: l.food.id, scope, unit: { in: toRemove } } });
        }
        if (def !== undefined) {
          await tx.foodPortion.updateMany({ where: { foodId: l.food.id, scope }, data: { isDefault: false, defaultAmount: null } });
          if (def) {
            // a medida padrão precisa existir neste escopo; se só existe herdada, cria o ajuste com o mesmo valor
            const mine = await tx.foodPortion.findUnique({ where: { foodId_scope_unit: { foodId: l.food.id, scope, unit: def.unit } } });
            if (!mine) {
              const inherited = (await resolved(l.food, l.team)).portions[def.unit];
              if (!inherited) throw Object.assign(new Error('DEFAULT_WITHOUT_MEASURE'), { code: 'DEFAULT_WITHOUT_MEASURE' });
              await tx.foodPortion.create({ data: { foodId: l.food.id, scope, unit: def.unit, grams: inherited, source } });
            }
            await tx.foodPortion.update({
              where: { foodId_scope_unit: { foodId: l.food.id, scope, unit: def.unit } },
              data: { isDefault: true, defaultAmount: def.amount },
            });
          }
        }
      });
    } catch (e: any) {
      if (e?.code === 'DEFAULT_WITHOUT_MEASURE') {
        return NextResponse.json({ error: 'A medida padrão precisa ser uma medida cadastrada para este alimento.' }, { status: 400 });
      }
      if (missingTable(e)) return NOT_READY();
      throw e;
    }

    return NextResponse.json({ ok: true, food: { id: l.food.id, name: l.food.name }, ...(await resolved(l.food, l.team)) });
  } catch (error: any) {
    console.error('[food/portions PUT]', error?.message || error);
    return NextResponse.json({ error: 'Erro ao salvar as medidas.' }, { status: 500 });
  }
}

export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  try {
    const auth = requireAuth(req);
    if ('response' in auth) return auth.response;
    const sp = new URL(req.url).searchParams;
    const coachId = sp.get('coachId') ?? auth.user.id;
    if (!canActAsCoach(auth.user, coachId)) return NextResponse.json({ error: 'Acesso negado.' }, { status: 403 });

    const isGlobal = sp.get('scope') === 'global';
    if (isGlobal && !isMasterId(auth.user.id)) {
      return NextResponse.json({ error: 'Só o time master altera medidas globais.' }, { status: 403 });
    }

    const l = await load(params.id, coachId);
    if ('error' in l) return l.error;

    const unitParam = sp.get('unit');
    const unit = unitParam ? normalizeUnitKey(unitParam) : null;
    if (unitParam && !unit) return NextResponse.json({ error: 'Medida inválida.' }, { status: 400 });

    try {
      await (prisma as any).foodPortion.deleteMany({
        where: { foodId: l.food.id, scope: isGlobal ? 'GLOBAL' : l.team, ...(unit ? { unit } : {}) },
      });
    } catch (e: any) {
      if (missingTable(e)) return NOT_READY();
      throw e;
    }
    return NextResponse.json({ ok: true, food: { id: l.food.id, name: l.food.name }, ...(await resolved(l.food, l.team)) });
  } catch (error: any) {
    console.error('[food/portions DELETE]', error?.message || error);
    return NextResponse.json({ error: 'Erro ao remover a medida.' }, { status: 500 });
  }
}
