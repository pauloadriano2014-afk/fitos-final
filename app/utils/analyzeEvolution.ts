// app/utils/analyzeEvolution.ts
import prisma from '@/lib/prisma'; // Ajuste o caminho se o seu prisma estiver noutro local

export async function analyzeWorkoutEvolution(userId: string, coachId?: string) {
  try {
    // 1. Vai buscar o histórico dos últimos 30 dias deste aluno
    const recentHistory = await prisma.workoutHistory.findMany({
      where: {
        userId: userId,
        date: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) } // Últimos 30 dias
      },
      include: { details: true },
      orderBy: { date: 'asc' }
    });

    if (recentHistory.length < 4) return; // Precisa de pelo menos 4 treinos para ter dados estatísticos

    const exerciseMap: Record<string, { weights: number[], rpes: number[], name: string }> = {};

    // 2. Agrupa as cargas e RPEs por exercício
    recentHistory.forEach(workout => {
      const rpe = workout.rpe || 5;
      workout.details.forEach(detail => {
        if (!exerciseMap[detail.exerciseId]) {
          exerciseMap[detail.exerciseId] = { weights: [], rpes: [], name: detail.exerciseName };
        }
        exerciseMap[detail.exerciseId].weights.push(detail.weight);
        exerciseMap[detail.exerciseId].rpes.push(rpe);
      });
    });

    // 3. Analisa cada exercício à procura de Estagnação ou Evolução
    for (const exId in exerciseMap) {
      const data = exerciseMap[exId];
      if (data.weights.length >= 3) {
        // Pega nas últimas 3 sessões
        const last3Weights = data.weights.slice(-3);
        const last3Rpes = data.rpes.slice(-3);

        const isWeightStagnant = last3Weights[0] === last3Weights[1] && last3Weights[1] === last3Weights[2];
        const isRpeHigh = last3Rpes.every(r => r >= 8); // RPE 8 ou superior significa que está a falhar/difícil

        // 🔥 DETETOU ESTAGNAÇÃO!
        if (isWeightStagnant && isRpeHigh) {
          // Verifica se já gerámos um alerta para este exercício nos últimos 7 dias para não fazer spam
          const existingAlert = await prisma.studentAlert.findFirst({
            where: {
              userId: userId,
              exerciseName: data.name,
              type: "STAGNATION",
              createdAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) }
            }
          });

          if (!existingAlert) {
            // Aqui entra a chamada à Inteligência Artificial (Ajuste para a sua API da OpenAI/Gemini)
            const prompt = `O aluno estagnou no exercício ${data.name} com a carga de ${last3Weights[0]}kg nas últimas 3 sessões, relatando fadiga extrema (RPE alto). Sugere de forma direta e curta (máx 2 frases) um ajuste de periodização (ex: deload, técnica avançada, ou alteração de volume).`;
            
            // Exemplo de como chamaria a IA (substitua pela sua função de IA real):
            // const aiResponse = await callYourAI(prompt);
            const aiResponse = `Sugestão IA: O aluno não está a recuperar. Considere aplicar um "Deload" com redução de 20% da carga na próxima sessão ou alterar a técnica para um "Rest-Pause" para quebrar o platô.`;

            // Guarda o alerta na Base de Dados!
            await prisma.studentAlert.create({
              data: {
                userId: userId,
                coachId: coachId, // Para o seu sistema Multi-Tenant
                type: "STAGNATION",
                title: "⚠️ Estagnação de Carga",
                message: aiResponse,
                exerciseName: data.name
              }
            });
          }
        }
      }
    }
  } catch (error) {
    console.error("Erro ao analisar a evolução do treino:", error);
  }
}