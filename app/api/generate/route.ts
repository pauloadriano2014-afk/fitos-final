import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

const globalForPrisma = global as unknown as { prisma: PrismaClient };
const prisma = globalForPrisma.prisma || new PrismaClient();
if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;

export const dynamic = 'force-dynamic';

// =====================================================================
// 1. BANCO DE TREINOS (ORDEM MANUAL DEFINIDA POR VOCÊ AQUI)
// =====================================================================
const TREINOS_BASE: any = {
  a1: {
    day: 'A', focus: 'Empurrar (Foco Peito)',
    exercises: [
      { name: 'Mobilidade de ombro c/bastão', sets: 1, reps: '1 min', category: 'Mobilidade', restTime: 0 },
      { name: 'Supino reto c/barra', sets: 4, reps: '8', category: 'Peito', restTime: 90 },
      { name: 'Supino inclinado c/halteres', sets: 3, reps: '10', category: 'Peito', restTime: 60 },
      { name: 'Voador frontal', sets: 3, reps: '12', category: 'Peito', restTime: 45 },
      { name: 'Desenvolvimento c/halteres', sets: 3, reps: '10', category: 'Ombros', restTime: 60 },
      { name: 'Elevação lateral', sets: 4, reps: '12', category: 'Ombros', restTime: 45 },
      { name: 'Tríceps corda', sets: 4, reps: '12', category: 'Tríceps', restTime: 45 },
      { name: 'Tríceps francês', sets: 3, reps: '12', category: 'Tríceps', restTime: 45 }
    ]
  },
  b1: {
    day: 'B', focus: 'Puxar (Vertical)',
    exercises: [
      { name: 'Alongamento dinâmico de peitoral', sets: 1, reps: '1 min', category: 'Mobilidade', restTime: 0 },
      { name: 'Puxada frente aberta', sets: 4, reps: '10', category: 'Costas', restTime: 60 },
      { name: 'Puxada triângulo', sets: 3, reps: '10', category: 'Costas', restTime: 60 },
      { name: 'Remada curvada c/barra', sets: 3, reps: '10', category: 'Costas', restTime: 60 },
      { name: 'Voador invertido', sets: 3, reps: '12', category: 'Costas', restTime: 45 },
      { name: 'Rosca direta c/barra curvada', sets: 4, reps: '10', category: 'Bíceps', restTime: 45 },
      { name: 'Rosca martelo', sets: 3, reps: '12', category: 'Bíceps', restTime: 45 }
    ]
  },
  c1: {
    day: 'C', focus: 'Pernas (Foco Quadríceps)',
    exercises: [
      { name: 'Mobilidade de quadril 90/90', sets: 1, reps: '1 min', category: 'Mobilidade', restTime: 0 },
      { name: 'Agachamento livre c/barra', sets: 4, reps: '8', category: 'Pernas', restTime: 90 },
      { name: 'Leg press 45°', sets: 4, reps: '10', category: 'Pernas', restTime: 60 },
      { name: 'Cadeira extensora', sets: 3, reps: '12', category: 'Pernas', restTime: 45 },
      { name: 'Mesa flexora', sets: 4, reps: '12', category: 'Pernas', restTime: 45 },
      { name: 'Panturrilha em pé', sets: 4, reps: '15', category: 'Pernas', restTime: 30 },
      { name: 'Prancha abdominal', sets: 3, reps: '45s', category: 'Abdômen', restTime: 30 }
    ]
  },
  a2: {
    day: 'D', focus: 'Empurrar (Variação)',
    exercises: [
      { name: 'Mobilidade de ombro c/bastão', sets: 1, reps: '1 min', category: 'Mobilidade', restTime: 0 },
      { name: 'Supino reto c/halteres', sets: 4, reps: '10', category: 'Peito', restTime: 60 },
      { name: 'Crucifixo máquina', sets: 3, reps: '12', category: 'Peito', restTime: 45 },
      { name: 'Desenvolvimento máquina', sets: 4, reps: '10', category: 'Ombros', restTime: 60 },
      { name: 'Elevação lateral no cross', sets: 4, reps: '12', category: 'Ombros', restTime: 45 },
      { name: 'Tríceps testa c/barra H', sets: 4, reps: '10', category: 'Tríceps', restTime: 45 },
      { name: 'Tríceps banco', sets: 3, reps: 'Falha', category: 'Tríceps', restTime: 45 }
    ]
  },
  b2: {
    day: 'E', focus: 'Puxar (Variação)',
    exercises: [
      { name: 'Alongamento dinâmico de peitoral', sets: 1, reps: '1 min', category: 'Mobilidade', restTime: 0 },
      { name: 'Barra fixa pegada aberta', sets: 3, reps: 'Falha', category: 'Costas', restTime: 90 },
      { name: 'Remada cavalinho', sets: 4, reps: '10', category: 'Costas', restTime: 60 },
      { name: 'Serrote', sets: 3, reps: '12', category: 'Costas', restTime: 45 },
      { name: 'Face pull', sets: 3, reps: '15', category: 'Costas', restTime: 45 },
      { name: 'Rosca Scott', sets: 4, reps: '10', category: 'Bíceps', restTime: 45 },
      { name: 'Rosca alternada c/halteres', sets: 3, reps: '12', category: 'Bíceps', restTime: 45 }
    ]
  },
  c2: {
    day: 'F', focus: 'Pernas (Foco Posterior)',
    exercises: [
      { name: 'Mobilidade de tornozelo na parede', sets: 1, reps: '1 min', category: 'Mobilidade', restTime: 0 },
      { name: 'Stiff c/barra', sets: 4, reps: '10', category: 'Pernas', restTime: 90 },
      { name: 'Elevação pélvica máquina', sets: 4, reps: '12', category: 'Pernas', restTime: 60 },
      { name: 'Búlgaro c/halteres', sets: 3, reps: '10', category: 'Pernas', restTime: 60 },
      { name: 'Cadeira flexora', sets: 4, reps: '12', category: 'Pernas', restTime: 45 },
      { name: 'Panturrilha sentado', sets: 4, reps: '15', category: 'Pernas', restTime: 30 },
      { name: 'Abdominal infra', sets: 3, reps: '15', category: 'Abdômen', restTime: 30 }
    ]
  },
  fullbody: [
    { 
        day: 'A', focus: 'Fullbody', 
        exercises: [
            { name: 'Mobilidade Geral', sets: 1, reps: '1 min', category: 'Mobilidade' },
            { name: 'Agachamento', sets: 3, reps: '12', category: 'Pernas' },
            { name: 'Supino', sets: 3, reps: '12', category: 'Peito' },
            { name: 'Puxada', sets: 3, reps: '12', category: 'Costas' }
        ] 
    }
  ]
};

