// app/api/exercise/route.ts
import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
export const dynamic = 'force-dynamic';

const MASTER_IDS = [
    '3c82f763-66b4-48da-836e-16817d4f57c0', // Paulo
    'b7c0c181-41fd-4156-b8fe-963a267759a3'  // Adri
];

async function checkExerciseOwnership(exerciseId: string, adminId: string | null) {
    if (!adminId) return false;
    if (MASTER_IDS.includes(adminId)) return true;
    const exercise = await prisma.exercise.findUnique({ where: { id: exerciseId }, select: { coachId: true } });
    if (!exercise) return false;
    return exercise.coachId === adminId;
}

function guessSubCategory(name: string, category: string): string {
  const n = name.toLowerCase();
  const c = category.toLowerCase();
  if (c.includes('peit')) {
    if (n.includes('inclinado') || n.includes('superior')) return 'Superior';
    if (n.includes('declinado') || n.includes('inferior')) return 'Inferior';
    return 'Medial';
  }
  if (c.includes('costas') || c.includes('dorsal')) {
    if (n.includes('puxada') || n.includes('pulldown') || n.includes('barra fixa') || n.includes('pull down')) return 'Puxadas';
    if (n.includes('lombar') || n.includes('hiperextensão') || n.includes('bom dia')) return 'Lombar';
    return 'Remadas';
  }
  if (c.includes('perna') || c.includes('membros inferiores') || c.includes('coxa')) {
    if (n.includes('panturrilha') || n.includes('gêmeos') || n.includes('gemeos') || n.includes('sóleo')) return 'Panturrilha';
    if (n.includes('glúteo') || n.includes('gluteo') || n.includes('pélvica') || n.includes('pelvica') || n.includes('abdutora') || n.includes('coice')) return 'Glúteos';
    if (n.includes('flexora') || n.includes('stiff') || n.includes('posterior') || n.includes('romeno')) return 'Posteriores';
    if (n.includes('extensora') || n.includes('adutora') || n.includes('adutor') || n.includes('sissy')) return 'Quadríceps e Adutores';
    if (n.includes('agachamento') || n.includes('leg') || n.includes('hack') || n.includes('afundo') || n.includes('passada') || n.includes('búlgaro')) return 'Multiarticular';
    return 'Geral';
  }
  if (c.includes('ombro') || c.includes('deltoide')) {
    if (n.includes('encolhimento') || n.includes('trapézio') || n.includes('trapezio')) return 'Trapézio';
    if (n.includes('desenvolvimento')) return 'Multiarticular';
    if (n.includes('frontal') || n.includes('frente')) return 'Frontal';
    if (n.includes('posterior') || n.includes('inverso') || n.includes('face pull') || n.includes('facepull') || n.includes('voador inverso')) return 'Posterior';
    if (n.includes('lateral') || n.includes('manguito') || n.includes('remada alta')) return 'Lateral';
    return 'Geral';
  }
  if (c.includes('abd') || c.includes('core')) {
    if (n.includes('remador') || n.includes('rodinha') || n.includes('roda') || n.includes('canivete') || n.includes('completo')) return 'Completo';
    if (n.includes('infra') || n.includes('perna') || n.includes('pendurado')) return 'Infra';
    if (n.includes('prancha') || n.includes('isometria') || n.includes('oblíquo') || n.includes('obliquo')) return 'Core';
    return 'Supra';
  }
  return 'Geral';
}

