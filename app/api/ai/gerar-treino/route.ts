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
    const adminExercises = await prisma.exercise.findMany({
      where: { coachId: adminId },
      select: { id: true, name: true, category: true, subCategory: true, videoUrl: true },
      orderBy: { name: 'asc' },
    });

    if (adminExercises.length === 0) {
      return NextResponse.json({ error: 'Nenhum exercício encontrado para este admin.' }, { status: 404 });
    }

    const exerciseMap = new Map(adminExercises.map((ex) => [ex.id, ex]));

    // ─── 2. BUSCAR DADOS DO ALUNO ───
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        anamneses: { orderBy: { createdAt: 'desc' }, take: 1 },
        workouts: {
          orderBy: { createdAt: 'desc' },
          take: 3,
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
      orderBy: { date: 'desc' },
      take: 20,
      include: { details: true },
    });

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

    // ─── 5. MONTAR MAPA DE VARIAÇÕES POR SUBCATEGORIA ───
    // Agrupa exercícios por categoria+subCategoria para a IA escolher variantes reais
    const variationMap: Record<string, Array<{id: string, name: string}>> = {};
    adminExercises.forEach((ex) => {
      const key = `${ex.category}|${ex.subCategory}`;
      if (!variationMap[key]) variationMap[key] = [];
      variationMap[key].push({ id: ex.id, name: ex.name });
    });

    // Formatar para o prompt — só grupos com 2+ opções
    const variationGuide = Object.entries(variationMap)
      .filter(([, exs]) => exs.length >= 2)
      .map(([key, exs]) => {
        const [cat, sub] = key.split('|');
        return `${cat} > ${sub}: ${exs.map(e => `"${e.name}" (${e.id})`).join(' | ')}`;
      })
      .join('\n');

    // ─── 6. MONTAR PROMPT ───
    const anamnese_ = anamnese as any;
    const alunoContext = `
DADOS DO ALUNO:
- Nome: ${user.name || 'Não informado'}
- Objetivo: ${user.goal || anamnese_?.objetivo || 'Não informado'}
- Nível: ${user.level || anamnese_?.nivel || 'Não informado'}
- Foco principal: ${anamnese_?.focoPrincipal || 'Geral'}
- Frequência semanal: ${anamnese_?.frequencia ? `${anamnese_?.frequencia}x por semana` : 'Não informado'}
- Tempo disponível: ${anamnese_?.tempoDisponivel ? `${anamnese_?.tempoDisponivel} minutos` : 'Não informado'}
- Limitações/Dores: ${anamnese_?.limitacoes?.length ? anamnese_?.limitacoes.join(', ') : 'Nenhuma'}
- Cirurgias: ${anamnese_?.cirurgias?.length ? anamnese_?.cirurgias.join(', ') : 'Nenhuma'}
- Peso: ${anamnese_?.peso ? `${anamnese_?.peso}kg` : 'Não informado'}
- Altura: ${anamnese_?.altura ? `${anamnese_?.altura}cm` : 'Não informado'}
`.trim();

    const workoutsContext = previousWorkouts.length > 0
      ? `\nHISTÓRICO DE TREINOS (do mais recente para o mais antigo):\n${JSON.stringify(previousWorkouts, null, 2)}`
      : '\nNenhum treino anterior encontrado. Crie uma rotina do zero adequada ao perfil do aluno.';

    // Extrair IDs dos exercícios do treino mais recente para forçar variação
    const latestWorkoutExerciseIds = new Set<string>();
    if (previousWorkouts.length > 0) {
      const latest = previousWorkouts[0];
      Object.values(latest.days).forEach((dayExs: any[]) => {
        dayExs.forEach((ex: any) => latestWorkoutExerciseIds.add(ex.exerciseId));
      });
    }
    const latestIds = Array.from(latestWorkoutExerciseIds);

    const systemPrompt = `Você é um personal trainer experiente. Sua tarefa é gerar uma rotina de treino NOVA e DIFERENTE do treino anterior.

═══════════════════════════════════════════
REGRAS ABSOLUTAS — NUNCA VIOLE ESTAS REGRAS
═══════════════════════════════════════════

REGRA 1 — NOMES DOS DIAS: Use SEMPRE letras simples: "A", "B", "C", "D", "E", "F". NUNCA use nomes descritivos como "Peito e Tríceps" ou "Glúteos".

REGRA 2 — IDs EXCLUSIVOS: Use APENAS ids e names do banco fornecido. Nunca invente.

REGRA 3 — VARIAÇÃO OBRIGATÓRIA DE EXERCÍCIOS:
${latestIds.length > 0 ? `Os IDs do treino anterior são: ${latestIds.join(', ')}
VOCÊ DEVE TROCAR NO MÍNIMO 40% DESSES EXERCÍCIOS por variantes do mesmo grupo muscular.
Use o GUIA DE VARIAÇÕES abaixo para escolher substitutos inteligentes.
Exemplo correto: Búlgaro c/halteres → Afundo no Smith (mesmo grupo: Pernas > Multiarticular)
Exemplo ERRADO: Búlgaro c/halteres → Búlgaro máquina (muito parecido, não conta como variação)` : 'Crie uma rotina do zero variada e equilibrada.'}

REGRA 4 — TÉCNICAS AVANÇADAS OBRIGATÓRIAS:
Cada dia DEVE ter pelo menos 1 técnica avançada. Use técnicas DIFERENTES em cada dia.
T�cnicas disponíveis: DROPSET, RESTPAUSE, BISET, 21, CLUSTERSET, 1_5_REPS, TUT, GVT
- DROPSET: reduz carga e continua sem pausa
- RESTPAUSE: pausa 10-15s e continua com mesma carga
- BISET: dois exercícios sem pausa (use em 2 exercícios consecutivos)
- 21: 7 reps baixo + 7 reps cima + 7 completas
- CLUSTERSET: mini-séries com 15s de pausa entre elas
- 1_5_REPS: movimento completo + meio movimento = 1 rep
- TUT: cadência controlada (3s descida, 1s pausa, 2s subida)
- GVT: 10 séries de 10 reps mesma carga

REGRA 5 — SUBSTITUTOS INTELIGENTES: Para cada exercício principal, adicione um substituto de subCategoria diferente quando possível.
Exemplo: exercício principal = Leg Press 45° (Multiarticular) → substituto = Cadeira Extensora (Quadríceps)

REGRA 6 — PROGRESSÃO DE CARGA: Se lastWeight existir, sugira +5% a +10%. Arredonde para múltiplos de 2.5kg.

REGRA 7 — ESTRUTURA DE BLOCOS: Cada série = 1 bloco com sets="1". Pirâmides em blocos separados.

REGRA 8 — LIMITAÇÕES: Respeite SEMPRE limitações e cirurgias. Nunca prescreva movimentos contraindicados.

REGRA 9 — CARDIO: sets=minutos, reps=kcal alvo, technique=Leve/Moderada/Zona 2/Forte/HIIT.

═══════════════════════════════════════════
GUIA DE VARIAÇÕES DO BANCO DO COACH
(Use para escolher substitutos e variações)
═══════════════════════════════════════════
${variationGuide}

═══════════════════════════════════════════
FORMATO DE SAÍDA — JSON PURO, SEM MARKDOWN
═══════════════════════════════════════════
{
  "workoutName": "Nome da rotina",
  "workoutModel": "CARGA",
  "reasoning": "Explique quais exercícios foram trocados e quais técnicas foram aplicadas em cada dia",
  "exercisesByDay": {
    "A": [
      {
        "exerciseId": "id-exato-do-banco",
        "title": "Nome exato do banco",
        "category": "Categoria",
        "subCategory": "SubCategoria",
        "observation": "Dica ao aluno",
        "substitute": {
          "exerciseId": "id-do-substituto",
          "title": "Nome do substituto"
        },
        "blocks": [
          { "sets": "1", "reps": "12", "load": "20kg", "restTime": "60", "technique": "" }
        ]
      }
    ]
  }
}`;

    const userMessage = `${alunoContext}
${workoutsContext}

BANCO COMPLETO DE EXERCÍCIOS:
${JSON.stringify(adminExercises.map(e => ({ id: e.id, name: e.name, category: e.category, subCategory: e.subCategory })))}

Gere a nova rotina. Responda APENAS com o JSON.`.trim();

    // ─── 7. CHAMAR CLAUDE API ───
    const response = await anthropic.messages.create({
      model: 'claude-opus-4-5',
      max_tokens: 10000,
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

    // ─── 8. VALIDAR E ENRIQUECER COM DADOS DO BANCO ───
    const validatedDays: Record<string, any[]> = {};
    let ghostCount = 0;

    for (const [day, exercises] of Object.entries(parsed.exercisesByDay || {})) {
      validatedDays[day] = (exercises as any[])
        .filter((ex) => {
          const exists = exerciseMap.has(ex.exerciseId);
          if (!exists) {
            ghostCount++;
            console.warn(`[gerar-treino] exercício inválido ignorado: ${ex.exerciseId} "${ex.title}"`);
          }
          return exists;
        })
        .map((ex) => {
          const dbEx = exerciseMap.get(ex.exerciseId)!;

          // Validar substituto se existir
          let substitute = null;
          if (ex.substitute?.exerciseId && exerciseMap.has(ex.substitute.exerciseId)) {
            const dbSub = exerciseMap.get(ex.substitute.exerciseId)!;
            substitute = {
              id: dbSub.id,
              name: dbSub.name,
              videoUrl: dbSub.videoUrl || '',
            };
          }

          return {
            exerciseId: ex.exerciseId,
            title: dbEx.name,
            videoUrl: dbEx.videoUrl || '',
            category: dbEx.category,
            subCategory: dbEx.subCategory,
            observation: ex.observation || '',
            substitute,
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
      console.warn(`[gerar-treino] ${ghostCount} exercícios fora do banco removidos.`);
    }

    const workoutTabs = Object.keys(validatedDays);
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