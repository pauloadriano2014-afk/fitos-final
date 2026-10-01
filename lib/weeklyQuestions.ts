// lib/weeklyQuestions.ts
// 🧩 (1 out 2026) As perguntas da segunda-feira MONTADAS COM OS DADOS REAIS da semana do aluno (lib/weeklyFacts.ts).
//
// Sem dados (falha ao carregar), cai nas perguntas de sempre (buildQuestions). Com dados:
//   - "Treinos": mostra o que está registrado x o que o plano pede ("No app aparece: 3 de 5 treinos registrados (terça, quinta e sábado)")
//   - se ficou abaixo do plano, pergunta O QUE ACONTECEU nos treinos que faltaram (incluindo "treinei, mas esqueci de registrar")
//   - se ele escreveu observações durante a semana, lembra na pergunta de dor/dificuldade
//   - se o check-in com fotos está atrasado, pergunta o que aconteceu e pede pra enviar
//   - dieta: além da nota 0-10, pergunta o que mais atrapalhou (mesmo quem não marca refeição no diário)
// Os números e datas dos textos vêm sempre dos fatos (código). A IA (lib/weeklyAI.ts) só reescreve o jeito de perguntar.
import { buildQuestions, type Question, type QuestionContext } from '@/lib/weeklyFeedback';
import { hasPlanGap, missingDaysText, trainingSentence, ddmm, type WeeklyFacts } from '@/lib/weeklyFacts';

export type WeeklyQuestionContext = QuestionContext & { facts?: WeeklyFacts | null };

const cut = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s);

export function buildWeeklyQuestions(ctx: WeeklyQuestionContext = {}): Question[] {
  const { facts, ...rest } = ctx;
  if (!facts) return buildQuestions(rest);

  const limitations = rest.limitations ?? facts.profile.limitations;
  const sleepQuality = rest.sleepQuality ?? (facts.profile.poorSleep ? 'Ruim' : null);
  const dietModule = rest.dietModule ?? facts.diet.enabled;
  const qs = buildQuestions({ limitations, sleepQuality, dietModule, extrasLimit: 4, dietIssue: !!dietModule });
  const at = (id: string) => qs.findIndex((q) => q.id === id);
  const patch = (id: string, fn: (q: Question) => Question) => { const i = at(id); if (i >= 0) qs[i] = fn(qs[i]); };
  const withHint = (q: Question, hint: string): Question => ({ ...q, hint: q.hint ? `${q.hint} ${hint}` : hint });

  // ── treinos: o que está registrado x plano ──
  const sentence = trainingSentence(facts);
  if (sentence) patch('trained', (q) => withHint(q, `No app aparece: ${sentence}.`));

  if (hasPlanGap(facts)) {
    const t = facts.training;
    const label = t.done === 0
      ? '🗓️ Não vi nenhum treino registrado na semana. O que aconteceu?'
      : `🗓️ Vi ${t.done} de ${t.planned} treinos registrados${t.missingDays.length ? ` (faltou ${missingDaysText(t.missingDays)})` : ''}. O que aconteceu nos que ficaram de fora?`;
    const values = ['NOLOG', 'TIME', 'TIRED', 'PAIN', 'TRAVEL', 'MOTIV', 'OTHER'];
    qs.splice(at('trained') + 1, 0, {
      id: 'training_gap', kind: 'choice', label,
      options: [
        { value: 'NOLOG', label: 'Treinei, mas esqueci de registrar' }, { value: 'TIME', label: 'Falta de tempo / rotina corrida' }, { value: 'TIRED', label: 'Cansaço ou pouca energia' },
        { value: 'PAIN', label: 'Dor ou lesão' }, { value: 'TRAVEL', label: 'Viagem ou imprevisto' }, { value: 'MOTIV', label: 'Desmotivação' }, { value: 'OTHER', label: 'Outro motivo' },
      ],
      textWhen: { values, label: 'Quer contar o que aconteceu? (opcional)', required: false },
    });
  }

  // ── observações que ele escreveu durante a semana ──
  if (facts.notes.length) {
    const quoted = facts.notes.slice(0, 2).map((n) => `"${cut(n.text, 90)}"${n.exercise ? ` (${cut(n.exercise, 40)})` : ''}`).join(' · ');
    patch('difficulty', (q) => withHint(q, `Você comentou durante a semana: ${quoted}.`));
  }

  // ── check-in com fotos atrasado ──
  const c = facts.checkin;
  if ((c.status === 'LATE' || c.status === 'NEVER') && at('energy') >= 0) {
    const label = c.status === 'NEVER'
      ? '📸 Ainda não recebemos as suas fotos do check-in. O que aconteceu?'
      : `📸 Seu check-in com fotos estava marcado para ${c.dueDate ? ddmm(c.dueDate) : 'esta semana'} e ainda não chegou. O que aconteceu?`;
    qs.splice(at('energy') + 1, 0, {
      id: 'checkin_missed', kind: 'choice', label, hint: 'Se puder, envie as fotos hoje: o seu coach precisa delas para ajustar o seu plano. 💜',
      options: [
        { value: 'FORGOT', label: 'Esqueci' }, { value: 'NOTIME', label: 'Sem tempo' }, { value: 'UNCOMFORTABLE', label: 'Não me sinto confortável' },
        { value: 'TECH', label: 'Dificuldade no app / nas fotos' }, { value: 'WILLSEND', label: 'Vou enviar hoje' }, { value: 'OTHER', label: 'Outro motivo' },
      ],
      textWhen: { values: ['FORGOT', 'NOTIME', 'UNCOMFORTABLE', 'TECH', 'OTHER'], label: 'Quer contar mais? (opcional)', required: false },
    });
  }

  // ── dieta: o que o diário mostra (quando ele marca) ──
  if (facts.diet.enabled && facts.diet.meals > 0) {
    const d = facts.diet;
    patch('diet', (q) => withHint(q, `No diário aparecem ${d.meals} ${d.meals === 1 ? 'refeição marcada' : 'refeições marcadas'} em ${d.loggedDays} ${d.loggedDays === 1 ? 'dia' : 'dias'}.`));
  }
  return qs;
}
