import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

// --- SINGLETON PATTERN (Evita "Too many connections" na Render) ---
const globalForPrisma = global as unknown as { prisma: PrismaClient };
const prisma = globalForPrisma.prisma || new PrismaClient();
if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;

export const dynamic = 'force-dynamic';

// =====================================================================
// 1. BANCO DE TREINOS BASE (COMPLETO PARA 1 a 6 DIAS)
// =====================================================================

const TREINOS_BASE: any = {
  // --- A1: EMPURRAR (Foco Peito) ---
  a1: {
    day: 'A', focus: 'Empurrar (Foco Peito)',
    exercises: [
      { name: 'Mobilidade de ombro c/bastão', sets: 1, reps: '1 min', category: 'Mobilidade' },
      { name: 'Supino reto c/barra', sets: 4, reps: '10', category: 'Peito' },
      { name: 'Supino inclinado c/halteres', sets: 3, reps: '12', category: 'Peito' },
      { name: 'Voador frontal', sets: 3, reps: '15', category: 'Peito' },
      { name: 'Desenvolvimento c/halteres', sets: 3, reps: '12', category: 'Ombros' },
      { name: 'Elevação lateral', sets: 3, reps: '15', category: 'Ombros' },
      { name: 'Tríceps corda', sets: 4, reps: '12', category: 'Tríceps' },
      { name: 'Tríceps francês', sets: 3, reps: '12', category: 'Tríceps' }
    ]
  },

  // --- B1: PUXAR (Vertical) ---
  b1: {
    day: 'B', focus: 'Puxar (Vertical)',
    exercises: [
      { name: 'Alongamento dinâmico de peitoral', sets: 1, reps: '1 min', category: 'Mobilidade' },
      { name: 'Puxada frente aberta', sets: 4, reps: '12', category: 'Costas' },
      { name: 'Puxada triângulo', sets: 3, reps: '12', category: 'Costas' },
      { name: 'Remada curvada c/barra', sets: 3, reps: '10', category: 'Costas' },
      { name: 'Voador invertido', sets: 3, reps: '15', category: 'Costas' },
      { name: 'Rosca direta c/barra curvada', sets: 4, reps: '12', category: 'Bíceps' },
      { name: 'Rosca martelo', sets: 3, reps: '12', category: 'Bíceps' }
    ]
  },

  // --- C1: PERNAS (Foco Quadríceps) ---
  c1: {
    day: 'C', focus: 'Pernas (Foco Quadríceps)',
    exercises: [
      { name: 'Mobilidade de quadril 90/90', sets: 1, reps: '1 min', category: 'Mobilidade' },
      { name: 'Agachamento livre c/barra', sets: 4, reps: '10', category: 'Pernas' },
      { name: 'Leg press 45°', sets: 4, reps: '12', category: 'Pernas' },
      { name: 'Cadeira extensora', sets: 3, reps: '15', category: 'Pernas' },
      { name: 'Mesa flexora', sets: 4, reps: '12', category: 'Pernas' },
      { name: 'Panturrilha em pé', sets: 4, reps: '15', category: 'Pernas' },
      { name: 'Prancha abdominal', sets: 3, reps: '40s', category: 'Abdômen' }
    ]
  },

  // --- A2 (D): VARIAÇÃO EMPURRAR (Foco Ombros) ---
  a2: {
    day: 'D', focus: 'Empurrar (Variação)',
    exercises: [
      { name: 'Mobilidade de ombro c/bastão', sets: 1, reps: '1 min', category: 'Mobilidade' },
      { name: 'Desenvolvimento máquina', sets: 4, reps: '10', category: 'Ombros' },
      { name: 'Elevação lateral no cross', sets: 4, reps: '12', category: 'Ombros' },
      { name: 'Supino reto c/halteres', sets: 4, reps: '10', category: 'Peito' },
      { name: 'Crucifixo máquina', sets: 3, reps: '12', category: 'Peito' },
      { name: 'Tríceps testa c/barra H', sets: 4, reps: '12', category: 'Tríceps' },
      { name: 'Tríceps banco', sets: 3, reps: 'Falha', category: 'Tríceps' }
    ]
  },

  // --- B2 (E): VARIAÇÃO PUXAR (Horizontal) ---
  b2: {
    day: 'E', focus: 'Puxar (Variação)',
    exercises: [
      { name: 'Alongamento dinâmico de peitoral', sets: 1, reps: '1 min', category: 'Mobilidade' },
      { name: 'Barra fixa pegada aberta', sets: 3, reps: 'Falha', category: 'Costas' },
      { name: 'Remada cavalinho', sets: 4, reps: '10', category: 'Costas' },
      { name: 'Serrote', sets: 3, reps: '12', category: 'Costas' },
      { name: 'Face pull', sets: 3, reps: '15', category: 'Costas' },
      { name: 'Rosca Scott', sets: 4, reps: '12', category: 'Bíceps' },
      { name: 'Rosca alternada c/halteres', sets: 3, reps: '12', category: 'Bíceps' }
    ]
  },

  // --- C2 (F): VARIAÇÃO PERNAS (Foco Posterior) ---
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

  // --- FULLBODY (Fallback) ---
  fullbody: [
    {
      day: 'A', focus: 'Fullbody',
      exercises: [
        { name: 'Mobilidade de quadril 90/90', sets: 1, reps: '1 min', category: 'Mobilidade' },
        { name: 'Agachamento livre c/barra', sets: 3, reps: '12', category: 'Pernas' },
        { name: 'Supino reto c/barra', sets: 3, reps: '12', category: 'Peito' },
        { name: 'Puxada frente aberta', sets: 3, reps: '12', category: 'Costas' },
        { name: 'Desenvolvimento c/halteres', sets: 3, reps: '12', category: 'Ombros' },
        { name: 'Rosca direta', sets: 3, reps: '12', category: 'Bíceps' },
        { name: 'Tríceps corda', sets: 3, reps: '12', category: 'Tríceps' },
        { name: 'Prancha abdominal', sets: 3, reps: '30s', category: 'Abdômen' }
      ]
    }
  ]
};

