import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { GoogleGenerativeAI } from '@google/generative-ai';

const prisma = new PrismaClient();
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

// CONFIGURAÇÃO DE SEGURANÇA (Evita timeouts em treinos longos)
export const maxDuration = 60; 
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  try {
    const { userId } = await req.json();

    if (!userId) {
      return NextResponse.json({ error: 'UserId obrigatório' }, { status: 400 });
    }

    // 1. BUSCAR DADOS DO ALUNO E O PLANO DELE
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { anamneses: { orderBy: { createdAt: 'desc' }, take: 1 } }
    });

    if (!user || user.anamneses.length === 0) {
      return NextResponse.json({ error: 'Anamnese não encontrada' }, { status: 404 });
    }

    const ficha = user.anamneses[0];
    
    // --- LÓGICA VIP ---
    // Se for VIP ou ADMIN, o treino nasce OCULTO (precisa de aprovação)
    // Se for Standard, o treino nasce VISÍVEL (automático)
    const isVIP = user.plan_tier === 'vip' || user.role === 'ADMIN';
    const treinoVisivel = !isVIP; 

    // 2. BUSCAR SEUS EXERCÍCIOS DISPONÍVEIS (SEU ACERVO)
    const allExercises = await prisma.exercise.findMany({
      select: { id: true, name: true, category: true }
    });

    if (allExercises.length === 0) {
      return NextResponse.json({ error: 'Nenhum exercício cadastrado no sistema' }, { status: 400 });
    }

    // 3. MONTAR O PROMPT PARA O GEMINI
    const exerciseListString = allExercises.map(e => `- [${e.id}] ${e.name} (${e.category})`).join('\n');

    const prompt = `
      ATUE COMO UM TREINADOR DE ELITE (Personal Trainer).
      
      DADOS DO ALUNO:
      - Objetivo: ${ficha.objetivo}
      - Nível: ${ficha.nivel}
      - Dias disponíveis: ${ficha.frequencia} dias/semana
      - Tempo por treino: ${ficha.tempoDisponivel} minutos
      - Limitações/Lesões: ${ficha.limitacoes.join(', ')}
      - Cirurgias: ${ficha.cirurgias.join(', ')}
      - IMC: ${ficha.imc || 'N/A'}

      SEU ACERVO DE EXERCÍCIOS (Use APENAS estes IDs):
      ${exerciseListString}

      MISSÃO:
      Crie uma rotina de treino completa (A, B, C...) baseada na frequência do aluno.
      
      REGRAS CRITICAS:
      1. Use APENAS exercícios da lista fornecida.
      2. Respeite as lesões do aluno (ex: se tem dor no joelho, evite impacto ou cargas excessivas no joelho).
      3. A saída DEVE ser estritamente um JSON válido.
      
      FORMATO JSON ESPERADO:
      {
        "workouts": [
          {
            "name": "Treino A - Peito e Tríceps",
            "exercises": [
              { "exerciseId": "ID_DO_EXERCICIO", "sets": 3, "reps": "12", "notes": "Foco na excêntrica" }
            ]
          }
        ]
      }
    `;

    // 4. CHAMAR O GEMINI
    const model = genAI.getGenerativeModel({ model: "gemini-pro" });
    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text();

    const cleanJson = text.replace(/```json/g, '').replace(/```/g, '').trim();
    const plan = JSON.parse(cleanJson);

    // 5. SALVAR NO BANCO DE DADOS (PRISMA)
    await prisma.workout.deleteMany({ where: { userId } });

    for (const treino of plan.workouts) {
      const createdWorkout = await prisma.workout.create({
        data: {
          userId,
          name: treino.name,
          isVisible: treinoVisivel, // <--- AQUI ESTÁ A MÁGICA (VIP fica false, Comum fica true)
        }
      });

      for (const ex of treino.exercises) {
        const exerciseExists = allExercises.find(e => e.id === ex.exerciseId);
        
        if (exerciseExists) {
          await prisma.workoutExercise.create({
            data: {
              workoutId: createdWorkout.id,
              exerciseId: ex.exerciseId,
              sets: ex.sets,
              reps: ex.reps,
              notes: ex.notes
            }
          });
        }
      }
    }

    // Retorna se é VIP ou não para o Front-end mostrar a mensagem certa
    return NextResponse.json({ 
      success: true, 
      isVIP: isVIP,
      message: isVIP ? 'Treino enviado para análise do Personal.' : 'Treino gerado com sucesso!' 
    });

  } catch (error) {
    console.error("ERRO GEMINI:", error);
    return NextResponse.json({ error: 'Falha ao gerar treino.' }, { status: 500 });
  }
}