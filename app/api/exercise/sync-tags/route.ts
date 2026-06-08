// app/api/exercise/sync-tags/route.ts
import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
export const dynamic = 'force-dynamic';

function guessSubCategory(name: string, category: string): string {
  const n = name.toLowerCase();
  const c = category.toLowerCase();
  if (c.includes('peit')) {
    if (n.includes('inclinado') || n.includes('superior')) return 'Superior';
    if (n.includes('declinado') || n.includes('inferior')) return 'Inferior';
    return 'Medial';
  }
  if (c.includes('costas') || c.includes('dorsal')) {
    if (n.includes('puxada') || n.includes('pulldown') || n.includes('barra fixa')) return 'Puxadas';
    if (n.includes('lombar') || n.includes('hiperextensão') || n.includes('bom dia')) return 'Lombar';
    return 'Remadas';
  }
  if (c.includes('perna') || c.includes('membros inferiores') || c.includes('coxa')) {
    if (n.includes('panturrilha') || n.includes('gêmeos') || n.includes('gemeos') || n.includes('sóleo')) return 'Panturrilha';
    if (n.includes('glúteo') || n.includes('gluteo') || n.includes('pélvica') || n.includes('abdutora') || n.includes('coice')) return 'Glúteos';
    if (n.includes('flexora') || n.includes('stiff') || n.includes('posterior') || n.includes('romeno')) return 'Posteriores';
    if (n.includes('extensora') || n.includes('adutora') || n.includes('adutor') || n.includes('sissy')) return 'Quadríceps e Adutores';
    if (n.includes('agachamento') || n.includes('leg') || n.includes('hack') || n.includes('afundo') || n.includes('passada') || n.includes('búlgaro')) return 'Multiarticular';
    return 'Geral';
  }
  if (c.includes('ombro') || c.includes('deltoide')) {
    if (n.includes('encolhimento') || n.includes('trapézio') || n.includes('trapezio')) return 'Trapézio';
    if (n.includes('desenvolvimento')) return 'Multiarticular';
    if (n.includes('frontal') || n.includes('frente')) return 'Frontal';
    if (n.includes('posterior') || n.includes('inverso') || n.includes('face pull') || n.includes('voador inverso')) return 'Posterior';
    if (n.includes('lateral') || n.includes('manguito') || n.includes('remada alta')) return 'Lateral';
    return 'Geral';
  }
  if (c.includes('abd') || c.includes('core')) {
    if (n.includes('remador') || n.includes('rodinha') || n.includes('roda') || n.includes('canivete')) return 'Completo';
    if (n.includes('infra') || n.includes('perna') || n.includes('pendurado')) return 'Infra';
    if (n.includes('prancha') || n.includes('isometria') || n.includes('oblíquo') || n.includes('obliquo')) return 'Core';
    return 'Supra';
  }
  return 'Geral';
}

