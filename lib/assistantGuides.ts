// lib/assistantGuides.ts
// 📖 (13 out 2026) GUIAS "COMO FAZER" do assistente único: a ÚNICA fonte de verdade do que o app faz e onde fica.
//   1) viram os botões/lista da aba "Como fazer" (sem IA, resposta na hora);
//   2) viram a base de conhecimento da IA de suporte (/api/ai/elite-assistant): ela só responde com o que está aqui;
//   3) a busca por palavras (`searchGuides`) acha o guia certo sem gastar IA.
// Para o assistente aprender um recurso novo: acrescente um guia aqui (id único, categoria, passos). Nada de inventar tela: só o que existe.
// `needs`: o guia só vale para quem tem aquele módulo (plano Personal = treino; Nutricionista = dieta; Elite = os dois). `master`: só o time master (Paulo/Adri).
export type GuideNeeds = 'treino' | 'dieta';
export type Guide = { id: string; cat: string; title: string; kw: string; steps: string[]; tip?: string; needs?: GuideNeeds; master?: boolean };
export type GuideCategory = { id: string; label: string; icon: string; master?: boolean };

export const GUIDE_CATEGORIES: GuideCategory[] = [
  { id: 'comecar', label: 'Começar', icon: 'rocket-launch-outline' },
  { id: 'treinos', label: 'Treinos', icon: 'dumbbell' },
  { id: 'dieta', label: 'Dieta', icon: 'food-apple-outline' },
  { id: 'avaliacoes', label: 'Avaliações e feedback', icon: 'camera-timer' },
  { id: 'agenda', label: 'Agenda e pendências', icon: 'calendar-clock' },
  { id: 'financeiro', label: 'Finanças', icon: 'cash-multiple' },
  { id: 'comunicacao', label: 'Comunicação', icon: 'bullhorn-outline' },
  { id: 'marca', label: 'Marca e vendas', icon: 'storefront-outline' },
  { id: 'recursos', label: 'Recursos especiais', icon: 'star-four-points-outline' },
  { id: 'master', label: 'Time master', icon: 'shield-crown-outline', master: true },
];

