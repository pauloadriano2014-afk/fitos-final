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

    // ─── 1. BUSCAR BANCO DO ADMIN COM TAGS ───
    const adminExercises = await prisma.exercise.findMany({
      where: { coachId: adminId },
      select: {
        id: true,
        name: true,
        category: true,
        subCategory: true,
        videoUrl: true,
        tags: true, // target, mechanic, equipment, jointRisk
      },
      orderBy: { name: 'asc' },
    });

    if (adminExercises.length === 0) {
      return NextResponse.json({ error: 'Nenhum exercício encontrado para este admin.' }, { status: 404 });
    }

    const exerciseMap = new Map(adminExercises.map((ex) => [ex.id, ex]));

    // ─── 2. MONTAR MAPA DE VARIAÇÕES POR TARGET ───
    // Agrupa por tags.target — o músculo alvo REAL
    // Assim: Mesa Flexora (POSTERIOR) → Cadeira Flexora (POSTERIOR) ✅
    const byTarget: Record<string, Array<{ id: string; name: string; equipment: string; mechanic: string }>> = {};
    const bySubCategory: Record<string, Array<{ id: string; name: string }>> = {};

    adminExercises.forEach((ex) => {
      const tags = ex.tags as any;
      const target = tags?.target || ex.category?.toUpperCase() || 'GERAL';
      const equipment = tags?.equipment || 'LIVRE';
      const mechanic = tags?.mechanic || 'ISOLADO';
      const sub = `${ex.category}|${ex.subCategory || 'Geral'}`;

      if (!byTarget[target]) byTarget[target] = [];
      byTarget[target].push({ id: ex.id, name: ex.name, equipment, mechanic });

      if (!bySubCategory[sub]) bySubCategory[sub] = [];
      bySubCategory[sub].push({ id: ex.id, name: ex.name });
    });

    // Formatar guia de variações para o prompt
    const variationGuide = Object.entries(byTarget)
      .filter(([, exs]) => exs.length >= 2)
      .map(([target, exs]) => {
        const byEquip: Record<string, string[]> = {};
        exs.forEach(e => {
          if (!byEquip[e.equipment]) byEquip[e.equipment] = [];
          byEquip[e.equipment].push(`"${e.name}" (${e.id})`);
        });
        const lines = Object.entries(byEquip)
          .map(([eq, names]) => `    ${eq}: ${names.join(' | ')}`)
          .join('\n');
        return `  TARGET ${target} (${exs.length} opções):\n${lines}`;
      })
      .join('\n\n');

    // ─── 3. BUSCAR DADOS DO ALUNO ───
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

    // ─── 4. HISTÓRICO DE CARGAS ───
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

    // ─── 5. PROCESSAR TREINOS ANTERIORES ───
    const anamnese = user.anamneses?.[0] || null;

    const previousWorkouts = user.workouts.map((workout, wIdx) => {
      const exercisesByDay: Record<string, any[]> = {};

      workout.exercises.forEach((ex: any) => {
        const day = ex.day || 'A';
        if (!exercisesByDay[day]) exercisesByDay[day] = [];

        let blocks = ex.blocks;
        let technique = ex.technique;
        try {
          if (ex.technique?.startsWith('{')) {
            const p = JSON.parse(ex.technique);
            if (p?.b) { blocks = p.b; technique = p.t; }
          }
        } catch (_) {}

        if (!blocks?.length) {
          blocks = [{ sets: String(ex.sets || '3'), reps: String(ex.reps || '12'), restTime: String(ex.restTime || '60'), technique: technique || '' }];
        }

        const realLoads = weightMap[ex.exerciseId] || {};
        const exTags = (ex.exercise?.tags as any) || {};

        exercisesByDay[day].push({
          exerciseId: ex.exerciseId,
          name: ex.exercise?.name || 'Exercício',
          target: exTags.target || ex.exercise?.category || '',
          equipment: exTags.equipment || '',
          mechanic: exTags.mechanic || '',
          jointRisk: exTags.jointRisk || [],
          blocks: blocks.map((b: any, idx: number) => ({
            ...b,
            lastWeight: realLoads[idx] ?? realLoads[0] ?? null,
          })),
          observation: ex.observation || '',
        });
      });

      return {
        index: wIdx + 1,
        name: workout.name,
        model: workout.workoutModel || 'CARGA',
        days: exercisesByDay,
      };
    });

    // IDs do treino mais recente para forçar variação
    const latestIds = new Set<string>();
    if (previousWorkouts.length > 0) {
      Object.values(previousWorkouts[0].days).forEach((dayExs: any[]) => {
        dayExs.forEach((ex: any) => latestIds.add(ex.exerciseId));
      });
    }

    // ─── 6. MONTAR PROMPT ───
    const anamnese_ = anamnese as any;
    const alunoCtx = `
ALUNO: ${user.name || 'Não informado'}
- Objetivo: ${user.goal || anamnese_?.objetivo || 'Não informado'}
- Nível: ${user.level || anamnese_?.nivel || 'Não informado'}
- Frequência: ${anamnese_?.frequencia ? `${anamnese_?.frequencia}x/sem` : 'Não informado'}
- Tempo: ${anamnese_?.tempoDisponivel ? `${anamnese_?.tempoDisponivel}min` : 'Não informado'}
- Limitações: ${anamnese_?.limitacoes?.length ? anamnese_?.limitacoes.join(', ') : 'Nenhuma'}
- Cirurgias: ${anamnese_?.cirurgias?.length ? anamnese_?.cirurgias.join(', ') : 'Nenhuma'}
- Peso/Altura: ${anamnese_?.peso ? `${anamnese_?.peso}kg` : '?'} / ${anamnese_?.altura ? `${anamnese_?.altura}cm` : '?'}`.trim();

    const workoutsCtx = previousWorkouts.length > 0
      ? `\nHISTÓRICO (mais recente primeiro):\n${JSON.stringify(previousWorkouts, null, 2)}`
      : '\nSem treinos anteriores — crie rotina do zero.';

    const systemPrompt = `Você é um personal trainer experiente. Gere uma rotina NOVA e DIFERENTE do treino anterior.

══════════════════════════════════════════
REGRAS ABSOLUTAS
══════════════════════════════════════════

REGRA 1 — DIAS: Use "A", "B", "C"... Nunca use nomes descritivos.

REGRA 2 — IDs: Use APENAS ids e names do banco. Jamais invente.

REGRA 3 — VARIAÇÃO POR TARGET (MAIS IMPORTANTE):
${latestIds.size > 0 ? `IDs do treino anterior: ${Array.from(latestIds).join(', ')}