// =====================================================================
// 2. ORDENAÇÃO INTELIGENTE (Prioridade Total)
// =====================================================================

function ordenarExercicios(exercises: any[]) {
  const prioridade: any = {
    'mobilidade': 1, 
    'pernas': 2,
    'costas': 3,
    'peito': 4,
    'ombros': 5,
    'tríceps': 6, 'triceps': 6,
    'bíceps': 7, 'biceps': 7,
    'abdômen': 8, 'abdomen': 8,
    'cardio': 9
  };

  return exercises.sort((a, b) => {
    // Normaliza para garantir match (ex: "Mobilidade" vira "mobilidade")
    const catA = (a.category || '').toLowerCase();
    const catB = (b.category || '').toLowerCase();

    const pA = prioridade[catA] || 99;
    const pB = prioridade[catB] || 99;

    // 1. Ordem por Grupo
    if (pA !== pB) return pA - pB;

    // 2. Regra Específica: Costas (Puxada ANTES de Remada)
    if (catA === 'costas' && catB === 'costas') {
      const aEhPuxada = a.name.toLowerCase().includes('puxada') || a.name.toLowerCase().includes('barra');
      const bEhPuxada = b.name.toLowerCase().includes('puxada') || b.name.toLowerCase().includes('barra');
      if (aEhPuxada && !bEhPuxada) return -1;
      if (!aEhPuxada && bEhPuxada) return 1;
    }

    // 3. Regra Específica: Peito (Supino ANTES de Voador)
    if (catA === 'peito' && catB === 'peito') {
      const aEhSupino = a.name.toLowerCase().includes('supino');
      const bEhSupino = b.name.toLowerCase().includes('supino');
      if (aEhSupino && !bEhSupino) return -1;
      if (!aEhSupino && bEhSupino) return 1;
    }

    return 0;
  });
}

// =====================================================================
// 3. FILTROS E AJUSTES
// =====================================================================

