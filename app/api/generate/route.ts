import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { GoogleGenerativeAI } from '@google/generative-ai';

const prisma = new PrismaClient();
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

// Configuração para evitar timeout em gerações longas
export const maxDuration = 60; 
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  try {
    const { userId } = await req.json();

    if (!userId) {
      return NextResponse.json({ error: "ID do usuário obrigatório" }, { status: 400 });
    }

    // 1. Busca dados do Aluno (Anamnese mais recente)
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { anamneses: { orderBy: { createdAt: 'desc' }, take: 1 } }
    });

    if (!user || user.anamneses.length === 0) {
      return NextResponse.json({ error: "Anamnese não encontrada." }, { status: 404 });
    }

    const anamnese = user.anamneses[0];

    // 2. Busca o ACERVO de exercícios do banco (apenas nomes e categorias)
    const allExercises = await prisma.exercise.findMany({
      select: { name: true, category: true }
    });

    // Formata a lista para a IA saber o que existe
    const exercisesList = allExercises.map(e => `- ${e.name} (${e.category})`).join('\n');

    // 3. DEFINIÇÃO DA METODOLOGIA (PROMPT)
    const prompt = `
      Você é o cérebro da FITO OS, um personal trainer de elite.
      Sua missão é gerar um treino periodizado em formato JSON.

      PERFIL DO ALUNO:
      - Nível: ${anamnese.experiencia} (Iniciante, Intermediário, Avançado)
      - Objetivo: ${anamnese.objetivo}
      - Frequência: ${anamnese.diasTreino} dias na semana
      - Tempo Disponível: ${anamnese.tempoDisponivel} minutos
      - Lesões/Limitações: ${anamnese.limitacoes ? anamnese.limitacoes : "Nenhuma"}

      ACERVO DE EXERCÍCIOS DISPONÍVEIS (USE APENAS ESTES NOMES EXATOS):
      ${exercisesList}

      REGRAS DE DIVISÃO (SPLIT) - RIGOROSAS:
      - 1 ou 2 dias: FULLBODY (Foco em grandes multiarticulares: Agachamento, Supino, Puxada, Terra).
      - 3 dias: DIVISÃO COMPLETA (A: Pernas completas + Panturrilha | B: Peito, Ombros, Tríceps | C: Costas, Bíceps, Abdômen).
      - 4 dias: DIVISÃO ASSINCRONA (A: Pernas Quads/Glúteos | B: Costas, Bíceps, Abs | C: Pernas Posterior/Panturrilha | D: Peito, Ombros, Tríceps). *Nunca colocar ombro dia antes de peito*.
      - 5 a 6 dias (Iniciante): ABC Sequencial (A-B-C-A-B...) para repetir estímulo e gerar adaptação.
      - 5 a 6 dias (Intermediário/Avançado): ABCDE (Um ou dois grupos musculares por dia, foco em volume isolado).

      REGRAS DE METODOLOGIA (FITO OS):
      1. MOBILIDADE: Obrigatório incluir 1 ou 2 exercícios de "Mobilidade" no início APENAS de treinos de MEMBROS INFERIORES (Pernas).
      2. AQUECIMENTO: Incluir 1 exercício de aquecimento específico (carga leve) antes do primeiro exercício multiarticular de cada treino.
      3. ORDEM: Mobilidade (se perna) -> Aquecimento -> Multiarticulares (Base) -> Acessórios -> Isoladores -> Abdômen (se houver) -> Cardio (se necessário).
      4. TEMPO: Se tempo < 40min, reduza o volume (max 4-5 exercícios) e descanso (45s). Se objetivo emagrecimento e >3 dias, sugira HIIT ou Cardio Final.

      REGRAS DE TÉCNICAS AVANÇADAS:
      - Iniciante: Apenas séries retas (Ex: 3x12). Foco em execução. Sem técnicas de intensidade.
      - Intermediário: Inserir Bi-set, Drop-set ou Rest-pause em 1 exercício por treino (preferencialmente isolador).
      - Avançado: Uso livre de técnicas (Bi-set, Drop-set, Falha) para aumentar densidade.

      REGRAS DE LESÃO (SEGURANÇA):
      - Se lesão JOELHO: PROIBIDO Agachamento profundo, Extensora pesada, Afundo. SUBSTITUIR POR: Leg Press, Isometrias, Elevação Pélvica.
      - Se lesão LOMBAR: PROIBIDO Terra, Stiff pesado, Remada Curvada livre. SUBSTITUIR POR: Máquinas apoiadas, Puxadas verticais.
      - Se lesão OMBRO: PROIBIDO Desenvolvimento por trás, Puxada por trás.

      FORMATO DE SAÍDA (JSON ESTRITO):
      {
        "name": "Nome do Treino (Ex: Hipertrofia Acelerada - Ficha A)",
        "goal": "${anamnese.objetivo}",
        "level": "${anamnese.experiencia}",
        "exercises": [
          {
            "name": "Nome Exato do Acervo",
            "sets": 3,
            "reps": "10-12",
            "rest": 60,
            "technique": "Normal" (ou Drop-set, Bi-set, Rest-pause),
            "day": "A", (Use A, B, C, D, E conforme a divisão)
            "muscleGroup": "Peito", (Categoria do exercício)
            "observations": "Dica curta de execução (opcional)"
          }
        ]
      }
      * Gere todos os dias (A, B, C...) dentro do array "exercises", mudando o campo "day".
    `;

    // 4. GERAÇÃO COM IA
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" }); // Flash é rápido e ótimo para seguir instruções
    const result = await model.generateContent(prompt);
    const response = await result.response;
    let text = response.text();

    // Limpeza do JSON (Remove blocos de código markdown se houver)
    text = text.replace(/```json/g, '').replace(/```/g, '').trim();
    
    let workoutPlan;
    try {
        workoutPlan = JSON.parse(text);
    } catch (e) {
        console.error("Erro ao fazer parse do JSON da IA:", text);
        return NextResponse.json({ error: "Erro na formatação do treino." }, { status: 500 });
    }

    // 5. SALVAMENTO NO BANCO
    // Primeiro, limpamos treinos antigos (opcional, depende da regra de negócio)
    // await prisma.workout.deleteMany({ where: { userId } });

    const newWorkout = await prisma.workout.create({
      data: {
        userId: userId,
        name: workoutPlan.name || "Treino Personalizado FITO",
        goal: workoutPlan.goal,
        level: workoutPlan.level,
        // Criação dos exercícios aninhada
        exercises: {
          create: workoutPlan.exercises.map((ex: any) => ({
            name: ex.name, // O nome virá da IA, que deve bater com o banco
            sets: Number(ex.sets),
            reps: String(ex.reps),
            rest: Number(ex.rest),
            technique: ex.technique || "Normal",
            day: ex.day, // A, B, C...
            muscleGroup: ex.muscleGroup,
            observations: ex.observations || ""
          }))
        }
      }
    });

    return NextResponse.json({ success: true, workoutId: newWorkout.id });

  } catch (error) {
    console.error("Erro Geral Route Generate:", error);
    return NextResponse.json({ error: "Falha interna ao gerar treino." }, { status: 500 });
  }
}