export const GUIDES: Guide[] = [
  // ───────── Começar ─────────
  { id: 'convite', cat: 'comecar', title: 'Como o aluno se cadastra (código de convite)', kw: 'convite codigo cadastro cadastrar aluno registro link vincular novo aluno',
    steps: ['Você tem um código de convite único (ex.: JOAO123), visível nas suas configurações.', 'Mande o link ao aluno: elitefitapp.com.br/registro?coach=SEUCODIGO.', 'O aluno preenche os dados e já fica vinculado ao seu painel, sem você fazer nada.', 'Você recebe uma notificação quando o aluno se cadastra.'] },
  { id: 'dashboard', cat: 'comecar', title: 'Entender a tela de alunos', kw: 'dashboard painel alunos filtro filtrar busca ativos inativos status plano atrasados alerta',
    steps: ['A aba ALUNOS mostra seus alunos divididos em Ativos e Inativos.', 'Filtre por status (pendentes de avaliação, atrasados, em alerta, no prazo, sem treino), por plano (Elite, Performance, Ficha 8S, Low Cost, Desafio 21D) e por intensidade (choque ou deload ativo).', 'Use a busca para achar um aluno pelo nome.'] },
  { id: 'perfil-aluno', cat: 'comecar', title: 'O que dá para fazer no perfil do aluno', kw: 'perfil aluno opcoes treino checkin evolucao anotacoes privadas contrato dados contratuais prontuario',
    steps: ['Toque num aluno para abrir as opções dele.', 'Dali você edita o treino, vê check-ins e avaliações, acompanha a evolução física e guarda anotações privadas (só você vê).', 'Também ficam os dados do contrato: valor, vencimento e tipo.'] },
  { id: 'ver-como-aluno', cat: 'comecar', title: 'Ver o app como o aluno vê', kw: 'visualizar como aluno teste ver app aluno modo aluno voltar painel',
    steps: ['Vá em SISTEMA e toque em "Visualizar como Aluno Teste".', 'Você navega exatamente como o aluno.', 'Para voltar ao painel de coach, toque no botão vermelho que aparece na tela inicial do modo aluno.'] },
  { id: 'assistente', cat: 'comecar', title: 'Usar o Assistente (perguntas rápidas e como fazer)', kw: 'assistente robo perguntas rapidas voz perguntar ajuda duvida consulta categorias como fazer',
    steps: ['Toque no botão do Assistente na tela do coach.', 'Em "Meus alunos" estão as perguntas rápidas por categoria (Hoje, Alunos, Finanças, Treinos, Dieta, Avaliações...): um toque e a resposta aparece na hora, sem IA.', 'Em "Como fazer" ficam estes guias; digite a dúvida na busca ou escolha uma categoria.', 'Se a pergunta livre por voz estiver liberada para você, o microfone entende perguntas faladas.', 'O Assistente só consulta: nunca altera nada nos seus dados.'] },

  // ───────── Treinos ─────────
  { id: 'montar-treino', cat: 'treinos', needs: 'treino', title: 'Montar o treino de um aluno', kw: 'montar treino criar treino ficha exercicios series repeticoes descanso biblioteca editor modo avancado biblioteca fixa computador',
    steps: ['Abra o aluno e toque em "Montar Treino".', 'Escolha os exercícios na biblioteca (filtre por ambiente/academia, grupo muscular e subgrupo).', 'Defina séries, repetições, descanso e técnica de cada exercício.', 'O treino aparece na hora no app do aluno.', 'No computador, o botão MODO deixa a Biblioteca fixa ao lado do treino (modo avançado), com troca de exercício direto nela.'],
    tip: 'Use Templates para reaproveitar estruturas que você já montou.' },
  { id: 'templates', cat: 'treinos', needs: 'treino', title: 'Criar e usar templates de treino', kw: 'template modelo treino reutilizar salvar colecao importar',
    steps: ['Vá em SISTEMA → Treino e Dieta → Meus Templates.', 'Crie um template com a estrutura que você usa com frequência.', 'Ao montar o treino de um aluno, importe o template e personalize.'] },
  { id: 'tecnicas', cat: 'treinos', needs: 'treino', title: 'Técnicas avançadas, Bi-set e Tri-set', kw: 'tecnica avancada drop set rest pause bi set biset tri set triset agrupar 1,5 combinar',
    steps: ['No exercício, o botão TÉCNICA define a técnica do próprio exercício (drop-set, rest-pause, 1 e meio...).', 'O botão AGRUPAR liga exercícios em Bi-set ou Tri-set.', 'Dá para combinar as duas: exemplo, cadeira extensora com 1 e meio dentro de um Bi-set com o RDL.', 'O aluno vê as instruções da técnica no app, e o grupo aparece junto.'] },
  { id: 'periodizacao', cat: 'treinos', needs: 'treino', title: 'Semana de choque e deload', kw: 'periodizacao deload choque semana de choque reduzir intensidade recuperacao pesos',
    steps: ['Nas opções do aluno, ative Semana de Choque (mais intensidade) ou Deload (menos intensidade, recuperação).', 'O sistema ajusta os pesos sozinho durante o período.', 'No painel de alunos dá para filtrar quem está em choque ou deload.'] },
  { id: 'deload-menstrual', cat: 'treinos', needs: 'treino', title: 'Deload menstrual (aluna)', kw: 'deload menstrual menstruacao aluna periodo ciclo',
    steps: ['A própria aluna ativa o Deload Menstrual no app dela quando estiver no período.', 'O treino é ajustado sozinho para menor intensidade.', 'No seu painel aparece "Deload Ativo / Menstrual". Você não precisa fazer nada.'] },
  { id: 'aparelho', cat: 'treinos', needs: 'treino', title: 'Aluno avisou que não tem o aparelho', kw: 'aparelho indisponivel nao tem maquina academia trocar exercicio substituto',
    steps: ['O aluno avisa, pelo botão do exercício no app, que não tem aquele aparelho.', 'O aviso vira uma pendência na central HOJE (aba AGENDA) e aparece no Assistente em Treinos → "Aparelho que não tem".', 'Toque na pendência: o editor abre direto no exercício.', 'Use "Trocar exercício" ou "Adicionar opção de troca"; a Biblioteca já abre na categoria e no subgrupo do exercício.'] },
  { id: 'carga', cat: 'treinos', needs: 'treino', title: 'Carga TOTAL ou CADA LADO e sugestão de carga', kw: 'carga total cada lado halter peso sugestao de carga hoje tente quilos kg progressao',
    steps: ['O aluno registra a CARGA escolhendo TOTAL ou CADA LADO; o histórico e a evolução já entendem a diferença.', 'A sugestão de carga ("Hoje tente X kg") aparece no treino do aluno a partir do que ele fez antes e de como foi.', 'Nas opções do aluno você desliga a sugestão ou escolhe o salto em kg.'] },
  { id: 'corrida', cat: 'treinos', needs: 'treino', title: 'Protocolo de corrida (5K, 10K, 21K, 42K)', kw: 'corrida protocolo 5k 10k 21k 42k meia maratona maratona corredor cronometro',
    steps: ['Abra o aluno e entre na Corrida (o protocolo de corrida aparece quando a equipe PA Elite liberou para a sua conta).', 'Use "Sugerir protocolo" (regras automáticas; no time master a IA também ajuda) e confira antes de ativar.', 'Escolha o tipo, a semana de entrada e os dias de treino da aluna.', 'Acompanhe o andamento: semana, treinos feitos, esforço e última corrida. Use LIBERAR PRÓXIMA, REPETIR SEMANA ou IR PARA A SEMANA N.', 'AJUSTAR muda recados e velocidades sem zerar o andamento; COMEÇAR PROTOCOLO NOVO recomeça do zero.'] },
  { id: 'ia-treino', cat: 'treinos', needs: 'treino', title: 'Montar o treino com IA (e como pedir um treino bom)', kw: 'ia inteligencia artificial gerar treino protocolo elite montar automatico limite mes anamnese rascunho',
    steps: ['O botão "Protocolo ELITE" aparece nas Ferramentas do aluno quando a equipe PA Elite liberou a IA para a sua conta. Sem ele, monte à mão ou por voz.', 'Antes de gerar, olhe o cartão "ANTES DE GERAR": ele mostra quantos treinos por IA ainda restam no mês e o que precisa ser resolvido (em vermelho) ou conferido (em amarelo).', 'Sem anamnese do aluno (peso, altura, objetivo, nível), a IA não gera. Peça para ele preencher ou preencha por ele.', 'Escolha o local de treino, os dias e os grupos musculares. Quanto mais certo o pedido, melhor o treino.', 'A IA monta um RASCUNHO: leia dia por dia, troque o que não servir e só então salve. Aluno com dor, lesão ou cirurgia pede conferência exercício por exercício.'],
    tip: 'O limite é mensal e volta a liberar no dia 1. Geração que falha não conta.' },
  { id: 'cardio', cat: 'treinos', needs: 'treino', title: 'Cardio guiado com fases e intervalos', kw: 'cardio hiit intervalado fases equipamento esteira bicicleta cronometro guiado kcal',
    steps: ['No Montar Treino, adicione o cardio e defina o modo (contínuo ou intervalado), as fases e o equipamento.', 'O aluno usa um cronômetro guiado de intervalos e registra o que realmente fez.'] },

  // ───────── Dieta ─────────
  { id: 'montar-dieta', cat: 'dieta', needs: 'dieta', title: 'Montar a dieta de um aluno', kw: 'montar dieta criar dieta refeicoes alimentos taco ibge macros kcal plano alimentar substituto',
    steps: ['Abra o aluno e entre na dieta.', 'Adicione as refeições e busque os alimentos (abas TACO, IBGE, FAVORITOS e DO ALUNO).', 'O resumo de macros fica fixo no alto; alergias e restrições do aluno aparecem avisadas.', 'No computador, o botão MODO deixa os Alimentos fixos ao lado das refeições.', 'Para trocas, use "Adicionar substituto": o app mostra a quantidade que iguala as kcal do alimento base.'] },
  { id: 'feedback-dieta', cat: 'dieta', needs: 'dieta', title: 'Feedbacks de dieta do aluno', kw: 'feedback dieta saciedade dificuldade pedido de mudanca resposta aluno',
    steps: ['O aluno envia feedback sobre a dieta (saciedade, dificuldade, pedidos de mudança).', 'Eles aparecem no FEED e no Assistente em Dieta → "Feedbacks de dieta".', 'Responda pelo app: a resposta chega ao aluno com aviso.'] },
  { id: 'ia-dieta', cat: 'dieta', needs: 'dieta', title: 'Montar a dieta com IA (e como pedir uma dieta boa)', kw: 'ia inteligencia artificial gerar dieta montar automatico limite mes anamnese rascunho macros',
    steps: ['O botão "GERAR COM IA" aparece na dieta do aluno quando a equipe PA Elite liberou a IA para a sua conta. Sem ele, monte à mão ou por voz.', 'No cartão "ANTES DE GERAR" veja o saldo do mês (cada aba de dieta gerada gasta 1) e o que precisa ser resolvido.', 'As calorias e os macros saem do peso, da altura e do objetivo da anamnese. Se estiverem errados, a dieta toda erra: corrija antes.', 'Gere uma aba por vez (dia de treino, dia de descanso), confira e só depois gere a próxima.', 'A IA monta um RASCUNHO: revise calorias, macros e cada refeição, troque o que o aluno não come e só então envie. Aluno com condição de saúde, remédio ou cirurgia pede revisão completa.'],
    tip: 'O limite é mensal e volta a liberar no dia 1.' },

  // ───────── Avaliações ─────────
  { id: 'checkin', cat: 'avaliacoes', title: 'Check-in com fotos de evolução', kw: 'checkin check in fotos evolucao avaliacao data proximo checkin aluno envia comparar',
    steps: ['Defina a data do próximo check-in nas opções do aluno.', 'O aluno recebe o lembrete e envia as fotos pelo app: você não precisa receber nada pelo WhatsApp.', 'As fotos ficam organizadas por data para comparação.', 'Para ver: painel → aba AVALIAÇÕES.'] },
  { id: 'avaliacao-ia', cat: 'avaliacoes', title: 'Gerar a avaliação do check-in com IA', kw: 'avaliacao ia gerar com ia inteligencia artificial texto avaliar fotos assinatura',
    steps: ['Abra o check-in do aluno e toque em "Gerar com IA".', 'A IA analisa as fotos e escreve a avaliação; você pode editar antes de enviar.', 'O aluno recebe a avaliação no app com notificação, assinada com o seu nome.'] },
  { id: 'minha-ia', cat: 'avaliacoes', title: 'Personalizar como a IA escreve (Minha IA)', kw: 'minha ia personalizar avaliacao avaliacoes prompt estilo tom junto ao base substituir instrucao',
    steps: ['Vá em SISTEMA → Minha IA.', 'Modo "Junto ao base": sua instrução se soma ao padrão da plataforma. Modo "Substituir base": só a sua instrução vale (escreva completa).', 'Exemplo: "Use um tom motivacional e foque no abdômen." A assinatura com seu nome é sempre incluída.'] },
  { id: 'feedback-semana', cat: 'avaliacoes', title: 'Feedback da semana: responder e cobrar', kw: 'feedback da semana semanal responder cobrar nao responderam respostas rapidas atalhos adesao',
    steps: ['Abra o Feedback da semana (também aparece na central HOJE e no Assistente em Avaliações).', 'Toque no aluno e responda: há respostas rápidas editáveis, e responder já conta como contato com o aluno.', 'Cobre quem não respondeu, um a um ou em massa (pede confirmação).', 'No computador a lista e o detalhe ficam lado a lado, com atalhos de teclado (tecla ? mostra todos). O gráfico mostra a adesão das últimas semanas.'] },
  { id: 'relatorio-mes', cat: 'avaliacoes', title: 'Relatório do mês do aluno', kw: 'relatorio do mes mensal story pdf resultados treinos recordes evolucao compartilhar',
    steps: ['No aluno, toque em "Relatório do Mês" para ver treinos, volume, recordes, músculos, cardio, dieta e corpo.', 'Dá para exportar em PDF e em Story com a sua marca.', 'Para o aluno ver o relatório dele, libere por aluno (interruptor do coach). Disponível quando o recurso estiver liberado na sua versão.'] },

  // ───────── Agenda ─────────
  { id: 'agenda', cat: 'agenda', title: 'Marcar atendimento na agenda (e repetir toda semana)', kw: 'agenda marcar horario atendimento compromisso serie semanal personal videochamada meet google remarcar presenca',
    steps: ['Abra a aba AGENDA (HOJE, DIA e SEMANA).', 'Crie o compromisso: presencial, videochamada, avaliação, bloco de tempo, indisponível ou lembrete; escolha a pessoa, hora, duração e local.', 'Para repetir (ex.: seg/qua/sex às 07:00), crie uma série; dá para alterar só um dia ou "este e os próximos".', 'Se já existir algo no horário, o app avisa quem é e pergunta se quer marcar mesmo assim.', 'Videochamada: cole o seu link do Google Meet nos ajustes (⚙) da agenda; o botão ENTRAR NO MEET aparece para você e para o aluno.'],
    tip: 'Você recebe push 30 min antes e um resumo do dia às 7h; o aluno, 2 h antes (nunca de madrugada).' },
  { id: 'central-hoje', cat: 'agenda', title: 'Central HOJE: pendências automáticas', kw: 'central hoje pendencias pendencia resolver resolvido avisar o aluno adiar anotar tarefas do dia',
    steps: ['Na aba AGENDA → HOJE, o app lista sozinho o que precisa de você: presença por marcar, pedidos de remarcar, feedbacks e observações sem resposta, avaliações, treinos vencendo, cobranças, aparelho que falta, vídeos e testes grátis.', 'Toque numa pendência para ir direto ao assunto.', 'A pendência some quando você resolve; também dá para adiar, marcar RESOLVIDO (aba Resolvidas), AVISAR O ALUNO ou anotar por que ainda está aberta.', 'No Assistente, "O que tenho hoje?" resume tudo isso.'] },

  // ───────── Finanças ─────────
  { id: 'financeiro', cat: 'financeiro', title: 'Gestão financeira dos alunos', kw: 'financeiro gestao financeira contrato valor vencimento cobranca atrasado em dia offline asaas pix boleto mensalidade',
    steps: ['Cadastre o valor do contrato, o vencimento e o tipo de cada aluno (também clientes que pagam fora do sistema).', 'A aba FINANÇAS mostra quem está em dia, atrasado ou perto de vencer.', 'Com o Asaas configurado, as cobranças saem por PIX e boleto.', 'No Assistente, Finanças mostra cobranças vencendo e atrasadas.'],
    tip: 'No app do iPhone o financeiro é só controle (sem gerar cobrança); cobrança e saque ficam na versão web e no Android.' },
  { id: 'paguei', cat: 'financeiro', title: 'Aluno avisou que já pagou', kw: 'ja paguei paguei pagou pagaram pago pagar pagamento informado confirmar recusar comprovante baixa',
    steps: ['O aviso aparece na central HOJE ("informou que pagou") e no Assistente em Finanças.', 'Abra o financeiro, confira e confirme ou recuse o pagamento.'] },

  // ───────── Comunicação ─────────
  { id: 'avisos', cat: 'comunicacao', title: 'Enviar aviso (push) para os alunos', kw: 'aviso avisos notificacao push enviar aviso todos alunos mensagem comunicado',
    steps: ['Vá em SISTEMA → Sistema e Avisos → Enviar Aviso.', 'Escolha todos os alunos ou um aluno específico e escreva a mensagem.', 'Use para mudanças, motivação e datas importantes.'] },
  { id: 'feed', cat: 'comunicacao', title: 'Feed de atividades', kw: 'feed atividades tempo real treinos concluidos checkins feedbacks acompanhar',
    steps: ['A aba FEED mostra em tempo real o que os alunos fazem: treinos concluídos, check-ins enviados e feedbacks de dieta.'] },
  { id: 'xp', cat: 'comunicacao', needs: 'treino', title: 'Gamificação: XP e ranking', kw: 'xp pontos ranking gamificacao engajamento consistencia',
    steps: ['Os alunos ganham XP ao completar treinos.', 'O ranking fica em SISTEMA → Treino e Dieta e ajuda no engajamento e na consistência.'] },

  // ───────── Marca e vendas ─────────
  { id: 'minha-marca', cat: 'marca', title: 'Colocar a sua marca (logo)', kw: 'minha marca logo logomarca white label personalizar aparencia cor',
    steps: ['Vá em SISTEMA → Minha Marca e envie a sua logomarca.', 'Ela aparece no app dos seus alunos e no seu painel.'] },
  { id: 'pagina-vendas', cat: 'marca', title: 'Página de vendas para captar alunos', kw: 'pagina de vendas vender planos depoimentos antes depois bio video link captar convite',
    steps: ['Vá em SISTEMA → Vendas.', 'Adicione foto, bio e vídeo de apresentação; fotos de antes e depois; depoimentos.', 'Configure seus planos com valores e links de pagamento.', 'Use o botão "Ver minha página" para conferir como o cliente vê.'] },
  { id: 'elite-flix', cat: 'marca', title: 'Biblioteca de conteúdo (ELITE FLIX)', kw: 'elite flix conteudo videos pdf audio aulas vip biblioteca conteudos alunos',
    steps: ['Vá em SISTEMA → Sistema e Avisos → Elite Flix Admin.', 'Adicione vídeos, PDFs e áudios (aulas, tutoriais, guias de alimentação).', 'Dá para marcar um conteúdo como VIP (acesso restrito).'] },

  // ───────── Recursos especiais ─────────
  { id: 'link-treino', cat: 'recursos', needs: 'treino', title: 'Link do treino e Treino avulso', kw: 'link treino treino avulso pagina whatsapp compartilhar link validade 24 horas cliente sem app pdf assistir execucao',
    steps: ['No treino do aluno, gere o Link Treino: o treino inteiro numa página (séries, descanso, técnicas com vídeo), sem app nem login.', 'Para quem não é aluno, use SISTEMA → Treino e Dieta → Treino avulso (aparece quando a equipe PA Elite liberou para a sua conta): monte do zero ou importe de uma base ou de um aluno e gere o link (validade padrão 24 h; também 48 h, 7 dias, 30 dias ou sem validade).', 'O WhatsApp já sai com a mensagem pronta; é possível renovar o link e receber aviso no celular quando abrirem ou concluírem.', 'O PDF do treino tem o botão ▶ ASSISTIR EXECUÇÃO.'] },
  { id: 'notas-voz', cat: 'recursos', title: 'Notas por voz sobre o aluno', kw: 'notas por voz anotacao anotar voz microfone falar tarefa diario prontuario',
    steps: ['Toque no microfone na tela do coach e fale (ex.: "o Samuel sentiu as costas no agachamento").', 'Toque em ORGANIZAR: o app separa aluno, assunto, prazo e texto.', 'Confira tudo e toque em SALVAR: nada é salvo antes disso.', '"Me cobrar" vira tarefa na central HOJE; "só registrar" fica no diário do aluno (Prontuário).'],
    tip: 'Disponível na web e no Android, para quem tem o recurso liberado.' },
  { id: 'video-execucao', cat: 'recursos', needs: 'treino', title: 'Vídeo de execução do aluno', kw: 'video de execucao aluno grava video exercicio corrigir feedback resposta marcacao desenho',
    steps: ['O coach libera o envio de vídeo por aluno (ou pede um vídeo de um exercício).', 'O aluno grava um vídeo curto no exercício e envia.', 'O vídeo vira pendência na central HOJE. Responda com comentário no instante do vídeo, desenho, vídeo-resposta ou exercício de referência.', 'Os vídeos são apagados após 90 dias.'],
    tip: 'Disponível na web e no Android, para quem tem o recurso liberado.' },

  // ───────── Time master ─────────
  { id: 'recursos-por-coach', cat: 'master', master: true, title: 'Liberar recursos especiais por coach', kw: 'recursos por coach liberar chave geral fundador video execucao notas voz perguntas livres ia ferramentas',
    steps: ['Vá em Ferramentas → RECURSOS POR COACH.', 'A chave geral libera para todos os coaches; os interruptores de cada coach liberam só para ele.', 'Fundadores recebem vídeo de execução e notas por voz sozinhos; os demais (perguntas livres por voz, treino avulso, montar treino por IA, montar dieta por IA e protocolo de corrida) só você libera, coach a coach. A IA de treino e de dieta tem limite mensal por coach.', 'Coach com acesso bloqueado, atrasado ou cancelado perde os recursos na hora e não volta sozinho ao renovar.'] },
  { id: 'perguntas-coaches', cat: 'master', master: true, title: 'Perguntar sobre os coaches da plataforma', kw: 'coaches coach perguntas master visao geral cadastros aprovar atraso alunos por coach novos fundadores vagas',
    steps: ['No Assistente, abra a categoria Coaches (só aparece para você e a Adri).', 'Botões: visão geral, cadastros para aprovar, coaches em atraso ou vencendo, alunos por coach, coaches novos e vagas de Fundador.', 'Pela voz ou texto: "resumo da coach Camila" mostra a situação de uma coach.', 'No iPhone, as perguntas de mensalidade dos coaches ficam ocultas.'] },
  { id: 'teste-gratis', cat: 'master', master: true, title: 'Teste grátis pelo Treino avulso', kw: 'teste gratis trial link de teste whatsapp carrossel resultado do teste lead',
    steps: ['Em Treino avulso → no treino → LINKS, ligue "Link de teste grátis" (validade de 7 dias e avisos já marcados).', 'Quem abre vê a faixa do teste, o carrossel do acompanhamento e o botão do WhatsApp; ao terminar, vê "Seu teste grátis terminou".', 'Depois, o Resultado do teste mostra o que a pessoa fez, para a conversa de fechar a consultoria.', 'Só Paulo e Adri criam teste grátis; nunca aparece no iPhone.'] },
];

