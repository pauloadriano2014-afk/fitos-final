# Resposta pra Apple — Guideline 2.1 (App Review)

## ✅ O que você precisa fazer, na ordem

1. **Gravar o vídeo** no iPhone físico (roteiro completo abaixo, com 4 partes e 4 contas diferentes).
2. **Colar o texto em inglês** (a partir de "---INÍCIO---" mais abaixo) em **dois lugares** no App Store Connect:
   - Na caixa de resposta do **Resolution Center** (Revisão de apps → essa mensagem) — anexando o vídeo junto.
   - No campo **Notes** de **App Review Information** (App Information → App Review Information), pra não te perguntarem de novo nas próximas versões.
3. **Reenviar o build** pra revisão depois de responder.

Isso é tudo — as 4 contas de teste já estão criadas e ativas em produção, você não precisa configurar nada no banco.

---

## 🎥 Roteiro de gravação (4 partes, 4 contas)

Grave tudo num iPhone físico (não simulador). Pode ser em um vídeo só, cortando entre logins, ou em vídeos separados — a Apple aceita os dois formatos, desde que fique claro o que é cada trecho.

### Parte 1 — Tour do Aluno
Conta: `revisor@elitefitapp.com.br` / `RevisorEliteFit2026!` **(não excluir esta)**

1. Abrir o app do zero (mostrar a splash) → tela de Login.
2. Logar com essa conta.
3. Mostrar a Home do aluno.
4. Abrir o treino do dia (mostrar os exercícios, registrar uma série).
5. Abrir a dieta do dia (mostrar as refeições).
6. Fazer um check-in diário (foto + peso) — é o trecho de "acesso a conteúdo/recurso pago" que a Apple pediu.
7. Abrir o assistente de IA (o único chat imediato dentro do app — o "falar com o coach" de verdade abre o WhatsApp, então não use esse botão na gravação) e mandar uma mensagem.
8. Abrir a tela de assinatura/pagamento (mostrar plano e forma de pagamento).

### Parte 2 — Exclusão de conta (lado Aluno)
Conta: `gravacao.exclusao@elitefitapp.com.br` / `GravacaoExclusao2026!` **(pode excluir de verdade, é descartável)**

1. Logar com essa conta.
2. Ir em Configurações → Excluir conta.
3. Mostrar o fluxo completo até o fim (confirmação, volta pra tela de Login).

### Parte 3 — Tour do Coach
Conta: `coach.revisor@elitefitapp.com.br` / `RevisorEliteFitCoach2026!` **(não excluir esta)**

1. Logar com essa conta.
2. Mostrar a lista de alunos (vai aparecer "Aluno Demonstração (Revisão)").
3. Abrir esse aluno e mostrar o treino e a dieta já montados pra ele.
4. Mostrar a revisão do check-in desse aluno (não tem um "chat" propriamente do lado coach além do assistente de IA — a comunicação com o aluno acontece pelo WhatsApp, então não precisa mostrar isso na gravação).

### Parte 4 — Exclusão de conta (lado Coach)
Conta: `gravacao.exclusao.coach@elitefitapp.com.br` / `GravacaoExclusaoCoach2026!` **(pode excluir de verdade, é descartável)**

1. Logar com essa conta.
2. Ir em Configurações → Excluir conta.
3. Mostrar o fluxo completo até o fim.

⚠️ **Importante sobre essa Parte 4**: essa conta foi criada sem nenhum aluno vinculado de propósito. Um coach com aluno ativo não exclui a conta na hora — vira um pedido pendente (você/Adri são avisados e precisam confirmar depois). Por isso essa conta específica (sem aluno) é a única que mostra a exclusão de Coach terminando completa na gravação, sem cair nesse fluxo de pedido. **Não tente gravar esse passo com a `coach.revisor@elitefitapp.com.br`** — ela tem aluno vinculado e só vai mostrar a mensagem de "pedido enviado".

---

## 📋 Texto pra colar no Resolution Center e no campo Notes

Escrevi em inglês porque é o idioma que o time de revisão usa — isso acelera a análise.

---INÍCIO---

**1. App purpose and target audience**

