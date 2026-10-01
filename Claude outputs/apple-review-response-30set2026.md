# Resposta pra Apple — 2ª rejeição (30 set 2026, atualizado 1 out)

> ⚠️ **Antes de enviar:** o texto abaixo já reflete a versão mais recente do fix — no iOS, escolher um plano agora abre o **navegador** pra `elitefitapp.com.br/seja-coach`, não mais o WhatsApp. Confirme que esse domínio já está com DNS propagado e certificado SSL válido (teste o link no celular) antes de submeter a build nova. Se não estiver pronto a tempo, me avisa que eu troco pra `pauloadrianoteam.com.br` (já no ar) nesse texto e no código, sem travar a submissão.

## 1) Mensagem curta pra responder na thread do App Store Connect

Cole isso como reply direto à mensagem da Apple:

```
Hello,

Thank you for the detailed feedback. Both issues have been addressed in the
new build we're submitting.

Guideline 2.1 — Demo account with expired subscription
We've added a dedicated demo Coach account whose subscription is already
expired, so the entire purchase/paywall flow is reachable immediately:

  Email: coach.elite@elitefitapp.com.br
  Password: EliteFitReview2026!

Logging in with this account lands directly on the "access suspended"
screen (subscription expired), which is the exact screen described in your
request. We've also updated the Notes field in App Review Information with
this account and with credentials for the two other coach plan tiers
(Personal and Nutricionista), also with expired subscriptions, in case you
want to confirm the behavior is consistent across all three plans.

Guideline 3.1.1 — In-App Purchase
We removed the non-Apple payment flow for coach subscriptions from the iOS
build entirely. Coaches can no longer purchase, renew, or set up automatic
billing for their Personal/Elite/Nutricionista subscription from inside the
iOS app by any means:

- The plan-selection screen now only presents information about each plan
  (features, pricing). Tapping a plan opens the device's browser to the
  same screen published as a web page at elitefitapp.com.br/seja-coach —
  there is no checkout, payment link, or purchase button of any kind
  inside the iOS app itself. This mirrors the pattern already approved for
  our digital-content purchase flow (see ProdutoCheckoutScreen equivalent,
  Guideline 3.1.1, resolved in a previous review).
- The "access suspended" / expired-subscription screen and the coach's own
  subscription-status panel no longer show any "Pay now" or "Enable
  automatic payment" button on iOS — only account status and a "Contact
  support" WhatsApp button (for account-status questions, not for
  purchasing).
- All non-billing coach features (student roster, workout/diet builder,
  check-in review, AI assistant, etc.) remain fully available on iOS —
  only the ability to pay/renew from inside the app was removed.
- This mirrors the pattern already approved for our digital-content
  purchase flow in a previous review (Guideline 3.1.1): choosing a plan
  opens the device's browser to the same screen published as a web page
  (elitefitapp.com.br/seja-coach), never a payment flow inside the app.
  Subscribing or renewing outside the app (our website or the Android
  version) is unaffected — coach subscriptions are a B2B software-access
  plan for independent personal trainers/nutritionists, not consumer
  digital content, and no ELITE FIT subscription is offered anywhere
  inside the iOS app.

You can verify this end-to-end by logging in with the expired-subscription
coach account above — you'll land directly on the suspended-access screen,
which only offers "Check payment status" and "Contact support via
WhatsApp", with no purchase option.

Please let us know if anything else is needed.
```

---

## 2) Texto atualizado pro campo "Notes" da App Review Information

(mesma estrutura do texto anterior — só a seção 2 ganhou as contas novas, e entrou uma seção nova explicando o fix do 3.1.1)