OBRIGATÓRIO: Troque no mínimo 40% desses exercícios.
COMO TROCAR CORRETAMENTE:
- Identifique o "target" do exercício a ser trocado
- Escolha outro exercício com o MESMO target no GUIA DE VARIAÇÕES
- Prefira equipment diferente para maior variedade
- Exemplos corretos:
  * Mesa Flexora (POSTERIOR/MAQUINA) → Cadeira Flexora (POSTERIOR/MAQUINA) ou Stiff c/halter (POSTERIOR/HALTER)
  * Búlgaro c/halteres (PERNAS/HALTER) → Afundo no Smith (PERNAS/BARRA) ou Passada c/barra (PERNAS/BARRA)
  * Supino articulado (PEITO/LIVRE) → Supino reto c/halteres (PEITO/HALTER) ou Supino no Smith (PEITO/BARRA)
  * Puxada frente aberta (COSTAS/LIVRE) → Puxada c/triângulo (COSTAS/LIVRE) ou Pulldown com barra (COSTAS/BARRA)
- ERRADO: Trocar Mesa Flexora por Mesa Flexora de outro jeito (mesmo equipamento/nome similar)` : 'Sem treino anterior — crie rotina variada.'}

REGRA 4 — TÉCNICAS (OBRIGATÓRIO):
Cada dia DEVE ter pelo menos 1 técnica avançada. Use técnicas DIFERENTES por dia.
- DROPSET: reduz 20-30% da carga e continua sem pausa
- RESTPAUSE: 10-15s de pausa e repete com mesma carga
- BISET: dois exercícios SEM pausa — marque os DOIS com BISET
- 21: 7 reps baixo + 7 reps cima + 7 completas
- CLUSTERSET: blocos de 3 reps com 15s entre eles
- 1_5_REPS: movimento completo + meio = 1 rep
- TUT: cadência controlada 3s descida
- GVT: 10 séries de 10 reps

REGRA 5 — SUBSTITUTOS INTELIGENTES:
Para cada exercício, adicione 1 substituto com TARGET diferente ou EQUIPMENT diferente.
Consulte o GUIA DE VARIAÇÕES abaixo.

REGRA 6 — PROGRESSÃO: lastWeight +5% a +10%, múltiplos de 2.5kg.

REGRA 7 — BLOCOS: sets="1" por bloco. Pirâmides = blocos separados.

REGRA 8 — LIMITAÇÕES: Respeite jointRisk. Se aluno tem limitação de joelho, EVITE exercícios com "JOELHO" em jointRisk.

REGRA 9 — CARDIO: sets=minutos, reps=kcal, technique=Leve/Moderada/Zona 2/Forte/HIIT.

══════════════════════════════════════════
GUIA DE VARIAÇÕES (por TARGET)
══════════════════════════════════════════
${variationGuide}

══════════════════════════════════════════
FORMATO JSON — sem markdown, sem texto extra
══════════════════════════════════════════
{
  "workoutName": "Nome",
  "workoutModel": "CARGA",
  "reasoning": "Quais exercícios foram trocados e por quê. Quais técnicas foram aplicadas em cada dia.",
  "exercisesByDay": {
    "A": [
      {
        "exerciseId": "id-exato",
        "title": "nome-exato",
        "category": "Categoria",
        "subCategory": "SubCategoria",
        "observation": "dica ao aluno",
        "substitute": { "exerciseId": "id-exato", "title": "nome-exato" },
        "blocks": [
          { "sets": "1", "reps": "12", "load": "20kg", "restTime": "60", "technique": "" }
        ]
      }
    ]
  }
}`;

    // Banco para o prompt — inclui target/equipment para a IA escolher melhor
    const bankForPrompt = adminExercises.map(ex => {
      const tags = ex.tags as any;
      return {
        id: ex.id,
        name: ex.name,
        category: ex.category,
        subCategory: ex.subCategory,
        target: tags?.target || ex.category,
        equipment: tags?.equipment || '',
        mechanic: tags?.mechanic || '',
        jointRisk: tags?.jointRisk || [],
      };
    });

    const userMessage = `${alunoCtx}
${workoutsCtx}

BANCO DE EXERCÍCIOS:
${JSON.stringify(bankForPrompt)}

Gere a rotina. Responda APENAS com o JSON.`.trim();

    // ─── 7. CHAMAR CLAUDE ───
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

    const cleanJson = rawText.replace(/^```json\s*/m, '').replace(/^```\s*/m, '').replace(/```\s*$/m, '').trim();

    let parsed: any;
    try {
      parsed = JSON.parse(cleanJson);
    } catch (e) {
      console.error('[gerar-treino] JSON inválido:', cleanJson.substring(0, 600));
      return NextResponse.json({ error: 'A IA retornou formato inválido. Tente novamente.' }, { status: 500 });
    }

    // ─── 8. VALIDAR E ENRIQUECER ───
    const validatedDays: Record<string, any[]> = {};
    let ghostCount = 0;

    for (const [day, exercises] of Object.entries(parsed.exercisesByDay || {})) {
      validatedDays[day] = (exercises as any[])
        .filter((ex) => {
          const ok = exerciseMap.has(ex.exerciseId);
          if (!ok) { ghostCount++; console.warn(`[gerar-treino] inválido: ${ex.exerciseId} "${ex.title}"`); }
          return ok;
        })
        .map((ex) => {
          const dbEx = exerciseMap.get(ex.exerciseId)!;

          let substitute = null;
          if (ex.substitute?.exerciseId && exerciseMap.has(ex.substitute.exerciseId)) {
            const dbSub = exerciseMap.get(ex.substitute.exerciseId)!;
            substitute = { id: dbSub.id, name: dbSub.name, videoUrl: dbSub.videoUrl || '' };
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

    if (ghostCount > 0) console.warn(`[gerar-treino] ${ghostCount} fantasmas removidos.`);

    const workoutTabs = Object.keys(validatedDays);
    const totalExercises = workoutTabs.reduce((acc, d) => acc + validatedDays[d].length, 0);

    if (totalExercises === 0) {
      return NextResponse.json({ error: 'A IA não gerou exercícios válidos. Tente novamente.' }, { status: 500 });
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