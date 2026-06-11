// app/api/ai/gerar-treino/route.ts
import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { PrismaClient } from '@prisma/client';
import { GoogleGenerativeAI } from '@google/generative-ai';
import OpenAI from 'openai';

const prisma = new PrismaClient();

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { userId, adminId, cycleConfig } = body;

    if (!userId || !adminId) {
      return NextResponse.json({ error: 'userId e adminId obrigatórios' }, { status: 400 });
    }

    // ─── 1. BUSCAR BANCO DO ADMIN ───
    const trainingEnv = cycleConfig?.trainingEnvironment || null;

    const envFilter = trainingEnv && trainingEnv !== 'UNIVERSAL'
      ? { hasSome: ['UNIVERSAL', trainingEnv] }
      : undefined;

    const currentAdmin = await prisma.user.findUnique({
      where: { id: adminId },
      select: { email: true }
    });

    const isAdri = currentAdmin?.email?.toLowerCase() === 'adri.personal@hotmail.com';
    let coachFilter: any = { coachId: adminId };

    if (isAdri) {
      const masterAdmin = await prisma.user.findFirst({
        where: { role: 'ADMIN', email: { not: 'adri.personal@hotmail.com' } },
        select: { id: true }
      });
      if (masterAdmin) {
        coachFilter = { OR: [{ coachId: adminId }, { coachId: masterAdmin.id }] };
      }
    }

    // Exercícios filtrados pelo ambiente (para o treino principal)
    const adminExercises = await prisma.exercise.findMany({
      where: {
        ...coachFilter,
        ...(envFilter ? { environments: envFilter } : {}),
      },
      select: {
        id: true,
        name: true,
        category: true,
        subCategory: true,
        videoUrl: true,
        tags: true,
        environments: true,
        defaultSubstitutes: true,
      },
      orderBy: { name: 'asc' },
    });

    if (adminExercises.length === 0) {
      return NextResponse.json({ error: 'Nenhum exercício encontrado para este admin.' }, { status: 404 });
    }

    // Mapa completo por id
    const exerciseMap = new Map(adminExercises.map((ex) => [ex.id, ex]));

    // ─── 2. MONTAR MAPA DE VARIAÇÕES POR TARGET ───
    // Para substitutos: só exercícios do mesmo ambiente
    const byTarget: Record<string, Array<{ id: string; name: string; equipment: string; mechanic: string }>> = {};

    adminExercises.forEach((ex) => {
      const tags = ex.tags as any;
      const target = tags?.target || ex.category?.toUpperCase() || 'GERAL';
      const equipment = tags?.equipment || 'LIVRE';
      const mechanic = tags?.mechanic || 'ISOLADO';

      if (!byTarget[target]) byTarget[target] = [];
      byTarget[target].push({ id: ex.id, name: ex.name, equipment, mechanic });
    });

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

    const latestIds = new Set<string>();
    if (previousWorkouts.length > 0) {
      Object.values(previousWorkouts[0].days).forEach((dayExs: any[]) => {
        dayExs.forEach((ex: any) => latestIds.add(ex.exerciseId));
      });
    }

    // ─── 6. PRÉ-CALCULAR SUBSTITUTOS VÁLIDOS POR EXERCÍCIO ───
    // Mapeamos os defaultSubstitutes já filtrados pelo ambiente
    // Isso garante que a IA só receba substitutos válidos para o ambiente escolhido
    const substitutesByExercise: Record<string, Array<{ id: string; name: string }>> = {};

    adminExercises.forEach((ex) => {
      const defaultSubs = (ex.defaultSubstitutes || []) as string[];
      if (defaultSubs.length === 0) return;

      const validSubs = defaultSubs
        .map(subId => exerciseMap.get(subId))
        .filter(Boolean)
        .map(sub => ({ id: sub!.id, name: sub!.name }));

      if (validSubs.length > 0) {
        substitutesByExercise[ex.id] = validSubs;
      }
    });

    // ─── 7. MONTAR PROMPT ───
    const anamnese_ = anamnese as any;
    const hasCycleConfig = cycleConfig && cycleConfig.days?.length > 0;

    let cycleCtx = '';
    if (hasCycleConfig) {
      const phaseLabels: Record<string, string> = {
        HIPERTROFIA:   'Hipertrofia — volume moderado, técnicas variadas, reps 8-15, foco em tempo sob tensão',
        FORCA:         'Força — cargas pesadas, reps 3-6, descanso longo 2-3min, pirâmides crescentes',
        CHOQUE:        'Choque — volume alto, técnicas avançadas em quase todos os exercícios, reps 6-12',
        DELOAD:        'Deload — volume leve, SEM técnicas avançadas, reps 15-20, cargas 60-70% do máximo',
        EMAGRECIMENTO: 'Emagrecimento — circuito com pouco descanso, reps 12-20, cardio OBRIGATÓRIO 300kcal no final dos dias de superiores/abdômen',
        DEFINICAO:     'Definição — preservar massa muscular, reps 12-15, cardio OBRIGATÓRIO 300kcal no final dos dias de superiores/abdômen',
      };

      const gender = cycleConfig.gender || 'Não informado';
      const genderRules = gender === 'Feminino'
        ? `GÊNERO: Feminino\n- Priorize glúteos, posteriores e adutor\n- Inclua variações de glúteo no cabo, elevação pélvica, coice\n- Peito: exercícios leves, máx 2-3 séries\n- Superiores com cargas mais leves e foco em definição`
        : `GÊNERO: Masculino\n- Priorize compostos de superiores: supino, desenvolvimento, remada\n- Foco em hipertrofia de peito, costas e ombros\n- Evite glúteo isolado (elevação pélvica no cabo, coice)\n- Pernas: foco em quadríceps e força multiarticular`;

      const dayStructure = cycleConfig.days.map((d: any) => {
        const groupLines = d.groups.map((g: any) => {
          const restNote = g.rest !== undefined ? `, descanso ${g.rest}s` : '';
          const setsNote = g.sets !== undefined ? `, ${g.sets} séries por exercício (exceto GVT=10)` : ', 4 séries por exercício';
          const cardioNote = g.id === 'CARDIO' && cycleConfig.cardioTarget
            ? ` (${cycleConfig.cardioTarget}kcal — sets=minutos, reps=kcal, technique=Moderada)`
            : '';
          return `    - ${g.id}: ${g.qty} exercício(s)${setsNote}${restNote}${cardioNote}`;
        }).join('\n');
        return `  Dia ${d.name}:\n${groupLines}`;
      }).join('\n');

      const techList = cycleConfig.techniques?.length > 0
        ? cycleConfig.techniques.join(', ')
        : 'Livre escolha da IA';

      const limitationRulesCtx = cycleConfig.limitationRules?.length > 0
        ? cycleConfig.limitationRules.map((rule: any) =>
            rule.rules.map((r: any) => {
              if (r.staticOnly) return `  - ${r.group}: APENAS estáticos (prancha, isometria). ${r.note}`;
              if (r.forceLight) return `  - ${r.group}: máx ${r.maxExercises} exercícios, carga LEVE. ${r.note}`;
              if (r.addNote) return `  - ${r.group}: adicionar observação: "${r.note}"`;
              return `  - ${r.group}: ${r.note}`;
            }).join('\n')
          ).join('\n')
        : '';

      const envLabel = trainingEnv && trainingEnv !== 'UNIVERSAL' ? trainingEnv : 'UNIVERSAL (todos os equipamentos)';

      cycleCtx = `
══════════════════════════════════════════
CONFIGURAÇÃO DO CICLO (SIGA EXATAMENTE)
══════════════════════════════════════════
FASE: ${phaseLabels[cycleConfig.phase] || cycleConfig.phase}
TÉCNICAS PERMITIDAS: ${techList}
ESCOPO DAS TÉCNICAS: ${cycleConfig.techniqueScope === 'DAY' ? 'Use técnicas DIFERENTES em cada dia' : 'Distribua as técnicas ao longo do ciclo — não repita a mesma técnica no mesmo dia'}
AMBIENTE DO TREINO: ${envLabel}

${genderRules}

ESTRUTURA DOS DIAS (ORDENS ABSOLUTAS):
${dayStructure}

REGRAS DE ESTRUTURA:
- Use EXATAMENTE os grupos e quantidades listados
- Respeite o descanso definido por grupo
- Nomes dos dias: ${cycleConfig.days.map((d: any) => `"${d.name}"`).join(', ')}
- Para CARDIO: sets=minutos, reps=kcal, technique=Moderada/Zona 2/HIIT

${limitationRulesCtx ? `REGRAS DE LIMITAÇÃO ATIVAS:\n${limitationRulesCtx}` : ''}`;
    }

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

    // Banco enriquecido com substitutos pré-calculados
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
        // 🔥 Substitutos pré-filtrados pelo ambiente — a IA SÓ pode usar esses
        suggestedSubstitutes: substitutesByExercise[ex.id] || [],
      };
    });

    const systemPrompt = `Você é um personal trainer experiente. Gere uma rotina NOVA e DIFERENTE do treino anterior.

══════════════════════════════════════════
REGRAS ABSOLUTAS
══════════════════════════════════════════

REGRA 1 — DIAS: Use "A", "B", "C"... Nunca use nomes descritivos.

REGRA 2 — IDs: Use APENAS ids e names do banco. Jamais invente.

REGRA 3 — VARIAÇÃO POR TARGET (MAIS IMPORTANTE):
${latestIds.size > 0 ? `IDs do treino anterior: ${Array.from(latestIds).join(', ')}

