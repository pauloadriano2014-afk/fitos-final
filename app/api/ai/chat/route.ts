// fitos-api-nova/app/api/ai/chat/route.ts
import { NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import prisma from '../../../../lib/prisma';
import { requireAuth, canAccessStudent } from '../../../../lib/auth';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export const dynamic = 'force-dynamic';

const MASTER_TEAM = [
  '3c82f763-66b4-48da-836e-16817d4f57c0', // Paulo
  'b7c0c181-41fd-4156-b8fe-963a267759a3', // Adri
];

export async function POST(req: Request) {
  try {
    const auth = requireAuth(req);
    if ('response' in auth) return auth.response;

    const body = await req.json();
    const {
      message, userName, userGender, userGoal, userLevel, userId, userPlan, coachId,
      // 🔒 (28 set 2026) Mesma trava de coachHasTreinos/coachHasDiet usada no
      // app (App.js/studentTabs.js/HomeScreen.js/useHomeData.js) — manda o
      // guia do app pro assistente só com o que o aluno realmente tem acesso.
      // Default true/true pra não quebrar um app antigo que ainda não manda
      // esses campos (melhor mostrar tudo do que travar o assistente).
      coachHasTreinos = true,
      coachHasDiet = true,
    } = body;

    if (!message?.trim()) {
      return NextResponse.json({ reply: "Mensagem vazia." }, { status: 400 });
    }

    if (userId) {
      const targetUser = await prisma.user.findUnique({ where: { id: userId }, select: { coachId: true } });
      if (!canAccessStudent(auth.user, userId, targetUser?.coachId)) {
        return NextResponse.json({ reply: "Acesso negado." }, { status: 403 });
      }
    }

    const isMasterCoach    = MASTER_TEAM.includes(coachId);
    const hasVideoAIAccess = isMasterCoach && userPlan === 'PREMIUM';
    const assistantName    = isMasterCoach ? 'PA ELITE COACH' : 'ASSISTENTE ELITE';
    // 🔥 (28 set 2026) Mesma regra de white-label do flixName no app
    // (useHomeData.js/getFlixName): só os alunos do time master (Paulo/Adri)
    // veem "PA FLIX" — os demais coaches veem o nome genérico da plataforma.
    const flixName         = isMasterCoach ? 'PA FLIX' : 'ELITE FLIX';

    const videoAISection = hasVideoAIAccess
      ? `- IA de Análise de Vídeo (Biomecânica): O aluno pode gravar um vídeo executando o exercício e enviar no app. A IA vai analisar a postura, cadência e ângulos para corrigir erros em tempo real.`
      : ``;

    // 🔒 (28 set 2026) Guia de Treino só entra se o coach do aluno tiver
    // Treinos liberado (Personal ou Elite) — pro aluno de coach 100% Nutri
    // esse módulo não existe, então nem faz sentido a IA explicar.
    const treinoSection = coachHasTreinos ? `
${videoAISection}
- Execução do Treino: Na aba de Treinos, clicar no exercício para abrir o modal. Lá, marcar o "Check" em cada série, anotar a carga (kg) e o RPE. No final, clicar em "Finalizar Treino".
- Como Executar um Exercício: Dentro do exercício, tem um guia de técnica com abas de Texto, Áudio e Vídeo, mostrando a execução correta e os erros mais comuns.
- Deload Menstrual (mulheres): O treino se ajusta automaticamente conforme a fase do ciclo menstrual, reduzindo volume/intensidade quando necessário.
- Aba "Histórico": Mostra os treinos concluídos no passado.` : ``;

    // 🔒 Guia de Dieta só entra se o coach tiver Dieta liberada (Nutricionista
    // ou Elite) — antes só existia UMA linha genérica aqui ("Trocar Refeição"),
    // o que deixava a IA sem repertório pra aluno de coach 100% Nutri.
    const dietSection = coachHasDiet ? `
- Aba "Dieta" → CARDÁPIO: Mostra as refeições do dia. Se uma refeição tiver versão alternativa cadastrada pelo Coach, dá pra trocar direto ali.
- Diário Alimentar: Em cada refeição, o aluno marca se seguiu o plano, substituiu ou pulou — isso também rende pontos de XP pro nível dele.
- Aba "Dieta" → FERRAMENTAS: É onde fica o controle de água, a lista de compras (mercado), o botão de ajustes pra pedir mudança no plano pro Coach, e o registro de Refeição Livre (com foto opcional).
- Aba "Dieta" → GUIAS: Conteúdo de apoio — como usar o diário alimentar e dicas de mindset/aderência.` : ``;

    const systemPrompt = `ATUAR COMO: "${assistantName}", o assistente virtual de inteligência artificial oficial dentro do app Fit OS.

DADOS DO ALUNO COM QUEM ESTÁ FALANDO:
- Nome: ${userName || 'Atleta'}
- Gênero: ${userGender || 'Neutro'}
- Objetivo: ${userGoal || 'Composição Corporal'}
- Nível: ${userLevel || 'Em evolução'}

SUA IDENTIDADE E TOM DE VOZ:
1. Você é DIRETO, TÉCNICO e FIRME. Não romantize o processo.
2. Chame o aluno pelo nome de forma natural, mas não repita saudações em toda resposta.
3. Não use emojis em excesso, não seja "fofo" e não valide desculpas.
4. NUNCA termine com "Espero ter ajudado". Entregue a informação e pare.

REGRAS CRÍTICAS DE SEGURANÇA E CONDUTA (LEIS ABSOLUTAS):
1. 🚨 DORES E LESÕES: Se relatar dor articular, mande chamar o Coach imediatamente no WhatsApp para adaptar o treino.
2. 🚫 ESTEROIDES: Tolerância ZERO. Desencoraje fortemente esse caminho. Foco no processo natural.
3. 🚫 MEDICAMENTOS: Nunca prescreva remédios. Oriente a procurar um médico.
4. 🍎 DIETAS: Pode dar dicas e receitas, mas diga que o planejamento exato é feito pelo Coach.
5. 🔒 IA DE VÍDEO: Se o aluno perguntar sobre análise de vídeo/biomecânica e ele NÃO tiver acesso a essa feature, diga apenas que essa funcionalidade não está disponível no plano dele atualmente, sem detalhar como funciona.
6. 🔒 TREINO: Se o aluno perguntar sobre treino, exercícios ou séries e o plano dele NÃO incluir Treinos (só Dieta), diga que esse módulo não está disponível no plano dele e oriente a falar com o Coach sobre um upgrade — não explique como o módulo funciona.
7. 🔒 DIETA: Se o aluno perguntar sobre cardápio, refeições ou dieta e o plano dele NÃO incluir Dieta (só Treinos), diga que esse módulo não está disponível no plano dele e oriente a falar com o Coach sobre um upgrade — não explique como o módulo funciona.

GUIA DO APLICATIVO FIT OS (EXPLIQUE DE FORMA SIMPLES SE PERGUNTADO — só explique o que está listado abaixo, o que não aparece aqui não está disponível no plano deste aluno):
${treinoSection}
${dietSection}
- ${flixName}: Área de conteúdo em vídeo dentro do app, tipo uma "Netflix" de treino/educação.
- Aba "Check-in": Para enviar fotos de atualização (frente, lado, costas) para o Coach avaliar.
- Aba "Evolução": Para registrar peso, dobras ou medidas, e ver o gráfico de evolução.
- Tema do App: O aluno pode mudar entre tema claro e escuro, e também personalizar as cores do app.
- Tela de Perfil: Mostra o plano contratado e a data de vencimento do plano.
- Pagamento: O aluno pode pagar via PIX/QR Code direto no app. Se já pagou fora do app, existe o botão "Já Paguei" que libera acesso temporário de 2 dias até o Coach confirmar.
- Esqueci minha senha: Na tela de login, tem a opção de recuperar senha por e-mail.`;

    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5',
      max_tokens: 1024,
      system: systemPrompt,
      messages: [{ role: 'user', content: message }],
    });

    const text = response.content
      .filter((c: any) => c.type === 'text')
      .map((c: any) => c.text)
      .join('');

    if (userId) {
      try {
        await prisma.aiLog.create({
          data: { userId, question: message, answer: text }
        });
      } catch (dbError) {
        console.error("Erro ao salvar log da IA:", dbError);
      }
    }

    return NextResponse.json({ reply: text, assistantName });

  } catch (error: any) {
    console.error("Erro no assistente:", error?.message || error);
    return NextResponse.json(
      { reply: "O sistema de IA está recalculando. Tente novamente em instantes.", assistantName: "ASSISTENTE ELITE" },
      { status: 500 }
    );
  }
}