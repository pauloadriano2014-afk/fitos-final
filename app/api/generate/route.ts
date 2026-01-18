import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

const globalForPrisma = global as unknown as { prisma: PrismaClient };
const prisma = globalForPrisma.prisma || new PrismaClient();
if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;

export const dynamic = 'force-dynamic';

// =====================================================================
// 1. BANCO DE TREINOS (Mantido e Completo)
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
// 2. DISTRIBUIÇÃO DE TÉCNICAS (INTELIGÊNCIA REAL)
// =====================================================================

function aplicarTecnicas(treino: any[], nivel: string) {
  const nivelStr = nivel ? nivel.toLowerCase() : 'iniciante';
  
  if (nivelStr !== 'avançado' && nivelStr !== 'intermediário') return treino;

  return treino.map((dia: any) => {
    let newExercises = dia.exercises.map((ex: any) => ({ ...ex }));
    const exercisesCount = newExercises.length;

    newExercises = newExercises.map((ex: any, index: number) => {
      const nome = ex.name.toLowerCase();
      const cat = ex.category;

      // 1. REST-PAUSE: No primeiro exercício "pesado" (index 1, pois 0 é mobilidade)
      if (index === 1 && !nome.includes('mobilidade') && nivelStr === 'avançado') {
        return { ...ex, technique: 'RESTPAUSE', notes: 'Carga alta, pausas curtas' };
      }

      // 2. CLUSTER SET: Para exercícios de máquina pesados no meio do treino
      if ((nome.includes('leg press') || nome.includes('supino máquina') || nome.includes('puxada')) && index > 1 && nivelStr === 'avançado') {
         return { ...ex, technique: 'CLUSTERSET', notes: '4 reps, pausa 15s, repete...' };
      }

      // 3. DROP-SET: No último exercício de cada grupo muscular principal
      // Ex: Último de Peito ou Último de Pernas do dia
      const isLastOfGroup = !newExercises[index + 1] || newExercises[index + 1].category !== cat;
      if (isLastOfGroup && (cat === 'Peito' || cat === 'Pernas' || cat === 'Ombros') && index > 1) {
         return { ...ex, technique: 'DROPSET', notes: 'Falha total na última série' };
      }

      // 4. MÉTODO 21: Para Bíceps e Tríceps Isolados
      if ((nome.includes('rosca direta') || nome.includes('tríceps corda') || nome.includes('scott')) && nivelStr === 'avançado') {
         return { ...ex, technique: '21', notes: '7 baixo, 7 alto, 7 completo' };
      }

      return ex;
    });

    return { ...dia, exercises: newExercises };
  });
}

// =====================================================================
// 3. ORDENAÇÃO MILITAR (Mantida)
// =====================================================================

function ordenarExercicios(exercises: any[]) {
  const prioridade: any = {
    'mobilidade': 0, 'pernas': 1, 'costas': 2, 'peito': 3, 'ombros': 4,
    'tríceps': 5, 'triceps': 5, 'bíceps': 6, 'biceps': 6, 'abdômen': 7, 'cardio': 8
  };

  return exercises.sort((a, b) => {
    const nomeA = a.name.toLowerCase();
    const nomeB = b.name.toLowerCase();
    const catA = (a.category || '').toLowerCase();
    const catB = (b.category || '').toLowerCase();

    const aIsMob = nomeA.includes('mobilidade') || nomeA.includes('alongamento') || catA === 'mobilidade';
    const bIsMob = nomeB.includes('mobilidade') || nomeB.includes('alongamento') || catB === 'mobilidade';
    
    if (aIsMob && !bIsMob) return -1;
    if (!aIsMob && bIsMob) return 1;

    const pA = prioridade[catA] || 99;
    const pB = prioridade[catB] || 99;
    if (pA !== pB) return pA - pB;

    if (catA === 'peito' && catB === 'peito') {
        const aPress = nomeA.includes('supino') || nomeA.includes('flexão');
        const bPress = nomeB.includes('supino') || nomeB.includes('flexão');
        if (aPress && !bPress) return -1;
        if (!aPress && bPress) return 1;
    }
    if (catA === 'costas' && catB === 'costas') {
        const aVert = nomeA.includes('puxada') || nomeA.includes('barra');
        const bVert = nomeB.includes('puxada') || nomeB.includes('barra');
        if (aVert && !bVert) return -1;
        if (!aVert && bVert) return 1;
    }
    if (catA === 'ombros' && catB === 'ombros') {
        const aPress = nomeA.includes('desenvolvimento');
        const bPress = nomeB.includes('desenvolvimento');
        if (aPress && !bPress) return -1;
        if (!aPress && bPress) return 1;
    }

    return 0;
  });
}