OBRIGATÓRIO: Troque no mínimo 40% desses exercícios.
COMO TROCAR: Identifique o "target" → escolha outro exercício com MESMO target no GUIA DE VARIAÇÕES → prefira equipment diferente.` : 'Sem treino anterior — crie rotina variada.'}

REGRA 4 — TÉCNICAS (OBRIGATÓRIO):
Cada dia DEVE ter pelo menos 1 técnica avançada. Use técnicas DIFERENTES por dia.
- DROPSET: reduz 20-30% da carga. Reps normais (8-15)
- RESTPAUSE: 10-15s de pausa e repete. Reps normais (8-12)
- BISET: dois exercícios SEM pausa — marque os DOIS com BISET
- 21: reps="21" em TODOS os blocos. NUNCA outra quantidade
- CLUSTERSET: reps="3" em cada bloco com 15s entre eles
- 1_5_REPS: movimento completo + meio = 1 rep. Reps normais (8-12)
- TUT: cadência 3s descida. Reps normais (8-12)
- GVT: sets="10" blocos com reps="10"

REGRA 5 — SUBSTITUTOS (CRÍTICA):
Cada exercício tem "suggestedSubstitutes" no banco — esses são substitutos JÁ FILTRADOS pelo ambiente ${trainingEnv || 'UNIVERSAL'}.
- SE o exercício tiver "suggestedSubstitutes", use OBRIGATORIAMENTE o primeiro da lista como substituto
- SE não tiver, escolha outro exercício do banco com target semelhante
- NUNCA invente substitutos fora do banco
- O substituto deve ser DIFERENTE do exercício principal

REGRA 6 — PROGRESSÃO: lastWeight +5% a +10%, múltiplos de 2.5kg.

REGRA 7 — BLOCOS: sets="1" por bloco. Pirâmides = blocos separados.

REGRA 8 — LIMITAÇÕES: Respeite jointRisk.

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
  "reasoning": "Máximo 3 linhas: quais exercícios foram trocados e qual técnica foi aplicada em cada dia.",
  "exercisesByDay": {
    "A": [
      {
        "exerciseId": "id-exato",
        "title": "nome-exato",
        "category": "Categoria",
        "subCategory": "SubCategoria",
        "observation": "",
        "substitute": { "exerciseId": "id-exato-do-substituto", "title": "nome-exato-do-substituto" },
        "blocks": [
          { "sets": "1", "reps": "12", "load": "20kg", "restTime": "60", "technique": "" }
        ]
      }
    ]
  }
}

IMPORTANTE: "observation" deve ser SEMPRE string vazia "".`;

    const userMessage = `${alunoCtx}
${workoutsCtx}
${cycleCtx}

BANCO DE EXERCÍCIOS (com substitutos pré-filtrados pelo ambiente ${trainingEnv || 'UNIVERSAL'}):
${JSON.stringify(bankForPrompt)}

Gere a rotina. Responda APENAS com o JSON.`.trim();

    // ─── 8. ROTEAMENTO DE IA ───
    const selectedAI = cycleConfig?.selectedAI || 'GEMINI';
    let rawText = '';

    console.log(`[gerar-treino] Modelo: ${selectedAI} | Ambiente: ${trainingEnv || 'UNIVERSAL'}`);

    if (selectedAI === 'GEMINI') {
      const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY as string);
      const model = genAI.getGenerativeModel({ model: 'gemini-2.5-pro' });
      const result = await model.generateContent({
        contents: [{ role: 'user', parts: [{ text: systemPrompt + '\n\n' + userMessage }] }]
      });
      rawText = result.response.text();

    } else if (selectedAI === 'GPT') {
      const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
      const response = await openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userMessage }
        ],
        temperature: 0.7,
        max_tokens: 16000,
        response_format: { type: 'json_object' },
      });
      rawText = response.choices[0].message.content || '';

    } else {
      // Claude Sonnet — qualidade próxima ao Opus, custo ~10x menor
      const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
      const response = await anthropic.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 6000,
        system: systemPrompt,
        messages: [{ role: 'user', content: userMessage }],
      });
      rawText = response.content.filter((c: any) => c.type === 'text').map((c: any) => c.text).join('');
    }

    // ─── 9. VALIDAR E ENRIQUECER ───
    const cleanJson = rawText.replace(/^```json\s*/m, '').replace(/^```\s*/m, '').replace(/```\s*$/m, '').trim();

    let parsed: any;
    try {
      parsed = JSON.parse(cleanJson);
    } catch (e) {
      console.error('[gerar-treino] JSON inválido:', cleanJson.substring(0, 600));
      return NextResponse.json({ error: 'A IA retornou formato inválido. Tente novamente.' }, { status: 500 });
    }

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

          // 🔥 Substituto: priorizar defaultSubstitutes pré-filtrados pelo ambiente
          let substitute = null;
          const preCalculatedSubs = substitutesByExercise[ex.exerciseId];

          if (preCalculatedSubs && preCalculatedSubs.length > 0) {
            // Usar o primeiro substituto pré-calculado (já filtrado pelo ambiente)
            const bestSub = preCalculatedSubs[0];
            const dbSub = exerciseMap.get(bestSub.id);
            if (dbSub) {
              substitute = { id: dbSub.id, name: dbSub.name, videoUrl: dbSub.videoUrl || '' };
            }
          } else if (ex.substitute?.exerciseId && exerciseMap.has(ex.substitute.exerciseId)) {
            // Fallback: substituto sugerido pela IA (validado no banco)
            const dbSub = exerciseMap.get(ex.substitute.exerciseId)!;
            substitute = { id: dbSub.id, name: dbSub.name, videoUrl: dbSub.videoUrl || '' };
          }

          const fixReps = (reps: string, technique: string): string => {
            if (technique === '21') return '21';
            if (technique === 'CLUSTERSET') return '3';
            if (technique === 'GVT') return '10';
            return reps;
          };

          const fixSets = (sets: string, technique: string): string => {
            if (technique === 'GVT') return '1';
            return sets;
          };

          return {
            exerciseId: ex.exerciseId,
            title: dbEx.name,
            videoUrl: dbEx.videoUrl || '',
            category: dbEx.category,
            subCategory: dbEx.subCategory,
            observation: '',
            substitute,
            blocks: (ex.blocks || []).map((b: any) => {
              const tech = b.technique || '';
              return {
                sets:      fixSets(String(b.sets || '1'), tech),
                reps:      fixReps(String(b.reps || '12'), tech),
                load:      b.load || '',
                restTime:  String(b.restTime || '60'),
                technique: tech,
              };
            }),
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
      workoutName:         parsed.workoutName || `Rotina — ${user.name}`,
      workoutModel:        parsed.workoutModel || 'CARGA',
      reasoning:           parsed.reasoning || '',
      trainingEnvironment: trainingEnv || 'UNIVERSAL',
      exercisesByDay:      validatedDays,
      workoutTabs,
    });

  } catch (error: any) {
    console.error('[gerar-treino] erro:', error);
    return NextResponse.json({ error: error.message || 'Erro interno' }, { status: 500 });
  }
}