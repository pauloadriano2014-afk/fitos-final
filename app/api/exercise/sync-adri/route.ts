// app/api/exercise/sync-adri/route.ts
// Copia environments, tags e defaultSubstitutes dos exercícios do master para os exercícios da Adri com mesmo nome
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

    // 2. Buscar todos os exercícios do master (com tags, environments e defaultSubstitutes)
    const masterExercises = await prisma.exercise.findMany({
      where: { coachId: master.id },
      select: { id: true, name: true, tags: true, environments: true, defaultSubstitutes: true }
    });

    // Mapa: nome em lowercase → exercício do master
    const masterMap = new Map(
      masterExercises.map(ex => [ex.name.toLowerCase().trim(), ex])
    );

    // 3. Buscar exercícios da Adri
    const adriExercises = await prisma.exercise.findMany({
      where: { coachId: adri.id },
      select: { id: true, name: true, environments: true, defaultSubstitutes: true }
    });

    let updatedCount = 0;
    let skippedCount = 0;

    // 4. Para cada exercício da Adri, busca o equivalente do master
    for (const adriEx of adriExercises) {
      const masterEx = masterMap.get(adriEx.name.toLowerCase().trim());

      if (masterEx) {
        // Encontrou correspondência — copia environments, tags e defaultSubstitutes
        await prisma.exercise.update({
          where: { id: adriEx.id },
          data: {
            environments: masterEx.environments,
            tags: masterEx.tags as any,
            defaultSubstitutes: masterEx.defaultSubstitutes,
          }
        });
        updatedCount++;
      } else {
        skippedCount++;
      }
    }

    return NextResponse.json({
      success: true,
      message: `Sincronização concluída! ${updatedCount} exercícios da Adri atualizados com os dados do master. ${skippedCount} exercícios exclusivos da Adri mantidos intactos.`
    });

  } catch (error) {
    console.error('Erro sync-adri:', error);
    return NextResponse.json({ error: 'Erro na sincronização' }, { status: 500 });
  }
}