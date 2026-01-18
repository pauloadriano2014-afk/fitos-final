import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
export const dynamic = 'force-dynamic';

// =====================================================================
// 1. BANCO DE TREINOS OTIMIZADO (COM VARIAÇÕES 1 e 2)
// =====================================================================

const TREINOS_BASE: any = {
  // --- TREINO A1: EMPURRAR (Peito, Ombro, Tríceps) ---
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

  // --- TREINO B1: PUXAR (Costas, Bíceps) ---
  b1: {
    day: 'B', focus: 'Puxar (Vertical)',
    exercises: [
      { name: 'Alongamento dinâmico de peitoral', sets: 1, reps: '1 min', category: 'Mobilidade' },
      { name: 'Puxada frente aberta', sets: 4, reps: '12', category: 'Costas' },
      { name: 'Puxada triângulo', sets: 3, reps: '12', category: 'Costas' },
      { name: 'Remada curvada c/barra', sets: 3, reps: '10', category: 'Costas' },
      { name: 'Voador invertido', sets: 3, reps: '15', category: 'Costas' }, // Posterior de ombro entra no dia de costas
      { name: 'Rosca direta c/barra curvada', sets: 4, reps: '12', category: 'Bíceps' },
      { name: 'Rosca martelo', sets: 3, reps: '12', category: 'Bíceps' }
    ]
  },

  // --- TREINO C1: PERNAS (Foco Quadríceps) ---
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

  // --- TREINO A2 (D): VARIAÇÃO EMPURRAR (Foco Ombros/Superior) ---
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

  // --- TREINO B2 (E): VARIAÇÃO PUXAR (Foco Horizontal/Espessura) ---
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

  // --- TREINO C2 (F): VARIAÇÃO PERNAS (Foco Posterior/Glúteo) ---
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

  // --- FULLBODY (1-2 Dias) ---
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
// 2. MOTOR DE ORDENAÇÃO INTELIGENTE (CORRIGE A ORDEM "ESCROTA")
// =====================================================================

function ordenarExercicios(exercises: any[]) {
  // Define a prioridade dos grupos musculares na ficha
  const prioridade: any = {
    'Mobilidade': 1, // Sempre primeiro
    'Pernas': 2,     // Grandes
    'Costas': 3,
    'Peito': 4,
    'Ombros': 5,     // Pequenos
    'Tríceps': 6,
    'Bíceps': 7,
    'Abdômen': 8,
    'Cardio': 9
  };

  return exercises.sort((a, b) => {
    // 1. Ordena por Grupo Muscular
    const pA = prioridade[a.category] || 99;
    const pB = prioridade[b.category] || 99;

    if (pA !== pB) return pA - pB;

    // 2. Regras de Ouro dentro do mesmo grupo
    
    // Regra: Costas -> Puxadas antes de Remadas
    if (a.category === 'Costas' && b.category === 'Costas') {
      const aEhPuxada = a.name.toLowerCase().includes('puxada') || a.name.toLowerCase().includes('barra');
      const bEhPuxada = b.name.toLowerCase().includes('puxada') || b.name.toLowerCase().includes('barra');
      if (aEhPuxada && !bEhPuxada) return -1; // A vem primeiro
      if (!aEhPuxada && bEhPuxada) return 1;  // B vem primeiro
    }

    // Regra: Peito -> Supinos (Multi) antes de Isoladores
    if (a.category === 'Peito' && b.category === 'Peito') {
      const aEhSupino = a.name.toLowerCase().includes('supino');
      const bEhSupino = b.name.toLowerCase().includes('supino');
      if (aEhSupino && !bEhSupino) return -1;
      if (!aEhSupino && bEhSupino) return 1;
    }

    return 0; // Mantém ordem original se empatar
  });
}

// =====================================================================
// 3. FILTROS E AJUSTES (SEGURANÇA E TÉCNICA)
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
    
    // HIIT Finalizador se for emagrecimento
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

    // 1. SELEÇÃO DE TEMPLATE (Lógica Expandida)
    let template = [];

    if (dias <= 2) {
        template = TREINOS_BASE.fullbody;
    } 
    else if (dias === 3) {
        // A1, B1, C1
        template = [TREINOS_BASE.a1, TREINOS_BASE.b1, TREINOS_BASE.c1];
    }
    else if (dias === 4) {
        // ABCD
        template = [TREINOS_BASE.a1, TREINOS_BASE.b1, TREINOS_BASE.c1, { ...TREINOS_BASE.a2, day: 'D' }];
    }
    else if (dias >= 5) {
        // A1, B1, C1, A2, B2, C2 (Variação Total)
        template = [
            TREINOS_BASE.a1, 
            TREINOS_BASE.b1, 
            TREINOS_BASE.c1, 
            TREINOS_BASE.a2, 
            TREINOS_BASE.b2, 
            TREINOS_BASE.c2 
        ];
        if (dias === 5) template.pop(); // Remove o F se for só 5 dias
    }

    // 2. Filtros
    let treinoFinal = filtrarLesoes(template, limitacoes, cirurgias);
    treinoFinal = ajustarPorTempo(treinoFinal, tempo, objetivo);
    treinoFinal = aplicarTecnicas(treinoFinal, nivel);

    // 3. ORDENAÇÃO (AQUI APLICAMOS A ORDEM CORRETA)
    treinoFinal = treinoFinal.map((dia: any) => ({
        ...dia,
        exercises: ordenarExercicios(dia.exercises)
    }));

    // 4. Busca e Salva
    const dbExercises = await prisma.exercise.findMany();
    const exercisesMap = new Map(dbExercises.map(e => [e.name.toLowerCase().trim(), e.id]));
    const fallbackId = dbExercises[0]?.id;

    const exercisesToSave = [];

    for (const dia of treinoFinal) {
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