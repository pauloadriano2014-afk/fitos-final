// app/api/coach-features/route.ts
// 🔑 GET -> os recursos especiais que valem para QUEM chama: { features: { <todas as chaves de FEATURE_KEYS> }, isMaster }.
//   coach/master: os dele; aluno: só `execVideo`, conforme o coach do aluno (o app usa para mostrar ou esconder o que depende do coach).
// O app combina isto com a chave de plataforma (featureFlags: iPhone fica oculto até a Apple revisar). Aqui só se responde "o coach tem o recurso?".
import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuth, isMasterId } from '@/lib/auth';
import { isCoachRole } from '@/lib/agendaAuth';
import { FEATURE_KEYS, resolveCoachFeatures } from '@/lib/coachFeatures';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  try {
    const auth = requireAuth(req);
    if ('response' in auth) return auth.response;
    const me = auth.user;
    const pick = (f: any) => { const on: any = {}, src: any = {}; for (const k of FEATURE_KEYS) { on[k] = !!f[k].on; src[k] = f[k].source; } return { on, src }; };
    if (isCoachRole(me) || isMasterId(me.id)) {
      const f = await resolveCoachFeatures(prisma, me.id, { isMaster: isMasterId(me.id) });
      const { on, src } = pick(f);
      return NextResponse.json({ features: on, sources: src, isMaster: isMasterId(me.id) });
    }
    const row: any = await prisma.user.findUnique({ where: { id: me.id }, select: { coachId: true } });
    const coachId = row?.coachId || me.coachId || null;
    const f = await resolveCoachFeatures(prisma, coachId, { isMaster: isMasterId(coachId) });
    // aluno: só o que muda a tela dele (vídeo de execução); o resto é assunto do coach
    const on: any = {}; for (const k of FEATURE_KEYS) on[k] = k === 'execVideo' ? !!f.execVideo.on : false;
    return NextResponse.json({ features: on, isMaster: false });
  } catch (e: any) {
    console.error('[GET /api/coach-features]', e);
    const off: any = {}; for (const k of FEATURE_KEYS) off[k] = false;
    return NextResponse.json({ features: off, isMaster: false, error: 'Não foi possível carregar.' }, { status: 200 });
  }
}
