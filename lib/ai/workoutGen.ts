// lib/ai/workoutGen.ts
// 🏋️ (3 out 2026) Geração de UM ciclo de treino por IA -- extraída de app/api/ai/gerar-treino/route.ts SEM mudar o comportamento, para que a rota
// do coach (com revisão antes de salvar) e o plano automático do aluno (lib/autoPlan.ts) usem exatamente o mesmo motor.
// A rota continua dona da autenticação e das travas de acesso (montagem por IA só do time master); aqui só tem a geração.
// Devolve { status, body } (o mesmo corpo/código que a rota sempre devolveu); erros inesperados são lançados.
import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';
import prisma from '@/lib/prisma';
import { buildLastLoads, sideValue } from '@/lib/exerciseLoad';
// 🔥 (21 set 2026) Migrado do @google/generative-ai (descontinuado pelo Google) pro @google/genai (SDK atual, com suporte a cache explícito).
// getOrCreateGeminiCache cuida de criar/reaproveitar o cache do banco de exercícios — ver lib/geminiCache.ts.
import { geminiClient, getOrCreateGeminiCache, hashForCache } from '@/lib/geminiCache';
import { MASTER_IDS } from '@/lib/masterIds';
import { jointFilterIssues } from '@/lib/autoPlanQuality';
import { unavailableExerciseIds, filterUnavailable } from '@/lib/equipment';
import { callClaudeWorkout, isClaudeEngine, WORKOUT_TIMEOUT_MS } from '@/lib/ai/claudeWorkout';
import { callArgon } from '@/lib/ai/argon';
import { shapeReps, cleanRepChoice, describeRepChoice } from '@/lib/ai/repSchemes';
import { compactToFull } from '@/lib/ai/compactOutput';
import { MUSCLE_GROUPS } from '@/lib/ai/splitPresets';
import { buildFacts, buildCandidates, candidatesText, rotationText, levelPolicy, techniquesForLevel, refineWorkout, repRange, REP_CAP, CodeBook, type PrevRoutine, type PrevEx, type GenEx, type Quality } from '@/lib/ai/workoutPlanner';
import { buildSubLinks } from '@/lib/ai/subFamily';
import { cleanOrderStyle, orderDayExercises } from '@/lib/ai/exerciseOrder';
import { recordGenerated } from '@/lib/ai/genSnapshots';
import { buildStyleContext } from '@/lib/ai/styleProfile';
import { canUseStyle, loadCoachStyleWorkouts, STYLE_COACH_NAMES } from '@/lib/ai/styleStore';
import { pickSwap, isCompatibleSub, nameKey, type LibEx } from '@/lib/exerciseSwap';
import { levelIssues } from '@/lib/similarStudents';
import { loadAdminLibrary } from '@/lib/genLibrary';
import { buildConcerns, concernIssues } from '@/lib/exerciseConcerns';
import { applyRules, cleanRules, describeRules, emptyRules, loadStudentRules, type GenRules } from '@/lib/genRules';
import { muscleTarget } from '@/lib/ai/muscleTarget';
import { computeLevel, parseLevel, LEVEL_LABEL, type LevelInfo } from '@/lib/studentLevel';

// 🧠 (19 out 2026) trechos de regra que os dois modos (antigo e inteligente) usam IGUAIS
const TECH_RULE = `TÉCNICAS (1 por dia mínimo, diferentes). ATENÇÃO — CARGA EXTERNA: DROPSET, RESTPAUSE, 21 e CLUSTERSET dependem de reduzir, pausar ou ajustar uma CARGA EXTERNA (halteres, barra, máquina, polia, anilha). NUNCA aplique nenhuma dessas em exercício de PESO CORPORAL puro (flexão de braço, prancha, abdominal, agachamento livre sem carga, etc.) — não existe carga pra reduzir/ajustar nesses casos. Pra peso corporal, use BISET, TRISET ou deixe technique="".
   DROPSET: -20-30% carga sem pausa | RESTPAUSE: 20s pausa mesma carga
   BISET: EXATAMENTE 2 exercícios consecutivos, um logo após o outro, ambos marcados BISET. NUNCA 3 ou mais exercícios seguidos com BISET — sempre pares fechados
   TRISET: EXATAMENTE 3 exercícios consecutivos, um logo após o outro, todos marcados TRISET. NUNCA 2 ou 4+ exercícios seguidos com TRISET — sempre trincas fechadas
   21: reps="21" SEMPRE | CLUSTERSET: reps="3" blocos 15s | 1_5_REPS: reps 8-12
   TUT: cadência 3s descida (também depende de carga externa, mesma regra acima) | GVT: SEMPRE gere EXATAMENTE 10 blocos separados, cada um com sets="1", reps="10", restTime="60". NUNCA 1 bloco só`;
const repsText = (cap: number) => `REPETIÇÕES (como o treino real do Paulo e da Adri): NÃO repita o mesmo número em todas as séries do exercício; use pirâmide decrescente dentro da faixa da fase — 3 séries = 15/12/10 (12/10/8 nos compostos pesados ou 15/12/12), 4 séries = 15/12/10/8 (ou 12/10/8/8), 5 séries = 15/12/12/10/10. Só mantenha a mesma repetição em todas as séries na fase DELOAD ou nas técnicas que têm repetição própria. TETO: NENHUMA série passa de ${cap} repetições (nunca 18 nem 20; a panturrilha pode chegar a 20).`;
const REPS_TEXT = repsText(REP_CAP);
const COMPACT_RULE = `Nº DE SÉRIES = TAMANHO DA LISTA "reps" (ERRO MAIS COMUM — LEIA COM ATENÇÃO): cada exercício leva uma lista de repetições com UMA entrada por série (4 séries = [15,12,10,8]). A CONFIGURAÇÃO DO CICLO abaixo informa quantas séries cada grupo muscular deve ter (ex: "4 séries"): escreva exatamente essa quantidade de entradas para CADA exercício daquele grupo, nunca uma só (a menos que a configuração peça 1 série). ${REPS_TEXT} TÉCNICA: campo "t" (omita se for normal). DROPSET e RESTPAUSE valem só para a ÚLTIMA série; BISET, TRISET, TUT, 21, CLUSTERSET e GVT valem para todas as séries do exercício (GVT: basta "reps":[10] — o servidor monta as 10 séries; 21: "reps":[21]; CLUSTERSET: "reps":[3]).`;
const BLOCKS_RULE = (n: number) => `Nº DE BLOCOS = Nº DE SÉRIES (ERRO MAIS COMUM — LEIA COM ATENÇÃO): cada bloco do array "blocks" representa UMA série. A CONFIGURAÇÃO DO CICLO abaixo informa quantas séries cada grupo muscular deve ter (ex: "4 séries"). Você DEVE gerar exatamente essa quantidade de blocos pra CADA exercício daquele grupo — nunca apenas 1 bloco, a menos que a configuração peça 1 série. Todo bloco tem sets="1" (é sempre 1 série por bloco); é a QUANTIDADE de blocos no array que soma as séries totais. Pirâmide = mesma quantidade de blocos, mas com reps/load DIFERENTES entre eles (ex: 12/10/8/6 reps com carga crescente). ${REPS_TEXT} Exceções com contagem própria: GVT sempre 10 blocos (regra ${n}), 21 e CLUSTERSET seguem a regra ${n}.`;

