// app/api/ai/gerar-treino/route.ts
import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { PrismaClient } from '@prisma/client';
import { GoogleGenerativeAI } from '@google/generative-ai';
import OpenAI from 'openai';

const prisma = new PrismaClient();

const MASTER_IDS = [
  '3c82f763-66b4-48da-836e-16817d4f57c0',
  'b7c0c181-41fd-4156-b8fe-963a267759a3'
];

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { userId, adminId, cycleConfig } = body;

    if (!userId || !adminId) {
      return NextResponse.json({ error: 'userId e adminId obrigatórios' }, { status: 400 });
    }

    const isMasterCoach = MASTER_IDS.includes(adminId);
    const trainingEnv = cycleConfig?.trainingEnvironment || null;
    const envFilter = trainingEnv && trainingEnv !== 'UNIVERSAL' ? { hasSome: ['UNIVERSAL', trainingEnv] } : undefined;

    const currentAdmin = await prisma.user.findUnique({ where: { id: adminId }, select: { email: true } });
    const isAdri = currentAdmin?.email?.toLowerCase() === 'adri.personal@hotmail.com';
    let coachFilter: any = { coachId: adminId };

    if (isAdri) {
      const masterAdmin = await prisma.user.findFirst({
        where: { role: 'ADMIN', email: { not: 'adri.personal@hotmail.com' } },
        select: { id: true }
      });
      if (masterAdmin) coachFilter = { OR: [{ coachId: adminId }, { coachId: masterAdmin.id }] };
    }

    const adminExercises = await prisma.exercise.findMany({
      where: { ...coachFilter, ...(envFilter ? { environments: envFilter } : {}) },
      select: { id: true, name: true, category: true, subCategory: true, videoUrl: true, tags: true, environments: true, defaultSubstitutes: true },
      orderBy: { name: 'asc' },
    });

    if (adminExercises.length === 0) {
      return NextResponse.json({ error: 'Nenhum exercício encontrado para este admin.' }, { status: 404 });
    }

    const exerciseMap = new Map(adminExercises.map((ex) => [ex.id, ex]));

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
        exs.forEach(e => { if (!byEquip[e.equipment]) byEquip[e.equipment] = []; byEquip[e.equipment].push(`"${e.name}" (${e.id})`); });
        return `  TARGET ${target}:\n${Object.entries(byEquip).map(([eq, names]) => `    ${eq}: ${names.join(' | ')}`).join('\n')}`;
      }).join('\n\n');

    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        anamneses: { orderBy: { createdAt: 'desc' }, take: 1 },
        workouts: { orderBy: { createdAt: 'desc' }, take: 3, include: { exercises: { include: { exercise: true }, orderBy: { order: 'asc' } } } },
      },
    });

    if (!user) return NextResponse.json({ error: 'Aluno não encontrado' }, { status: 404 });

    const history = await prisma.workoutHistory.findMany({ where: { userId }, orderBy: { date: 'desc' }, take: 20, include: { details: true } });
    const weightMap: Record<string, Record<number, string>> = {};
    [...history].reverse().forEach((hist) => {
      hist.details?.forEach((detail: any) => {
        if (!weightMap[detail.exerciseId]) weightMap[detail.exerciseId] = {};
        weightMap[detail.exerciseId][detail.setNumber] = detail.weight;
      });
    });

    const anamnese = user.anamneses?.[0] || null;
    const previousWorkouts = user.workouts.map((workout, wIdx) => {
      const exercisesByDay: Record<string, any[]> = {};
      workout.exercises.forEach((ex: any) => {
        const day = ex.day || 'A';
        if (!exercisesByDay[day]) exercisesByDay[day] = [];
        let blocks = ex.blocks; let technique = ex.technique;
        try { if (ex.technique?.startsWith('{')) { const p = JSON.parse(ex.technique); if (p?.b) { blocks = p.b; technique = p.t; } } } catch (_) {}
        if (!blocks?.length) blocks = [{ sets: String(ex.sets || '3'), reps: String(ex.reps || '12'), restTime: String(ex.restTime || '60'), technique: technique || '' }];
        const realLoads = weightMap[ex.exerciseId] || {};
        const exTags = (ex.exercise?.tags as any) || {};
        exercisesByDay[day].push({
          exerciseId: ex.exerciseId, name: ex.exercise?.name || 'Exercício',
          target: exTags.target || ex.exercise?.category || '', equipment: exTags.equipment || '',
          mechanic: exTags.mechanic || '', jointRisk: exTags.jointRisk || [],
          blocks: blocks.map((b: any, idx: number) => ({ ...b, lastWeight: realLoads[idx] ?? realLoads[0] ?? null })),
          observation: ex.observation || '',
        });
      });
      return { index: wIdx + 1, name: workout.name, model: workout.workoutModel || 'CARGA', days: exercisesByDay };
    });

    const latestIds = new Set<string>();
    if (previousWorkouts.length > 0) {
      Object.values(previousWorkouts[0].days).forEach((dayExs: any[]) => dayExs.forEach((ex: any) => latestIds.add(ex.exerciseId)));
    }

    const substitutesByExercise: Record<string, Array<{ id: string; name: string }>> = {};
    adminExercises.forEach((ex) => {
      const defaultSubs = (ex.defaultSubstitutes || []) as string[];
      if (!defaultSubs.length) return;
      const validSubs = defaultSubs.map(subId => exerciseMap.get(subId)).filter(Boolean).map(sub => ({ id: sub!.id, name: sub!.name }));
      if (validSubs.length > 0) substitutesByExercise[ex.id] = validSubs;
    });

    const anamnese_ = anamnese as any;
    const hasCycleConfig = cycleConfig && cycleConfig.days?.length > 0;
    // 🔥 NOVO: Exercícios de mobilidade selecionados manualmente pelo coach — bypassam a IA
    const manualExercisesByDay: Record<string, Array<{ exerciseId: string; name?: string }>> = cycleConfig?.manualExercisesByDay || {};
    const hasManualOnly = !hasCycleConfig && Object.keys(manualExercisesByDay).length > 0;
    let cycleCtx = '';

    if (hasCycleConfig) {
      const phaseLabels: Record<string, string> = {
        HIPERTROFIA: 'Hipertrofia — volume moderado, técnicas variadas, reps 8-15',
        FORCA: 'Força — cargas pesadas, reps 3-6, descanso 2-3min',
        CHOQUE: 'Choque — volume alto, técnicas avançadas, reps 6-12',
        DELOAD: 'Deload — volume leve, SEM técnicas avançadas, reps 15-20',
        EMAGRECIMENTO: 'Emagrecimento — circuito com pouco descanso, reps 12-20, cardio OBRIGATÓRIO',
        DEFINICAO: 'Definição — preservar massa, reps 12-15, cardio OBRIGATÓRIO',
      };
      const gender = cycleConfig.gender || 'Não informado';
      const genderRules = gender === 'Feminino'
        ? `GÊNERO: Feminino\n- Priorize glúteos, posteriores e adutor\n- Peito: exercícios leves, máx 2-3 séries`
        : `GÊNERO: Masculino\n- Priorize compostos: supino, desenvolvimento, remada\n- Evite glúteo isolado`;
      const dayStructure = cycleConfig.days.map((d: any) => {
        const groupLines = d.groups.filter((g: any) => g.id !== 'MOBILIDADE').map((g: any) => {
          const restNote = g.rest !== undefined ? `, descanso ${g.rest}s` : '';
          const setsNote = g.sets !== undefined ? `, ${g.sets} séries (exceto GVT=10)` : ', 4 séries';
          const cardioNote = g.id === 'CARDIO' && cycleConfig.cardioTarget ? ` (${cycleConfig.cardioTarget}kcal)` : '';
          return `    - ${g.id}: ${g.qty} exercício(s)${setsNote}${restNote}${cardioNote}`;
        }).join('\n');
        return `  Dia ${d.name}:\n${groupLines}`;
      }).join('\n');
      const techList = cycleConfig.techniques?.length > 0 ? cycleConfig.techniques.join(', ') : 'Livre escolha';
      const limitationRulesCtx = cycleConfig.limitationRules?.length > 0
        ? cycleConfig.limitationRules.map((rule: any) => rule.rules.map((r: any) => {
            if (r.staticOnly) return `  - ${r.group}: APENAS estáticos. ${r.note}`;
            if (r.forceLight) return `  - ${r.group}: carga LEVE. ${r.note}`;
            if (r.addNote) return `  - ${r.group}: observação: "${r.note}"`;
            return `  - ${r.group}: ${r.note}`;
          }).join('\n')).join('\n') : '';
      const envLabel = trainingEnv && trainingEnv !== 'UNIVERSAL' ? trainingEnv : 'UNIVERSAL';
      cycleCtx = `
══════════════════════════════════════════
CONFIGURAÇÃO DO CICLO
══════════════════════════════════════════
FASE: ${phaseLabels[cycleConfig.phase] || cycleConfig.phase}
TÉCNICAS: ${techList}
ESCOPO: ${cycleConfig.techniqueScope === 'DAY' ? 'Técnicas DIFERENTES por dia' : 'Distribua ao longo do ciclo'}
AMBIENTE: ${envLabel}
${genderRules}
ESTRUTURA:
${dayStructure}
Nomes dos dias: ${cycleConfig.days.map((d: any) => `"${d.name}"`).join(', ')}
${limitationRulesCtx ? `LIMITAÇÕES:\n${limitationRulesCtx}` : ''}`;
    }

    const alunoCtx = `ALUNO: ${user.name || 'Não informado'}
- Objetivo: ${user.goal || anamnese_?.objetivo || 'Não informado'}
- Nível: ${user.level || anamnese_?.nivel || 'Não informado'}
- Frequência: ${anamnese_?.frequencia ? `${anamnese_?.frequencia}x/sem` : 'Não informado'}
- Tempo: ${anamnese_?.tempoDisponivel ? `${anamnese_?.tempoDisponivel}min` : 'Não informado'}
- Limitações: ${anamnese_?.limitacoes?.length ? anamnese_?.limitacoes.join(', ') : 'Nenhuma'}
- Cirurgias: ${anamnese_?.cirurgias?.length ? anamnese_?.cirurgias.join(', ') : 'Nenhuma'}
- Peso/Altura: ${anamnese_?.peso ? `${anamnese_?.peso}kg` : '?'} / ${anamnese_?.altura ? `${anamnese_?.altura}cm` : '?'}`;

    const workoutsCtx = previousWorkouts.length > 0
      ? `\nHISTÓRICO:\n${JSON.stringify(previousWorkouts, null, 2)}`
      : '\nSem treinos anteriores.';

    const bankForPrompt = adminExercises.map(ex => {
      const tags = ex.tags as any;
      return { id: ex.id, name: ex.name, category: ex.category, subCategory: ex.subCategory,
        target: tags?.target || ex.category, equipment: tags?.equipment || '', mechanic: tags?.mechanic || '',
        jointRisk: tags?.jointRisk || [], suggestedSubstitutes: substitutesByExercise[ex.id] || [] };
    });

    const systemPrompt = `Você é um personal trainer experiente. Gere rotina NOVA e DIFERENTE do treino anterior.

REGRAS:
1. DIAS: Use "A","B","C"... Nunca nomes descritivos.
2. IDs: Use APENAS ids do banco. Jamais invente.
3. VARIAÇÃO: ${latestIds.size > 0 ? `IDs anteriores: ${Array.from(latestIds).join(', ')} — troque mínimo 40%.` : 'Crie rotina variada.'}
4. TÉCNICAS (1 por dia mínimo, diferentes):
   DROPSET: -20-30% carga sem pausa | RESTPAUSE: 20s pausa mesma carga
   BISET: EXATAMENTE 2 exercícios consecutivos, um logo após o outro, ambos marcados BISET. NUNCA 3 ou mais exercícios seguidos com BISET — sempre pares fechados
   21: reps="21" SEMPRE | CLUSTERSET: reps="3" blocos 15s | 1_5_REPS: reps 8-12
   TUT: cadência 3s descida | GVT: SEMPRE gere EXATAMENTE 10 blocos separados, cada um com sets="1", reps="10", restTime="60". NUNCA 1 bloco só
5. SUBSTITUTOS (CRÍTICA): cada exercício tem "suggestedSubstitutes" no banco — já filtrados pelo ambiente ${trainingEnv || 'UNIVERSAL'}.
   - SE tiver "suggestedSubstitutes", use OBRIGATORIAMENTE o primeiro da lista
   - SE não tiver, escolha outro exercício do banco com target semelhante
   - NUNCA invente substitutos fora do banco
   - O substituto deve ser DIFERENTE do exercício principal
6. PROGRESSÃO: lastWeight +5% a +10%, múltiplos de 2.5kg.
7. BLOCOS: sets="1" por bloco. Pirâmides = blocos separados.
8. LIMITAÇÕES: respeite jointRisk.
9. CARDIO: sets=minutos, reps=kcal, technique=Leve/Moderada/Zona 2/Forte/HIIT.

GUIA DE VARIAÇÕES:
${variationGuide}

FORMATO JSON — sem markdown, sem texto extra:
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

IMPORTANTE: "observation" deve ser SEMPRE string vazia "". Não escreva observações — o personal trainer fará isso manualmente.`;

    const userMessage = `${alunoCtx}${workoutsCtx}${cycleCtx}

BANCO (ambiente ${trainingEnv || 'UNIVERSAL'}):
${JSON.stringify(bankForPrompt)}

Responda APENAS com JSON válido.`.trim();

    // ─── ROTEAMENTO ───
    let selectedAI = cycleConfig?.selectedAI || 'GEMINI_FLASH';
    if (!isMasterCoach && ['GEMINI', 'GPT', 'CLAUDE'].includes(selectedAI)) selectedAI = 'GEMINI_FLASH';

    let rawText = '';
    console.log(`[gerar-treino] Modelo: ${selectedAI} | Ambiente: ${trainingEnv || 'UNIVERSAL'}`);

    // 🔥 MODO MANUAL PURO: se o coach só selecionou exercícios de mobilidade
    // (sem grupos musculares para a IA gerar), pula a chamada de IA inteiramente
    if (hasManualOnly) {
      console.log('[gerar-treino] Modo manual puro (sem IA) — apenas mobilidade selecionada.');
      rawText = JSON.stringify({
        workoutName: `Rotina — ${user.name}`,
        workoutModel: 'CARGA',
        reasoning: 'Treino montado manualmente com exercícios de mobilidade selecionados pelo coach.',
        exercisesByDay: {},
      });
    } else if (selectedAI === 'OWN_KEY') {
      const customKey = cycleConfig?.customKey;
      if (!customKey || !customKey.startsWith('sk-')) return NextResponse.json({ error: 'Chave OpenAI inválida.' }, { status: 400 });
      const openai = new OpenAI({ apiKey: customKey });
      const r = await openai.chat.completions.create({ model: 'gpt-4o-mini', messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: userMessage }], temperature: 0.7, max_tokens: 16000, response_format: { type: 'json_object' } });
      rawText = r.choices[0].message.content || '';

    } else if (selectedAI === 'GPT_MINI') {
      const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
      const r = await openai.chat.completions.create({ model: 'gpt-4o-mini', messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: userMessage }], temperature: 0.7, max_tokens: 16000, response_format: { type: 'json_object' } });
      rawText = r.choices[0].message.content || '';

    } else if (selectedAI === 'GEMINI_FLASH') {
      const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY as string);
      const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
      const result = await model.generateContent({ contents: [{ role: 'user', parts: [{ text: systemPrompt + '\n\n' + userMessage }] }] });
      rawText = result.response.text();

    } else if (selectedAI === 'GEMINI') {
      // 🔥 CORRIGIDO: gemini-2.5-flash (era 2.5-pro, dava 403)
      const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY as string);
      const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
      const result = await model.generateContent({ contents: [{ role: 'user', parts: [{ text: systemPrompt + '\n\n' + userMessage }] }] });
      rawText = result.response.text();

    } else if (selectedAI === 'GPT') {
      const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
      const r = await openai.chat.completions.create({ model: 'gpt-4o', messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: userMessage }], temperature: 0.7, max_tokens: 16000, response_format: { type: 'json_object' } });
      rawText = r.choices[0].message.content || '';

    } else if (selectedAI === 'CLAUDE') {
      // 🔥 CORRIGIDO: removido prefill que causava erro 400
      const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
      const r = await anthropic.messages.create({
        model: 'claude-sonnet-4-6', max_tokens: 8000,
        system: systemPrompt,
        messages: [{ role: 'user', content: userMessage }],
      });
      rawText = r.content.filter((c: any) => c.type === 'text').map((c: any) => c.text).join('');
    }

    // 🔥 EXTRAI JSON: tenta regex primeiro (mais robusto que replace)
    const jsonMatch = rawText.match(/\{[\s\S]*\}/);
    const cleanJson = jsonMatch
      ? jsonMatch[0]
      : rawText.replace(/^```json\s*/m, '').replace(/^```\s*/m, '').replace(/```\s*$/m, '').trim();

    let parsed: any;
    try {
      parsed = JSON.parse(cleanJson);
    } catch (e) {
      console.error(`[gerar-treino] JSON inválido (${selectedAI}). Tamanho: ${cleanJson.length}`);
      console.error('Início:', cleanJson.substring(0, 500));
      console.error('Fim:', cleanJson.substring(Math.max(0, cleanJson.length - 300)));
      return NextResponse.json({ error: `A IA (${selectedAI}) retornou formato inválido. Tente novamente ou use outra IA.` }, { status: 500 });
    }

    const validatedDays: Record<string, any[]> = {};
    let ghostCount = 0;

    // 🔥 Expande corretamente blocos de GVT: sempre 10 blocos de 1x10, 60s de descanso
    const expandBlocksForTechnique = (blocks: any[]): any[] => {
      const hasGVT = blocks.some((b: any) => (b.technique || '').toUpperCase() === 'GVT');
      if (!hasGVT) return blocks;

      // Pega a carga do primeiro bloco GVT encontrado (se houver) para preservar
      const gvtBlock = blocks.find((b: any) => (b.technique || '').toUpperCase() === 'GVT');
      const load = gvtBlock?.load || '';

      // Gera exatamente 10 blocos de 1 série x 10 reps, 60s de descanso
      return Array.from({ length: 10 }, () => ({
        sets: '1', reps: '10', load, restTime: '60', technique: 'GVT',
      }));
    };

    for (const [day, exercises] of Object.entries(parsed.exercisesByDay || {})) {
      let dayExercises = (exercises as any[])
        .filter((ex) => { const ok = exerciseMap.has(ex.exerciseId); if (!ok) { ghostCount++; console.warn(`fantasma: ${ex.exerciseId}`); } return ok; })
        .map((ex) => {
          const dbEx = exerciseMap.get(ex.exerciseId)!;
          let substitute = null;
          const preCalc = substitutesByExercise[ex.exerciseId];
          if (preCalc?.length > 0) { const dbSub = exerciseMap.get(preCalc[0].id); if (dbSub) substitute = { id: dbSub.id, name: dbSub.name, videoUrl: dbSub.videoUrl || '' }; }
          else if (ex.substitute?.exerciseId && exerciseMap.has(ex.substitute.exerciseId)) { const dbSub = exerciseMap.get(ex.substitute.exerciseId)!; substitute = { id: dbSub.id, name: dbSub.name, videoUrl: dbSub.videoUrl || '' }; }
          const fixReps = (r: string, t: string) => t === '21' ? '21' : t === 'CLUSTERSET' ? '3' : t === 'GVT' ? '10' : r;
          const fixSets = (s: string, t: string) => t === 'GVT' ? '1' : s;

          let rawBlocks = (ex.blocks || []).map((b: any) => {
            const tech = b.technique || '';
            return { sets: fixSets(String(b.sets || '1'), tech), reps: fixReps(String(b.reps || '12'), tech), load: b.load || '', restTime: String(b.restTime || '60'), technique: tech };
          });

          // 🔥 Corrige GVT: garante exatamente 10 blocos de 1x10 com 60s, mesmo se a IA mandou só 1 bloco
          rawBlocks = expandBlocksForTechnique(rawBlocks);

          return {
            exerciseId: ex.exerciseId, title: dbEx.name, videoUrl: dbEx.videoUrl || '',
            category: dbEx.category, subCategory: dbEx.subCategory, observation: '', substitute,
            blocks: rawBlocks,
          };
        });

      // 🔥 Corrige cadeias de BISET: só pode existir em PARES consecutivos.
      // Se vier 3+ exercícios seguidos marcados como BISET, quebra o excedente para NORMAL.
      let biSetChainCount = 0;
      dayExercises = dayExercises.map((ex, idx) => {
        const firstBlockTech = (ex.blocks[0]?.technique || '').toUpperCase();
        const isBiSet = firstBlockTech === 'BISET';

        if (isBiSet) {
          biSetChainCount++;
          // Se já temos 2 no par atual, este é excedente — reverte para NORMAL
          if (biSetChainCount > 2) {
            ex.blocks = ex.blocks.map((b: any) => ({ ...b, technique: '' }));
            // Reinicia a contagem: este exercício vira o início de um possível novo par
            biSetChainCount = 0;
          }
        } else {
          biSetChainCount = 0;
        }
        return ex;
      });

      // Se sobrou um BISET sozinho no final do dia (par incompleto), reverte para NORMAL
      if (biSetChainCount === 1) {
        const lastBiSetIdx = [...dayExercises].reverse().findIndex(ex => (ex.blocks[0]?.technique || '').toUpperCase() === 'BISET');
        if (lastBiSetIdx !== -1) {
          const realIdx = dayExercises.length - 1 - lastBiSetIdx;
          dayExercises[realIdx].blocks = dayExercises[realIdx].blocks.map((b: any) => ({ ...b, technique: '' }));
        }
      }

      validatedDays[day] = dayExercises;
    }

    // 🔥 INJETA EXERCÍCIOS MANUAIS DE MOBILIDADE — escolhidos pelo coach, bypassam a IA
    Object.entries(manualExercisesByDay).forEach(([day, items]) => {
      if (!validatedDays[day]) validatedDays[day] = [];
      items.forEach((item) => {
        const dbEx = exerciseMap.get(item.exerciseId);
        if (!dbEx) return; // exercício não existe mais no banco — ignora silenciosamente
        const alreadyIn = validatedDays[day].some((ex: any) => ex.exerciseId === item.exerciseId);
        if (alreadyIn) return;
        validatedDays[day].push({
          exerciseId: dbEx.id,
          title: dbEx.name,
          videoUrl: dbEx.videoUrl || '',
          category: dbEx.category,
          subCategory: dbEx.subCategory,
          observation: '',
          substitute: null,
          blocks: [{ sets: '2', reps: '12', load: '', restTime: '30', technique: '' }],
        });
      });
    });

    if (ghostCount > 0) console.warn(`[gerar-treino] ${ghostCount} fantasmas removidos.`);
    const workoutTabs = Object.keys(validatedDays);
    const totalExercises = workoutTabs.reduce((acc, d) => acc + validatedDays[d].length, 0);
    if (totalExercises === 0) return NextResponse.json({ error: 'A IA não gerou exercícios válidos. Tente novamente.' }, { status: 500 });

    return NextResponse.json({
      success: true,
      workoutName: parsed.workoutName || `Rotina — ${user.name}`,
      workoutModel: parsed.workoutModel || 'CARGA',
      reasoning: parsed.reasoning || '',
      trainingEnvironment: trainingEnv || 'UNIVERSAL',
      exercisesByDay: validatedDays,
      workoutTabs,
    });

  } catch (error: any) {
    console.error('[gerar-treino] erro geral:', error);
    return NextResponse.json({ error: error.message || 'Erro interno' }, { status: 500 });
  }
}