ELITE FIT is a private coaching platform used by independent personal trainers and nutrition coaches ("coaches") to remotely manage their own paying clients ("students"). Coaches build and assign personalized workout and nutrition plans (optionally AI-assisted), review students' daily check-ins and progress photos, reach out to students via an integrated WhatsApp shortcut, and manage billing for their coaching services. Students use the same app to view their assigned workout and diet, log daily check-ins, and manage their subscription payment. Both coaches and students also have access to an in-app AI assistant chat for instant guidance and questions.

Target audience: personal trainers and nutrition coaches running an online coaching business in Brazil, and the fitness students who pay for their coaching. This is not a public social network or open marketplace — every account is tied to a real, existing coaching relationship. There is no public user-generated content and no public-facing social feed; all chat and content sharing happens privately between a coach and their own students, so no content-reporting/blocking mechanism applies.

**2. Setup and access instructions**

No special setup is needed. Launch the app and sign in on the Login screen. ELITE FIT has two account types — Coach and Student — so we are providing one demo login for each, per the "Prevent Common Issues" guidance.

Demo account (Student):
- Email: revisor@elitefitapp.com.br
- Password: RevisorEliteFit2026!

This account already has a sample workout plan and two sample diet plans assigned, so every core student-facing feature is reachable immediately, with no empty screens. It can log in, view its assigned workout and diet, submit a daily check-in with a photo, use the in-app AI assistant chat, and view the subscription/billing screen.

Demo account (Coach):
- Email: coach.revisor@elitefitapp.com.br
- Password: RevisorEliteFitCoach2026!

This account already has one demo student ("Aluno Demonstração") assigned to it, with a full sample workout plan and two sample diet plans already built, so the coach-side features (student roster, workout/diet builder, check-in review, AI assistant) are reachable immediately as well.

Both account-deletion flows (Student and Coach) are demonstrated in the attached screen recording using two separate, disposable test accounts, so the two demo accounts above remain available for future review cycles.

**3. External services, tools and platforms used**

- Hosting / application server: Render
- Database: Neon (managed PostgreSQL)
- Media storage: Cloudflare R2 (photos) and Cloudflare Stream (videos)
- Payment processor: Asaas (Brazilian payment gateway — Pix, credit card, boleto)
- Transactional email: Resend
- AI services (server-side only, used to generate personalized workout/diet suggestions and to evaluate check-in photos/exercise-form videos): Anthropic Claude, OpenAI, Google Gemini. End users never call these APIs directly and no API key is ever exposed on the client.
- Push notifications: Apple Push Notification service via Expo, and Web Push for the PWA version

**4. Regional differences**

The app is built specifically for the Brazilian market: the interface is Brazilian Portuguese only, all pricing is in BRL, and the payment processor (Asaas) only operates in Brazil. Outside of that scope, the app behaves identically for every user — there is no feature or content variation by region.

**5. Regulated industry / protected third-party material**

ELITE FIT is a fitness and nutrition coaching tool, not a medical or healthcare product — it does not provide medical diagnosis, treatment, or advice, and operates outside any regulated health-industry category. All workout, diet and video content is authored by the coach for their own clients (or generated for that specific coach's use); the app does not include or distribute any licensed or protected third-party material.

---FIM---

---

## 🔑 Resumo das 4 contas

| Conta | E-mail | Senha | Uso | Pode excluir? |
|---|---|---|---|---|
| Aluno (permanente) | revisor@elitefitapp.com.br | RevisorEliteFit2026! | Tour do aluno + vai no texto pra Apple | ❌ Não |
| Coach (permanente) | coach.revisor@elitefitapp.com.br | RevisorEliteFitCoach2026! | Tour do coach + vai no texto pra Apple | ❌ Não |
| Aluno (descartável) | gravacao.exclusao@elitefitapp.com.br | GravacaoExclusao2026! | Só pra gravar a exclusão (lado aluno) | ✅ Sim |
| Coach (descartável) | gravacao.exclusao.coach@elitefitapp.com.br | GravacaoExclusaoCoach2026! | Só pra gravar a exclusão (lado coach) | ✅ Sim |

## 🛠️ Manutenção (opcional, não bloqueia o envio)

Em anexo está o `seed-review-coach-account.ts` — mesma lógica do `seed-review-account.ts` que você já tinha, só que pra recriar acesso (senha/status) da conta de Coach permanente se um dia precisar. Coloque em `prisma/` no repo do backend. Rodar de novo no futuro não mexe no treino/dieta já existentes.
