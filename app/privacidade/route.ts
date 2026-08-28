// app/privacidade/route.ts
import { NextResponse } from 'next/server';

export async function GET() {
  const html = `
  <!DOCTYPE html>
  <html lang="pt-BR">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Política de Privacidade - ELITE FIT</title>
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
      <h1>Política de Privacidade - Aplicativo ELITE FIT</h1>
      <p class="date"><strong>Última atualização:</strong> Agosto de 2026</p>

      <p>Bem-vindo ao aplicativo <strong>ELITE FIT</strong> (nome fantasia de <strong>PÁ ELITE TEAM</strong>, empresa responsável pelo aplicativo). A sua privacidade e a segurança dos seus dados pessoais e físicos são nossas maiores prioridades. Esta Política de Privacidade explica como coletamos, usamos, armazenamos e protegemos as suas informações ao utilizar o nosso aplicativo e os nossos serviços.</p>
      <p>Ao utilizar o aplicativo, você concorda com a coleta e o uso de informações de acordo com esta política.</p>

      <h2>1. Informações que Coletamos</h2>
      <ul>
        <li><strong>Dados Cadastrais:</strong> Nome completo, endereço de e-mail, telefone e senha (criptografada).</li>
        <li><strong>Dados de Saúde e Bem-Estar (Health Data):</strong> Idade, peso atual, histórico de lesões, nível de experiência com musculação e informações preenchidas na Anamnese inicial.</li>
        <li><strong>Dados de Acompanhamento (Check-in):</strong> Evolução de cargas, histórico de treinos concluídos, dieta e feedback de performance.</li>
        <li><strong>Mídia (Fotos e Vídeos):</strong> Imagens do seu corpo (frente, costas, lado e poses extras) enviadas voluntariamente durante o processo de Check-in, e vídeos curtos de execução de exercício enviados voluntariamente ao Scanner de Movimento (análise de técnica por IA).</li>
        <li><strong>Dados Financeiros:</strong> Para alunos com cobrança recorrente via cartão ou PIX, coletamos CPF e endereço de cobrança, necessários para emissão de cobrança junto ao nosso processador de pagamentos (Asaas). Não armazenamos número completo de cartão de crédito — isso é feito diretamente pelo processador de pagamentos.</li>
      </ul>

      <h2>2. Uso de Permissões Específicas do Dispositivo</h2>
      <ul>
        <li><strong>Câmera e Galeria de Fotos:</strong> Solicitamos acesso para que você possa capturar ou fazer upload das suas fotos de evolução física no Check-in e da foto do dia nos Desafios.</li>
        <li><strong>Câmera e Microfone (Scanner de Movimento):</strong> Usados exclusivamente para gravar, com o seu comando explícito, o vídeo de execução de um exercício que você opta por enviar para análise de técnica por Inteligência Artificial. <em>Nenhuma foto ou vídeo é capturado em segundo plano ou sem a sua ação direta.</em></li>
        <li><strong>Notificações (Push):</strong> Para enviar lembretes de treinos, avisos de novos conteúdos e mensagens do seu treinador.</li>
      </ul>

      <h2>3. Como Usamos as Suas Informações</h2>
      <ul>
        <li>Elaborar e adaptar protocolos de treino e dieta personalizados de acordo com as suas limitações e objetivos físicos.</li>
        <li>Analisar a sua evolução estética e métrica por meio dos Check-ins e a técnica de execução dos exercícios via Scanner de Movimento.</li>
        <li>Processar a cobrança da sua consultoria, quando aplicável.</li>
        <li>Garantir a segurança e a integridade da sua conta.</li>
        <li>Melhorar e otimizar os recursos do aplicativo.</li>
      </ul>

      <h2>4. Privacidade e Segurança das Fotos e Vídeos</h2>
      <ul>
        <li><strong>Acesso Restrito:</strong> As suas fotos de Check-in e vídeos do Scanner de Movimento são de acesso estrito, único e exclusivo do seu treinador e da equipe técnica oficial, não sendo visíveis para nenhum outro usuário do aplicativo.</li>
        <li><strong>Armazenamento Seguro:</strong> As imagens e vídeos são enviados de forma segura para servidores em nuvem isolados, garantindo alta proteção contra acessos não autorizados.</li>
      </ul>

      <h2>5. Compartilhamento de Dados</h2>
      <p>A <strong>PÁ ELITE TEAM</strong> jamais vende, aluga ou compartilha seus dados pessoais, de saúde ou fotos com terceiros para fins de marketing ou publicidade. O compartilhamento só ocorre com prestadores de serviço essenciais para o funcionamento do app — servidores em nuvem e, para dados financeiros, o processador de pagamentos Asaas — ou se exigido por lei ou ordem judicial. Esses prestadores possuem suas próprias políticas de segurança e são contratualmente obrigados a proteger seus dados.</p>

      <h2>6. Retenção e Exclusão de Dados</h2>
      <p>Você tem o controle total sobre as suas informações. Retemos seus dados pessoais e de saúde apenas pelo tempo necessário para fornecer o serviço de consultoria.</p>
      <p><strong>Direito ao Esquecimento:</strong> A qualquer momento, você pode excluir a sua conta diretamente pelo aplicativo, na tela de Perfil, opção "Excluir minha conta" — ou solicitando pelos canais de contato abaixo. Ao excluir sua conta, seus dados pessoais (nome, contato, fotos, vídeos, anotações) são removidos/anonimizados dos nossos servidores. Registros financeiros (cobranças e pagamentos) podem ser mantidos de forma desvinculada da sua identidade pelo prazo exigido pela legislação fiscal brasileira, mesmo após a exclusão da conta.</p>

      <h2>7. Seus Direitos (LGPD)</h2>
      <p>Nos termos da Lei Geral de Proteção de Dados (Lei 13.709/2018), você pode a qualquer momento solicitar a confirmação da existência de tratamento, acesso, correção, anonimização ou exclusão dos seus dados pessoais, entrando em contato pelos canais abaixo.</p>

      <h2>8. Contato e Suporte</h2>
      <p>Se você tiver qualquer dúvida sobre esta Política de Privacidade, sobre como seus dados são manipulados ou desejar solicitar a exclusão da sua conta, entre em contato:</p>
      <ul style="list-style-type: none; padding-left: 0;">
        <li>📧 <strong>E-mail:</strong> paulo_adriano2014@live.com</li>
        <li>📱 <strong>WhatsApp / Suporte:</strong> (41) 99799-1346</li>
      </ul>
    </div>
  </body>
  </html>
  `;

  return new NextResponse(html, {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
    },
  });
}
