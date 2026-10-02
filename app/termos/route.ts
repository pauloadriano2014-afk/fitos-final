// app/termos/route.ts
import { NextResponse } from 'next/server';

// 🍎 (2 out 2026) O link "Termos de Uso" do app abre esta página. No app de iPhone (Apple 3.1.1) não pode haver nada que fale de compra/pagamento
// por outros meios: o app do iOS abre com ?plataforma=ios e recebe a versão SEM a seção de assinaturas e pagamentos. Quem abre sem o parâmetro
// (web, Android, builds antigas) vê o texto completo, agora com um aviso de que o app do iPhone não tem contratação nem pagamento.
export const dynamic = 'force-dynamic';

const SECTION_7_FULL_NOTE = `<p><strong>Aplicativo para iPhone (iOS):</strong> não há contratação, assinatura nem pagamento no aplicativo para iPhone. As regras desta seção valem para os demais canais de acesso (web e Android).</p>`;

const SECTION_7_IOS = `
      <h2>7. Acesso ao Serviço</h2>
      <p>O acesso ao ELITE FIT neste aplicativo é liberado pelo seu coach ou profissional responsável. O aplicativo para iPhone (iOS) não oferece contratação, assinatura nem pagamento de planos ou serviços. Dúvidas sobre o seu acesso podem ser enviadas pelos canais de contato ao final destes Termos.</p>
`;

const isIosApp = (req: Request) => {
  try { return (new URL(req.url).searchParams.get('plataforma') || '').toLowerCase() === 'ios'; } catch { return false; }
};

