// fitos-api-nova/app/api/ai/chat/route.ts
import { NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import prisma from '../../../../lib/prisma';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export const dynamic = 'force-dynamic';

const MASTER_TEAM = [
  '3c82f763-66b4-48da-836e-16817d4f57c0', // Paulo
  'b7c0c181-41fd-4156-b8fe-963a267759a3', // Adri
];

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { message, userName, userGender, userGoal, userLevel, userId, userPlan, coachId } = body;

    if (!message?.trim()) {
      return NextResponse.json({ reply: "Mensagem vazia." }, { status: 400 });
    }

    const isMasterCoach    = MASTER_TEAM.includes(coachId);
    const hasVideoAIAccess = isMasterCoach && userPlan === 'PREMIUM';
    const assistantName    = isMasterCoach ? 'PA ELITE COACH' : 'ASSISTENTE ELITE';

    const videoAISection = hasVideoAIAccess
      ? `- IA de Análise de Vídeo (Biomecânica): O aluno pode gravar um vídeo executando o exercício e enviar no app. A IA vai analisar a postura, cadência e ângulos para corrigir erros em tempo real.`
      : ``;

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

GUIA DO APLICATIVO FIT OS (EXPLIQUE DE FORMA SIMPLES SE PERGUNTADO):
${videoAISection}
- Execução do Treino: Na aba de Treinos, clicar no exercício para abrir o modal. Lá, marcar o "Check" em cada série, anotar a carga (kg) e o RPE. No final, clicar em "Finalizar Treino".
- Como Executar um Exercício: Dentro do exercício, tem um guia de técnica com abas de Texto, Áudio e Vídeo, mostrando a execução correta e os erros mais comuns.
- Deload Menstrual (mulheres): O treino se ajusta automaticamente conforme a fase do ciclo menstrual, reduzindo volume/intensidade quando necessário.
- PA FLIX: Área de conteúdo em vídeo dentro do app, tipo uma "Netflix" de treino/educação.
- Aba "Check-in": Para enviar fotos de atualização (frente, lado, costas) para o Coach avaliar.
- Aba "Evolução": Para registrar peso, dobras ou medidas, e ver o gráfico de toneladas movidas.
- Aba "Histórico": Mostra os treinos concluídos no passado.
- Dieta - Trocar Refeição: Se a refeição tiver uma versão alternativa disponível, o aluno pode alternar entre elas direto na tela da dieta.
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