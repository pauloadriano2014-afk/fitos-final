// app/api/exercise/sync-adri/route.ts
// Copia environments, tags e defaultSubstitutes dos exercícios do master para os exercícios da Adri com mesmo nome
// defaultSubstitutes: traduz IDs do master para IDs equivalentes da Adri (por nome)
import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    // 1. Buscar a Adri e o master admin
    const adri = await prisma.user.findFirst({
      where: { email: 'adri.personal@hotmail.com' },
      select: { id: true }
    });

    const master = await prisma.user.findFirst({
      where: { role: 'ADMIN', email: { not: 'adri.personal@hotmail.com' } },
      select: { id: true }
    });

    if (!adri || !master) {
      return NextResponse.json({ error: 'Usuários não encontrados' }, { status: 404 });
    }

    // 2. Buscar todos os exercícios do master
    const masterExercises = await prisma.exercise.findMany({
      where: { coachId: master.id },
      select: { id: true, name: true, tags: true, environments: true, defaultSubstitutes: true }
    });

    // Mapa: nome lowercase → exercício do master
    const masterMapByName = new Map(
      masterExercises.map(ex => [ex.name.toLowerCase().trim(), ex])
    );

    // Mapa: ID do master → nome do exercício (para traduzir substitutos)
    const masterMapById = new Map(
      masterExercises.map(ex => [ex.id, ex.name.toLowerCase().trim()])
    );

    // 3. Buscar todos os exercícios da Adri
    const adriExercises = await prisma.exercise.findMany({
      where: { coachId: adri.id },
      select: { id: true, name: true }
    });

    // Mapa: nome lowercase → ID da Adri (para resolver substitutos)
    const adriMapByName = new Map(
      adriExercises.map(ex => [ex.name.toLowerCase().trim(), ex.id])
    );

    let updatedCount = 0;
    let skippedCount = 0;
    let substitutesTranslated = 0;

    // 4. Para cada exercício da Adri, busca o equivalente do master
    for (const adriEx of adriExercises) {
      const masterEx = masterMapByName.get(adriEx.name.toLowerCase().trim());

      if (!masterEx) {
        skippedCount++;
        continue;
      }

      // Traduz os IDs dos substitutos do master para IDs da Adri
      const translatedSubstitutes: string[] = [];
      for (const masterSubId of (masterEx.defaultSubstitutes || [])) {
        const subName = masterMapById.get(masterSubId);
        if (subName) {
          const adriSubId = adriMapByName.get(subName);
          if (adriSubId) {
            translatedSubstitutes.push(adriSubId);
            substitutesTranslated++;
          }
        }
      }

      await prisma.exercise.update({
        where: { id: adriEx.id },
        data: {
          environments: masterEx.environments,
          tags: masterEx.tags as any,
          defaultSubstitutes: translatedSubstitutes,
        }
      });
      updatedCount++;
    }

    return NextResponse.json({
      success: true,
      message: `Sincronização concluída! ${updatedCount} exercícios atualizados, ${substitutesTranslated} substitutos traduzidos, ${skippedCount} exclusivos da Adri mantidos.`
    });

  } catch (error) {
    console.error('Erro sync-adri:', error);
    return NextResponse.json({ error: 'Erro na sincronização' }, { status: 500 });
  }
}