function filtrarLesoes(treino: any[], limitacoes: string[], cirurgias: string[]) {
  const problemas = [...(limitacoes || []), ...(cirurgias || [])].map(t => t.toLowerCase().trim()).filter(t => t !== 'nenhuma');
  if (problemas.length === 0) return treino;

  return treino.map((dia: any) => {
    let newExercises = dia.exercises.map((ex: any) => {
      let modificado = { ...ex };
      const nomeEx = ex.name.toLowerCase();

      // JOELHO
      if (problemas.some(p => p.includes('joelho') || p.includes('lca') || p.includes('menisco'))) {
        if (nomeEx.includes('agachamento') || nomeEx.includes('afundo') || nomeEx.includes('búlgaro')) {
           return { ...modificado, name: 'Elevação pélvica máquina', notes: 'Substituído (Proteção Joelho)' };
        }
        if (nomeEx.includes('extensora')) {
           return { ...modificado, name: 'Mesa flexora', notes: 'Foco Posterior (Pupa Joelho)' };
        }
      }
      // LOMBAR
      if (problemas.some(p => p.includes('lombar') || p.includes('hérnia') || p.includes('coluna'))) {
        if (nomeEx.includes('agachamento') || nomeEx.includes('terra') || nomeEx.includes('stiff') || nomeEx.includes('remada curvada')) {
           return { ...modificado, name: 'Puxada frente aberta', notes: 'Substituído (Coluna)' };
        }
      }
      // SILICONE
      if (problemas.some(p => p.includes('silicone') || p.includes('prótese'))) {
        if (nomeEx.includes('supino') && nomeEx.includes('barra')) return { ...modificado, name: 'Supino reto c/halteres', notes: 'Segurança Prótese' };
        if (nomeEx.includes('voador') || nomeEx.includes('crucifixo')) return { ...modificado, name: 'Supino máquina', notes: 'Segurança Prótese' };
      }
      // QUADRIL
      if (problemas.some(p => p.includes('quadril'))) {
         if (nomeEx.includes('agachamento') || nomeEx.includes('afundo')) return { ...modificado, name: 'Leg press 45°', notes: 'Quadril estável' };
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

function ajustarPorTempo(treino: any[], tempo: number, objetivo: string) {
  if (tempo > 45) return treino;

  return treino.map((dia: any) => {
    let sliced = dia.exercises.slice(0, 5).map((ex: any) => ({ ...ex, restTime: 45 }));
    
    // HIIT Finalizador
    if (objetivo === 'Emagrecimento' || objetivo === 'Definição') {
         if(sliced[sliced.length-1].category !== 'Mobilidade') {
             sliced[sliced.length-1] = { 
                 name: 'Polichinelo', sets: 3, reps: '1 min', category: 'Cardio', restTime: 30, notes: 'HIIT Final' 
             };
         }
    }
    return { ...dia, exercises: sliced };
  });
}

function aplicarTecnicas(treino: any[], nivel: string) {
  const nivelStr = nivel ? nivel.toLowerCase() : 'iniciante';
  return treino.map((dia: any) => {
    const newExercises = dia.exercises.map((ex: any) => ({ ...ex }));
    if (nivelStr === 'avançado') {
        if (newExercises[1] && newExercises[2] && newExercises[1].category === newExercises[2].category) {
            newExercises[1].technique = 'BISET';
            newExercises[2].technique = 'BISET';
        }
    }
    return { ...dia, exercises: newExercises };
  });
}

// =====================================================================
// 4. EXECUÇÃO DA ROTA
// =====================================================================

export async function POST(req: Request) {
  console.log("Iniciando Geração..."); 
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

    // 1. SELEÇÃO DE TEMPLATE (Agora com A1..C2 definidos)
    let template = [];

    // Proteção se TREINOS_BASE não tiver as chaves (mas agora tem)
    const baseA1 = TREINOS_BASE.a1 || TREINOS_BASE.abc[0];
    const baseB1 = TREINOS_BASE.b1 || TREINOS_BASE.abc[1];
    const baseC1 = TREINOS_BASE.c1 || TREINOS_BASE.abc[2];

    if (dias <= 2) {
        template = TREINOS_BASE.fullbody;
    } 
    else if (dias === 3) {
        template = [baseA1, baseB1, baseC1];
    }
    else if (dias === 4) {
        template = [baseA1, baseB1, baseC1, { ...TREINOS_BASE.a2, day: 'D' }];
    }
    else if (dias >= 5) {
        // Agora vai funcionar porque a1, b1... estão definidos lá em cima
        template = [
            TREINOS_BASE.a1, 
            TREINOS_BASE.b1, 
            TREINOS_BASE.c1, 
            TREINOS_BASE.a2, 
            TREINOS_BASE.b2, 
            TREINOS_BASE.c2 
        ];
        if (dias === 5) template.pop();
    }

    // 2. Filtros e Ajustes
    let treinoFinal = filtrarLesoes(template, limitacoes, cirurgias);
    treinoFinal = ajustarPorTempo(treinoFinal, tempo, objetivo);
    treinoFinal = aplicarTecnicas(treinoFinal, nivel);

    // 3. ORDENAÇÃO (Aqui a mágica acontece)
    treinoFinal = treinoFinal.map((dia: any) => ({
        ...dia,
        exercises: ordenarExercicios(dia.exercises)
    }));

    // 4. Busca e Salva
    const dbExercises = await prisma.exercise.findMany();
    // Safety check
    if (dbExercises.length === 0) return NextResponse.json({ error: "Banco vazio" }, { status: 500 });

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

    console.log("Sucesso ID:", workout.id);
    return NextResponse.json({ success: true, workoutId: workout.id });

  } catch (error: any) {
    console.error("Erro Fatal:", error);
    return NextResponse.json({ error: "Erro: " + error.message }, { status: 500 });
  }
}