function generateTags(name: string, category: string): object {
  const n = name.toLowerCase();
  let target = category.toUpperCase();
  if (n.includes('stiff') || n.includes('flexora') || n.includes('posterior') || n.includes('romeno')) target = 'POSTERIOR';
  else if (n.includes('extensora') || n.includes('agachamento') || n.includes('leg press') || n.includes('hack') || n.includes('sissy')) target = 'QUADRICEPS';
  else if (n.includes('pelve') || n.includes('pélvica') || n.includes('abdução') || n.includes('glúteo') || n.includes('gluteo') || n.includes('coice') || n.includes('abdutora')) target = 'GLUTEOS';
  else if (n.includes('adutora') || n.includes('adutor')) target = 'ADUTOR';
  else if (n.includes('panturrilha') || n.includes('gêmeos') || n.includes('gemeos') || n.includes('sóleo')) target = 'PANTURRILHA';
  else if (n.includes('supino') || n.includes('crucifixo') || n.includes('peck deck') || n.includes('voador frontal') || n.includes('cross')) target = 'PEITO';
  else if (n.includes('remada') || n.includes('serrote')) target = 'COSTAS_REMADA';
  else if (n.includes('puxada') || n.includes('pulldown') || n.includes('pull down') || n.includes('barra fixa')) target = 'COSTAS_PUXADA';
  else if (n.includes('desenvolvimento') || n.includes('elevação frontal') || n.includes('frontal')) target = 'OMBRO_FRONTAL';
  else if (n.includes('elevação lateral') || n.includes('lateral')) target = 'OMBRO_LATERAL';
  else if (n.includes('voador inverso') || n.includes('face pull') || n.includes('posterior')) target = 'OMBRO_POST';
  else if (n.includes('encolhimento') || n.includes('trapézio') || n.includes('trapezio')) target = 'TRAPEZIO';
  else if (n.includes('tríceps') || n.includes('triceps') || n.includes('francesa') || n.includes('testa') || n.includes('corda')) target = 'TRICEPS';
  else if (n.includes('bíceps') || n.includes('biceps') || n.includes('rosca') || n.includes('scott')) target = 'BICEPS';
  else if (n.includes('abdominal') || n.includes('prancha') || n.includes('infra') || n.includes('oblíquo')) target = 'ABDOMEN';

  let mechanic = 'ISOLADO';
  if (n.includes('agachamento') || n.includes('leg press') || n.includes('supino') || n.includes('remada') || n.includes('puxada') || n.includes('desenvolvimento') || n.includes('stiff') || n.includes('terra') || n.includes('hack') || n.includes('afundo') || n.includes('passada') || n.includes('búlgaro') || n.includes('mergulho') || n.includes('barra fixa')) mechanic = 'COMPOSTO';

  let equipment = 'LIVRE';
  if (n.includes('máquina') || n.includes('maquina') || n.includes('extensora') || n.includes('flexora') || n.includes('peck deck') || n.includes('hack') || n.includes('articulado') || n.includes('smart')) equipment = 'MAQUINA';
  else if (n.includes('cross') || n.includes('polia') || n.includes('cabo') || n.includes('corda')) equipment = 'POLIA';
  else if (n.includes('halter') || n.includes('halteres')) equipment = 'HALTER';
  else if (n.includes('barra') || n.includes('smith')) equipment = 'BARRA';
  else if (n.includes('caneleira')) equipment = 'CANELEIRA';
  else if (n.includes('prancha') || n.includes('corporal') || n.includes('livre')) equipment = 'PESO_CORPORAL';

  const jointRisk: string[] = [];
  if (n.includes('stiff') || n.includes('terra') || n.includes('remada curvada') || n.includes('agachamento livre') || n.includes('bom dia')) jointRisk.push('LOMBAR');
  if (n.includes('agachamento') || n.includes('extensora') || n.includes('leg press') || n.includes('hack') || n.includes('sissy') || n.includes('afundo') || n.includes('passada')) jointRisk.push('JOELHO');
  if (n.includes('desenvolvimento') || n.includes('tríceps testa') || n.includes('puxada costas') || n.includes('crucifixo') || n.includes('supino')) jointRisk.push('OMBRO');

  return { target, mechanic, equipment, jointRisk };
}

