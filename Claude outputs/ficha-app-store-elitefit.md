# Ficha da App Store — ELITE FIT

Rascunho pronto pra colar direto nos campos do App Store Connect (App Store → seu app → aba "App Store" → "Informações do App" / "Versão 1.0"). Onde eu não tenho certeza de algo seu (ex: URL de suporte definitiva), deixei uma opção pronta pra usar já e uma nota de ajuste futuro.

---

## Nome do app
```
ELITE FIT
```
(já confirmado disponível — usado ao criar o registro no App Store Connect. Ver nota abaixo sobre por que "Consultoria de Performance" vai no campo de Subtítulo, não aqui.)

## Subtítulo (máx. 30 caracteres)
```
Consultoria de Performance
```
26 caracteres.

> O campo "Nome" do app na Apple tem limite de 30 caracteres — "ELITE FIT - Consultoria de Performance" inteiro (38 caracteres) não cabe nele. Mas a Apple tem exatamente dois campos pra isso: **Nome** (aparece embaixo do ícone) e **Subtítulo** (aparece logo abaixo do nome nos resultados de busca e na página do app). Então na prática o app fica representado como:
> **ELITE FIT**
> *Consultoria de Performance*
> — que é visualmente o "ELITE FIT - Consultoria de Performance" que você quer, só dividido nos dois campos certos (e ainda bate com a descrição que já está no `app.json` do projeto).

## Categoria
- **Principal:** Saúde e Condicionamento Físico (Health & Fitness) — mesma categoria já usada no Google Play
- **Secundária (opcional):** Estilo de Vida (Lifestyle)

## Palavras-chave (máx. 100 caracteres, separadas por vírgula, sem espaço depois da vírgula)
```
treino,dieta,fitness,personal trainer,nutrição,academia,musculação,emagrecimento,IA,consultoria
```
(97 caracteres — cabe. Não repita palavras que já estão no nome/subtítulo, a Apple já indexa por elas.)

## Texto promocional (máx. 170 caracteres — este campo dá pra editar depois, a qualquer momento, sem precisar de nova revisão)
```
Treino e dieta personalizados por IA, acompanhamento direto com seu coach e evolução acompanhada em tempo real. Sua consultoria fitness, no bolso.
```

## Descrição completa (máx. 4000 caracteres)
```
ELITE FIT é o app oficial da consultoria online da PA Elite Team — treino, dieta e acompanhamento profissional direto no seu celular, sem depender de planilha ou papel.

Feito pra quem já treina com um coach (personal trainer ou nutricionista) e quer ter tudo organizado num só lugar: seu plano de treino, sua dieta, sua evolução e a comunicação direta com quem te acompanha.

O QUE VOCÊ ENCONTRA NO APP

• Treinos personalizados — fichas montadas pelo seu coach, com vídeo demonstrativo de cada exercício, histórico de cargas e progressão semana a semana
• Dieta com apoio de Inteligência Artificial — plano alimentar ajustado ao seu objetivo, rotina e preferências, com opções de substituição pra cada refeição
• Check-in diário — registre seu peso, fotos de evolução e sensações do dia, e receba feedback direto do seu coach
• Scanner de Movimento com IA — disponível para alunos do plano Elite: grave a execução de um exercício e receba uma análise biomecânica comparando com o vídeo padrão do seu coach
• Diário alimentar — registre se seguiu a dieta, trocou algo ou teve uma refeição livre, com foto opcional
• Chat com assistente de IA — tire dúvidas rápidas sobre treino e dieta a qualquer hora
• Desafios e conquistas — acompanhe sua sequência de dias treinados e participe de desafios da comunidade
• Biblioteca de conteúdo em vídeo (PA FLIX ou ELITE FLIX, dependendo do seu coach) — vídeos e materiais exclusivos selecionados por ele
• Tudo isso com a sua marca — se você é coach parceiro, seus alunos usam o mesmo app com a identidade visual da sua marca

PRA QUEM É

O ELITE FIT foi criado pra alunos de consultoria fitness (presencial ou online) que já têm um acompanhamento profissional ativo, e também pra personal trainers e nutricionistas que usam a plataforma pra gerenciar seus próprios alunos.

Este app não vende planos de consultoria diretamente — o acesso é liberado pelo seu coach após a contratação do serviço.

Dúvidas ou suporte: acesse pauloadrianoteam.com.br
```
(≈1750 caracteres — bem dentro do limite, dá pra ir ajustando à vontade)

