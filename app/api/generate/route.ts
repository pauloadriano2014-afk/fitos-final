import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
export const dynamic = 'force-dynamic';

// =====================================================================
// 1. BANCO DE TREINOS BASE (OS TEMPLATES)
// =====================================================================

const TREINOS_BASE: any = {
  // --- 1 ou 2 DIAS: FULLBODY ---
  fullbody: [
    {
      day: 'A',
      focus: 'Corpo Todo',
      exercises: [
        { name: 'Mobilidade de quadril 90/90', sets: 1, reps: '1 min', category: 'Mobilidade' },
        { name: 'Agachamento livre c/barra', sets: 3, reps: '12', category: 'Pernas' },
        { name: 'Supino reto c/barra', sets: 3, reps: '12', category: 'Peito' },
        { name: 'Puxada frente aberta', sets: 3, reps: '12', category: 'Costas' },
        { name: 'Desenvolvimento c/halteres', sets: 3, reps: '12', category: 'Ombros' },
        { name: 'Leg press 45°', sets: 3, reps: '12', category: 'Pernas' },
        { name: 'Rosca direta c/barra curvada', sets: 3, reps: '12', category: 'Bíceps' },
        { name: 'Tríceps corda', sets: 3, reps: '12', category: 'Tríceps' },
        { name: 'Prancha abdominal', sets: 3, reps: '30s', category: 'Abdômen' }
      ]
    }
  ],

  // --- 3, 5 ou 6 DIAS: ABC (Sequencial se for > 3) ---
  abc: [
    {
      day: 'A', focus: 'Pernas Completas',
      exercises: [
        { name: 'Mobilidade de quadril 90/90', sets: 1, reps: '1 min', category: 'Mobilidade' },
        { name: 'Agachamento livre c/barra', sets: 4, reps: '10', category: 'Pernas' },
        { name: 'Leg press 45°', sets: 4, reps: '12', category: 'Pernas' },
        { name: 'Cadeira extensora', sets: 3, reps: '15', category: 'Pernas' },
        { name: 'Mesa flexora', sets: 4, reps: '12', category: 'Pernas' },
        { name: 'Stiff c/barra', sets: 3, reps: '12', category: 'Pernas' },
        { name: 'Panturrilha em pé', sets: 4, reps: '15', category: 'Pernas' }
      ]
    },
    {
      day: 'B', focus: 'Empurrar (Peito/Ombro/Tríceps)',
      exercises: [
        { name: 'Mobilidade de ombro c/bastão', sets: 1, reps: '1 min', category: 'Mobilidade' },
        { name: 'Supino reto c/barra', sets: 4, reps: '10', category: 'Peito' },
        { name: 'Supino inclinado c/halteres', sets: 3, reps: '12', category: 'Peito' },
        { name: 'Desenvolvimento c/halteres', sets: 3, reps: '12', category: 'Ombros' },
        { name: 'Elevação lateral', sets: 3, reps: '15', category: 'Ombros' },
        { name: 'Tríceps corda', sets: 3, reps: '12', category: 'Tríceps' },
        { name: 'Tríceps francês', sets: 3, reps: '12', category: 'Tríceps' }
      ]
    },
    {
      day: 'C', focus: 'Puxar (Costas/Bíceps/Abs)',
      exercises: [
        { name: 'Alongamento dinâmico de peitoral', sets: 1, reps: '1 min', category: 'Mobilidade' },
        { name: 'Puxada frente aberta', sets: 4, reps: '12', category: 'Costas' },
        { name: 'Remada curvada c/barra', sets: 3, reps: '10', category: 'Costas' },
        { name: 'Remada baixa c/triângulo', sets: 3, reps: '12', category: 'Costas' },
        { name: 'Voador invertido', sets: 3, reps: '15', category: 'Costas' },
        { name: 'Rosca direta c/barra curvada', sets: 3, reps: '12', category: 'Bíceps' },
        { name: 'Rosca martelo', sets: 3, reps: '12', category: 'Bíceps' },
        { name: 'Abdominal supra no banco declinado', sets: 3, reps: '20', category: 'Abdômen' }
      ]
    }
  ],

  // --- 4 DIAS: ABCD ---
  abcd: [
    {
      day: 'A', focus: 'Quadríceps e Glúteos',
      exercises: [
        { name: 'Mobilidade de tornozelo na parede', sets: 1, reps: '1 min', category: 'Mobilidade' },
        { name: 'Agachamento livre c/barra', sets: 4, reps: '10', category: 'Pernas' },
        { name: 'Leg press 45°', sets: 4, reps: '12', category: 'Pernas' },
        { name: 'Búlgaro c/halteres', sets: 3, reps: '10', category: 'Pernas' },
        { name: 'Cadeira extensora', sets: 3, reps: '15', category: 'Pernas' },
        { name: 'Elevação pélvica máquina', sets: 4, reps: '12', category: 'Pernas' }
      ]
    },
    {
      day: 'B', focus: 'Costas, Bíceps e Abs',
      exercises: [
        { name: 'Barra fixa pegada aberta', sets: 3, reps: 'Falha', category: 'Costas' },
        { name: 'Puxada frente c/triângulo', sets: 3, reps: '12', category: 'Costas' },
        { name: 'Remada cavalinho', sets: 3, reps: '10', category: 'Costas' },
        { name: 'Serrote', sets: 3, reps: '12', category: 'Costas' },
        { name: 'Rosca Scott', sets: 3, reps: '12', category: 'Bíceps' },
        { name: 'Rosca alternada c/halteres', sets: 3, reps: '12', category: 'Bíceps' },
        { name: 'Abdominal infra na paralela', sets: 3, reps: '15', category: 'Abdômen' }
      ]
    },
    {
      day: 'C', focus: 'Posterior e Panturrilha',
      exercises: [
        { name: 'Mobilidade de quadril 90/90', sets: 1, reps: '1 min', category: 'Mobilidade' },
        { name: 'Stiff c/barra', sets: 4, reps: '10', category: 'Pernas' },
        { name: 'Mesa flexora', sets: 4, reps: '12', category: 'Pernas' },
        { name: 'Cadeira flexora', sets: 3, reps: '15', category: 'Pernas' },
        { name: 'Flexora unilateral', sets: 3, reps: '12', category: 'Pernas' },
        { name: 'Panturrilha sentado', sets: 4, reps: '15', category: 'Pernas' },
        { name: 'Panturrilha no Smith', sets: 4, reps: '15', category: 'Pernas' }
      ]
    },
    {
      day: 'D', focus: 'Peito, Ombros e Tríceps',
      exercises: [
        { name: 'Supino inclinado c/halteres', sets: 4, reps: '10', category: 'Peito' },
        { name: 'Supino reto c/barra', sets: 3, reps: '10', category: 'Peito' },
        { name: 'Crucifixo máquina', sets: 3, reps: '12', category: 'Peito' },
        { name: 'Desenvolvimento máquina', sets: 3, reps: '12', category: 'Ombros' },
        { name: 'Elevação lateral no cross', sets: 4, reps: '12', category: 'Ombros' },
        { name: 'Tríceps testa c/barra H', sets: 3, reps: '12', category: 'Tríceps' },
        { name: 'Tríceps corda', sets: 3, reps: '15', category: 'Tríceps' }
      ]
    }
  ]
};