function generateTags(name: string, category: string): object {
  const n = name.toLowerCase();

  let target = category.toUpperCase();
  if (n.includes('stiff') || n.includes('flexora') || n.includes('romeno')) target = 'POSTERIOR';
  else if (n.includes('extensora') || n.includes('agachamento') || n.includes('leg press') || n.includes('hack') || n.includes('sissy')) target = 'QUADRICEPS';
  else if (n.includes('pelve') || n.includes('pélvica') || n.includes('abdução') || n.includes('glúteo') || n.includes('gluteo') || n.includes('coice') || n.includes('abdutora')) target = 'GLUTEOS';
  else if (n.includes('adutora') || n.includes('adutor')) target = 'ADUTOR';
  else if (n.includes('panturrilha') || n.includes('gêmeos') || n.includes('gemeos') || n.includes('sóleo')) target = 'PANTURRILHA';
  else if (n.includes('supino') || n.includes('crucifixo') || n.includes('peck deck') || n.includes('voador frontal')) target = 'PEITO';
  else if (n.includes('remada') || n.includes('serrote')) target = 'COSTAS_REMADA';
  else if (n.includes('puxada') || n.includes('pulldown') || n.includes('pull down') || n.includes('barra fixa')) target = 'COSTAS_PUXADA';
  else if (n.includes('desenvolvimento') || n.includes('elevação frontal')) target = 'OMBRO_FRONTAL';
  else if (n.includes('elevação lateral')) target = 'OMBRO_LATERAL';
  else if (n.includes('voador inverso') || n.includes('face pull')) target = 'OMBRO_POST';
  else if (n.includes('encolhimento') || n.includes('trapézio') || n.includes('trapezio')) target = 'TRAPEZIO';
  else if (n.includes('tríceps') || n.includes('triceps') || n.includes('francesa') || n.includes('corda')) target = 'TRICEPS';
  else if (n.includes('bíceps') || n.includes('biceps') || n.includes('rosca') || n.includes('scott')) target = 'BICEPS';
  else if (n.includes('abdominal') || n.includes('prancha') || n.includes('infra') || n.includes('oblíquo')) target = 'ABDOMEN';

  let mechanic = 'ISOLADO';
  if (n.includes('agachamento') || n.includes('leg press') || n.includes('supino') || n.includes('remada') || n.includes('puxada') || n.includes('desenvolvimento') || n.includes('stiff') || n.includes('terra') || n.includes('hack') || n.includes('afundo') || n.includes('passada') || n.includes('búlgaro') || n.includes('barra fixa')) mechanic = 'COMPOSTO';

  let equipment = 'LIVRE';
  if (n.includes('máquina') || n.includes('maquina') || n.includes('extensora') || n.includes('flexora') || n.includes('peck deck') || n.includes('articulado') || n.includes('smart')) equipment = 'MAQUINA';
  else if (n.includes('cross') || n.includes('polia') || n.includes('cabo') || n.includes('corda')) equipment = 'POLIA';
  else if (n.includes('halter') || n.includes('halteres')) equipment = 'HALTER';
  else if (n.includes('barra') || n.includes('smith')) equipment = 'BARRA';
  else if (n.includes('caneleira')) equipment = 'CANELEIRA';
  else if (n.includes('prancha') || n.includes('corporal')) equipment = 'PESO_CORPORAL';

  const jointRisk: string[] = [];
  if (n.includes('stiff') || n.includes('terra') || n.includes('remada curvada') || n.includes('agachamento livre') || n.includes('bom dia')) jointRisk.push('LOMBAR');
  if (n.includes('agachamento') || n.includes('extensora') || n.includes('leg press') || n.includes('hack') || n.includes('sissy') || n.includes('afundo') || n.includes('passada')) jointRisk.push('JOELHO');
  if (n.includes('desenvolvimento') || n.includes('tríceps testa') || n.includes('puxada costas') || n.includes('crucifixo') || n.includes('supino')) jointRisk.push('OMBRO');

  return { target, mechanic, equipment, jointRisk };
}

export async function GET() {
  try {
    const exercises = await prisma.exercise.findMany();
    let updatedCount = 0;

    for (const ex of exercises) {
      const novaSubCategoria = guessSubCategory(ex.name, ex.category);
      const novasTags = generateTags(ex.name, ex.category);

      // Migra environments antigos para novos IDs
      let environments = ex.environments || [];
      const needsMigration = environments.some((e: string) => 
        ['ACADEMIA', 'CONDOMÍNIO', 'CASA'].includes(e)
      );
      if (needsMigration || environments.length === 0) {
        environments = environments.length === 0 
          ? ['ACADEMIA_PADRAO']
          : environments.map((e: string) => {
              if (e === 'ACADEMIA') return 'ACADEMIA_PADRAO';
              if (e === 'CONDOMÍNIO' || e === 'CONDOMINIO') return 'CONDOMINIO';
              if (e === 'CASA') return 'EM_CASA';
              return e;
            });
      }

      await prisma.exercise.update({
        where: { id: ex.id },
        data: {
          subCategory: novaSubCategoria,
          tags: novasTags,
          environments: environments,
        }
      });
      updatedCount++;
    }

    return NextResponse.json({
      success: true,
      message: `Mágica concluída! ${updatedCount} exercícios atualizados com subCategoria e tags.`
    });

  } catch (error) {
    console.error("Erro no sync-tags:", error);
    return NextResponse.json({ error: "Deu erro no robô faxineiro" }, { status: 500 });
  }
}