// =====================================================================
// 2. FUNÇÕES AUXILIARES
// =====================================================================

// Aplica técnicas baseado na posição da lista (Ordem Manual)
function aplicarTecnicas(treino: any[], nivel: string) {
  const nivelStr = nivel ? nivel.toLowerCase() : 'iniciante';
  if (nivelStr !== 'avançado') return treino;

  return treino.map((dia: any) => {
    let newExercises = dia.exercises.map((ex: any) => ({ ...ex }));

    // Se tiver mais de 2 exercícios, aplica RESTPAUSE no segundo da lista
    if (newExercises.length > 2 && !newExercises[1].name.includes('Mobilidade')) {
        newExercises[1].technique = 'RESTPAUSE';
        newExercises[1].notes = 'Carga máxima + pausa curta';
    }
    
    // DROPSET no penúltimo exercício
    if (newExercises.length > 4) {
        const target = newExercises.length - 2; 
        if(newExercises[target].category !== 'Abdômen' && newExercises[target].category !== 'Mobilidade') {
            newExercises[target].technique = 'DROPSET';
            newExercises[target].notes = 'Falha total';
        }
    }
    return { ...dia, exercises: newExercises };
  });
}

// Filtra lesões mantendo a ordem original, apenas trocando o exercício
function filtrarLesoes(treino: any[], limitacoes: string[], cirurgias: string[]) {
  const problemas = [...(limitacoes || []), ...(cirurgias || [])].map(t => t.toLowerCase().trim()).filter(t => t !== 'nenhuma');
  if (problemas.length === 0) return treino;

  return treino.map((dia: any) => {
    let newExercises = dia.exercises.map((ex: any) => {
      let modificado = { ...ex };
      const nomeEx = ex.name.toLowerCase();

      if (problemas.some(p => p.includes('joelho') || p.includes('lca'))) {
        if (nomeEx.includes('agachamento') || nomeEx.includes('afundo') || nomeEx.includes('leg press')) {
             return { ...modificado, name: 'Elevação pélvica máquina', notes: 'Substituído (Joelho)' };
        }
        if (nomeEx.includes('extensora')) return { ...modificado, name: 'Mesa flexora', notes: 'Foco Posterior' };
      }
      if (problemas.some(p => p.includes('lombar') || p.includes('hérnia'))) {
        if (nomeEx.includes('agachamento') || nomeEx.includes('terra') || nomeEx.includes('remada curvada')) {
            return { ...modificado, name: 'Puxada frente aberta', notes: 'Substituído (Coluna)' };
        }
      }
      return modificado;
    });
    
    return { ...dia, exercises: newExercises };
  });
}