// ───────── regras de acesso ─────────
export type GuideViewer = { master: boolean; plan: string | null | undefined };
export function guideVisible(g: Guide, v: GuideViewer): boolean {
  if (g.master && !v.master) return false;
  if (v.master) return true;
  const plan = String(v.plan || 'ELITE').toUpperCase();
  if (g.needs === 'dieta' && plan === 'PERSONAL') return false;
  if (g.needs === 'treino' && plan === 'NUTRICIONISTA') return false;
  return true;
}
export const guidesFor = (v: GuideViewer): Guide[] => GUIDES.filter((g) => guideVisible(g, v));
export const categoriesFor = (v: GuideViewer): (GuideCategory & { guides: Guide[] })[] => {
  const list = guidesFor(v);
  return GUIDE_CATEGORIES.filter((c) => !c.master || v.master).map((c) => ({ ...c, guides: list.filter((g) => g.cat === c.id) })).filter((c) => c.guides.length > 0);
};

// ───────── busca por palavras (sem IA) ─────────
const norm = (s: string) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
const STOP = new Set(['como', 'faco', 'fazer', 'para', 'por', 'que', 'uma', 'um', 'uns', 'umas', 'com', 'sem', 'dos', 'das', 'nos', 'nas', 'meu', 'minha', 'meus', 'minhas', 'qual', 'quais', 'onde', 'fica', 'posso', 'pode', 'preciso', 'quero', 'ver', 'dar', 'esta', 'esse', 'essa', 'isso', 'aqui', 'app', 'aplicativo', 'tem', 'ter', 'sobre', 'tela', 'funciona', 'funcao', 'usar', 'uso', 'aluno', 'alunos', 'aluna', 'alunas']);
const stem = (w: string) => (w.length > 5 ? w.replace(/(oes|ao|es|s)$/, '') : w.replace(/s$/, ''));
const toks = (s: string) => norm(s).split(' ').filter((w) => w.length >= 3 && !STOP.has(w)).map(stem);

