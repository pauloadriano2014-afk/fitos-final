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
      day: 'A', focus: 'Corpo Todo',
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

  // --- 3, 5, 6, 7 DIAS: ABC (Ciclo Contínuo) ---
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
      day: 'B', focus: 'Costas e Bíceps',
      exercises: [
        { name: 'Barra fixa pegada aberta', sets: 3, reps: 'Falha', category: 'Costas' },
        { name: 'Puxada frente c/triângulo', sets: 3, reps: '12', category: 'Costas' },
        { name: 'Remada cavalinho', sets: 3, reps: '10', category: 'Costas' },
        { name: 'Serrote', sets: 3, reps: '12', category: 'Costas' },
        { name: 'Rosca Scott', sets: 3, reps: '12', category: 'Bíceps' },
        { name: 'Rosca alternada c/halteres', sets: 3, reps: '12', category: 'Bíceps' }
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
// 2. MOTOR DE FILTRAGEM (TODAS AS OPÇÕES DA ANAMNESE)
// =====================================================================

function filtrarLesoes(treino: any[], limitacoes: string[], cirurgias: string[]) {
  // Junta tudo num array único de "problemas" para facilitar a busca
  const problemas = [...(limitacoes || []), ...(cirurgias || [])]
    .map(t => t.toLowerCase().trim())
    .filter(t => t !== 'nenhuma');

  if (problemas.length === 0) return treino;

  console.log("Aplicando filtros para:", problemas);

  return treino.map(dia => {
    const newExercises = dia.exercises.map((ex: any) => {
      let modificado = { ...ex };
      const nomeEx = ex.name.toLowerCase();

      // ---------------------------------------------------------
      // 1. JOELHO / LCA / MENISCO
      // Evitar: Impacto, Agachamento profundo pesado, Extensora pesada
      // ---------------------------------------------------------
      if (problemas.some(p => p.includes('joelho') || p.includes('lca') || p.includes('menisco'))) {
        if (nomeEx.includes('agachamento') || nomeEx.includes('afundo') || nomeEx.includes('búlgaro') || nomeEx.includes('passada') || nomeEx.includes('burpee')) {
          modificado = { ...modificado, name: 'Elevação pélvica máquina', notes: 'Substituído (Proteção Joelho)' };
        }
        if (nomeEx.includes('extensora')) {
          // Mantém, mas com isometria, ou troca se for crítico (aqui vamos trocar para garantir)
          modificado = { ...modificado, name: 'Mesa flexora', notes: 'Foco Posterior (Pupa Joelho)' }; 
        }
      }

      // ---------------------------------------------------------
      // 2. LOMBAR / HÉRNIA / COLUNA
      // Evitar: Carga axial (barra nas costas), Terra, Stiff pesado, Remada Curvada
      // ---------------------------------------------------------
      if (problemas.some(p => p.includes('lombar') || p.includes('hérnia') || p.includes('coluna'))) {
        if (nomeEx.includes('agachamento') || nomeEx.includes('terra') || nomeEx.includes('stiff') || nomeEx.includes('desenvolvimento') && !nomeEx.includes('máquina')) {
          modificado = { ...modificado, name: 'Leg press 45°', notes: 'Coluna apoiada (Segurança Lombar)' };
        }
        if (nomeEx.includes('remada curvada') || nomeEx.includes('cavalinho')) {
          modificado = { ...modificado, name: 'Remada baixa c/triângulo', notes: 'Coluna estável (Segurança Lombar)' };
        }
        if (nomeEx.includes('abdominal supra')) {
           modificado = { ...modificado, name: 'Prancha isométrica', notes: 'Core Estático' };
        }
      }

      // ---------------------------------------------------------
      // 3. OMBRO / MANGUITO
      // Evitar: Desenvolvimento pesado, Puxada nuca, Elevação acima da cabeça
      // ---------------------------------------------------------
      if (problemas.some(p => p.includes('ombro') || p.includes('manguito'))) {
        if (nomeEx.includes('desenvolvimento') || nomeEx.includes('supino inclinado')) {
          modificado = { ...modificado, name: 'Elevação lateral', notes: 'Carga controlada (Ombro)' };
        }
        if (nomeEx.includes('paralela') || nomeEx.includes('tríceps banco')) {
          modificado = { ...modificado, name: 'Tríceps corda', notes: 'Sem impacto no ombro' };
        }
      }

      // ---------------------------------------------------------
      // 4. PUNHO (WRIST)
      // Evitar: Flexão de braço, Barra reta (Rosca), Apoio direto
      // ---------------------------------------------------------
      if (problemas.some(p => p.includes('punho'))) {
        if (nomeEx.includes('flexão de braços') || nomeEx.includes('burpee') || nomeEx.includes('prancha')) {
          modificado = { ...modificado, name: 'Voador frontal', notes: 'Sem apoio de punho' };
        }
        if (nomeEx.includes('rosca direta') && nomeEx.includes('barra')) {
          modificado = { ...modificado, name: 'Rosca martelo', notes: 'Pegada neutra (Alivio Punho)' };
        }
        if (nomeEx.includes('tríceps testa')) {
           modificado = { ...modificado, name: 'Tríceps corda', notes: 'Pegada neutra' };
        }
      }

      // ---------------------------------------------------------
      // 5. QUADRIL (HIP)
      // Evitar: Passada, Afundo, Agachamento profundo
      // ---------------------------------------------------------
      if (problemas.some(p => p.includes('quadril'))) {
        if (nomeEx.includes('agachamento') || nomeEx.includes('afundo') || nomeEx.includes('passada') || nomeEx.includes('búlgaro')) {
          modificado = { ...modificado, name: 'Leg press 45°', notes: 'Quadril estável' };
        }
        if (nomeEx.includes('terra')) {
           modificado = { ...modificado, name: 'Mesa flexora', notes: 'Sem carga axial no quadril' };
        }
      }

      // ---------------------------------------------------------
      // 6. TORNOZELO
      // Evitar: Panturrilha em pé pesada, Agachamento profundo (dorsiflexão), Salto
      // ---------------------------------------------------------
      if (problemas.some(p => p.includes('tornozelo'))) {
        if (nomeEx.includes('agachamento') || nomeEx.includes('burpee') || nomeEx.includes('polichinelo')) {
          modificado = { ...modificado, name: 'Leg press horizontal', notes: 'Sem mobilidade tornozelo' };
        }
        if (nomeEx.includes('panturrilha em pé')) {
          modificado = { ...modificado, name: 'Panturrilha sentado', notes: 'Menor carga tornozelo' };
        }
      }

      // ---------------------------------------------------------
      // 7. CERVICAL
      // Evitar: Barra nas costas (Agachamento), Abdominal puxando pescoço
      // ---------------------------------------------------------
      if (problemas.some(p => p.includes('cervical'))) {
        if (nomeEx.includes('agachamento') && nomeEx.includes('barra')) {
          modificado = { ...modificado, name: 'Agachamento com halteres', notes: 'Sem barra na nuca' };
        }
        if (nomeEx.includes('abdominal supra') || nomeEx.includes('crunch')) {
          modificado = { ...modificado, name: 'Abdominal infra no colchonete', notes: 'Sem tensão cervical' };
        }
      }

      // ---------------------------------------------------------
      // 8. COTOVELOS
      // Evitar: Tríceps Testa, Francês (Extensão total sob carga)
      // ---------------------------------------------------------
      if (problemas.some(p => p.includes('cotovelo'))) {
        if (nomeEx.includes('testa') || nomeEx.includes('francês')) {
          modificado = { ...modificado, name: 'Tríceps corda', notes: 'Menor estresse articular' };
        }
      }

      // ---------------------------------------------------------
      // 9. ABDOMINOPLASTIA / CESÁREA (Cirurgias Abdominais)
      // Evitar: Distensão abdominal excessiva, Abdominal completo intenso
      // ---------------------------------------------------------
      if (problemas.some(p => p.includes('abdominoplastia') || p.includes('cesárea'))) {
        if (nomeEx.includes('abdominal') || nomeEx.includes('prancha')) {
          modificado = { ...modificado, name: 'Elevação pélvica máquina', notes: 'Core estabilizado (Pós-cirúrgico)' };
        }
        if (nomeEx.includes('agachamento') || nomeEx.includes('terra')) {
           // Evita pressão intra-abdominal excessiva
           modificado = { ...modificado, name: 'Cadeira extensora', notes: 'Menor pressão abdominal' };
        }
      }

      // ---------------------------------------------------------
      // 10. PRÓTESE DE SILICONE
      // Evitar: Supino Barra (risco impacto), Voador (alongamento excessivo)
      // ---------------------------------------------------------
      if (problemas.some(p => p.includes('silicone') || p.includes('prótese'))) {
        if (nomeEx.includes('supino') && nomeEx.includes('barra')) {
          modificado = { ...modificado, name: 'Supino reto c/halteres', notes: 'Segurança (Prótese)' };
        }
        if (nomeEx.includes('voador') || nomeEx.includes('crucifixo')) {
          modificado = { ...modificado, name: 'Supino máquina', notes: 'Evitar amplitude excessiva' };
        }
        if (nomeEx.includes('flexão de braços')) {
           modificado = { ...modificado, name: 'Tríceps no cross', notes: 'Substituído (Prótese)' };
        }
      }

      return modificado;
    });
    return { ...dia, exercises: newExercises };
  });
}

function ajustarPorTempo(treino: any[], tempo: number, objetivo: string, dias: number) {
  if (tempo > 45) return treino;

  return treino.map(dia => {
    let newExercises = dia.exercises.slice(0, 5); 
    newExercises = newExercises.map((ex: any) => ({ ...ex, restTime: 45 }));

    if ((objetivo === 'Emagrecimento' || objetivo === 'Definição') && dias >= 3) {
        const lastIndex = newExercises.length - 1;
        // Só substitui se o último não for um exercício essencial de reabilitação (Mobilidade)
        if(newExercises[lastIndex].category !== 'Mobilidade') {
            newExercises[lastIndex] = {
                name: 'Polichinelo', // Polichinelo é mais seguro que Burpee para a maioria
                sets: 3,
                reps: '1 min',
                category: 'Cardio',
                restTime: 30,
                notes: 'HIIT Finalizador'
            };
        }
    }
    return { ...dia, exercises: newExercises };
  });
}

function aplicarTecnicas(treino: any[], nivel: string) {
  const nivelStr = nivel ? nivel.toLowerCase() : 'iniciante';
  
  return treino.map(dia => {
    const newExercises = dia.exercises.map((ex: any) => ({ ...ex }));

    if (nivelStr === 'iniciante') return { ...dia, exercises: newExercises };

    if (nivelStr === 'intermediário') {
      const lastIndex = newExercises.length - 1;
      if (newExercises[lastIndex] && !['Cardio', 'Mobilidade'].includes(newExercises[lastIndex].category)) {
        newExercises[lastIndex].technique = 'DROPSET';
      }
    }

    if (nivelStr === 'avançado') {
      // Bi-set (Exercícios 2 e 3 se forem do mesmo grupo e não forem perigosos)
      if (newExercises.length >= 3 && newExercises[1].category === newExercises[2].category) {
        newExercises[1].technique = 'BISET';
        newExercises[2].technique = 'BISET';
      }
      // Rest-pause no penúltimo
      const penultimo = newExercises.length - 2;
      if (newExercises[penultimo] && !['Cardio', 'Mobilidade'].includes(newExercises[penultimo].category)) {
          newExercises[penultimo].technique = 'RESTPAUSE';
      }
    }

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
    
    // Arrays de lesões
    const limitacoes = anamnese.limitacoes || [];
    const cirurgias = anamnese.cirurgias || [];

    // 1. Template
    let template = [];
    if (dias <= 2) template = TREINOS_BASE.fullbody;
    else if (dias === 3) template = TREINOS_BASE.abc;
    else if (dias === 4) template = TREINOS_BASE.abcd;
    else template = TREINOS_BASE.abc; 

    // 2. Filtros (CASCA DE SEGURANÇA TOTAL)
    let treinoFinal = filtrarLesoes(template, limitacoes, cirurgias);
    treinoFinal = ajustarPorTempo(treinoFinal, tempo, objetivo, dias);
    treinoFinal = aplicarTecnicas(treinoFinal, nivel);

    // 3. Busca IDs
    const dbExercises = await prisma.exercise.findMany();
    // Mapa: nome_lower -> id
    const exercisesMap = new Map(dbExercises.map(e => [e.name.toLowerCase().trim(), e.id]));
    const fallbackId = dbExercises[0]?.id; 

    const exercisesToSave = [];

    for (const dia of treinoFinal) {
      for (const ex of dia.exercises) {
        let realId = exercisesMap.get(ex.name.toLowerCase().trim());
        
        // Tentativa de Match Parcial se não achar exato
        if (!realId) {
            const match = dbExercises.find(d => ex.name.toLowerCase().includes(d.name.toLowerCase()) || d.name.toLowerCase().includes(ex.name.toLowerCase()));
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
                restTime: ex.restTime || 60 
            });
        }
      }
    }

    // 4. Salva
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
    console.error("Erro Fatal Generate:", error);
    return NextResponse.json({ error: "Erro interno: " + error.message }, { status: 500 });
  }
}