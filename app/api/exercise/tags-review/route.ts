// app/api/exercise/tags-review/route.ts
// 🏷️ (19 out 2026) REVISÃO DAS TAGS NOVAS (impacto, "evitar para", favorito — lib/exerciseTags.ts) da biblioteca do coach.
//   GET  [?adminId=]                                  -> lista com o valor que VALE (marcado à mão ou sugestão pelo nome) e de onde veio
//   POST { changes: [{ id, impact?, avoid?, favorite? }], approveIds?: [id] }
//        changes    = marca à mão (impact null / avoid null apagam e voltam à sugestão)
//        approveIds = "aprovar a sugestão": grava como marcação o que a sugestão diz hoje (em massa)
// Só mexe nas chaves novas de `tags` (target/mechanic/equipment/jointRisk ficam como estão). O coach edita só os próprios exercícios; o master, qualquer um.
import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuth, canActAsCoach, isMasterId } from '@/lib/auth';
import { visibleLibraryWhere } from '@/lib/exerciseVisibility';
import { cleanExtraPatch, effectiveExtra, mergeTags } from '@/lib/exerciseTags';

export const dynamic = 'force-dynamic';
const MAX_CHANGES = 600;

export async function GET(req: Request) {
  try {
    const auth = requireAuth(req); if ('response' in auth) return auth.response;
    const adminId = new URL(req.url).searchParams.get('adminId') || auth.user.id;
    if (!canActAsCoach(auth.user, adminId)) return NextResponse.json({ error: 'Acesso negado.' }, { status: 403 });
    const rows = await prisma.exercise.findMany({ where: visibleLibraryWhere(adminId), select: { id: true, name: true, category: true, tags: true, coachId: true }, orderBy: { name: 'asc' } });
    const items = rows.map((r: any) => {
      const ef = effectiveExtra(r);
      return { id: r.id, name: r.name, category: r.category, target: r.tags?.target || null, equipment: r.tags?.equipment || null, impact: ef.impact, avoid: ef.avoid, favorite: ef.favorite, source: ef.source, editable: isMasterId(auth.user.id) || r.coachId === auth.user.id };
    });
    const pending = items.filter((i) => i.source.impact === 'SUGESTAO' || i.source.avoid === 'SUGESTAO').length;
    return NextResponse.json({ items, summary: { total: items.length, pending, highImpact: items.filter((i) => i.impact === 'ALTO').length, favorites: items.filter((i) => i.favorite).length } });
  } catch (e) {
    console.error('Erro na revisão de tags (GET):', e);
    return NextResponse.json({ error: 'Não foi possível ler as tags agora.' }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const auth = requireAuth(req); if ('response' in auth) return auth.response;
    const body = await req.json().catch(() => ({}));
    const changes: any[] = Array.isArray(body.changes) ? body.changes.slice(0, MAX_CHANGES) : [];
    const approve: string[] = Array.isArray(body.approveIds) ? [...new Set<string>(body.approveIds.map(String))].slice(0, MAX_CHANGES) : [];
    if (!changes.length && !approve.length) return NextResponse.json({ error: 'Nada para alterar.' }, { status: 400 });
    const ids = [...new Set([...changes.map((c) => String(c?.id || '')), ...approve].filter(Boolean))];
    const rows: any[] = await prisma.exercise.findMany({ where: { id: { in: ids } }, select: { id: true, name: true, tags: true, coachId: true } });
    const byId = new Map(rows.map((r) => [r.id, r]));
    const can = (r: any) => isMasterId(auth.user.id) || r.coachId === auth.user.id;
    let updated = 0, denied = 0;
    const save = async (r: any, patch: ReturnType<typeof cleanExtraPatch>) => {
      if (!can(r)) { denied++; return; }
      await prisma.exercise.update({ where: { id: r.id }, data: { tags: mergeTags(r.tags && typeof r.tags === 'object' ? r.tags : {}, r.tags, patch) as any } });
      updated++;
    };
    for (const c of changes) { const r = byId.get(String(c?.id)); if (r) await save(r, cleanExtraPatch(c)); }
    const edited = new Set(changes.map((c) => String(c?.id || '')));
    for (const id of approve) {
      const r = byId.get(id); if (!r || edited.has(id)) continue;   // o que o coach acabou de editar à mão não é sobrescrito pela sugestão
      const ef = effectiveExtra(r);
      await save(r, { impact: ef.impact, avoid: ef.avoid });
    }
    return NextResponse.json({ ok: true, updated, denied });
  } catch (e) {
    console.error('Erro na revisão de tags (POST):', e);
    return NextResponse.json({ error: 'Não foi possível salvar as tags agora.' }, { status: 500 });
  }
}
