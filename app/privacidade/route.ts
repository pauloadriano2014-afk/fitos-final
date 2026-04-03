// app/privacidade/route.ts
import { NextResponse } from 'next/server';

export async function GET() {
  const html = `
  <!DOCTYPE html>
  <html lang="pt-BR">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Política de Privacidade - PA TEAM</title>
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
      <h1>Política de Privacidade - Aplicativo PA TEAM</h1>
      <p class="date"><strong>Última atualização:</strong> Abril de 2026</p>
      
      <p>Bem-vindo ao aplicativo da consultoria <strong>Paulo Adriano Team</strong>. A sua privacidade e a segurança dos seus dados pessoais e físicos são nossas maiores prioridades. Esta Política de Privacidade explica como coletamos, usamos, armazenamos e protegemos as suas informações ao utilizar o nosso aplicativo e os nossos serviços.</p>
      <p>Ao utilizar o aplicativo, você concorda com a coleta e o uso de informações de acordo com esta política.</p>

      <h2>1. Informações que Coletamos</h2>
      <ul>
        <li><strong>Dados Cadastrais:</strong> Nome completo, endereço de e-mail e senha (criptografada).</li>
        <li><strong>Dados de Saúde e Bem-Estar (Health Data):</strong> Idade, peso atual, histórico de lesões, nível de experiência com musculação e informações preenchidas na Anamnese inicial.</li>
        <li><strong>Dados de Acompanhamento (Check-in):</strong> Evolução de cargas, histórico de treinos concluídos e feedback de performance.</li>
        <li><strong>Mídia (Fotos):</strong> Imagens do seu corpo (frente, costas, lado e poses extras) enviadas voluntariamente durante o processo de Check-in quinzenal/mensal.</li>
      </ul>

      <h2>2. Uso de Permissões Específicas do Dispositivo</h2>
      <ul>
        <li><strong>Câmera e Galeria de Fotos:</strong> Solicitamos acesso exclusivo para que você possa capturar ou fazer o upload das suas fotos de evolução física no Check-in. <em>Nenhuma foto é capturada em segundo plano ou sem o seu comando explícito.</em></li>
        <li><strong>Notificações (Push):</strong> Para enviar lembretes de treinos, avisos de novos conteúdos no PA Flix e mensagens do seu treinador.</li>
      </ul>

      <h2>3. Como Usamos as Suas Informações</h2>
      <ul>
        <li>Elaborar e adaptar protocolos de treino personalizados de acordo com as suas limitações e objetivos físicos.</li>
        <li>Analisar a sua evolução estética e métrica por meio dos Check-ins.</li>
        <li>Garantir a segurança e a integridade da sua conta.</li>
        <li>Melhorar e otimizar os recursos do aplicativo.</li>
      </ul>

      <h2>4. Privacidade e Segurança das Fotos (Check-in)</h2>
      <ul>
        <li><strong>Acesso Restrito:</strong> As suas fotos de Check-in são de acesso estrito, único e exclusivo do seu treinador (Paulo Adriano) e da equipe técnica oficial, não sendo visíveis para nenhum outro usuário do aplicativo.</li>
        <li><strong>Armazenamento Seguro:</strong> As imagens são enviadas de forma segura para servidores em nuvem isolados, garantindo alta proteção contra acessos não autorizados.</li>
      </ul>

      <h2>5. Compartilhamento de Dados</h2>
      <p>O <strong>Paulo Adriano Team</strong> jamais vende, aluga ou compartilha seus dados pessoais, de saúde ou fotos com terceiros para fins de marketing ou publicidade. O compartilhamento só ocorrerá se exigido por lei ou ordem judicial, ou com prestadores de serviço de infraestrutura essenciais para o funcionamento do app (servidores), que possuem políticas de segurança rigorosas.</p>

      <h2>6. Retenção e Exclusão de Dados</h2>
      <p>Você tem o controle total sobre as suas informações. Retemos seus dados pessoais e de saúde apenas pelo tempo necessário para fornecer o serviço de consultoria.</p>
      <p><strong>Direito ao Esquecimento:</strong> A qualquer momento, você pode solicitar a exclusão completa e permanente da sua conta, incluindo todo o histórico de treinos e fotos de Check-in, bastando entrar em contato através dos canais oficiais. Todos os arquivos serão deletados permanentemente de nossos servidores.</p>

      <h2>7. Contato e Suporte</h2>
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