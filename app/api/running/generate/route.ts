import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import Anthropic from '@anthropic-ai/sdk';
import { requireAuth, canActAsCoach } from '@/lib/auth';
import { canUseAiBuilder } from '@/lib/aiAccess';
import { GOAL_LABELS, PLAN_META, PLAN_TYPES, eligibleTypes, extractJson, sanitizeAiSuggestion, suggestByRules } from '@/lib/runningPlans';

// POST /api/running/generate
// Body: { userId: string }
// O coach chama depois da anamnese preenchida e recebe uma SUGESTÃO de protocolo (tipo, semana de entrada, velocidades, dias, observações) para revisar.
// 🏃 (6 out 2026) Antes só o time master conseguia (os demais tomavam erro) e a resposta da IA ia direto, sem conferir. Agora:
//   • todo coach recebe a sugestão AUTOMÁTICA por regras (sem custo de IA) — `source: 'rules'`;
//   • o time master recebe a sugestão da IA (`source: 'ai'`), conferida: tipo e semana válidos, velocidades coerentes e nada que a anamnese não sustente;
//     a IA só pode ser mais cautelosa que as regras na semana de entrada. Se a IA falhar ou responder fora do formato, cai nas regras (nunca fica sem sugestão);
//   • os dias de treino são escolhidos pelas regras a partir dos dias que a aluna marcou (a IA não decide isso).
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);
    const userId = body && typeof body.userId === 'string' ? body.userId : null;
    if (!userId) return NextResponse.json({ error: 'userId obrigatório' }, { status: 400 });

    // 🔒 Só o coach dono do aluno (ou o time master) gera o protocolo dele.
    const auth = requireAuth(req);
    if ('response' in auth) return auth.response;
    const targetUser = await prisma.user.findUnique({ where: { id: userId }, select: { coachId: true } });
    if (!targetUser) return NextResponse.json({ error: 'Aluno não encontrado.' }, { status: 404 });
    if (!canActAsCoach(auth.user, targetUser.coachId)) {
      return NextResponse.json({ error: 'Acesso negado.' }, { status: 403 });
    }

    const anamnese = await prisma.runningAnamnese.findUnique({ where: { userId } });
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { name: true, gender: true } });

    if (!anamnese || !anamnese.filled) {
      return NextResponse.json(
        { error: 'Anamnese de corrida não preenchida' },
        { status: 400 }
      );
    }

    const rules = suggestByRules(anamnese);
    const prompt = buildPrompt({ ...anamnese, user });

    let suggestion = rules;
    let source: 'ai' | 'rules' = 'rules';
    let corrections: string[] = [];
    let fallbackReason: string | null = null;

    if (canUseAiBuilder(auth.user)) {
      try {
        if (!process.env.ANTHROPIC_API_KEY) throw new Error('sem chave da IA');
        const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
        const response = await client.messages.create({
          model: 'claude-opus-4-6',
          max_tokens: 1500,
          messages: [{ role: 'user', content: prompt }],
        });
        const raw = response.content[0] && response.content[0].type === 'text' ? response.content[0].text : '';
        const parsed = extractJson(raw);
        if (!parsed) throw new Error('resposta fora do formato');
        const checked = sanitizeAiSuggestion(parsed, anamnese);
        suggestion = checked.suggestion;
        corrections = checked.corrections;
        source = 'ai';
      } catch (e: any) {
        console.error('[running-generate] IA indisponível, usando regras:', e && e.message);
        fallbackReason = 'A IA não respondeu direito desta vez; usei a sugestão automática por regras.';
      }
    }

    const { warnings, reasons, ...fields } = suggestion;
    return NextResponse.json({
      suggestion: fields,
      source,
      warnings,
      reasons,
      corrections,
      fallbackReason,
      eligibleTypes: eligibleTypes(anamnese),
      promptSnapshot: source === 'ai' ? prompt : null,
    });

  } catch (error) {
    console.error('[running-generate]', error);
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
  }
}

function buildPrompt(anamnese: any): string {
  const allowed = eligibleTypes(anamnese);
  const catalog = PLAN_TYPES.map((t) => `- ${t}: ${PLAN_META[t].weeks} semanas, 3 treinos por semana, termina na prova de ${PLAN_META[t].distanceKm} km`).join('\n');
  return `Você é um especialista em corrida e prescrição de treinamento aeróbico.
Com base na anamnese abaixo, escolha o protocolo de corrida mais adequado e a semana em que ele deve começar para este aluno.

ANAMNESE:
- Nome: ${anamnese.user?.name ?? 'Aluno'}
- Gênero: ${anamnese.user?.gender ?? 'Não informado'}
- Experiência com corrida: ${anamnese.runningExperience} ${anamnese.timeStopped ? `(parado há ${anamnese.timeStopped})` : ''}
- Distância máxima anterior: ${anamnese.maxDistanceBefore ?? 'Não informado'}
- Frequência atual de treino: ${anamnese.weeklyFrequencyNow}x/semana
- Provas já completadas: ${anamnese.completedRaces ? `Sim (${anamnese.racesDescription ?? 'sem detalhes'})` : 'Não'}
- Consegue caminhar 30min: ${anamnese.canWalk30min ? 'Sim' : 'Não'}
- Consegue trotar 5min: ${anamnese.canJog5min ? 'Sim' : 'Não'}
- Dificuldade respiratória: ${anamnese.breathingDifficulty}
- Autoavaliação condicionamento (1-5): ${anamnese.fitnessLevel}
- Lesões: ${anamnese.injuries?.join(', ') || 'Nenhuma'}
- Condição cardíaca: ${anamnese.heartCondition ? 'Sim' : 'Não'}
- Problema articular: ${anamnese.jointIssues ? 'Sim' : 'Não'}
- Liberação médica: ${anamnese.medicalClearance}
- Objetivo: ${GOAL_LABELS[anamnese.runningGoal] || anamnese.runningGoal}
- Prazo: ${anamnese.goalDeadline ?? 'Não informado'}
- Dias disponíveis: ${anamnese.availableDays?.join(', ')}
- Horário preferido: ${anamnese.preferredTime}
- Local de treino: ${anamnese.trainingLocation}
- Tem tênis adequado: ${anamnese.hasProperShoes}
- Qualidade do sono: ${anamnese.sleepQuality}
- Dores durante caminhada: ${anamnese.bodyPainDuringWalk ?? 'Nenhuma'}

PROTOCOLOS DISPONÍVEIS:
${catalog}
O protocolo 5K tem 5 blocos: Adaptação (sem. 1-2), Resistência base (3-4), Sustentar ritmo (5-6), Pré-performance (7) e O 5K (8).
Os demais começam com treinos mais curtos e crescem, com semanas de recuperação e polimento antes da prova.

PROTOCOLOS QUE O HISTÓRICO DESTE ALUNO SUSTENTA: ${allowed.join(', ')}. Escolha somente entre eles; na dúvida, escolha o mais cauteloso.
Se for um dos protocolos longos (10K, 21K, 42K), comece pela semana 1.

Responda APENAS com um JSON válido, sem nenhum texto adicional, sem markdown:
{
  "protocolType": "<${allowed.join(' | ')}>",
  "startWeek": <número a partir de 1>,
  "customSpeeds": {
    "z2": <velocidade esteira km/h>,
    "z3": <velocidade esteira km/h>,
    "z4": <velocidade esteira km/h>,
    "z5": <velocidade esteira km/h>
  },
  "adaptations": "<string com adaptações específicas ou null>",
  "customNotes": "<string com observações personalizadas para o coach revisar>"
}`;
}