export async function GET(req: Request) {
  const ios = isIosApp(req);
  let html = `
  <!DOCTYPE html>
  <html lang="pt-BR">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Termos de Uso - ELITE FIT</title>
    <style>
      body { background-color: #F9FAFB; font-family: system-ui, -apple-system, sans-serif; padding: 40px 20px; color: #374151; line-height: 1.6; }
      .container { max-width: 800px; margin: 0 auto; background-color: #FFFFFF; padding: 40px; border-radius: 12px; box-shadow: 0 4px 6px rgba(0,0,0,0.05); }
      h1 { font-size: 28px; font-weight: 900; color: #111827; margin-bottom: 10px; }
      h2 { font-size: 20px; font-weight: bold; color: #111827; margin-top: 30px; margin-bottom: 15px; }
      .date { color: #6B7280; font-size: 14px; margin-bottom: 30px; }
      ul { padding-left: 20px; margin-bottom: 30px; }
      li { margin-bottom: 8px; }
    </style>
  </head>
  <body>
    <div class="container">
      <h1>Termos de Uso - Aplicativo ELITE FIT</h1>
      <p class="date"><strong>Última atualização:</strong> Outubro de 2026</p>

      <p>Estes Termos de Uso regulam a utilização do aplicativo <strong>ELITE FIT</strong>, plataforma de consultoria online e presencial de treino e nutrição operada por <strong>PA ELITE TEAM LTDA</strong>, sediada em Curitiba-PR. Ao criar uma conta ou utilizar o aplicativo, você declara ter lido, compreendido e aceito integralmente estes Termos, bem como a nossa <a href="https://fitos-final.onrender.com/privacidade">Política de Privacidade</a>.</p>

      <h2>1. Descrição do Serviço</h2>
      <p>O ELITE FIT é uma plataforma digital de fornecimento de conteúdo de bem-estar, treinos, protocolos alimentares e acompanhamento de evolução física, prestada por profissionais habilitados e sua equipe de suporte. Alguns planos incluem também acompanhamento presencial (aulas e avaliação física), sujeito a agenda e disponibilidade combinadas diretamente com o profissional responsável.</p>

      <h2>2. Responsabilidade Técnica</h2>
      <p>O usuário declara estar ciente que o profissional <strong>Paulo Adriano</strong> atua como Responsável Técnico da plataforma. Todas as rotinas e periodizações de treinamento físico são elaboradas e/ou supervisionadas diretamente por ele ou por profissionais parceiros habilitados dentro de suas respectivas áreas.</p>

      <h2>3. Profissionais que Atuam na Plataforma e Registro Profissional</h2>
      <p>Além do Responsável Técnico, a plataforma é utilizada por coaches, personal trainers, educadores físicos, nutricionistas e outros profissionais parceiros (&quot;Profissionais&quot;). Ao criar uma conta de Profissional ou utilizar as ferramentas de montagem de treinos e dietas, o Profissional declara e concorda que:</p>
      <ul>
        <li>exerce a sua profissão de forma regular e <strong>dentro das atribuições legais da sua área</strong>, responsabilizando-se por manter ativo e em situação regular o seu registro no respectivo conselho profissional (por exemplo, <strong>CREF</strong> para educação física e treinamento; <strong>CRN</strong> para nutrição), sempre que a lei exigir esse registro para a atividade que exerce;</li>
        <li>é o <strong>único responsável técnico</strong> pelos treinos, planos alimentares, orientações e prescrições que elabora, edita ou envia por meio da plataforma, inclusive os que tenham sido gerados com apoio de Inteligência Artificial, os quais devem ser por ele revisados antes de chegarem ao aluno;</li>
        <li>a plataforma oferece o recurso de incluir título e número de registro profissional (CRN/CREF) na assinatura do PDF da dieta. Esse preenchimento é <strong>opcional</strong> e as informações digitadas são de responsabilidade do Profissional, que deve informar apenas dados verdadeiros. A plataforma <strong>não valida</strong> o número de registro junto aos conselhos, e a ausência do registro no PDF não afasta as obrigações do Profissional perante o seu conselho e a legislação;</li>
        <li>não deve realizar, por meio da plataforma, atividades privativas de outra profissão regulamentada.</li>
      </ul>
      <p>A PA ELITE TEAM LTDA poderá suspender ou encerrar o acesso de Profissional que informe dados falsos sobre o seu registro ou que atue fora dos limites legais da sua profissão, sem prejuízo das demais medidas cabíveis.</p>

      <h2>4. Natureza das Sugestões Alimentares</h2>
      <p>A plataforma poderá disponibilizar Guias de Sugestão Alimentar. O usuário declara compreender que tais guias possuem caráter estritamente <strong>informativo e educativo</strong>, servindo como referência de bons hábitos, e NÃO substituem uma consulta individualizada com um nutricionista. O usuário possui total autonomia para seguir ou não as sugestões apresentadas.</p>

      <h2>5. Condição de Saúde e Resultados</h2>
      <p>O usuário declara estar em plenas condições de saúde para a prática de exercícios físicos e protocolos de déficit calórico, devendo comunicar qualquer patologia, lesão ou condição médica prévia relevante. O usuário reconhece que estimativas de resultado divulgadas pela plataforma são médias baseadas em aderência total ao protocolo e podem variar de acordo com fatores individuais (metabolismo, genética, consistência, condições de saúde). O ELITE FIT não substitui atendimento médico de emergência.</p>

      <h2>6. Cadastro e Conta</h2>
      <ul>
        <li>O uso da plataforma é destinado a maiores de 18 anos. Menores de idade só podem utilizar o aplicativo mediante autorização e supervisão de um responsável legal.</li>
        <li>O usuário é responsável por manter a confidencialidade da sua senha e por todas as atividades realizadas na sua conta, e deve comunicar imediatamente qualquer uso não autorizado.</li>
        <li>As informações fornecidas no cadastro e na Anamnese devem ser verdadeiras, completas e atualizadas — protocolos incorretos gerados a partir de informações falsas ou desatualizadas são de responsabilidade do usuário.</li>
      </ul>

      <h2>7. Assinaturas, Pagamentos e Cancelamento</h2>
      ${SECTION_7_FULL_NOTE}
      <ul>
        <li>Planos pagos são cobrados no ciclo contratado (mensal, trimestral, semestral ou anual, conforme o plano escolhido) através do nosso processador de pagamentos Asaas, via PIX, boleto ou cartão de crédito.</li>
        <li>Quando o pagamento recorrente automático é ativado, a cobrança do ciclo seguinte ocorre automaticamente na data de vencimento, salvo cancelamento prévio pelo usuário.</li>
        <li>O usuário pode cancelar a renovação automática a qualquer momento pelo aplicativo (tela de Perfil) ou pelos canais de suporte; o cancelamento interrompe cobranças futuras, mas não gera reembolso proporcional do período já pago e em curso, exceto quando exigido por lei.</li>
        <li>Em compras feitas pela primeira vez, o usuário tem direito de arrependimento em até 7 (sete) dias corridos a partir da contratação, conforme art. 49 do Código de Defesa do Consumidor, com reembolso integral caso solicitado dentro desse prazo e sem uso relevante do serviço.</li>
        <li>Serviços e produtos avulsos (ebooks, cursos digitais, fichas de treino avulsas) não são reembolsáveis após o download/acesso ao conteúdo, ressalvado o mesmo prazo de arrependimento de 7 dias quando aplicável.</li>
        <li>Eventuais reajustes de valores serão comunicados ao usuário com antecedência razoável e não afetam ciclos já pagos.</li>
      </ul>

      <h2>8. Uso de Inteligência Artificial</h2>
      <p>A plataforma utiliza ferramentas de Inteligência Artificial (incluindo o Google Gemini) como apoio a funcionalidades como o Scanner de Movimento (análise de execução de exercício por vídeo), geração assistida de treinos/dietas e outras análises. Essas ferramentas funcionam como suporte técnico ao Responsável Técnico e à equipe do ELITE FIT, e suas sugestões podem ser revisadas, ajustadas ou substituídas por avaliação humana profissional a qualquer momento. O uso de IA não substitui o acompanhamento e a responsabilidade técnica do profissional habilitado.</p>

      <h2>9. Propriedade Intelectual</h2>
      <p>Todo o conteúdo disponibilizado na plataforma — treinos, protocolos alimentares, vídeos, materiais em PDF, PA Flix, ebooks e demais produtos digitais — é de propriedade da <strong>PA ELITE TEAM LTDA</strong> ou licenciado a ela, protegido por direitos autorais. É proibida a reprodução, distribuição, revenda ou compartilhamento de login/conteúdo com terceiros não autorizados, sob pena de suspensão da conta e responsabilização civil.</p>

      <h2>10. Conduta do Usuário</h2>
      <p>O usuário compromete-se a utilizar a plataforma de boa-fé, não compartilhar suas credenciais de acesso, não utilizar o conteúdo para fins comerciais não autorizados, e a tratar a equipe do ELITE FIT com respeito nos canais de suporte e chat.</p>

      <h2>11. Suspensão e Encerramento de Conta</h2>
      <p>A PA ELITE TEAM LTDA reserva-se o direito de suspender ou encerrar contas em caso de inadimplência, uso indevido do conteúdo, violação destes Termos ou conduta abusiva com a equipe. O usuário pode excluir sua própria conta a qualquer momento pelo aplicativo (tela de Perfil, "Excluir minha conta"), conforme detalhado na nossa Política de Privacidade.</p>

      <h2>12. Limitação de Responsabilidade</h2>
      <p>A plataforma é fornecida "como está". Envidamos esforços para manter o serviço disponível e seguro, mas não garantimos disponibilidade ininterrupta. A PA ELITE TEAM LTDA não se responsabiliza por danos indiretos decorrentes de instabilidades técnicas, uso inadequado do aplicativo, ou pelo descumprimento das orientações de treino/dieta e das recomendações médicas por parte do usuário.</p>

      <h2>13. Alterações destes Termos</h2>
      <p>Estes Termos podem ser atualizados periodicamente para refletir mudanças no serviço ou na legislação aplicável. A versão vigente estará sempre disponível nesta página, com a data da última atualização indicada no topo.</p>

      <h2>14. Legislação Aplicável e Foro</h2>
      <p>Estes Termos são regidos pelas leis da República Federativa do Brasil. Fica eleito o foro da comarca de Curitiba-PR para dirimir quaisquer controvérsias, com renúncia a qualquer outro, por mais privilegiado que seja, ressalvado o direito do consumidor de optar pelo foro do seu domicílio.</p>

      <h2>15. Contato</h2>
      <p>Dúvidas sobre estes Termos de Uso podem ser enviadas pelos canais abaixo:</p>
      <ul style="list-style-type: none; padding-left: 0;">
        <li>📧 <strong>E-mail:</strong> elitefit_app@outlook.com</li>
        <li>📱 <strong>WhatsApp / Suporte:</strong> (41) 99799-1346</li>
      </ul>
    </div>
  </body>
  </html>
  `;

  if (ios) {
    // a seção inteira (do título 7 até o título 8) vira a versão sem pagamento
    const start = html.indexOf('<h2>7. Assinaturas, Pagamentos e Cancelamento</h2>');
    const end = html.indexOf('<h2>8. Uso de Inteligência Artificial</h2>');
    if (start !== -1 && end > start) html = html.slice(0, start) + SECTION_7_IOS.trim() + '\n\n      ' + html.slice(end);
    html = html.replace('em caso de inadimplência, uso indevido do conteúdo', 'em caso de uso indevido do conteúdo');
  }

  return new NextResponse(html, {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  });
}
