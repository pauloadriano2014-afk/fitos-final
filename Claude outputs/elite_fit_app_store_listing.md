# ELITE FIT — Ficha da App Store (rascunho pronto pra colar no App Store Connect)

> Preparado enquanto a verificação de identidade/pagamento da Apple Developer Program está em processamento. Quando a conta ativar, é só criar o app em App Store Connect e colar cada campo abaixo.

---

## ⚠️ Antes de submeter: um ponto de compliance que precisa de decisão

O sistema de **Produtos Digitais (Sistema B)** — venda de ebooks/curso pelo checkout dentro do próprio app (`ProdutoCheckoutScreen.js`, pagamento via Asaas PIX/cartão/boleto) — é exatamente o tipo de fluxo que a Apple costuma rejeitar pela **Guideline 3.1.1 (In-App Purchase)**: conteúdo puramente digital (ebook, curso, área de membros) vendido *dentro do app* precisa passar pela compra dentro do app da Apple (IAP), a não ser que a compra aconteça fora do app.

Isso **não afeta a consultoria em si** (treino/dieta com acompanhamento humano) — isso já está coberto pela Guideline 3.1.3(d), que você já tinha mapeado certo. O risco é específico do checkout de ebook/curso feito com Asaas dentro da tela do app.

Duas saídas possíveis, pra decidir antes de submeter a build iOS:

1. **Esconder esse checkout específico na versão iOS** (ex: `Platform.OS !== 'ios'` envolvendo o botão/tela de compra do Sistema B) e deixar que quem usa iPhone compre pelo link da página de vendas no navegador (`oferta.pauloadrianoteam.com.br` ou similar) em vez de dentro do app. Mais rápido de implementar, zero risco de rejeição.
2. **Implementar Apple In-App Purchase** só pra esses itens puramente digitais. Mais trabalho (precisa cadastrar cada produto como IAP na App Store Connect, código nativo de compra), mas mantém a experiência 100% dentro do app.

Se quiser, converso com você sobre isso com mais calma numa próxima sessão — só não esquece de resolver antes de mandar a build iOS pra revisão, senão o app provavelmente volta rejeitado nessa guideline.

---

## Nome do app
**ELITE FIT**
*(já curto, cabe no limite de 30 caracteres sem precisar cortar)*

## Subtítulo (máx. 30 caracteres)
**Consultoria de Performance**
*(27 caracteres — cabe certinho, e já é a frase que vocês usam no manifest do PWA)*

## Texto promocional (máx. 170 caracteres — pode editar depois sem passar por revisão)
Treino, dieta e acompanhamento com seu coach, tudo em um só lugar. Check-ins, IA de movimento, PA FLIX e sua evolução na palma da mão.

## Descrição completa (máx. 4000 caracteres)

```
ELITE FIT é o app oficial de consultoria online de performance da sua equipe de coaches — o mesmo sistema usado por personal trainers e nutricionistas para acompanhar de perto cada aluno, todos os dias.

Se você é aluno de um coach parceiro ELITE FIT, é por aqui que a consultoria acontece:

TREINO SOB MEDIDA
• Fichas de treino organizadas por dia, com vídeo de execução de cada exercício
• Registro de séries, cargas e RPE em tempo real
• Observações direto pro seu coach durante o treino, com aviso de que ele foi notificado
• Scanner de Movimento com IA: grave um vídeo curto da execução e receba feedback biomecânico

DIETA E NUTRIÇÃO
• Plano alimentar completo com opções de substituição por grupo de alimentos
• Diário alimentar: marque o que seguiu, o que trocou ou registre sua refeição livre com foto
• Opções de refeição livre cadastradas pelo seu próprio coach

EVOLUÇÃO E CHECK-INS
• Envio de fotos de evolução com comparação antes/depois
• Relatório técnico do seu coach a cada check-in
• Gráficos de peso, medidas e composição corporal ao longo do tempo

ACOMPANHAMENTO DE VERDADE
• Chat com assistente de IA pra dúvidas rápidas sobre o app e o treino
• Notificações do seu coach — avisos, respostas e novidades
• Biblioteca de vídeos (PA FLIX) com conteúdo educativo selecionado

GAMIFICAÇÃO
• Sistema de níveis e XP que evolui junto com sua consistência
• Desafios por tempo limitado com ranking entre alunos

O ELITE FIT foi criado pra quem já treina com acompanhamento profissional e quer isso organizado, visual e motivador — sem depender de planilha, papel ou grupo de WhatsApp perdido.

Já é aluno de um coach parceiro ELITE FIT? Baixe o app e entre com os dados que seu coach te passou.

É personal trainer ou nutricionista e quer usar o ELITE FIT com seus próprios alunos? Fale com a gente pelo app na tela de login, opção "Fazer Parte".
```

## Palavras-chave (máx. 100 caracteres, separadas por vírgula, sem espaço extra)
```
treino,dieta,personal trainer,academia,fitness,consultoria,nutricao,check-in,musculacao,coach
```

## Categoria
- **Primária:** Saúde e Fitness (Health & Fitness)
- **Secundária (opcional):** Estilo de Vida (Lifestyle)

## URLs
- **Suporte:** `https://pauloadrianoteam.com.br` (ou uma página de suporte dedicada, se preferir)
- **Marketing (opcional):** `https://pauloadrianoteam.com.br`
- **Política de Privacidade:** `https://fitos-final.onrender.com/privacidade` ← já existe e já está em produção

## Copyright
`2026 PA ELITE TEAM LTDA`

---

## Screenshots — o que preparar (confirmei as medidas atuais direto na documentação da Apple)

Como o app tem `supportsTablet: false`, você **não precisa de screenshot de iPad** — só iPhone.

- **Obrigatório:** tela de 6.9" (a linha do iPhone 16 Pro Max/iPhone 17 Pro Max) — **1260 × 2736 pixels**, retrato. De 3 a 10 imagens.
- Se você mandar essas, a Apple **escala automaticamente** pras outras telas (6.5", 6.3", 6.1") — não precisa gerar um conjunto pra cada tamanho.

Sugestão de telas pra capturar (nessa ordem, pra contar uma história): Home do aluno → Tela de treino em andamento → Diário/registro de dieta → Relatório técnico do check-in → PA FLIX ou Scanner de Movimento com IA.

Sem alpha/transparência no PNG, e sem mockup de moldura de iPhone dentro da própria imagem (a Apple já mostra dentro da moldura na loja).

---

## Classificação etária
Isso é um formulário de perguntas dentro do App Store Connect (violência, conteúdo sexual, jogos de azar simulado, etc.) — como o ELITE FIT não tem nada disso, a tendência é sair como **4+**. Preencha honestamente pergunta por pergunta na hora; não dá pra eu prever o resultado exato sem ver o questionário atual deles.

## Notas para o revisor da Apple (App Review Information)
Preencha com a conta de revisão que vocês já criaram:

```
E-mail: revisor@elitefitapp.com.br
Senha: [preencher — está no script prisma/seed-review-account.ts]

Essa conta já vem com plano ELITE, treino e dieta atribuídos, pronta pra explorar
a experiência do aluno sem precisar de nenhum cadastro adicional.
```

Se o revisor pedir acesso à visão do coach/admin também, me avisa que a gente decide como liberar isso com segurança na hora.

---

*Assim que sua conta Apple Developer for aprovada, me chama que a gente parte pro registro do App ID, criação do app em App Store Connect e o primeiro build iOS via EAS.*
