// app/api/exercise/route.ts
import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
export const dynamic = 'force-dynamic';

// 🔥 INTELIGÊNCIA DE AUTO-TAGUEAMENTO 🔥
function guessSubCategory(name: string, category: string): string {
  const n = name.toLowerCase();
  const c = category.toLowerCase();

  // PEITORAL
  if (c.includes('peit')) {
    if (n.includes('inclinado') || n.includes('superior')) return 'Superior';
    if (n.includes('declinado') || n.includes('inferior')) return 'Inferior';
    return 'Medial'; 
  }
  
  // COSTAS
  if (c.includes('costas') || c.includes('dorsal')) {
    if (n.includes('puxada') || n.includes('pulldown') || n.includes('barra fixa') || n.includes('pull down')) return 'Puxadas';
    if (n.includes('lombar') || n.includes('hiperextensão') || n.includes('bom dia')) return 'Lombar';
    return 'Remadas'; 
  }
  
  // PERNAS
  if (c.includes('perna') || c.includes('membros inferiores') || c.includes('coxa')) {
    if (n.includes('panturrilha') || n.includes('gêmeos') || n.includes('gemeos') || n.includes('sóleo')) return 'Panturrilha';
    if (n.includes('glúteo') || n.includes('gluteo') || n.includes('pélvica') || n.includes('pelvica') || n.includes('abdutora') || n.includes('coice')) return 'Glúteos';
    if (n.includes('flexora') || n.includes('stiff') || n.includes('posterior') || n.includes('romeno')) return 'Posteriores';
    if (n.includes('extensora') || n.includes('adutora') || n.includes('adutor') || n.includes('sissy')) return 'Quadríceps e Adutores';
    if (n.includes('agachamento') || n.includes('leg') || n.includes('hack') || n.includes('afundo') || n.includes('passada') || n.includes('búlgaro')) return 'Multiarticular';
    return 'Geral';
  }
  
  // OMBROS
  if (c.includes('ombro') || c.includes('deltoide')) {
    if (n.includes('encolhimento') || n.includes('trapézio') || n.includes('trapezio')) return 'Trapézio';
    if (n.includes('desenvolvimento')) return 'Multiarticular';
    if (n.includes('frontal') || n.includes('frente')) return 'Frontal';
    if (n.includes('posterior') || n.includes('inverso') || n.includes('face pull') || n.includes('facepull') || n.includes('voador inverso')) return 'Posterior';
    if (n.includes('lateral') || n.includes('manguito') || n.includes('remada alta')) return 'Lateral';
    return 'Geral';
  }
  
  // ABDÔMEN
  if (c.includes('abd') || c.includes('core')) {
    if (n.includes('remador') || n.includes('rodinha') || n.includes('roda') || n.includes('canivete') || n.includes('completo')) return 'Completo';
    if (n.includes('infra') || n.includes('perna') || n.includes('pendurado')) return 'Infra';
    if (n.includes('prancha') || n.includes('isometria') || n.includes('oblíquo') || n.includes('obliquo')) return 'Core'; // Apenas estabilizações e isometrias
    return 'Supra'; 
  }
  
  return 'Geral';
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const adminId = searchParams.get('adminId');

    if (!adminId || adminId === 'null' || adminId === 'undefined') {
        return NextResponse.json([]);
    }

    const exercises = await prisma.exercise.findMany({
      where: { coachId: adminId }, 
      orderBy: { name: 'asc' }
    });
    
    return NextResponse.json(exercises);
  } catch (error) {
    console.error("Erro GET Exercises:", error);
    return NextResponse.json({ error: "Erro ao buscar exercícios" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const cat = body.muscleGroup || body.category || "Geral";
    const subCat = body.subCategory || guessSubCategory(body.name, cat);

    const exercise = await prisma.exercise.create({
      data: {
        name: body.name,
        category: cat,
        subCategory: subCat,
        videoUrl: body.videoUrl || "",
        instructions: body.instructions || "Execução padrão FIT OS.",
        coachId: body.adminId || null 
      }
    });
    return NextResponse.json(exercise);
  } catch (error: any) {
    console.error("Erro POST Exercise:", error);
    if (error.code === 'P2002') return NextResponse.json({ error: "Já cadastrado." }, { status: 400 });
    return NextResponse.json({ error: "Erro ao cadastrar" }, { status: 500 });
  }
}

export async function PUT(req: Request) {
  try {
    const body = await req.json();
    const cat = body.muscleGroup || body.category || "Geral";
    const subCat = body.subCategory || guessSubCategory(body.name, cat);

    const updatedExercise = await prisma.exercise.update({
      where: { id: body.id },
      data: {
        name: body.name,
        category: cat,
        subCategory: subCat,
        videoUrl: body.videoUrl || "",
        instructions: body.instructions || "Execução padrão FIT OS."
      }
    });
    return NextResponse.json(updatedExercise);
  } catch (error) {
    return NextResponse.json({ error: "Erro ao editar" }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');
    if (!id) return NextResponse.json({ error: "ID obrigatório" }, { status: 400 });
    
    await prisma.exercise.delete({ where: { id: id } }); 
    
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: "Erro ao excluir" }, { status: 500 });
  }
}