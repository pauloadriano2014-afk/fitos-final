// app/api/ai/gerar-treino/route.ts
import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { userId, adminId } = body;

    if (!userId || !adminId) {
      return NextResponse.json({ error: 'userId e adminId obrigatórios' }, { status: 400 });
    }

    // ─── 1. BUSCAR BANCO DE EXERCÍCIOS DO ADMIN LOGADO ───
    // Cada admin tem seus próprios exercícios (com seus vídeos).
    // Filtramos por coachId para nunca misturar exercícios entre admins.
    const adminExercises = await prisma.exercise.findMany({
      where: { coachId: adminId },
      select: { id: true, name: true, category: true, subCategory: true },
      orderBy: { name: 'asc' },
    });

    if (adminExercises.length === 0) {
      return NextResponse.json({ error: 'Nenhum exercício encontrado para este admin.' }, { status: 404 });
    }

    // Map para validação rápida na etapa 6
    const exerciseMap = new Map(adminExercises.map((ex) => [ex.id, ex]));

    // ─── 2. BUSCAR DADOS DO ALUNO ───
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        anamneses: { orderBy: { createdAt: 'desc' }, take: 1 },
        workouts: {
          orderBy: { createdAt: 'desc' },
          take: 3, // últimos 3 treinos (ativos ou arquivados)
          include: {
            exercises: {
              include: { exercise: true },
              orderBy: { order: 'asc' },
            },
          },
        },
      },
    });

    if (!user) {
      return NextResponse.json({ error: 'Aluno não encontrado' }, { status: 404 });
    }

    // ─── 3. BUSCAR HISTÓRICO DE CARGAS ───
    const history = await prisma.workoutHistory.findMany({
      where: { userId },
      orderBy: { date: 'desc' },        // ← campo correto do schema (não createdAt)
      take: 20,
      include: { details: true },        // ← 'details' é o nome do campo no schema
    });

    // Mapa: exerciseId → { setIndex → última carga registrada }
    const weightMap: Record<string, Record<number, string>> = {};
    [...history].reverse().forEach((hist) => {
      hist.details?.forEach((detail: any) => {
        if (!weightMap[detail.exerciseId]) weightMap[detail.exerciseId] = {};
        weightMap[detail.exerciseId][detail.setNumber] = detail.weight;
      });
    });

    // ─── 4. PROCESSAR TREINOS ANTERIORES ───
    const anamnese = user.anamneses?.[0] || null;

    const previousWorkouts = user.workouts.map((workout, wIdx) => {
      const exercisesByDay: Record<string, any[]> = {};

      workout.exercises.forEach((ex: any) => {
        const day = ex.day || 'A';
        if (!exercisesByDay[day]) exercisesByDay[day] = [];

        // Desempacotar blocos (formato interno do app — JSON no campo technique)
        let blocks = ex.blocks;
        let technique = ex.technique;
        try {
          if (ex.technique && typeof ex.technique === 'string' && ex.technique.trim().startsWith('{')) {
            const parsed = JSON.parse(ex.technique);
            if (parsed?.b) { blocks = parsed.b; technique = parsed.t; }
          }
        } catch (_) {}

        if (!blocks || !Array.isArray(blocks) || blocks.length === 0) {
          blocks = [{
            sets: String(ex.sets || '3'),
            reps: String(ex.reps || '12'),
            restTime: String(ex.restTime || '60'),
            technique: technique || '',
          }];
        }

        // Cargas reais que o aluno usou neste exercício
        const realLoads = weightMap[ex.exerciseId] || {};
        const blocksWithHistory = blocks.map((b: any, idx: number) => ({
          ...b,
          lastWeight: realLoads[idx] ?? realLoads[0] ?? null,
        }));

        exercisesByDay[day].push({
          exerciseId: ex.exerciseId,
          name: ex.exercise?.name || 'Exercício',
          category: ex.exercise?.category || '',
          subCategory: ex.exercise?.subCategory || '',
          blocks: blocksWithHistory,
          observation: ex.observation || '',
        });
      });

      return {
        index: wIdx + 1,
        name: workout.name,
        model: workout.workoutModel || 'CARGA',
        createdAt: workout.createdAt,
        days: exercisesByDay,
      };
    });

    // ─── 5. MONTAR PROMPT ───
    const alunoContext = `
DADOS DO ALUNO:
- Nome: ${user.name || 'Não informado'}
- Objetivo: ${user.goal || anamnese?.objetivo || 'Não informado'}
- Nível: ${user.level || anamnese?.nivel || 'Não informado'}
- Foco principal: ${(anamnese as any)?.focoPrincipal || 'Geral'}
- Frequência semanal: ${anamnese?.frequencia ? `${anamnese.frequencia}x por semana` : 'Não informado'}
- Tempo disponível: ${anamnese?.tempoDisponivel ? `${anamnese.tempoDisponivel} minutos` : 'Não informado'}
- Limitações/Dores: ${anamnese?.limitacoes?.length ? anamnese.limitacoes.join(', ') : 'Nenhuma'}
- Cirurgias: ${anamnese?.cirurgias?.length ? anamnese.cirurgias.join(', ') : 'Nenhuma'}
- Peso: ${anamnese?.peso ? `${anamnese.peso}kg` : 'Não informado'}
- Altura: ${anamnese?.altura ? `${anamnese.altura}cm` : 'Não informado'}
`.trim();

    const workoutsContext = previousWorkouts.length > 0
      ? `\nHISTÓRICO DE TREINOS (do mais recente para o mais antigo):\n${JSON.stringify(previousWorkouts, null, 2)}`
      : '\nNenhum treino anterior encontrado. Crie uma rotina do zero adequada ao perfil do aluno.';

    const systemPrompt = `Você é um personal trainer especialista em prescrição de treinos de musculação e hipertrofia.
Sua tarefa é gerar uma NOVA rotina de treino progressiva baseada no histórico do aluno.

REGRAS OBRIGATÓRIAS:
1. Use EXCLUSIVAMENTE exercícios do banco fornecido. Nunca invente nomes ou IDs.
2. Use o "id" e o "name" EXATAMENTE como estão no banco — sem alterações.
3. Progressão de carga: se houver lastWeight no histórico, sugira +5% a +10%. Arredonde para múltiplos de 2.5kg.
4. Varie pelo menos 20% dos exercícios em relação ao treino mais recente (use variantes do mesmo grupo muscular).
5. Respeite OBRIGATORIAMENTE limitações e cirurgias — jamais prescreva movimentos contraindicados.
6. Cada série = um bloco individual com sets="1". Pirâmides ficam em blocos separados (ex: 15, 12, 10, 8).
7. Técnicas disponíveis (use com moderação — máx. 2 por dia): GVT, DROPSET, RESTPAUSE, BISET, 21, CLUSTERSET, 1_5_REPS, TUT. Deixe em branco para execução normal.
8. Cardio: sets = minutos, reps = kcal alvo, technique = intensidade (Leve/Moderada/Zona 2/Forte/HIIT).
9. Mantenha o mesmo número de dias e estrutura geral do treino anterior (se houver).

FORMATO DE SAÍDA — JSON puro, sem markdown, sem texto antes ou depois:
{
  "workoutName": "Nome da rotina",
  "workoutModel": "CARGA",
  "reasoning": "1-2 frases explicando as principais decisões (progressões aplicadas, variações escolhidas)",
  "exercisesByDay": {
    "A": [
      {
        "exerciseId": "id-exato-do-banco",
        "title": "Nome exato do banco",
        "category": "Categoria",
        "subCategory": "SubCategoria",
        "observation": "Dica opcional ao aluno (pode ser vazio)",
        "blocks": [
          { "sets": "1", "reps": "12", "load": "20kg", "restTime": "60", "technique": "" }
        ]
      }
    ]
  }
}`;

    const userMessage = `${alunoContext}
${workoutsContext}

BANCO DE EXERCÍCIOS DO COACH (use APENAS estes):
${JSON.stringify(adminExercises)}

Gere a nova rotina progressiva. Responda APENAS com o JSON.`.trim();

    // ─── 6. CHAMAR CLAUDE API ───
    const response = await anthropic.messages.create({
      model: 'claude-opus-4-5',
      max_tokens: 8000,
      messages: [{ role: 'user', content: userMessage }],
      system: systemPrompt,
    });

    const rawText = response.content
      .filter((c) => c.type === 'text')
      .map((c) => (c as any).text)
      .join('');

    const cleanJson = rawText
      .replace(/^```json\s*/m, '')
      .replace(/^```\s*/m, '')
      .replace(/```\s*$/m, '')
      .trim();

    let parsed: any;
    try {
      parsed = JSON.parse(cleanJson);
    } catch (e) {
      console.error('[gerar-treino] JSON inválido da IA:', cleanJson.substring(0, 600));
      return NextResponse.json(
        { error: 'A IA retornou um formato inválido. Tente novamente.' },
        { status: 500 }
      );
    }

    // ─── 7. VALIDAR — só aceita exercícios que existem no banco do admin ───
    const validatedDays: Record<string, any[]> = {};
    let ghostCount = 0;

    for (const [day, exercises] of Object.entries(parsed.exercisesByDay || {})) {
      validatedDays[day] = (exercises as any[])
        .filter((ex) => {
          const exists = exerciseMap.has(ex.exerciseId);
          if (!exists) {
            ghostCount++;
            console.warn(`[gerar-treino] exercício fora do banco ignorado: ${ex.exerciseId} "${ex.title}"`);
          }
          return exists;
        })
        .map((ex) => {
          const dbEx = exerciseMap.get(ex.exerciseId)!;
          return {
            exerciseId: ex.exerciseId,
            title: dbEx.name,           // nome canônico do banco
            category: dbEx.category,
            subCategory: dbEx.subCategory,
            observation: ex.observation || '',
            substitute: null,
            blocks: (ex.blocks || []).map((b: any) => ({
              sets:      String(b.sets      || '1'),
              reps:      String(b.reps      || '12'),
              load:      b.load             || '',
              restTime:  String(b.restTime  || '60'),
              technique: b.technique        || '',
            })),
          };
        });
    }

    if (ghostCount > 0) {
      console.warn(`[gerar-treino] ${ghostCount} exercícios fora do banco foram removidos.`);
    }

    const workoutTabs = Object.keys(validatedDays);

    // Checar se sobrou algum exercício após validação
    const totalExercises = workoutTabs.reduce((acc, day) => acc + validatedDays[day].length, 0);
    if (totalExercises === 0) {
      return NextResponse.json(
        { error: 'A IA gerou exercícios que não existem no banco. Tente novamente.' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      workoutName:    parsed.workoutName  || `Rotina — ${user.name}`,
      workoutModel:   parsed.workoutModel || 'CARGA',
      reasoning:      parsed.reasoning   || '',
      exercisesByDay: validatedDays,
      workoutTabs,
    });

  } catch (error: any) {
    console.error('[gerar-treino] erro:', error);
    return NextResponse.json({ error: error.message || 'Erro interno' }, { status: 500 });
  }
}