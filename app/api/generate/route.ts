import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

const globalForPrisma = global as unknown as { prisma: PrismaClient };
const prisma = globalForPrisma.prisma || new PrismaClient();
if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;

export const dynamic = 'force-dynamic';

// =====================================================================
// 1. BANCO DE TREINOS
// =====================================================================
const TREINOS_BASE: any = {
  a1: {
    day: 'A', focus: 'Empurrar (Foco Peito)',
    exercises: [
      { name: 'Mobilidade de ombro c/bastão', sets: 1, reps: '1 min', category: 'Mobilidade' },
      { name: 'Supino reto c/barra', sets: 4, reps: '8', category: 'Peito' },
      { name: 'Supino inclinado c/halteres', sets: 3, reps: '10', category: 'Peito' },
      { name: 'Voador frontal', sets: 3, reps: '12', category: 'Peito' },
      { name: 'Desenvolvimento c/halteres', sets: 3, reps: '10', category: 'Ombros' },
      { name: 'Elevação lateral', sets: 4, reps: '12', category: 'Ombros' },
      { name: 'Tríceps corda', sets: 4, reps: '12', category: 'Tríceps' },
      { name: 'Tríceps francês', sets: 3, reps: '12', category: 'Tríceps' }
    ]
  },
  b1: {
    day: 'B', focus: 'Puxar (Vertical)',
    exercises: [
      { name: 'Alongamento dinâmico de peitoral', sets: 1, reps: '1 min', category: 'Mobilidade' },
      { name: 'Puxada frente aberta', sets: 4, reps: '10', category: 'Costas' },
      { name: 'Puxada triângulo', sets: 3, reps: '10', category: 'Costas' },
      { name: 'Remada curvada c/barra', sets: 3, reps: '10', category: 'Costas' },
      { name: 'Voador invertido', sets: 3, reps: '12', category: 'Costas' },
      { name: 'Rosca direta c/barra curvada', sets: 4, reps: '10', category: 'Bíceps' },
      { name: 'Rosca martelo', sets: 3, reps: '12', category: 'Bíceps' }
    ]
  },
  c1: {
    day: 'C', focus: 'Pernas (Foco Quadríceps)',
    exercises: [
      { name: 'Mobilidade de quadril 90/90', sets: 1, reps: '1 min', category: 'Mobilidade' },
      { name: 'Agachamento livre c/barra', sets: 4, reps: '8', category: 'Pernas' },
      { name: 'Leg press 45°', sets: 4, reps: '10', category: 'Pernas' },
      { name: 'Cadeira extensora', sets: 3, reps: '12', category: 'Pernas' },
      { name: 'Mesa flexora', sets: 4, reps: '12', category: 'Pernas' },
      { name: 'Panturrilha em pé', sets: 4, reps: '15', category: 'Pernas' },
      { name: 'Prancha abdominal', sets: 3, reps: '45s', category: 'Abdômen' }
    ]
  },
  a2: {
    day: 'D', focus: 'Empurrar (Variação)',
    exercises: [
      { name: 'Mobilidade de ombro c/bastão', sets: 1, reps: '1 min', category: 'Mobilidade' },
      { name: 'Supino reto c/halteres', sets: 4, reps: '10', category: 'Peito' },
      { name: 'Crucifixo máquina', sets: 3, reps: '12', category: 'Peito' },
      { name: 'Desenvolvimento máquina', sets: 4, reps: '10', category: 'Ombros' },
      { name: 'Elevação lateral no cross', sets: 4, reps: '12', category: 'Ombros' },
      { name: 'Tríceps testa c/barra H', sets: 4, reps: '10', category: 'Tríceps' },
      { name: 'Tríceps banco', sets: 3, reps: 'Falha', category: 'Tríceps' }
    ]
  },
  b2: {
    day: 'E', focus: 'Puxar (Variação)',
    exercises: [
      { name: 'Alongamento dinâmico de peitoral', sets: 1, reps: '1 min', category: 'Mobilidade' },
      { name: 'Barra fixa pegada aberta', sets: 3, reps: 'Falha', category: 'Costas' },
      { name: 'Remada cavalinho', sets: 4, reps: '10', category: 'Costas' },
      { name: 'Serrote', sets: 3, reps: '12', category: 'Costas' },
      { name: 'Face pull', sets: 3, reps: '15', category: 'Costas' },
      { name: 'Rosca Scott', sets: 4, reps: '10', category: 'Bíceps' },
      { name: 'Rosca alternada c/halteres', sets: 3, reps: '12', category: 'Bíceps' }
    ]
  },
  c2: {
    day: 'F', focus: 'Pernas (Foco Posterior)',
    exercises: [
      { name: 'Mobilidade de tornozelo na parede', sets: 1, reps: '1 min', category: 'Mobilidade' },
      { name: 'Stiff c/barra', sets: 4, reps: '10', category: 'Pernas' },
      { name: 'Elevação pélvica máquina', sets: 4, reps: '12', category: 'Pernas' },
      { name: 'Búlgaro c/halteres', sets: 3, reps: '10', category: 'Pernas' },
      { name: 'Cadeira flexora', sets: 4, reps: '12', category: 'Pernas' },
      { name: 'Panturrilha sentado', sets: 4, reps: '15', category: 'Pernas' },
      { name: 'Abdominal infra', sets: 3, reps: '15', category: 'Abdômen' }
    ]
  },
  fullbody: [
    { day: 'A', focus: 'Fullbody', exercises: [{ name: 'Agachamento', sets: 3, reps: '12', category: 'Pernas' }] }
  ]
};