// =====================================================================
// 4. FILTROS E AJUSTES
// =====================================================================

function filtrarLesoes(treino: any[], limitacoes: string[], cirurgias: string[]) {
  const problemas = [...(limitacoes || []), ...(cirurgias || [])].map(t => t.toLowerCase().trim()).filter(t => t !== 'nenhuma');
  if (problemas.length === 0) return treino;

  return treino.map((dia: any) => {
    let newExercises = dia.exercises.map((ex: any) => {
      let modificado = { ...ex };
      const nomeEx = ex.name.toLowerCase();

      if (problemas.some(p => p.includes('joelho') || p.includes('lca') || p.includes('menisco'))) {
        if (nomeEx.includes('agachamento') || nomeEx.includes('afundo') || nomeEx.includes('búlgaro')) {
           return { ...modificado, name: 'Elevação pélvica máquina', notes: 'Proteção Joelho' };
        }
        if (nomeEx.includes('extensora')) return { ...modificado, name: 'Mesa flexora', notes: 'Foco Posterior' };
      }
      if (problemas.some(p => p.includes('lombar') || p.includes('hérnia') || p.includes('coluna'))) {
        if (nomeEx.includes('agachamento') || nomeEx.includes('terra') || nomeEx.includes('stiff') || nomeEx.includes('remada curvada')) {
           return { ...modificado, name: 'Puxada frente aberta', notes: 'Proteção Coluna' };
        }
      }
      if (problemas.some(p => p.includes('silicone') || p.includes('prótese'))) {
        if (nomeEx.includes('supino') && nomeEx.includes('barra')) return { ...modificado, name: 'Supino reto c/halteres', notes: 'Segurança Prótese' };
        if (nomeEx.includes('voador') || nomeEx.includes('crucifixo')) return { ...modificado, name: 'Supino máquina', notes: 'Segurança Prótese' };
      }
      return modificado;
    });

    const nomesVistos = new Set();
    newExercises = newExercises.filter((ex: any) => {
        if (nomesVistos.has(ex.name)) return false;
        nomesVistos.add(ex.name);
        return true;
    });

    return { ...dia, exercises: newExercises };
  });
}

function ajustarPorTempo(treino: any[], tempo: number, objetivo: string) {
  if (tempo > 45) return treino;
  return treino.map((dia: any) => {
    let sliced = dia.exercises.slice(0, 5).map((ex: any) => ({ ...ex, restTime: 45 }));
    if (objetivo === 'Emagrecimento' || objetivo === 'Definição') {
         if(sliced[sliced.length-1].category !== 'Mobilidade') {
             sliced[sliced.length-1] = { name: 'Polichinelo', sets: 3, reps: '1 min', category: 'Cardio', restTime: 30, notes: 'HIIT Final' };
         }
    }
    return { ...dia, exercises: sliced };
  });
}

// =====================================================================
// 5. EXECUÇÃO
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

    let template = [];
    // Garante fallback se faltar chave
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

    let treinoFinal = filtrarLesoes(template, limitacoes, cirurgias);
    treinoFinal = ajustarPorTempo(treinoFinal, tempo, objetivo);
    
    // ORDENA PRIMEIRO (Para garantir que o Multiarticular seja o index 1)
    treinoFinal = treinoFinal.map((dia: any) => ({
        ...dia,
        exercises: ordenarExercicios(dia.exercises)
    }));

    // APLICA TÉCNICAS DEPOIS (Para pegar o exercício certo)
    treinoFinal = aplicarTecnicas(treinoFinal, nivel);

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