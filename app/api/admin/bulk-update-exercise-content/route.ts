// app/api/admin/bulk-update-exercise-content/route.ts
import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
export const dynamic = 'force-dynamic';

// Recebe uma lista de conteúdo por NOME de exercício (não por id), porque o
// mesmo exercício físico pode existir em múltiplos coaches com ids diferentes
// (ex: Paulo e Adri têm registros separados para "Agachamento Livre"). A rota
// aplica o mesmo conteúdo em TODOS os registros que baterem o nome
// (comparação exata, sem diferenciar maiúsculas/minúsculas ou espaços extras).
//
// Body esperado:
// {
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
// em uma chamada anterior.
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const items = body.items;

    if (!Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ error: "items deve ser uma lista não vazia" }, { status: 400 });
    }

    const results: any[] = [];

    for (const item of items) {
      const rawName = item?.name;
      if (!rawName || typeof rawName !== 'string' || !rawName.trim()) {
        results.push({ name: rawName || '(sem nome)', updated: 0, error: "nome ausente ou inválido" });
        continue;
      }

      const normalizedName = rawName.trim();

      // Monta o objeto de atualização só com os campos que vieram preenchidos
      const data: any = {};
      if (typeof item.howToExecute === 'string' && item.howToExecute.trim()) data.howToExecute = item.howToExecute.trim();
      if (typeof item.commonMistakes === 'string' && item.commonMistakes.trim()) data.commonMistakes = item.commonMistakes.trim();
      if (typeof item.maleFocus === 'string' && item.maleFocus.trim()) data.maleFocus = item.maleFocus.trim();
      if (typeof item.femaleFocus === 'string' && item.femaleFocus.trim()) data.femaleFocus = item.femaleFocus.trim();

      if (Object.keys(data).length === 0) {
        results.push({ name: normalizedName, updated: 0, error: "nenhum campo de conteúdo preenchido neste item" });
        continue;
      }

      // updateMany para cobrir todos os coaches que tiverem um exercício com
      // esse nome exato. Prisma já compara string exata por padrão (case-sensitive
      // no Postgres) — então o name enviado precisa bater com o que está no banco.
      const updateResult = await prisma.exercise.updateMany({
        where: { name: normalizedName },
        data,
      });

      results.push({ name: normalizedName, updated: updateResult.count });
    }

    const totalUpdated = results.reduce((acc, r) => acc + (r.updated || 0), 0);
    const notFound = results.filter(r => r.updated === 0 && !r.error);

    return NextResponse.json({
      success: true,
      totalItems: items.length,
      totalUpdated,
      notFoundCount: notFound.length,
      results,
    });
  } catch (error: any) {
    console.error("Erro POST bulk-update-exercise-content:", error);
    return NextResponse.json({ error: error.message || "Erro ao aplicar conteúdo em lote" }, { status: 500 });
  }
}