// =====================================================================
// 2. FUNÇÕES DE REGRAS (MOTOR INTELIGENTE)
// =====================================================================

function ajustarPorTempo(treino: any[], tempo: number, objetivo: string, dias: number) {
  // Se o aluno tem mais de 45 minutos, mantemos o treino completo
  if (tempo > 45) return treino;

  // REGRA 30 MINUTOS:
  return treino.map(dia => {
    // 1. Reduz volume: Mantém Mobilidade (se houver) + 3 ou 4 exercícios principais
    // O template já está ordenado por prioridade (Multiarticulares primeiro)
    let newExercises = dia.exercises.slice(0, 5); 

    // 2. Reduz descanso para aumentar densidade
    newExercises = newExercises.map((ex: any) => ({ 
        ...ex, 
        restTime: 45 // Descanso curto padrão para treinos rápidos
    }));

    // 3. Lógica do HIIT (Se Emagrecimento/Definição E treina 3x ou mais)
    if ((objetivo === 'Emagrecimento' || objetivo === 'Definição') && dias >= 3) {
        // Substitui o último exercício (geralmente isolador) por um Cardio intenso
        const lastIndex = newExercises.length - 1;
        newExercises[lastIndex] = {
            name: 'Burpee', // Ou Polichinelo, dependendo do que tem no banco
            sets: 3,
            reps: '1 min',
            category: 'Cardio',
            restTime: 30,
            notes: 'HIIT Finalizador (Máx intensidade)'
        };
    }

    return { ...dia, exercises: newExercises };
  });
}

function aplicarTecnicas(treino: any[], nivel: string) {
  const nivelStr = nivel ? nivel.toLowerCase() : 'iniciante';
  
  return treino.map(dia => {
    const newExercises = dia.exercises.map((ex: any) => ({ ...ex }));

    if (nivelStr === 'iniciante') {
      // Iniciante: Foco em execução, sem firula
      return { ...dia, exercises: newExercises };
    }

    if (nivelStr === 'intermediário') {
      // Drop-set no último exercício do dia (geralmente isolador)
      const lastIndex = newExercises.length - 1;
      if (newExercises[lastIndex] && newExercises[lastIndex].category !== 'Mobilidade' && newExercises[lastIndex].category !== 'Cardio') {
        newExercises[lastIndex].technique = 'DROPSET';
      }
    }

    if (nivelStr === 'avançado') {
      // Bi-set nos primeiros do mesmo grupo
      if (newExercises.length >= 3 && newExercises[1].category === newExercises[2].category) {
        newExercises[1].technique = 'BISET';
        newExercises[2].technique = 'BISET';
      }
      // Rest-pause no penúltimo
      const penultimo = newExercises.length - 2;
      if (newExercises[penultimo]) newExercises[penultimo].technique = 'RESTPAUSE';
    }

    return { ...dia, exercises: newExercises };
  });
}

