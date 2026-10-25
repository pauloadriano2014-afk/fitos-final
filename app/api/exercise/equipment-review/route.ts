// app/api/exercise/equipment-review/route.ts
// 🏋️ (25 out 2026) REVISÃO DO EQUIPAMENTO: lista o palpite pelo nome para cada exercício (Máquina, Polia, Barra, Smith, Halter, Peso do corpo, Outros) e o que não tem palpite.
//
//   GET -> { items: [{ id, name, category, subCategory, current, suggested, reason }], noGuess: [{ id, name, category, current }], locked, total, byCurrent }
//
// Só Paulo e Adri, só exercício do próprio coach logado ou global. NÃO grava nada: quem aplica é o /api/exercise/bulk-update (equipment), grupo a grupo, depois de o Paulo conferir.
// Já "travado" (marcado à mão ou por este fluxo) não entra na lista: a correção do Paulo nunca é desfeita.
import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireMaster } from '@/lib/auth';
import { guessEquipment, isEquipmentLocked, EQUIPMENT_IDS } from '@/lib/exerciseEquipment';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  try {
    const auth = requireMaster(req);
    if ('response' in auth) return auth.response;

    const rows: any[] = await prisma.exercise.findMany({
      where: { OR: [{ coachId: auth.user.id }, { coachId: null }] },
      select: { id: true, name: true, category: true, subCategory: true, tags: true },
    });

    const items: any[] = []; const noGuess: any[] = []; const byCurrent: Record<string, number> = {}; let locked = 0;
    for (const r of rows) {
      if (String(r.category || '').toLowerCase().startsWith('mobil') || String(r.category || '').toLowerCase() === 'cardio') continue;   // alongamento e cardio não têm equipamento de musculação
      const current = String(r.tags?.equipment || '').toUpperCase() || 'LIVRE';
      byCurrent[current] = (byCurrent[current] || 0) + 1;
      if (isEquipmentLocked(r.tags)) { locked++; continue; }
      const g = guessEquipment(r.name, r.category);
      if (!g) { if (!(EQUIPMENT_IDS as readonly string[]).includes(current)) noGuess.push({ id: r.id, name: r.name, category: r.category, current }); continue; }
      if (g.equipment !== current) items.push({ id: r.id, name: r.name, category: r.category, subCategory: r.subCategory || null, current, suggested: g.equipment, reason: g.reason });
    }
    items.sort((a, b) => a.suggested.localeCompare(b.suggested) || String(a.name).localeCompare(String(b.name), 'pt-BR'));
    noGuess.sort((a, b) => String(a.name).localeCompare(String(b.name), 'pt-BR'));
    return NextResponse.json({ items, noGuess, locked, total: rows.length, byCurrent });
  } catch (error: any) {
    console.error('ERRO exercise/equipment-review GET:', error);
    return NextResponse.json({ error: 'Erro ao montar a revisão de equipamentos.' }, { status: 500 });
  }
}