// =====================================================================
// 3. EXECUÇÃO
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

    // SELEÇÃO DE TEMPLATE (Mantendo a lógica de dias)
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

    // 1. FILTRA (Lesões)
    let treinoFinal = filtrarLesoes(template, limitacoes, cirurgias);

    // 2. TÉCNICAS (Se avançado)
    treinoFinal = aplicarTecnicas(treinoFinal, nivel);

    // NOTA: Removi a função ordenarPorBaldes(). A ordem agora é 100% a do array TREINOS_BASE.

    // 3. PREPARAÇÃO PARA SALVAR
    const dbExercises = await prisma.exercise.findMany();
    const exercisesMap = new Map(dbExercises.map(e => [e.name.toLowerCase().trim(), e.id]));
    const fallbackId = dbExercises[0]?.id;

    const exercisesToSave = [];

    // Limpa treino anterior
    await prisma.workoutExercise.deleteMany({ where: { workout: { userId } } });
    await prisma.workout.deleteMany({ where: { userId } });

    // Cria Treino Pai
    const workout = await prisma.workout.create({
      data: {
        userId,
        name: `Treino ${nivel} - ${dias} Dias`,
        goal: objetivo,
        level: nivel,
        isVisible: true
      }
    });

    // Processa exercícios
    for (const dia of treinoFinal) {
      if(!dia || !dia.exercises) continue;
      
      // AQUI ESTÁ O SEGREDO: Usamos o índice 'i' como ORDEM
      for (let i = 0; i < dia.exercises.length; i++) {
        const ex = dia.exercises[i];
        let realId = exercisesMap.get(ex.name.toLowerCase().trim());
        
        // Tenta achar parcial se não achou exato
        if (!realId) {
            const match = dbExercises.find(d => d.name.toLowerCase().includes(ex.name.toLowerCase().split(' ')[0]));
            realId = match ? match.id : fallbackId;
        }

        if (realId) {
            exercisesToSave.push({
                workoutId: workout.id,
                exerciseId: realId,
                day: dia.day,
                sets: Number(ex.sets),
                reps: String(ex.reps),
                technique: ex.technique || "",
                notes: ex.notes || "",
                restTime: ex.restTime ? Number(ex.restTime) : 60,
                order: i // <--- SALVA A ORDEM EXATA DO ARRAY, SEM REORDENAR
            });
        }
      }
    }

    // Salva em lote para garantir performance
    if (exercisesToSave.length > 0) {
        await prisma.workoutExercise.createMany({ data: exercisesToSave });
    }

    return NextResponse.json({ success: true, workoutId: workout.id });

  } catch (error: any) {
    console.error("Erro Fatal:", error);
    return NextResponse.json({ error: "Erro: " + error.message }, { status: 500 });
  }
}