function filtrarLesoes(treino: any[], limitacoes: string[]) {
  if (!limitacoes || limitacoes.length === 0 || limitacoes.includes('Nenhuma')) {
    return treino;
  }
  const lesoes = limitacoes.map(l => l.toLowerCase());

  return treino.map(dia => {
    const newExercises = dia.exercises.map((ex: any) => {
      // Joelho
      if (lesoes.includes('joelho')) {
        if (ex.name.includes('Agachamento') || ex.name.includes('Afundo') || ex.name.includes('Extensora')) {
          return { ...ex, name: 'Elevação pélvica máquina', notes: 'Substituído (Joelho)' };
        }
      }
      // Lombar
      if (lesoes.includes('lombar')) {
        if (ex.name.includes('Terra') || ex.name.includes('Stiff') || ex.name.includes('Remada curvada')) {
          return { ...ex, name: 'Puxada frente aberta', notes: 'Substituído (Lombar)' };
        }
      }
      // Ombro
      if (lesoes.includes('ombro')) {
        if (ex.name.includes('Desenvolvimento') || ex.name.includes('Supino inclinado')) {
          return { ...ex, name: 'Elevação lateral', notes: 'Carga leve (Ombro)' };
        }
      }
      return ex;
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

    // 1. Busca Anamnese
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { anamneses: { orderBy: { createdAt: 'desc' }, take: 1 } }
    });

    if (!user || user.anamneses.length === 0) {
      return NextResponse.json({ error: "Anamnese não encontrada" }, { status: 404 });
    }

    const anamnese = user.anamneses[0];
    const dias = anamnese.frequencia || 3;
    const tempo = anamnese.tempoDisponivel || 60; // Padrão 60
    const nivel = anamnese.nivel || 'Iniciante';
    const objetivo = anamnese.objetivo || 'Hipertrofia';
    const lesoes = anamnese.limitacoes || [];

    // 2. Seleciona o Template Base
    let templateSelecionado = [];
    
    if (dias <= 2) templateSelecionado = TREINOS_BASE.fullbody;
    else if (dias === 3) templateSelecionado = TREINOS_BASE.abc;
    else if (dias === 4) templateSelecionado = TREINOS_BASE.abcd;
    else templateSelecionado = TREINOS_BASE.abc; // 5, 6, 7 dias: Repete o ABC

    // 3. Pipeline de Ajustes (ORDEM IMPORTA)
    // A. Filtra lesões primeiro para não colocar técnica em exercício perigoso
    let treinoFinal = filtrarLesoes(templateSelecionado, lesoes);
    
    // B. Ajusta por tempo (Corta exercícios se for 30min e insere HIIT)
    treinoFinal = ajustarPorTempo(treinoFinal, tempo, objetivo, dias);

    // C. Aplica técnicas no que sobrou
    treinoFinal = aplicarTecnicas(treinoFinal, nivel);

    // 4. Busca IDs Reais no Banco
    const dbExercises = await prisma.exercise.findMany();
    const exercisesMap = new Map(dbExercises.map(e => [e.name.toLowerCase().trim(), e.id]));
    const fallbackId = dbExercises[0]?.id; 

    const exercisesToSave = [];

    for (const dia of treinoFinal) {
      for (const ex of dia.exercises) {
        let realId = exercisesMap.get(ex.name.toLowerCase().trim());
        
        // Fallback inteligente: tenta achar algo parecido se o nome exato falhar
        if (!realId) {
            const parecido = dbExercises.find(d => d.name.includes(ex.name.split(' ')[0]));
            realId = parecido ? parecido.id : fallbackId;
        }

        exercisesToSave.push({
          exerciseId: realId,
          day: dia.day,
          sets: Number(ex.sets),
          reps: String(ex.reps),
          technique: ex.technique || "",
          notes: ex.notes || "",
          restTime: ex.restTime || 60 
        });
      }
    }

    // 5. Salva no Banco
    await prisma.workout.deleteMany({ where: { userId } });

    const workout = await prisma.workout.create({
      data: {
        userId,
        name: `Treino ${nivel} - ${dias} Dias (${tempo}min)`,
        goal: objetivo,
        level: nivel,
        isVisible: true,
        exercises: {
          create: exercisesToSave
        }
      }
    });

    return NextResponse.json({ success: true, workoutId: workout.id, message: "Treino gerado com sucesso!" });

  } catch (error: any) {
    console.error("Erro Fatal Generate:", error);
    return NextResponse.json({ error: "Erro interno no gerador." }, { status: 500 });
  }
}