// app/api/admin/bulk-update-exercise-content/route.ts
import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireMaster } from '@/lib/auth';

export const dynamic = 'force-dynamic';

// Recebe uma lista de conteúdo por NOME de exercício (não por id), porque o
// mesmo exercício físico pode existir em múltiplos coaches com ids diferentes
// (ex: Paulo e Adri têm registros separados para "Agachamento Livre"). A rota
// aplica o mesmo conteúdo em TODOS os registros que baterem o nome.
// 🔎 (25 out 2026) A comparação ignora maiúsculas, acentos e espaços sobrando
// (antes era exata: "Bulgaro Tronco Inclinado " com espaço no fim nunca batia).
//
// Body esperado:
// {
//   "onlyEmpty": true,          // (opcional) só preenche o que está VAZIO; nunca sobrescreve texto já escrito
//   "items": [
//     {
//       "name": "Agachamento Livre",
//       "howToExecute": "...",
//       "commonMistakes": "...",
//       "maleFocus": "...",
//       "femaleFocus": "..."
//     },
//     ...
//   ]
// }
//
// Campos vazios ("" ou ausentes) em um item NÃO sobrescrevem o que já existe
// no banco — só atualiza os campos que vierem de fato preenchidos. Isso evita
// que rodar a rota de novo com um lote parcial apague conteúdo já aplicado
// em uma chamada anterior. Com `onlyEmpty: true`, nem os campos preenchidos
// do item sobrescrevem um texto que o coach já escreveu.
const FIELDS = ['howToExecute', 'commonMistakes', 'maleFocus', 'femaleFocus'] as const;
const nameKey = (s: any) => String(s ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
const isBlank = (v: any) => v == null || (typeof v === 'string' && !v.trim());

export async function POST(req: Request) {
  try {
    // 🔒 Aplica conteúdo em massa em exercícios de TODOS os coaches (bate por
    // nome, sem checar dono) — restrito ao time master.
    const auth = requireMaster(req);
    if ('response' in auth) return auth.response;

    const body = await req.json();
    const items = body.items;

    if (!Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ error: "items deve ser uma lista não vazia" }, { status: 400 });
    }

    const onlyEmpty = body.onlyEmpty === true;
    const results: any[] = [];

    // Um carregamento só da biblioteca (id, nome e os 4 campos), agrupado pelo nome normalizado
    const all = await prisma.exercise.findMany({ select: { id: true, name: true, howToExecute: true, commonMistakes: true, maleFocus: true, femaleFocus: true } });
    const byName = new Map<string, any[]>();
    for (const r of all) { const k = nameKey(r.name); if (!k) continue; (byName.get(k) || byName.set(k, []).get(k)!).push(r); }

    for (const item of items) {
      const rawName = item?.name;
      if (!rawName || typeof rawName !== 'string' || !rawName.trim()) {
        results.push({ name: rawName || '(sem nome)', updated: 0, error: "nome ausente ou inválido" });
        continue;
      }

      const normalizedName = rawName.trim();

      // Monta o objeto de atualização só com os campos que vieram preenchidos
      const data: any = {};
      for (const f of FIELDS) if (typeof item[f] === 'string' && item[f].trim()) data[f] = item[f].trim();

      if (Object.keys(data).length === 0) {
        results.push({ name: normalizedName, updated: 0, error: "nenhum campo de conteúdo preenchido neste item" });
        continue;
      }

      const matches = byName.get(nameKey(normalizedName)) || [];
      let updated = 0, skippedFilled = 0;
      for (const row of matches) {
        // onlyEmpty: só os campos que estão vazios nesse registro
        const patch: any = {};
        for (const f of Object.keys(data)) if (!onlyEmpty || isBlank(row[f])) patch[f] = data[f];
        if (Object.keys(patch).length === 0) { skippedFilled++; continue; }
        await prisma.exercise.update({ where: { id: row.id }, data: patch });
        updated++;
      }

      results.push({ name: normalizedName, updated, ...(onlyEmpty && skippedFilled ? { skippedFilled } : {}) });
    }

    const totalUpdated = results.reduce((acc, r) => acc + (r.updated || 0), 0);
    const notFound = results.filter(r => r.updated === 0 && !r.error && !r.skippedFilled);

    return NextResponse.json({
      success: true,
      totalItems: items.length,
      totalUpdated,
      alreadyFilledCount: results.filter(r => r.skippedFilled).length,
      notFoundCount: notFound.length,
      results,
    });
  } catch (error: any) {
    console.error("Erro POST bulk-update-exercise-content:", error);
    return NextResponse.json({ error: error.message || "Erro ao aplicar conteúdo em lote" }, { status: 500 });
  }
}