## URL de Suporte
```
https://pauloadrianoteam.com.br
```
(pode trocar depois pra elitefitapp.com.br quando ele estiver no ar — é só metadado, não precisa de build nova)

## URL de Marketing (opcional)
```
https://pauloadrianoteam.com.br
```

## Política de Privacidade
```
https://fitos-final.onrender.com/privacidade
```

## Copyright
```
© 2026 PA ELITE TEAM LTDA
```

---

## Classificação etária (questionário "Classificações Etárias")
O app não tem conteúdo adulto, violência, apostas ou compras de conteúdo digital dentro do app no iOS (isso já é redirecionado pro navegador). Respostas esperadas:
- Conteúdo de terceiros, violência, conteúdo sexual, apostas, drogas/álcool/fumo: **Não**
- **Recursos de redes sociais / conteúdo gerado por usuário**: responda **Não** — o PA FLIX é conteúdo curado pelo coach (vídeos do YouTube escolhidos por ele), não é postagem aberta entre alunos, e não existe feed social ou compartilhamento entre usuários dentro do app
- Compartilhamento de localização em tempo real: **Não**

Resultado esperado: **4+**

## Notas para o revisor da Apple (campo "Notas de Revisão")
```
Conta de revisão (aluno, plano completo com treino e dieta já cadastrados):
E-mail: revisor@elitefitapp.com.br
Senha: [preencher você mesmo ao submeter — não fica salva aqui por segurança]

Este app é usado por alunos de consultoria fitness (treino/dieta) e pelos próprios coaches (personal trainers/nutricionistas) que gerenciam seus alunos. O acesso de aluno é liberado manualmente pelo coach após contratação do serviço — não há cadastro público de "assinatura" dentro do app.

Sobre compras: o app não processa nenhum pagamento dentro do fluxo do iOS. Qualquer tela de compra de conteúdo digital (ebooks/cursos) redireciona o usuário para o navegador (Safari), fora do app, conforme guideline 3.1.1. Isso pode ser conferido na aba "Biblioteca" → botão "Comprar" (abre no navegador) — no iOS não existe opção de pagamento in-app.

O recurso "Scanner de Movimento" usa a câmera pra gravar um vídeo curto (7-10s) do aluno executando um exercício, que é analisado por IA (Google Gemini) e comparado a um vídeo de referência gravado pelo coach — a política de privacidade linkada acima descreve esse uso. Esse recurso é exclusivo dos alunos do plano Elite dos coaches master (nós, os donos da conta) — a conta de revisão acima já é uma conta desse plano, então o recurso já aparece disponível pra testar.
```

---

## Especificações de screenshot exigidas
- iPhone 6.9" (obrigatório): 1290×2796px ou 1320×2868px — pelo menos 3 imagens, recomendado 6-10
- iPhone 6.5" (se quiser cobrir aparelhos mais antigos): 1284×2778px
- iPad 13" (só se `supportsTablet` for ativado depois — hoje está desativado, pode pular)

Sugestão de sequência de telas pra capturar (bate com o que os alunos mais usam):
1. Tela inicial (Home) com resumo do dia
2. Tela de treino do dia com exercício em execução
3. Tela de dieta/refeições do dia
4. Check-in / evolução com fotos
5. Chat com assistente de IA
6. Perfil ou tela de conquistas/desafios

## "Novidades desta versão" (What's New — primeira versão)
```
Primeira versão do ELITE FIT na App Store! Treino, dieta e acompanhamento com seu coach, tudo em um só lugar.
```

---

### O que fazer com isso
1. Abre o app no App Store Connect → aba **App Store** → versão **1.0 Preparar para envio**
2. Cola cada campo acima na seção correspondente (Informações do App tem nome/categoria/URLs; a tela da versão tem descrição/keywords/screenshots/notas de revisão)
3. Sobe os screenshots (posso te ajudar a organizá-los se você me mandar prints das telas)
4. Confere a build enviada (a que já subimos) na seção "Compilação"
5. Só depois disso o botão de "Enviar para Revisão" fica disponível
