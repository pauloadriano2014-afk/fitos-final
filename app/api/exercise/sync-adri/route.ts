// app/api/exercise/sync-adri/route.ts
// Sincronização completa da biblioteca do Paulo pra Adri:
// 1. Cria as cópias que estão faltando (exercícios que o Paulo tem e a Adri ainda não tem)
// 2. Atualiza environments, tags e defaultSubstitutes dos exercícios que já existem nos dois,
//    casando por nome (preserva nome/vídeo/instruções que a Adri já tiver customizado)
// defaultSubstitutes: traduz IDs do Paulo para IDs equivalentes da Adri (por nome)
import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { PAULO_ID, ADRI_ID } from '@/lib/masterIds';

const prisma = new PrismaClient();
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    // 1. Buscar todos os exercícios do Paulo (fonte da biblioteca base)
    const masterExercises = await prisma.exercise.findMany({
      where: { coachId: PAULO_ID }
    });

    // Mapa: nome lowercase → exercício do Paulo
    const masterMapByName = new Map(
      masterExercises.map(ex => [ex.name.toLowerCase().trim(), ex])
    );

    // Mapa: ID do Paulo → nome do exercício (para traduzir substitutos)
    const masterMapById = new Map(
      masterExercises.map(ex => [ex.id, ex.name.toLowerCase().trim()])
    );

    // 2. Buscar todos os exercícios da Adri
    const adriExercises = await prisma.exercise.findMany({
      where: { coachId: ADRI_ID },
      select: { id: true, name: true }
    });

    // Mapa: nome lowercase → ID da Adri (para resolver substitutos e checar o que falta)
    const adriMapByName = new Map(
      adriExercises.map(ex => [ex.name.toLowerCase().trim(), ex.id])
    );

    let createdCount = 0;
    let updatedCount = 0;
    let keptExclusiveCount = 0;
    let substitutesTranslated = 0;

    function translateSubstitutes(masterSubstitutes: string[], adriMapByNameNow: Map<string, string>) {
      const translated: string[] = [];
      for (const masterSubId of (masterSubstitutes || [])) {
        const subName = masterMapById.get(masterSubId);
        if (subName) {
          const adriSubId = adriMapByNameNow.get(subName);
          if (adriSubId) {
            translated.push(adriSubId);
            substitutesTranslated++;
          }
        }
      }
      return translated;
    }

    // 3. Cria pra Adri os exercícios do Paulo que ela ainda não tem
    for (const masterEx of masterExercises) {
      const nameKey = masterEx.name.toLowerCase().trim();
      if (adriMapByName.has(nameKey)) continue; // ela já tem, trata na etapa de update

      try {
        const created = await prisma.exercise.create({
          data: {
            name: masterEx.name,
            category: masterEx.category,
            subCategory: masterEx.subCategory,
            environments: masterEx.environments,
            tags: masterEx.tags as any,
            videoUrl: masterEx.videoUrl,
            instructions: masterEx.instructions,
            howToExecute: masterEx.howToExecute,
            commonMistakes: masterEx.commonMistakes,
            maleFocus: masterEx.maleFocus,
            femaleFocus: masterEx.femaleFocus,
            coachId: ADRI_ID,
            defaultSubstitutes: [] // traduzido numa segunda passada, depois que todos existirem
          }
        });
        adriMapByName.set(nameKey, created.id);
        createdCount++;
      } catch (err: any) {
        if (err.code !== 'P2002') console.error('Erro ao criar cópia pra Adri:', masterEx.name, err);
      }
    }

    // 4. Para cada exercício correspondente, atualiza environments/tags/substitutos
    //    (não mexe em nome, vídeo ou instruções — isso a Adri pode ter customizado)
    for (const [nameKey, masterEx] of masterMapByName) {
      const adriId = adriMapByName.get(nameKey);
      if (!adriId) continue;

      const translatedSubstitutes = translateSubstitutes(masterEx.defaultSubstitutes, adriMapByName);

      await prisma.exercise.update({
        where: { id: adriId },
        data: {
          environments: masterEx.environments,
          tags: masterEx.tags as any,
          defaultSubstitutes: translatedSubstitutes,
        }
      });
      updatedCount++;
    }

    keptExclusiveCount = adriExercises.filter(ex => !masterMapByName.has(ex.name.toLowerCase().trim())).length;

    return NextResponse.json({
      success: true,
      message: `Sincronização concluída! ${createdCount} exercícios novos herdados, ${updatedCount} atualizados, ${substitutesTranslated} substitutos traduzidos, ${keptExclusiveCount} exclusivos da Adri mantidos.`
    });

  } catch (error) {
    console.error('Erro sync-adri:', error);
    return NextResponse.json({ error: 'Erro na sincronização' }, { status: 500 });
  }
}