```
Demo video: https://drive.google.com/file/d/1WH5tQ_FKIZDg1XsYLlde-UzEie2ihvR8/view?usp=sharing

1. App purpose and target audience

ELITE FIT is a private coaching platform for independent personal trainers and nutrition coaches ("coaches") to remotely manage their own paying clients ("students"). Coaches build personalized workout and nutrition plans (optionally AI-assisted), review students' daily check-ins and progress photos, reach students via an integrated WhatsApp shortcut, and manage billing. Students view their assigned workout and diet, log daily check-ins, and manage their subscription payment. Both roles also have an in-app AI assistant chat for instant guidance.

Target audience: personal trainers and nutrition coaches running an online coaching business in Brazil, and the fitness students who pay for their coaching. This is not a public social network or open marketplace — every account is tied to a real, existing coaching relationship. There is no public user-generated content or public-facing feed; all chat and content sharing happens privately between a coach and their own students, so no content-reporting/blocking mechanism applies.

2. Setup and access instructions

No special setup is needed. Launch the app and sign in on the Login screen. ELITE FIT has two account types — Coach and Student.

Demo account (Student — active subscription):
- Email: revisor@elitefitapp.com.br
- Password: RevisorEliteFit2026!
Already has a sample workout plan and two diet plans assigned, so every student-facing feature is reachable immediately: view workout/diet, submit a daily check-in with a photo, use the AI assistant chat, and view the subscription/billing screen.

Demo account (Coach — active subscription):
- Email: coach.revisor@elitefitapp.com.br
- Password: RevisorEliteFitCoach2026!
Already has one demo student assigned, with a full workout plan and two diet plans built, so coach-side features (student roster, workout/diet builder, check-in review, AI assistant) are reachable immediately too.

Demo account (Coach — EXPIRED subscription, for reviewing the complete purchase/paywall flow — Guideline 2.1):
- Email: coach.elite@elitefitapp.com.br
- Password: EliteFitReview2026!
Logging in lands directly on the "access suspended" screen (subscription expired 5 days ago). This screen shows only account status, a "Check payment status" button, and a "Contact support" WhatsApp button — no in-app purchase mechanism of any kind on iOS (see item 6 below). This account has one demo student assigned (with workout + diet already built) so the coach's non-billing features remain reachable too.

Additional demo accounts (same expired-subscription behavior, other plan tiers, optional):
- Coach Personal: coach.personal@elitefitapp.com.br / EliteFitReview2026! (student: aluno.personal@elitefitapp.com.br, workout only)
- Coach Nutricionista: coach.nutri@elitefitapp.com.br / EliteFitReview2026! (student: aluno.nutri@elitefitapp.com.br, diet only)

Both account-deletion flows (Student and Coach) are demonstrated in the attached recording using two separate, disposable test accounts, so the demo accounts above stay available for future review cycles.

3. External services, tools and platforms used

- Hosting: Render
- Database: Neon (managed PostgreSQL)
- Media storage: Cloudflare R2 (photos) and Cloudflare Stream (videos)
- Payments: Asaas (Brazilian gateway — Pix, credit card, boleto) — used only for the student subscription (charged outside the iOS app's purchase flow, see item 6) and, on Android/web, for coach subscriptions
- Transactional email: Resend
- AI (server-side only, for workout/diet suggestions, evaluating check-in photos/videos, and voice-to-text for coach-authored workouts/diets): Anthropic Claude, OpenAI (including Whisper transcription), Google Gemini. End users never call these APIs directly; no API key is ever exposed client-side.
- Push notifications: Apple Push Notification service via Expo, and Web Push for the PWA version

4. Regional differences

Built specifically for Brazil: interface is Brazilian Portuguese only, pricing is in BRL, and the payment processor (Asaas) only operates in Brazil. Otherwise the app behaves identically for every user — no feature or content variation by region.

5. Regulated industry / protected third-party material

ELITE FIT is a fitness and nutrition coaching tool, not a medical or healthcare product — it does not provide medical diagnosis, treatment, or advice, and falls outside any regulated health-industry category. All workout, diet and video content is authored by the coach for their own clients (or generated for that coach's use); the app does not include or distribute any licensed or protected third-party material.

6. Guideline 3.1.1 — In-App Purchase fix (new, this build)

Coach subscription plans (Personal / Nutricionista / Elite) can no longer be purchased, renewed, or paid for by any means inside the iOS app:

- The plan-selection screen for prospective coaches now only presents plan information (features, pricing); choosing a plan opens the device's browser to the same screen published as a web page at elitefitapp.com.br/seja-coach — there is no checkout or payment link inside the iOS app.
- The expired/suspended-access screen and the active coach's own subscription-status panel no longer expose any "Pay now" or "Enable automatic payment" action on iOS — only account status and a "Contact support" WhatsApp button (for support questions, not purchasing).
- Every non-billing coach feature remains fully available on iOS; only in-app purchase/renewal of the subscription was removed.
- This mirrors the pattern already approved for our digital-content purchase flow in a previous review round (also Guideline 3.1.1): the iOS app hands off to the browser rather than processing payment in-app. Coach subscriptions are a B2B software-access plan for independent personal trainers/nutritionists to use our platform, not consumer digital content, and no ELITE FIT subscription purchase is offered anywhere inside the iOS app — subscribing/renewing happens outside the app (our website or the Android app).
```
