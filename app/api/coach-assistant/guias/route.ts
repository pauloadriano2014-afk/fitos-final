// app/api/coach-assistant/guias/route.ts
// 📖 GET            -> { ok, master, categories: [{ id, label, icon, guides: [{ id, title, steps[], tip? }] }] }
//   GET ?q=texto    -> { ok, results: [{ id, cat, title, steps[], tip? }] }   (busca por palavras, SEM IA)
// Só o que ESTE coach pode usar: plano Personal não vê dieta, Nutricionista não vê treino, "Time master" só para Paulo e Adri. Qualquer coach ativo.
import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireActiveCoach } from '@/lib/coachNotesStore';
import { isMasterCoachId } from '@/lib/coachAssistant';
import { categoriesFor, searchGuides, type GuideViewer } from '@/lib/assistantGuides';

export const dynamic = 'force-dynamic';
const slim = (g: any) => ({ id: g.id, cat: g.cat, title: g.title, steps: g.steps, ...(g.tip ? { tip: g.tip } : {}) });

export async function GET(req: Request) {
  const auth = await requireActiveCoach(req);
  if ('response' in auth) return auth.response;
  const master = isMasterCoachId(auth.user.id);
  let plan: string | null = null;
  if (!master) { try { const u: any = await prisma.user.findUnique({ where: { id: auth.user.id }, select: { coachPlan: true } }); plan = u?.coachPlan || null; } catch { plan = null; } }
  const viewer: GuideViewer = { master, plan };
  const q = new URL(req.url).searchParams.get('q');
  if (q && q.trim()) return NextResponse.json({ ok: true, results: searchGuides(q.slice(0, 200), viewer).map(slim) });
  return NextResponse.json({ ok: true, master, categories: categoriesFor(viewer).map((c) => ({ id: c.id, label: c.label, icon: c.icon, guides: c.guides.map(slim) })) });
}