// =====================================================================
// 2. ORDENAÇÃO POR BALDES (INFALÍVEL)
// =====================================================================

function ordenarPorBaldes(exercises: any[]) {
  // 1. Cria os baldes vazios
  const mob = [];
  const grandes = []; // Perna, Peito, Costas
  const pequenos = []; // Ombro, Triceps, Biceps
  const finalizadores = []; // Abs, Cardio

  for (const ex of exercises) {
    const nome = ex.name.toLowerCase();
    const cat = (ex.category || '').toLowerCase();

    // REGRA SUPREMA: SE TIVER "MOBILIDADE" NO NOME, VAI PRO TOPO
    if (nome.includes('mobilidade') || nome.includes('alongamento') || cat.includes('mobilidade')) {
      mob.push(ex);
      continue;
    }

    // REGRA 2: MUSCULOS
    if (cat.includes('perna') || cat.includes('costas') || cat.includes('peito')) {
        grandes.push(ex);
    } 
    else if (cat.includes('ombro') || cat.includes('tríceps') || cat.includes('triceps') || cat.includes('bíceps') || cat.includes('biceps')) {
        pequenos.push(ex);
    } 
    else {
        finalizadores.push(ex);
    }
  }

  // 3. Ordena dentro dos baldes (Ex: Supino antes de Voador)
  // Função auxiliar de ordenação interna
  const sortInternal = (a: any, b: any) => {
     // Costas: Puxada antes de Remada
     if(a.category === 'Costas' && b.category === 'Costas') {
         const aVert = a.name.includes('Puxada') || a.name.includes('Barra');
         const bVert = b.name.includes('Puxada') || b.name.includes('Barra');
         if(aVert && !bVert) return -1;
         if(!aVert && bVert) return 1;
     }
     // Peito: Supino antes de Isolador
     if(a.category === 'Peito' && b.category === 'Peito') {
         const aPress = a.name.includes('Supino');
         const bPress = b.name.includes('Supino');
         if(aPress && !bPress) return -1;
         if(!aPress && bPress) return 1;
     }
     return 0;
  };

  grandes.sort(sortInternal);
  pequenos.sort(sortInternal);

  // 4. Cola tudo na ordem correta
  return [...mob, ...grandes, ...pequenos, ...finalizadores];
}

// =====================================================================
// 3. TÉCNICAS E FILTROS
// =====================================================================

function aplicarTecnicas(treino: any[], nivel: string) {
  const nivelStr = nivel ? nivel.toLowerCase() : 'iniciante';
  if (nivelStr !== 'avançado') return treino;

  return treino.map((dia: any) => {
    // Agora que está ordenado, sabemos posições exatas
    const exMob = dia.exercises[0]; // Mobilidade
    const exPrincipal = dia.exercises[1]; // Primeiro Grande (Agacha/Supino/Puxada)
    const exSecundario = dia.exercises[2]; 
    const exUltimo = dia.exercises[dia.exercises.length - 2]; // Penúltimo (antes do abs)

    let newExercises = dia.exercises.map((ex: any) => ({ ...ex }));

    // REST-PAUSE no exercício principal (índice 1)
    if (newExercises[1] && !newExercises[1].name.includes('Mobilidade')) {
        newExercises[1].technique = 'RESTPAUSE';
        newExercises[1].notes = 'Carga máxima + pausa curta';
    }

    // DROP-SET no último exercício de músculo (frequentemente o penúltimo da lista)
    if (newExercises.length > 4) {
        const target = newExercises.length - 2; 
        if(newExercises[target].category !== 'Abdômen') {
            newExercises[target].technique = 'DROPSET';
            newExercises[target].notes = 'Falha total';
        }
    }

    return { ...dia, exercises: newExercises };
  });
}