export interface GenerateWorkoutInput {
  userId: string;
  adminId: string;
  cycleConfig?: any;
  /** Confere se quem pediu pode mexer neste aluno (a rota passa a regra do token). Sem guarda = uso interno confiável. */
  guard?: (student: { coachId: string | null }) => boolean;
}

export interface GenerateWorkoutResult { status: number; body: any }

export async function generateWorkoutPlan({ userId, adminId, cycleConfig, guard }: GenerateWorkoutInput): Promise<GenerateWorkoutResult> {
  {
    const isMasterCoach = MASTER_IDS.includes(adminId);
    const trainingEnv = cycleConfig?.trainingEnvironment || null;

    // 🎛️ (19 out 2026) FILTROS DO COACH (lib/genRules.ts): o que ele bloqueou/fixou/poupou e de quais LOCAIS podem vir os exercícios (tela do Protocolo ELITE → `cycleConfig.genRules`; sem isso,
    // o que está salvo no aluno). Só atuam quando há estrutura de ciclo; não derrubam a geração se a tabela ainda não existe. Lidos ANTES da biblioteca porque os locais mudam quais exercícios entram.
    let genRules: GenRules = emptyRules();
    if (cycleConfig && Array.isArray(cycleConfig.days) && cycleConfig.days.length) genRules = 'genRules' in cycleConfig ? cleanRules(cycleConfig.genRules) : (await loadStudentRules(prisma, userId)).rules;

    // (lib/genLibrary.ts: a mesma biblioteca que a prévia dos filtros conta)
    const allAdminExercises = await loadAdminLibrary(prisma, adminId, trainingEnv, genRules.includeEnvironments);

    // 🛡️ (4 out 2026) Só o plano automático usa: aluno com dor/cirurgia numa articulação (JOELHO, LOMBAR, OMBRO) NÃO vê, na biblioteca que a IA recebe,
    // os exercícios que a própria biblioteca marca como de risco para ela. Sem a opção, nada muda (rota do coach intacta).
    const excludeRisks: string[] = Array.isArray(cycleConfig?.excludeJointRisk) ? cycleConfig.excludeJointRisk.map((r: any) => String(r).toUpperCase()) : [];
    const riskOf = (ex: any): string[] => (Array.isArray((ex.tags as any)?.jointRisk) ? (ex.tags as any).jointRisk.map((r: any) => String(r).toUpperCase()) : []);
    const afterJoint = excludeRisks.length ? allAdminExercises.filter((ex) => !riskOf(ex).some((r) => excludeRisks.includes(r))) : allAdminExercises;
    // 🛠️ (9 out 2026) exercícios que ESTE aluno disse não ter na academia: a IA não os escolhe. Só afasta; nunca apaga nada. Se afastar esvaziaria um grupo (sobrariam menos
    // de 2 exercícios dele), o exercício volta para a lista: um treino completo vale mais do que o aviso (o coach vê a observação no resumo).
    const bannedIds = new Set<string>(await unavailableExerciseIds(userId).catch(() => [] as string[]));
    const eq = filterUnavailable(afterJoint, bannedIds);
    // Fixar vence as regras; os filtros de segurança acima (articulação, aparelho do aluno) continuam valendo.
    const applied = applyRules(eq.list as any, genRules);
    const adminExercises = applied.list as typeof eq.list;
    const avoidedNames = eq.avoided;
    if (excludeRisks.length && cycleConfig?.days?.length) {
      const targetOf = (ex: any) => muscleTarget(ex);
      const issues = jointFilterIssues(cycleConfig.days, allAdminExercises.map(targetOf), afterJoint.map(targetOf));
      if (issues.length) return { status: 422, body: { error: `Biblioteca insuficiente depois de tirar os exercícios de risco (${excludeRisks.join(', ')}): ${issues.join('; ')}`, code: 'BANCO_INSUFICIENTE' } };
    }

    if (applied.active && cycleConfig?.days?.length) {
      const tgt = (ex: any) => muscleTarget(ex);
      const issues = jointFilterIssues(cycleConfig.days, eq.list.map(tgt), adminExercises.map(tgt));
      if (issues.length) return { status: 422, body: { error: `Os filtros de exercícios deixaram poucas opções: ${issues.join('; ')}. Afrouxe os filtros ou libere mais exercícios.`, code: 'BANCO_INSUFICIENTE' } };
    }

    if (adminExercises.length === 0) {
      return { status: 404, body: { error: 'Nenhum exercício encontrado para este admin.' } };
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

    if (!user) return { status: 404, body: { error: 'Aluno não encontrado' } };

    if (guard && !guard({ coachId: user.coachId })) {
      return { status: 403, body: { error: 'Acesso negado' } };
    }

    const history = await prisma.workoutHistory.findMany({ where: { userId }, orderBy: { date: 'desc' }, take: 20, include: { details: true } });
    // ⚖️ (3 out 2026) `weight` do histórico é sempre a carga TOTAL; quando o aluno anotou "cada lado" (perSide) a IA recebe o valor de UM lado + a
    // unidade, para escrever o `load` do mesmo jeito que o aluno vai ver e digitar (senão o treino pediria "88" a quem treina com "22,5 cada lado").
    const { weights: weightMap, modes: sideMap } = buildLastLoads(history);

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
          blocks: blocks.map((b: any, idx: number) => {
            const k = realLoads[idx] !== undefined ? idx : 0;
            const total = realLoads[k] ?? null;
            const side = total !== null && (sideMap[ex.exerciseId] || {})[k] === true;
            return side ? { ...b, lastWeight: sideValue(total), lastWeightUnit: 'cada lado' } : { ...b, lastWeight: total };
          }),
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
    // 🧠 (19 out 2026) MONTAGEM INTELIGENTE (lib/ai/workoutPlanner.ts): só quando o coach/plano mandou uma estrutura de ciclo. Nível real do aluno, o que fazer com cada exercício da
    // rotina anterior (manter a âncora, trocar o acessório), candidatos já filtrados no lugar da biblioteca inteira e revisão depois da IA. `cycleConfig.smart === false` volta ao modo antigo;
    // `cycleConfig.levelRules === false` desliga só as regras de nível.
    const repCapCfg: number | null = Number.isFinite(Number(cycleConfig?.maxReps)) && Number(cycleConfig?.maxReps) > 0 ? Number(cycleConfig.maxReps) : null;   // teto de repetições escolhido pelo coach (padrão REP_CAP)
    const smart = !!hasCycleConfig && !hasManualOnly && cycleConfig.smart !== false;
    const levelRules = smart && cycleConfig.levelRules !== false;
    let levelInfo: LevelInfo | null = null;
    const prevRoutines: PrevRoutine[] = smart ? user.workouts.map((w: any) => {
      const days: Record<string, PrevEx[]> = {};
      (w.exercises || []).forEach((ex: any) => {
        const t = (ex.exercise?.tags as any) || {};
        (days[ex.day || 'A'] = days[ex.day || 'A'] || []).push({ exerciseId: ex.exerciseId, name: ex.exercise?.name || 'Exercício', target: String(muscleTarget(ex.exercise) || ''), mechanic: String(t.mechanic || ''), category: String(ex.exercise?.category || '') });
      });
      return { name: w.name, days };
    }).filter((r) => Object.keys(r.days).length > 0) : [];
    // nomes dos fixados que NÃO estão disponíveis para este aluno (ambiente, limitação, aparelho): o coach lê o nome, não o id
    const pinNames = new Map<string, string>((allAdminExercises as any[]).map((e) => [e.id, e.name]));
    const lostPins = applied.droppedPins.filter((id) => !pinNames.has(id));
    if (lostPins.length) { try { const rows: any[] = await prisma.exercise.findMany({ where: { id: { in: lostPins } }, select: { id: true, name: true } }); rows.forEach((r) => pinNames.set(r.id, r.name)); } catch (_) { /* fica o id */ } }
    const droppedPinsView = applied.droppedPins.map((id) => ({ id, name: pinNames.get(id) || id }));
    const book = new CodeBook();
    const pinSet = new Set<string>(applied.pinned);
    let facts: ReturnType<typeof buildFacts> = [];
    let cands: ReturnType<typeof buildCandidates> | null = null;
    let techRemoved: string[] = [];
    if (smart) {
      let sessions = history.length;
      try { const c = await (prisma as any).workoutHistory.count({ where: { userId } }); if (Number.isFinite(c)) sessions = c; } catch (_) { /* fica com o que veio no histórico */ }
      levelInfo = computeLevel({ entry: parseLevel((user as any).level) || parseLevel(anamnese_?.nivel) || 'INICIANTE', startDate: (user as any).startDate || (user as any).createdAt, sessions });
      // fixado pelo coach = âncora: repete mesmo que a rotação mandasse trocar
      facts = buildFacts(prevRoutines, history).map((f) => (pinSet.has(f.exerciseId) ? { ...f, plan: 'MANTER' as const, why: 'fixado pelo coach' } : f));
      cands = buildCandidates({ days: cycleConfig.days, library: adminExercises as unknown as LibEx[], facts, prev: prevRoutines, level: levelInfo.level, env: trainingEnv || 'UNIVERSAL', levelRules, pins: pinSet, subLinks: buildSubLinks(adminExercises) });
    }
    const techFiltered = smart && levelRules && levelInfo ? techniquesForLevel(cycleConfig.techniques || [], levelInfo.level) : { kept: cycleConfig?.techniques || [], removed: [] as string[] };
    techRemoved = techFiltered.removed;
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
      const techList = techFiltered.kept.length > 0 ? techFiltered.kept.join(', ') : (cycleConfig.techniques?.length > 0 ? 'Nenhuma técnica avançada (nível do aluno): deixe technique="" (BISET só se combinar)' : 'Livre escolha');
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
${describeRepChoice(cleanRepChoice(cycleConfig.repScheme)) ? `REPETIÇÕES (escolha do coach — OBRIGATÓRIO, vale mais que a regra geral de repetições): ${describeRepChoice(cleanRepChoice(cycleConfig.repScheme))}\n` : ''}TÉCNICAS: ${techList}
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
- Nível: ${levelInfo ? `${levelInfo.label} (${levelInfo.months} meses de treino, ${levelInfo.sessions} treinos feitos)` : (user.level || anamnese_?.nivel || 'Não informado')}
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

    // 🔥 (21 set 2026) Reestruturado pra habilitar cache de prompt (Paulo
    // pediu explicitamente essa otimização de custo). O que antes ficava
    // dividido meio a meio entre systemPrompt e userMessage agora fica:
    //   - systemPromptStatic: 100% igual pro mesmo coach+ambiente, NUNCA
    //     muda de aluno pra aluno (regras + banco de exercícios + guia de
    //     variação) → isso é o que entra no cache explícito da Gemini e no
    //     prefixo que a OpenAI cacheia sozinha.
    //   - userMessage: só o que realmente varia por aluno/ciclo (antes
    //     incluía o banco inteiro também, o que quebrava qualquer chance de
    //     cache já que o resto do texto mudava a cada aluno).
    const legacyPrompt = () => `Você é um personal trainer experiente. Gere rotina NOVA e DIFERENTE do treino anterior.

REGRAS:
1. DIAS: Use "A","B","C"... Nunca nomes descritivos.
2. IDs: Use APENAS ids do banco abaixo. Jamais invente.
3. VARIAÇÃO: veja "IDs usados na rotina anterior" na mensagem do aluno (se houver) — troque no mínimo 40% deles. Se não houver, crie rotina variada.
4. ${TECH_RULE}
5. SUBSTITUTOS (CRÍTICA): cada exercício tem "suggestedSubstitutes" no banco — já filtrados pelo ambiente ${trainingEnv || 'UNIVERSAL'}.
   - SE tiver "suggestedSubstitutes", use OBRIGATORIAMENTE o primeiro da lista
   - SE não tiver, escolha outro exercício do banco com target semelhante
   - NUNCA invente substitutos fora do banco
   - O substituto deve ser DIFERENTE do exercício principal
6. PROGRESSÃO: lastWeight +5% a +10%, múltiplos de 2.5kg. Se o bloco tiver lastWeightUnit="cada lado", lastWeight é a carga de UM lado: mantenha a unidade no load (ex: "22.5kg cada lado"); sem lastWeightUnit, é a carga total (ex: "45kg").
7. ${BLOCKS_RULE(4)}
8. LIMITAÇÕES: respeite jointRisk.
9. CARDIO: sets=minutos, reps=kcal, technique=Leve/Moderada/Zona 2/Forte/HIIT.

GUIA DE VARIAÇÕES:
${variationGuide}

BANCO (ambiente ${trainingEnv || 'UNIVERSAL'}):
${JSON.stringify(bankForPrompt)}

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
          { "sets": "1", "reps": "15", "load": "20kg", "restTime": "60", "technique": "" },
          { "sets": "1", "reps": "12", "load": "22.5kg", "restTime": "60", "technique": "" },
          { "sets": "1", "reps": "10", "load": "25kg", "restTime": "60", "technique": "" },
          { "sets": "1", "reps": "8", "load": "27.5kg", "restTime": "60", "technique": "" }
        ]
      }
    ]
  }
}
// ☝️ Exemplo com 4 blocos = 4 séries em pirâmide 15/12/10/8 (porque a ESTRUTURA pediu 4 séries pra esse grupo). Se a ESTRUTURA pedir outra quantidade, gere essa quantidade de blocos e uma pirâmide do mesmo jeito — não sempre 4.

IMPORTANTE: "observation" deve ser SEMPRE string vazia "". Não escreva observações — o personal trainer fará isso manualmente.`;

    const smartPrompt = `Você é um personal trainer experiente montando a PRÓXIMA rotina de um aluno, com PROGRESSÃO em relação à anterior (não um treino aleatório).

REGRAS:
1. DIAS: Use "A","B","C"... Nunca nomes descritivos.
2. ESTRUTURA: siga EXATAMENTE a ESTRUTURA do ciclo (grupos, quantidade de exercícios por dia e séries). Não omita grupo, não acrescente grupo, não mude os dias.
3. CÓDIGOS: use APENAS os códigos (E001, E002...) do BANCO DE CANDIDATOS, tirando cada exercício da lista do grupo certo. Jamais invente códigos.
4. PROGRESSÃO (a regra mais importante): a seção ROTINA ANTERIOR diz o que fazer com cada exercício. MANTER = repita o mesmo código (é a âncora: o aluno progride na carga). TROCAR = escolha OUTRO exercício do mesmo grupo, nunca um marcado "REPETIDO". Nos TROCAR varie o ângulo, a pegada ou o equipamento. Exercícios marcados FIXADO pelo coach entram obrigatoriamente (no grupo certo). Sem rotina anterior, monte a primeira rotina: compostos básicos primeiro, variada.
5. ${TECH_RULE}
6. NÍVEL: respeite a seção NÍVEL DO ALUNO (técnicas proibidas, exercícios complexos, faixa de repetições). Técnica avançada só em exercício que combine, nos exercícios finais do grupo, nunca em todos.
7. ${COMPACT_RULE}
8. ORDEM: dentro de cada grupo, o exercício composto vem antes do isolado; siga a ordem dos grupos da ESTRUTURA.${repCapCfg ? `\n   TETO DE REPETIÇÕES DESTE COACH: nenhuma série passa de ${repCapCfg} repetições (vale mais que o teto acima).` : ''}
9. LIMITAÇÕES: os candidatos já saem filtrados pelo risco articular e pelo ambiente ${trainingEnv || 'UNIVERSAL'}; respeite também as LIMITAÇÕES do ciclo.
10. CARDIO (única exceção ao formato compacto): use "blocks" com sets=minutos, reps=kcal, technique=Leve/Moderada/Zona 2/Forte/HIIT.
11. CARGAS, DESCANSO, NOME E SUBSTITUTO: NÃO escreva — o servidor coloca a carga-alvo (só em quem o aluno já treinou), o descanso do grupo, o nome e o substituto.

FORMATO JSON COMPACTO — sem markdown, sem texto extra. Por exercício escreva SÓ o código, as repetições (uma por série) e, se houver, a técnica:
{
  "workoutName": "Nome",
  "reasoning": "Máximo 3 linhas: o que foi mantido (âncoras), o que foi trocado e a técnica de cada dia.",
  "exercisesByDay": {
    "A": [
      { "id": "E001", "reps": [15, 12, 10, 8] },
      { "id": "E014", "reps": [12, 10, 8], "t": "DROPSET" },
      { "id": "E077", "blocks": [{ "sets": "20", "reps": "200", "technique": "Moderada" }] }
    ]
  }
}
// ☝️ Exemplo: E001 = 4 séries em pirâmide 15/12/10/8; E014 = 3 séries com drop-set na última; E077 = cardio (20 min, 200 kcal). Se a ESTRUTURA pedir outra quantidade de séries, escreva essa quantidade de repetições — não sempre 4.`;
    const systemPromptStatic = smart ? smartPrompt : legacyPrompt();

    const variationClause = latestIds.size > 0
      ? `IDs usados na rotina anterior: ${Array.from(latestIds).join(', ')} — troque no mínimo 40%.`
      : 'Sem rotina anterior — crie variada.';

    // 🧬 (27 out 2026) ESTILO DO COACH: com `cycleConfig.useMyStyle` ligado (e só para quem está em STYLE_COACH_IDS: por enquanto o Paulo) a mensagem leva o resumo do jeito dele de montar
    // + 3 treinos reais parecidos com este aluno (lib/ai/styleProfile.ts). É APOIO: a estrutura do ciclo, as regras, o nível e os códigos do banco continuam valendo mais. Qualquer falha = segue sem o estilo.
    let styleCtx = ''; let styleUsed = false;
    if (cycleConfig?.useMyStyle === true && canUseStyle(adminId)) {
      try {
        const styleWorkouts = await loadCoachStyleWorkouts(adminId);
        const built = buildStyleContext(styleWorkouts, {
          gender: String((user as any).gender || cycleConfig?.gender || ''), level: levelInfo ? LEVEL_LABEL[levelInfo.level] : String((user as any).level || ''),
          goal: String(cycleConfig?.phase || ''), days: Array.isArray(cycleConfig?.days) ? cycleConfig.days.length : undefined, studentId: userId,
        }, { coachName: STYLE_COACH_NAMES[adminId] || 'o coach', examples: 3 });
        if (built) { styleCtx = `\n\n${built}\n(O estilo acima é APOIO: a ESTRUTURA do ciclo, as regras, o nível do aluno e os códigos do banco valem mais. Use-o para escolher e ordenar dentro delas.)\n`; styleUsed = true; }
      } catch (e) { styleCtx = ''; styleUsed = false; }
    }

    // 🧠 modo inteligente: a mensagem leva o nível, o que fazer com cada exercício da rotina anterior e SÓ os candidatos de cada grupo (códigos curtos); o modo antigo segue igual
    const userMessage = smart && cands && levelInfo
      ? `${alunoCtx}

${rotationText(prevRoutines, facts, book)}
${cycleCtx}${styleCtx}

${levelRules ? `${levelPolicy(levelInfo.level, cycleConfig.phase, repCapCfg).text}\n\n` : ''}${candidatesText(cands, cycleConfig.days, facts, book, trainingEnv || 'UNIVERSAL', pinSet)}

Responda APENAS com JSON válido.`.trim()
      : `${alunoCtx}${workoutsCtx}${cycleCtx}${styleCtx}

${variationClause}

Responda APENAS com JSON válido.`.trim();

    // Backwards-compat: alguns branches (Claude/GPT sem cache) ainda usam
    // um "systemPrompt" único — pra eles é só a mesma coisa concatenada.
    const systemPrompt = systemPromptStatic;

    // Chave de cache: muda sozinha se o coach editar exercícios (o hash é
    // do conteúdo, não de um contador manual).
    const geminiCacheKey = hashForCache('gerar-treino', adminId, trainingEnv || 'UNIVERSAL', systemPromptStatic);

    // ─── ROTEAMENTO ───
    let selectedAI = cycleConfig?.selectedAI || 'GEMINI_FLASH';
    if (!isMasterCoach && ['GEMINI', 'GEMINI_PRO', 'GPT', 'CLAUDE', 'HAIKU', 'ARGON'].includes(selectedAI)) selectedAI = 'GEMINI_FLASH';
    // 📊 (19 out 2026) o que cada geração gastou (tokens) fica no AiLog — é o que mostra, com número real, quanto custa cada motor
    let genUsage: any = null; const genT0 = Date.now();
    // 📊 (19 out 2026) geração que FALHA também fica no registro (`gerar-treino:<motor>:falhou`): o Google/OpenAI cobram os tokens mesmo quando o treino não sai, e antes isso não aparecia em lugar nenhum
    const logFail = async (error: any, extra: any = {}) => {
      try { await (prisma as any).aiLog.create({ data: { userId: adminId, question: `gerar-treino:${selectedAI}:falhou`, answer: JSON.stringify({ error: String(error?.message || error).slice(0, 300), ...(genUsage || {}), ms: genUsage?.ms ?? Date.now() - genT0, studentId: userId, ...extra }).slice(0, 2000) } }); } catch (e) { /* sem registro */ }
    };

    let rawText = '';
    console.log(`[gerar-treino] Modelo: ${selectedAI} | Ambiente: ${trainingEnv || 'UNIVERSAL'}`);

    // 🔥 MODO MANUAL PURO: se o coach só selecionou exercícios de mobilidade
    // (sem grupos musculares para a IA gerar), pula a chamada de IA inteiramente
    try {
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
      if (!customKey || !customKey.startsWith('sk-')) return { status: 400, body: { error: 'Chave OpenAI inválida.' } };
      const openai = new OpenAI({ apiKey: customKey });
      const r = await openai.chat.completions.create({ model: 'gpt-4o-mini', messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: userMessage }], temperature: 0.7, max_tokens: 16000, response_format: { type: 'json_object' } });
      rawText = r.choices[0].message.content || '';

    } else if (selectedAI === 'GPT_MINI') {
      const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
      const r = await openai.chat.completions.create({ model: 'gpt-4o-mini', messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: userMessage }], temperature: 0.7, max_tokens: 16000, response_format: { type: 'json_object' } });
      rawText = r.choices[0].message.content || '';

    } else if (['GEMINI_FLASH', 'GEMINI', 'GEMINI_PRO'].includes(selectedAI)) {
      // 🔥 (21 set 2026) Migrado pro @google/genai + cache explícito do
      // banco de exercícios (a pedido do Paulo). Se o conteúdo for pequeno
      // demais pra qualificar pro cache (biblioteca curta, ex: ambiente
      // "Em Casa" com poucos exercícios cadastrados), getOrCreateGeminiCache
      // devolve null e a gente simplesmente manda tudo direto, sem cache —
      // nunca quebra a geração por causa disso.
      const geminiModel = selectedAI === 'GEMINI' ? 'gemini-3.8-flash'
        : selectedAI === 'GEMINI_PRO' ? 'gemini-2.5-pro'
        : 'gemini-1.5-flash';

      const cacheName = await getOrCreateGeminiCache({
        model: geminiModel,
        cacheKey: `${geminiCacheKey}:${geminiModel}`,
        staticContent: systemPromptStatic,
      });

      const result = cacheName
        ? await geminiClient.models.generateContent({
            model: geminiModel,
            contents: userMessage,
            config: { cachedContent: cacheName },
          })
        : await geminiClient.models.generateContent({
            model: geminiModel,
            contents: `${systemPromptStatic}\n\n${userMessage}`,
          });
      rawText = result.text || '';
      const gu: any = (result as any).usageMetadata || {};
      genUsage = { model: geminiModel, inputTokens: Number(gu.promptTokenCount) || 0, outputTokens: Number(gu.candidatesTokenCount) || 0, cacheReadTokens: Number(gu.cachedContentTokenCount) || 0, cached: !!cacheName };

    } else if (selectedAI === 'GPT') {
      const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
      const r = await openai.chat.completions.create({ model: 'gpt-4o', messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: userMessage }], temperature: 0.7, max_tokens: 16000, response_format: { type: 'json_object' } });
      rawText = r.choices[0].message.content || '';
      genUsage = { model: 'gpt-4o', inputTokens: Number(r.usage?.prompt_tokens) || 0, outputTokens: Number(r.usage?.completion_tokens) || 0 };

    } else if (isClaudeEngine(selectedAI)) {
      // 🧠 (19 out 2026) HAIKU (Claude Haiku 5.5) e CLAUDE (Claude Sonnet 5.5): ver lib/ai/claudeWorkout.ts (cache do prompt fixo, limite de 90 s, tokens para o registro de custo)
      const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY, timeout: WORKOUT_TIMEOUT_MS, maxRetries: 0 });
      const out = await callClaudeWorkout(anthropic, { engine: selectedAI, system: systemPromptStatic, user: userMessage });
      rawText = out.text; genUsage = out.usage;

    } else if (selectedAI === 'ARGON') {
      // 🧪 (19 out 2026) Gemini 4 Argon, motor de TESTE só para masters: ver lib/ai/argon.ts (nível de pensamento, limite de 85 s, aviso claro se a chave ainda não enxerga o modelo, tokens e custo para o AiLog)
      const out = await callArgon(geminiClient, { system: systemPromptStatic, user: userMessage, timeoutMs: WORKOUT_TIMEOUT_MS - 5000 });
      rawText = out.text; genUsage = out.usage;
    }
    } catch (e: any) { await logFail(e, { stage: 'ia' }); throw e; }

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
      await logFail('resposta em formato inválido (não é JSON)', { stage: 'json', chars: cleanJson.length });
      return { status: 500, body: { error: `A IA (${selectedAI}) retornou formato inválido. Tente novamente ou use outra IA.` } };
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

    // 🔥 Corrige cadeias de técnicas que agrupam exercícios (BI-SET, TRI-SET,
    // ...): só podem existir em grupos FECHADOS de tamanho exato, consecutivos.
    // Generalizado a partir da correção original que só tratava o BISET (que
    // só cobria o caso de sobra no FINAL do dia — uma sobra no MEIO do dia,
    // entre dois exercícios normais, passava batido). Aqui qualquer sobra
    // incompleta (no meio ou no fim) é revertida pra NORMAL, e qualquer
    // excedente (4º exercício de uma "TRISET" de 4, por exemplo) também.
    const repairChainedTechnique = (exs: any[], techniqueKey: string, groupSize: number): any[] => {
      const revertRange = (fromIdx: number, toIdxExclusive: number) => {
        for (let i = fromIdx; i < toIdxExclusive; i++) {
          exs[i].blocks = exs[i].blocks.map((b: any) => ({ ...b, technique: '' }));
        }
      };
      let chainCount = 0;
      let chainStartIdx = -1;
      exs.forEach((ex, idx) => {
        const firstBlockTech = (ex.blocks[0]?.technique || '').toUpperCase();
        const isMatch = firstBlockTech === techniqueKey;
        if (isMatch) {
          if (chainCount === 0) chainStartIdx = idx;
          chainCount++;
          if (chainCount > groupSize) {
            // excedente (grupo já fechado) -- reverte só este item e recomeça a contagem a partir dele
            revertRange(idx, idx + 1);
            chainCount = 0;
            chainStartIdx = -1;
          }
        } else if (chainCount > 0) {
          if (chainCount < groupSize) revertRange(chainStartIdx, chainStartIdx + chainCount);
          chainCount = 0;
          chainStartIdx = -1;
        }
      });
      if (chainCount > 0 && chainCount < groupSize) revertRange(chainStartIdx, chainStartIdx + chainCount);
      return exs;
    };

    // 🧠 substituto de um exercício: o da biblioteca (defaultSubstitutes) primeiro, depois o que a IA escolheu; no modo inteligente, sem nenhum dos dois, o servidor escolhe um do mesmo músculo
    // 🔒 (24 out 2026) por padrão SÓ vale o substituto que o coach marcou na biblioteca (cycleConfig.subsOnlyTagged === false libera a escolha da IA e a do servidor); sem marcação, fica sem substituto
    const onlyTaggedSubs = cycleConfig?.subsOnlyTagged !== false;
    const subFor = (exId: string, iaSubId?: string) => {
      let substitute: any = null;
      const orig = exerciseMap.get(exId) as unknown as LibEx | undefined;
      const asSub = (e: any) => ({ id: e.id, name: e.name, videoUrl: e.videoUrl || '' });
      // 1) o que o coach marcou na biblioteca manda (o primeiro marcado que o aluno pode fazer; se nenhum pode, o primeiro marcado)
      const preCalc = (substitutesByExercise[exId] || []).map((s) => exerciseMap.get(s.id)).filter(Boolean) as any[];
      const tagged = preCalc.find((e) => !bannedIds.has(e.id)) || preCalc[0];
      if (tagged) substitute = asSub(tagged);
      // 2) o que a IA escolheu só vale se for do mesmo músculo e do mesmo tipo (nunca alongamento/mobilidade/cardio no lugar de musculação)
      else if (!onlyTaggedSubs && iaSubId && exerciseMap.has(iaSubId) && isCompatibleSub(orig, exerciseMap.get(iaSubId) as unknown as LibEx) && !bannedIds.has(iaSubId)) substitute = asSub(exerciseMap.get(iaSubId)!);
      // 3) sem marcação e sem escolha boa da IA (modo inteligente): o servidor escolhe um do mesmo músculo na biblioteca
      if (!substitute && !onlyTaggedSubs && smart && orig && String(orig.category || '').toUpperCase() !== 'CARDIO') {
        const p = pickSwap(orig, adminExercises as unknown as LibEx[], { unavailable: bannedIds, jointRisks: excludeRisks, env: trainingEnv || 'UNIVERSAL', level: levelRules && levelInfo ? levelInfo.level : null, usedNames: new Set<string>(), envOk: () => true, levelIssues });
        if (p) substitute = { id: p.id, name: p.name, videoUrl: p.videoUrl || '' };
      }
      return substitute;
    };
    const fixReps = (r: string, t: string) => t === '21' ? '21' : t === 'CLUSTERSET' ? '3' : t === 'GVT' ? '10' : r;
    const fixSets = (s: string, t: string) => t === 'GVT' ? '1' : s;
    const rawDays: Record<string, any[]> = {};
    for (const [day, exercises] of Object.entries(parsed.exercisesByDay || {})) {
      rawDays[day] = (Array.isArray(exercises) ? (exercises as any[]) : [])
        .filter(Boolean)
        // 📉 formato compacto (ver lib/ai/compactOutput.ts): { id, reps:[...], t } vira o exercício completo, com descanso e séries do GRUPO a que ele pertence; resposta no formato antigo passa igual
        .map((ex) => {
          const rid = book.resolve(ex?.exerciseId ?? ex?.id);
          const dayCfg = (cycleConfig?.days || []).find((d: any) => d.name === day);
          const grp = cands && dayCfg ? (dayCfg.groups || []).find((g: any) => (cands.byGroup.get(g.id) || []).some((e: any) => e.id === rid)) : null;
          const defRest = MUSCLE_GROUPS.find((m: any) => m.id === grp?.id)?.defaultRest;
          return compactToFull({ ...ex, exerciseId: rid }, { rest: String(grp?.rest ?? defRest ?? 60), sets: Number(grp?.sets) > 0 ? Number(grp.sets) : null, isCardio: String(exerciseMap.get(rid)?.category || '').toLowerCase() === 'cardio' });
        })
        .map((ex) => ({ ...ex, exerciseId: book.resolve(ex.exerciseId), substitute: ex.substitute ? { ...ex.substitute, exerciseId: book.resolve(ex.substitute.exerciseId) } : ex.substitute }))
        .filter((ex) => { const ok = exerciseMap.has(ex.exerciseId); if (!ok) { ghostCount++; console.warn(`fantasma: ${ex.exerciseId}`); } return ok; })
        .map((ex, exIdx) => {
          const dbEx = exerciseMap.get(ex.exerciseId)!;
          const substitute = subFor(ex.exerciseId, ex.substitute?.exerciseId);

          let rawBlocks = (ex.blocks || []).map((b: any) => {
            const tech = b.technique || '';
            return { sets: fixSets(String(b.sets || '1'), tech), reps: fixReps(String(b.reps || '12'), tech), load: b.load || '', restTime: String(b.restTime || '60'), technique: tech };
          });

          // 🔥 Corrige GVT: garante exatamente 10 blocos de 1x10 com 60s, mesmo se a IA mandou só 1 bloco
          rawBlocks = expandBlocksForTechnique(rawBlocks);
          // 🔺 séries todas com a mesma repetição viram pirâmide da fase (modo inteligente faz o mesmo na revisão; aqui cobre o modo antigo)
          rawBlocks = shapeReps(rawBlocks, { phase: cycleConfig?.phase, range: repRange(cycleConfig?.phase, null, repCapCfg), compound: String((dbEx as any).tags?.mechanic || '').toUpperCase() === 'COMPOSTO', idx: exIdx, choice: cleanRepChoice(cycleConfig?.repScheme) });

          return {
            exerciseId: ex.exerciseId, title: dbEx.name, videoUrl: dbEx.videoUrl || '',
            category: dbEx.category, subCategory: dbEx.subCategory, observation: '', substitute,
            blocks: rawBlocks,
          };
        });
    }

    // 🧠 REVISÃO depois da IA (lib/ai/workoutPlanner.ts → refineWorkout): completa o que faltou, tira o que passou, ajusta séries/repetições/técnicas pelo nível,
    // troca o que repetiu da rotina anterior (ou de outro dia), e só deixa carga onde o aluno já treinou o exercício.
    let reviewedDays: Record<string, any[]> = rawDays;
    let assignedGroups: Record<string, Record<string, string>> = {};   // dia → exercício → grupo em que o planejador o encaixou
    let quality: Quality | null = null;
    if (smart && cands && levelInfo) {
      const loaded = new Set<string>();
      for (const h of history as any[]) for (const dd of h.details || []) if (Number(dd.weight) > 0) loaded.add(dd.exerciseId);
      const r = refineWorkout(rawDays as Record<string, GenEx[]>, {
        days: cycleConfig.days, phase: String(cycleConfig.phase || ''), level: levelInfo.level, levelRules,
        lib: exerciseMap as unknown as Map<string, LibEx>, pool: adminExercises as unknown as LibEx[], cands, facts, hasPrev: prevRoutines.length > 0,
        env: trainingEnv || 'UNIVERSAL', jointRisks: excludeRisks, unavailable: bannedIds, loaded, pins: pinSet, repChoice: cleanRepChoice(cycleConfig?.repScheme), repCap: repCapCfg, subLinks: buildSubLinks(adminExercises),
        makeEx: (e, blocks) => ({ exerciseId: e.id, title: e.name, videoUrl: e.videoUrl || '', category: e.category, subCategory: e.subCategory, observation: '', substitute: subFor(e.id), blocks }),
      });
      reviewedDays = r.byDay; quality = r.quality; assignedGroups = r.groupIds;
      if (applied.droppedPins.length) {
        for (const id of applied.droppedPins) quality.issues.push(`"${pinNames.get(id) || id}" fixado não está disponível para este aluno (local, limitação ou aparelho)`);
        quality.score = Math.max(0, 100 - 10 * quality.issues.length);
      }
      if (techRemoved.length) quality.fixes.unshift(`Técnicas tiradas do ciclo pelo nível ${levelInfo.label}: ${techRemoved.join(', ')}`);
    }

    const orderFixedDays: string[] = [];
    for (const [day, list] of Object.entries(reviewedDays)) {
      let dayExercises = list as any[];
      // 🔥 Corrige cadeias de técnicas que agrupam exercícios (BI-SET=2,
      // TRI-SET=3, ...): só podem existir em grupos FECHADOS do tamanho
      // certo, consecutivos. Generalizado a partir da correção original que
      // só existia pro BISET — repairChainedTechnique(tecnica, tamanho) é
      // chamada uma vez por técnica de agrupamento (GROUP_SIZES no app
      // mobile é o espelho client-side dessa mesma tabela).
      dayExercises = repairChainedTechnique(dayExercises, 'BISET', 2);
      dayExercises = repairChainedTechnique(dayExercises, 'TRISET', 3);

      // 📐 ORDEM (padrão do coach, garantida pelo servidor): grupos juntos, músculo grande antes de pequeno, composto antes de isolado, bi/tri-set inteiros, mobilidade no começo e cardio no fim
      if (smart && cands) {
        const dayCfg = (cycleConfig?.days || []).find((d: any) => d.name === day);
        const groupIds: string[] = (dayCfg?.groups || []).map((g: any) => String(g.id));
        const groupOf = (ex: any): string | null => { const placed = assignedGroups[day]?.[ex.exerciseId]; if (placed && groupIds.includes(placed)) return placed; for (const gid of groupIds) if ((cands!.byGroup.get(gid) || []).some((e: any) => e.id === ex.exerciseId)) return gid; return null; };
        const ord = orderDayExercises(dayExercises, {
          groups: groupIds, keepGroupOrder: cycleConfig?.keepGroupOrder === true, groupOf, style: cycleConfig?.orderStyle, exId: (ex: any) => String(ex.exerciseId), cardioAt: cycleConfig?.warmup?.cardio,
          isCompound: (ex: any) => String((exerciseMap.get(ex.exerciseId) as any)?.tags?.mechanic || '').toUpperCase() === 'COMPOSTO',
          kind: (ex: any) => { const c = String((exerciseMap.get(ex.exerciseId) as any)?.category || '').toLowerCase(); return c === 'mobilidade' ? 'MOB' : c === 'cardio' ? 'CARDIO' : 'FORCA'; },
          technique: (ex: any) => String(ex.blocks?.[0]?.technique || ''),
        });
        if (ord.changed) { dayExercises = ord.list; orderFixedDays.push(day); }
      }

      validatedDays[day] = dayExercises;
    }
    if (quality && orderFixedDays.length) quality.fixes.push(`Ordem ajustada no(s) dia(s) ${orderFixedDays.join(', ')}: ${cleanOrderStyle(cycleConfig?.orderStyle) ? 'a ordem e as regras que você escolheu' : 'músculo grande primeiro, multiarticular antes do isolado, cada músculo junto'}`);

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
    // 🩺 (19 out 2026) o que a aluna escreveu sobre um exercício (dor, "não senti o músculo", "muito difícil") e que VOLTOU neste treino: avisa o coach em "Para você conferir" (nunca troca sozinho)
    if (quality) {
      try {
        const inPlan = new Set<string>(Object.values(validatedDays).flat().map((e: any) => String(e.exerciseId)));
        const msgs = concernIssues(buildConcerns(history as any), inPlan);
        if (msgs.length) quality.issues.push(...msgs);
      } catch (_) { /* o alerta nunca derruba a geração */ }
    }
    const workoutTabs = Object.keys(validatedDays);
    const totalExercises = workoutTabs.reduce((acc, d) => acc + validatedDays[d].length, 0);
    if (totalExercises === 0) { await logFail('a IA não gerou nenhum exercício válido', { stage: 'validacao', ghosts: ghostCount }); return { status: 500, body: { error: 'A IA não gerou exercícios válidos. Tente novamente.' } }; }

    // 📊 registro de custo (não pode derrubar a geração)
    if (genUsage) {
      try { await (prisma as any).aiLog.create({ data: { userId: adminId, question: `gerar-treino:${selectedAI}`, answer: JSON.stringify({ ...genUsage, ms: genUsage.ms ?? Date.now() - genT0, studentId: userId, bankExercises: adminExercises.length, days: workoutTabs.length, exercises: totalExercises, ghosts: ghostCount, ...(quality ? { smart: true, score: quality.score, newPct: quality.stats.newPct, swapped: quality.stats.swapped, filled: quality.stats.filled, candidates: book.size } : {}), ...(applied.active ? { rulesRemoved: applied.removedTotal, pinned: applied.pinned.length } : {}) }).slice(0, 2000) } }); } catch (e) { /* sem registro */ }
    }

    // 🧠 (23 out 2026) guarda uma cópia do treino gerado para comparar com o que o coach corrigir ao salvar (etapa 2; nunca derruba a geração)
    const genSnapshotId = await recordGenerated({ coachId: adminId, studentId: userId, engine: selectedAI, exercisesByDay: validatedDays, workoutTabs });

    return {
      status: 200,
      body: {
        success: true,
        ...(genSnapshotId ? { genSnapshotId } : {}),
        ...(styleUsed ? { styleUsed: true } : {}),
        workoutName: parsed.workoutName || `Rotina — ${user.name}`,
        workoutModel: parsed.workoutModel || 'CARGA',
        reasoning: parsed.reasoning || '',
        trainingEnvironment: trainingEnv || 'UNIVERSAL',
        exercisesByDay: validatedDays,
        workoutTabs,
        // 🧠 revisão automática (só no modo inteligente): nota, o que foi ajustado e o que ainda merece o olhar do coach
        ...(applied.active ? { filters: { summary: describeRules(genRules), removed: applied.removed, removedTotal: applied.removedTotal, pinned: applied.pinned.length, droppedPins: droppedPinsView } } : {}),
        ...(quality && levelInfo ? { quality, levelInfo: { level: levelInfo.level, label: levelInfo.label, months: levelInfo.months, sessions: levelInfo.sessions } } : {}),
        ...(excludeRisks.length ? { jointFilter: { risks: excludeRisks, excluded: allAdminExercises.length - afterJoint.length } } : {}),
        ...(avoidedNames.length ? { avoidedUnavailable: avoidedNames } : {}),
      },
    };
  }
}