/** Os guias que melhor respondem ao texto (só os que `v` pode ver). Sem palavra em comum, devolve vazio. */
export function searchGuides(text: string, v: GuideViewer, max = 5): Guide[] {
  const q = [...new Set(toks(text))];
  if (!q.length) return [];
  const scored = guidesFor(v).map((g) => {
    const kw = new Set(toks(g.kw)); const ti = new Set(toks(g.title));
    let s = 0;
    for (const w of q) { if (ti.has(w)) s += 3; else if (kw.has(w)) s += 2; else if ([...kw].some((k) => k.length >= 5 && w.length >= 5 && (k.startsWith(w) || w.startsWith(k)))) s += 1; }
    return { g, s };
  }).filter((x) => x.s >= 2).sort((a, b) => b.s - a.s);
  return scored.slice(0, max).map((x) => x.g);
}

/** O texto que a IA de suporte recebe como "tudo que o app faz" (só o que o coach pode usar). */
export function guidesForPrompt(v: GuideViewer): string {
  return categoriesFor(v).map((c) => `## ${c.label.toUpperCase()}\n` + c.guides.map((g) => `### ${g.title}\n${g.steps.map((s, i) => `${i + 1}. ${s}`).join('\n')}${g.tip ? `\nDica: ${g.tip}` : ''}`).join('\n\n')).join('\n\n');
}

/** O prompt de sistema da IA de suporte ("como fazer"): regras + só os guias que este coach pode usar. */
const SUPPORT_INTRO = `Você é o ELITE Assistant, o assistente oficial de suporte da plataforma ELITE FIT.
Sua única função é explicar como usar as funcionalidades da plataforma para coaches.
Seja didático, prático e direto. Use linguagem simples e amigável. Responda SEMPRE em português brasileiro.
Se a pergunta não for sobre a plataforma, diga educadamente que só pode ajudar com dúvidas sobre o ELITE FIT.
Responda SOMENTE com o que está nos GUIAS abaixo. Nunca invente funcionalidade, tela, botão ou caminho de menu que não esteja neles.
Quando explicar um fluxo, use passos numerados. Use emojis com moderação.
Se a resposta não estiver nos guias, diga: "Não tenho essa informação no momento. Entre em contato com o suporte."
Perguntas sobre os DADOS do coach (quantos alunos, quem está devendo...) você não responde: diga para usar as perguntas rápidas do Assistente.

GUIAS DA PLATAFORMA
`;

export const supportSystemPrompt = (v: GuideViewer) => SUPPORT_INTRO + guidesForPrompt(v);
