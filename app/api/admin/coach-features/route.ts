// app/api/admin/coach-features/route.ts
// 🔑 Painel do time master: liga/desliga os recursos especiais por coach e a chave GERAL.
//   GET                                   -> { global: { execVideo, notasVoz, perguntasVoz }, coaches: [ { id, name, email, accountStatus, coachBillingStatus, isLaunchPromo, features: { execVideo: {on, source, grantedAt, reason, revokedAt, revokedReason}, ... } } ] }
//   PUT { coachId, feature, enabled }     -> liga/desliga um recurso de UM coach (ligar de novo apaga a revogação)
//   PUT { global: true, feature, enabled }-> chave geral: vale para todos os coaches
//   PUT { action: 'GRANT_FOUNDERS' }      -> libera os recursos para os Fundadores que já pagaram e estão com acesso em dia (só quem nunca teve linha)
import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireMaster } from '@/lib/auth';
import { FEATURE_KEYS, coachInGoodStanding, grantExistingFounders, isFeatureKey, loadGlobal, setCoachFeature } from '@/lib/coachFeatures';

export const dynamic = 'force-dynamic';
const missing = (e: any) => /does not exist|P2021|P2022/i.test(String(e?.code || '') + String(e?.message || ''));
const UNAVAILABLE = { error: 'As chaves por coach ainda não estão habilitadas no servidor (falta criar as tabelas novas: npx prisma db push).', unavailable: true };

export async function GET(req: Request) {
  try {
    const auth = requireMaster(req);
    if ('response' in auth) return auth.response;
    const global = await loadGlobal(prisma);
    const coaches: any[] = await prisma.user.findMany({ where: { role: 'COACH' }, select: { id: true, name: true, email: true, accountStatus: true, coachBillingStatus: true, isLaunchPromo: true }, orderBy: { name: 'asc' } });
    let rows: any[] = [];
    try { rows = await prisma.coachFeature.findMany({ where: { coachId: { in: coaches.map((c) => c.id) } } }); } catch (e) { if (!missing(e)) throw e; }
    const byCoach = new Map<string, any[]>();
    for (const r of rows) byCoach.set(r.coachId, [...(byCoach.get(r.coachId) || []), r]);
    const out = coaches.map((c) => {
      const mine = byCoach.get(c.id) || [];
      const standing = coachInGoodStanding(c);
      const features: any = {};
      for (const k of FEATURE_KEYS) {
        const r = mine.find((x) => x.feature === k);
        features[k] = { on: !!r && !r.revokedAt && standing, grant: !!r && !r.revokedAt, reason: r?.reason || null, grantedAt: r?.grantedAt || null, revokedAt: r?.revokedAt || null, revokedReason: r?.revokedReason || null };
      }
      return { id: c.id, name: c.name, email: c.email, accountStatus: c.accountStatus, coachBillingStatus: c.coachBillingStatus, isLaunchPromo: !!c.isLaunchPromo, standing, features };
    });
    return NextResponse.json({ global, coaches: out });
  } catch (e: any) {
    if (missing(e)) return NextResponse.json(UNAVAILABLE, { status: 503 });
    console.error('[GET /api/admin/coach-features]', e);
    return NextResponse.json({ error: 'Erro ao carregar as chaves.' }, { status: 500 });
  }
}

export async function PUT(req: Request) {
  try {
    const auth = requireMaster(req);
    if ('response' in auth) return auth.response;
    const b = await req.json().catch(() => null);
    if (!b) return NextResponse.json({ error: 'Corpo inválido.' }, { status: 400 });
    const by = auth.user.id;

    if (b.action === 'GRANT_FOUNDERS') {
      const r = await grantExistingFounders(prisma, by);
      return NextResponse.json({ success: true, ...r });
    }
    if (!isFeatureKey(b.feature)) return NextResponse.json({ error: 'Recurso inválido.' }, { status: 400 });
    if (typeof b.enabled !== 'boolean') return NextResponse.json({ error: 'enabled deve ser verdadeiro ou falso.' }, { status: 400 });

    if (b.global === true) {
      await prisma.featureGlobal.upsert({ where: { feature: b.feature }, create: { feature: b.feature, enabled: b.enabled, updatedBy: by }, update: { enabled: b.enabled, updatedBy: by } });
      return NextResponse.json({ success: true, global: await loadGlobal(prisma) });
    }
    const coachId = String(b.coachId || '');
    if (!coachId) return NextResponse.json({ error: 'coachId obrigatório.' }, { status: 400 });
    const coach: any = await prisma.user.findUnique({ where: { id: coachId }, select: { id: true, role: true } });
    if (!coach || coach.role !== 'COACH') return NextResponse.json({ error: 'Coach não encontrado.' }, { status: 404 });
    await setCoachFeature(prisma, { coachId, feature: b.feature, enabled: b.enabled, by, reason: 'MANUAL' });
    return NextResponse.json({ success: true });
  } catch (e: any) {
    if (missing(e)) return NextResponse.json(UNAVAILABLE, { status: 503 });
    console.error('[PUT /api/admin/coach-features]', e);
    return NextResponse.json({ error: 'Erro ao salvar a chave.' }, { status: 500 });
  }
}
