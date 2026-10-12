// app/api/coach-features/route.ts
// 🔑 GET -> os recursos especiais que valem para QUEM chama: { features: { execVideo, notasVoz }, isMaster }.
//   coach/master: os dele; aluno: só `execVideo`, conforme o coach do aluno (o app usa para mostrar ou esconder o que depende do coach).
// O app combina isto com a chave de plataforma (featureFlags: iPhone fica oculto até a Apple revisar). Aqui só se responde "o coach tem o recurso?".
import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuth, isMasterId } from '@/lib/auth';
import { isCoachRole } from '@/lib/agendaAuth';
import { resolveCoachFeatures } from '@/lib/coachFeatures';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  try {
    const auth = requireAuth(req);
    if ('response' in auth) return auth.response;
    const me = auth.user;
    if (isCoachRole(me) || isMasterId(me.id)) {
      const f = await resolveCoachFeatures(prisma, me.id, { isMaster: isMasterId(me.id) });
      return NextResponse.json({ features: { execVideo: f.execVideo.on, notasVoz: f.notasVoz.on }, sources: { execVideo: f.execVideo.source, notasVoz: f.notasVoz.source }, isMaster: isMasterId(me.id) });
    }
    const row: any = await prisma.user.findUnique({ where: { id: me.id }, select: { coachId: true } });
    const coachId = row?.coachId || me.coachId || null;
    const f = await resolveCoachFeatures(prisma, coachId, { isMaster: isMasterId(coachId) });
    return NextResponse.json({ features: { execVideo: f.execVideo.on, notasVoz: false }, isMaster: false });
  } catch (e: any) {
    console.error('[GET /api/coach-features]', e);
    return NextResponse.json({ features: { execVideo: false, notasVoz: false }, isMaster: false, error: 'Não foi possível carregar.' }, { status: 200 });
  }
}