// 👇 LISTAGEM — sem duplicatas
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const adminId = searchParams.get('adminId');

    if (!adminId || adminId === 'null' || adminId === 'undefined') {
      return NextResponse.json([]);
    }

    const isMaster = MASTER_IDS.includes(adminId);
    let whereClause: any = {};

    if (isMaster) {
      // 🔥 CORREÇÃO: Master vê APENAS os próprios exercícios + globais (sem coachId)
      // Não mistura com exercícios de outros admins do MASTER_IDS — evita duplicatas
      whereClause = {
        OR: [
          { coachId: adminId },   // Só os dele
          { coachId: null }       // Globais sem dono
        ]
      };
    } else {
      // Parceiro vê os próprios + herda APENAS do Paulo (master principal)
      // Não inclui a Adri como fonte de herança para evitar duplicatas
      whereClause = {
        OR: [
          { coachId: adminId },
          { coachId: '3c82f763-66b4-48da-836e-16817d4f57c0' }, // Paulo — fonte única de herança
          { coachId: null }
        ]
      };
    }

    const exercises = await prisma.exercise.findMany({
      where: whereClause,
      orderBy: { name: 'asc' }
    });

    return NextResponse.json(exercises);
  } catch (error) {
    console.error("Erro GET Exercises:", error);
    return NextResponse.json({ error: "Erro ao buscar exercícios" }, { status: 500 });
  }
}

// 👇 CRIAÇÃO
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const cat = body.muscleGroup || body.category || "Geral";
    const subCat = body.subCategory || guessSubCategory(body.name, cat);
    const envs = body.environments && body.environments.length > 0 ? body.environments : ["ACADEMIA"];
    const tags = generateTags(body.name, cat);
    const adminId = body.adminId;

    if (!adminId) return NextResponse.json({ error: "Acesso Negado: Faltando Admin ID" }, { status: 403 });

    const exercise = await prisma.exercise.create({
      data: {
        name: body.name,
        category: cat,
        subCategory: subCat,
        environments: envs,
        tags: tags,
        videoUrl: body.videoUrl || "",
        instructions: body.instructions || "Execução padrão FIT OS.",
        howToExecute: body.howToExecute || null,
        commonMistakes: body.commonMistakes || null,
        maleFocus: body.maleFocus || null,
        femaleFocus: body.femaleFocus || null,
        coachId: adminId,
        defaultSubstitutes: body.defaultSubstitutes || []
      }
    });
    return NextResponse.json(exercise);
  } catch (error: any) {
    console.error("Erro POST Exercise:", error);
    if (error.code === 'P2002') return NextResponse.json({ error: "Já cadastrado." }, { status: 400 });
    return NextResponse.json({ error: "Erro ao cadastrar" }, { status: 500 });
  }
}

// 👇 EDIÇÃO
export async function PUT(req: Request) {
  try {
    const body = await req.json();
    const { id, adminId } = body;

    const isOwner = await checkExerciseOwnership(id, adminId);
    if (!isOwner) return NextResponse.json({ error: "Acesso Negado: Apenas o criador pode editar este exercício." }, { status: 403 });

    const cat = body.muscleGroup || body.category || "Geral";
    const subCat = body.subCategory || guessSubCategory(body.name, cat);
    const envs = body.environments && body.environments.length > 0 ? body.environments : ["ACADEMIA"];
    const tags = generateTags(body.name, cat);

    const updatedExercise = await prisma.exercise.update({
      where: { id: id },
      data: {
        name: body.name,
        category: cat,
        subCategory: subCat,
        environments: envs,
        tags: tags,
        videoUrl: body.videoUrl || "",
        instructions: body.instructions || "Execução padrão FIT OS.",
        howToExecute: body.howToExecute || null,
        commonMistakes: body.commonMistakes || null,
        maleFocus: body.maleFocus || null,
        femaleFocus: body.femaleFocus || null,
        defaultSubstitutes: body.defaultSubstitutes || []
      }
    });
    return NextResponse.json(updatedExercise);
  } catch (error) {
    console.error("Erro PUT Exercise:", error);
    return NextResponse.json({ error: "Erro ao editar" }, { status: 500 });
  }
}

// 👇 EXCLUSÃO
export async function DELETE(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');
    const adminId = searchParams.get('adminId');

    if (!id) return NextResponse.json({ error: "ID obrigatório" }, { status: 400 });

    const isOwner = await checkExerciseOwnership(id, adminId);
    if (!isOwner) return NextResponse.json({ error: "Acesso Negado: Apenas o criador pode excluir este exercício." }, { status: 403 });

    await prisma.exercise.delete({ where: { id: id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: "Erro ao excluir" }, { status: 500 });
  }
}