function filtrarLesoes(treino: any[], limitacoes: string[], cirurgias: string[]) {
  const problemas = [...(limitacoes || []), ...(cirurgias || [])].map(t => t.toLowerCase().trim()).filter(t => t !== 'nenhuma');
  if (problemas.length === 0) return treino;

  return treino.map((dia: any) => {
    let newExercises = dia.exercises.map((ex: any) => {
      let modificado = { ...ex };
      const nomeEx = ex.name.toLowerCase();

      if (problemas.some(p => p.includes('joelho') || p.includes('lca'))) {
        if (nomeEx.includes('agachamento') || nomeEx.includes('afundo')) return { ...modificado, name: 'Elevação pélvica máquina', notes: 'Substituído (Joelho)' };
        if (nomeEx.includes('extensora')) return { ...modificado, name: 'Mesa flexora', notes: 'Foco Posterior' };
      }
      if (problemas.some(p => p.includes('lombar') || p.includes('hérnia'))) {
        if (nomeEx.includes('agachamento') || nomeEx.includes('terra') || nomeEx.includes('remada curvada')) return { ...modificado, name: 'Puxada frente aberta', notes: 'Substituído (Coluna)' };
      }
      return modificado;
    });
    
    // Remove duplicatas
    const nomesVistos = new Set();
    newExercises = newExercises.filter((ex: any) => {
        if (nomesVistos.has(ex.name)) return false;
        nomesVistos.add(ex.name);
        return true;
    });

    return { ...dia, exercises: newExercises };
  });
}

function ajustarPorTempo(treino: any[], tempo: number) {
  if (tempo > 45) return treino;
  return treino.map((dia: any) => ({
    ...dia,
    exercises: dia.exercises.slice(0, 5).map((ex: any) => ({ ...ex, restTime: 45 }))
  }));
}

// =====================================================================
// 4. EXECUÇÃO
// =====================================================================

export async function POST(req: Request) {
  try {
    const { userId } = await req.json();
    if (!userId) return NextResponse.json({ error: "UserId obrigatório" }, { status: 400 });

    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { anamneses: { orderBy: { createdAt: 'desc' }, take: 1 } }
    });

    if (!user || user.anamneses.length === 0) return NextResponse.json({ error: "Anamnese 404" }, { status: 404 });

    const anamnese = user.anamneses[0];
    const dias = anamnese.frequencia || 3;
    const tempo = anamnese.tempoDisponivel || 60;
    const nivel = anamnese.nivel || 'Iniciante';
    const objetivo = anamnese.objetivo || 'Hipertrofia';
    const limitacoes = anamnese.limitacoes || [];
    const cirurgias = anamnese.cirurgias || [];

    // SELEÇÃO
    let template = [];
    const A1 = TREINOS_BASE.a1 || TREINOS_BASE.fullbody[0];
    const B1 = TREINOS_BASE.b1 || TREINOS_BASE.fullbody[0];
    const C1 = TREINOS_BASE.c1 || TREINOS_BASE.fullbody[0];

    if (dias <= 2) template = TREINOS_BASE.fullbody;
    else if (dias === 3) template = [A1, B1, C1];
    else if (dias === 4) template = [A1, B1, C1, { ...TREINOS_BASE.a2, day: 'D' }];
    else if (dias >= 5) {
        template = [
            TREINOS_BASE.a1, TREINOS_BASE.b1, TREINOS_BASE.c1,
            TREINOS_BASE.a2, TREINOS_BASE.b2, TREINOS_BASE.c2 
        ];
        if (dias === 5) template.pop();
    }

    // 1. FILTRA
    let treinoFinal = filtrarLesoes(template, limitacoes, cirurgias);
    treinoFinal = ajustarPorTempo(treinoFinal, tempo);

    // 2. ORDENA (Agora usando BALDES)
    treinoFinal = treinoFinal.map((dia: any) => ({
        ...dia,
        exercises: ordenarPorBaldes(dia.exercises)
    }));

    // 3. TÉCNICAS (Agora que a ordem está garantida)
    treinoFinal = aplicarTecnicas(treinoFinal, nivel);

    // 4. SALVA
    const dbExercises = await prisma.exercise.findMany();
    const exercisesMap = new Map(dbExercises.map(e => [e.name.toLowerCase().trim(), e.id]));
    const fallbackId = dbExercises[0]?.id;

    const exercisesToSave = [];

    for (const dia of treinoFinal) {
      if(!dia || !dia.exercises) continue;
      for (const ex of dia.exercises) {
        let realId = exercisesMap.get(ex.name.toLowerCase().trim());
        if (!realId) {
            const match = dbExercises.find(d => d.name.toLowerCase().includes(ex.name.toLowerCase().split(' ')[0]));
            realId = match ? match.id : fallbackId;
        }
        if (realId) {
            exercisesToSave.push({
                exerciseId: realId,
                day: dia.day,
                sets: Number(ex.sets),
                reps: String(ex.reps),
                technique: ex.technique || "",
                notes: ex.notes || "",
                restTime: ex.restTime ? Number(ex.restTime) : 60
            });
        }
      }
    }

    await prisma.workout.deleteMany({ where: { userId } });

    const workout = await prisma.workout.create({
      data: {
        userId,
        name: `Treino ${nivel} - ${dias} Dias`,
        goal: objetivo,
        level: nivel,
        isVisible: true,
        exercises: { create: exercisesToSave }
      }
    });

    return NextResponse.json({ success: true, workoutId: workout.id });

  } catch (error: any) {
    console.error("Erro Fatal:", error);
    return NextResponse.json({ error: "Erro: " + error.message }, { status: 500 });
  }
}