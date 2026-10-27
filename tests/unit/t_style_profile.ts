import assert from 'assert';
import { toStyleWorkout, buildStyleProfile, styleProfileText, pickSimilarExamples, exampleText, buildStyleContext } from '/home/user/fitos-final/lib/ai/styleProfile';

// ESTILO DO COACH (27 out 2026): resumir o jeito de montar do Paulo a partir dos treinos reais dele. Funções puras.
let ok = 0, bad = 0;
const t = (name: string, fn: () => any) => { try { fn(); ok++; console.log('  ok  ' + name); } catch (e: any) { bad++; console.log('FALHOU ' + name + '\n   ' + (e.stack || e)); } };

// como está no sistema do Paulo: o músculo na categoria (Peito, Pernas...) e a subcategoria é o tipo (Medial, Superior, Multiarticular); "Geral" = sem tipo
const EX: Record<string, any> = {
  sup: { name: 'Supino reto', category: 'Peito', subCategory: 'Medial' }, inc: { name: 'Supino inclinado', category: 'Peito', subCategory: 'Superior' }, cru: { name: 'Crucifixo', category: 'Peito', subCategory: 'Medial' }, pec: { name: 'Pec deck', category: 'Peito', subCategory: 'Medial' },
  tri: { name: 'Tríceps corda', category: 'Tríceps', subCategory: 'Geral' }, fra: { name: 'Tríceps francês', category: 'Tríceps', subCategory: 'Geral' },
  agach: { name: 'Agachamento', category: 'Pernas', subCategory: 'Multiarticular' }, leg: { name: 'Leg press', category: 'Pernas', subCategory: 'Quadríceps e Adutores' }, ext: { name: 'Cadeira extensora', category: 'Pernas', subCategory: 'Quadríceps e Adutores' },
  esteira: { name: 'Esteira', category: 'Cardio', subCategory: 'Geral' },
};
// pirâmide: um bloco por série (como o app salva), a técnica (se houver) na última série
const pyr = (reps: number[], tech = '') => ({ sets: reps.length, reps: reps.join('/'), technique: JSON.stringify({ t: '', b: reps.map((r, i) => ({ sets: '1', reps: String(r), technique: i === reps.length - 1 ? tech : '' })) }) });
const plain = (sets: number, reps: string) => ({ sets, reps, technique: '' });
// o sistema grava "NORMAL" em muitos exercícios comuns: isso NÃO é técnica
const normalT = () => ({ sets: 3, reps: '12', technique: JSON.stringify({ t: 'NORMAL', b: [{ sets: '3', reps: '12', technique: 'NORMAL' }] }) });
const r = (id: string, day: string, order: number, o: any) => ({ exerciseId: id, day, order, exercise: EX[id], ...o });
const W = (id: string, student: string, date: string, gender: string, level: string, goal: string, rows: any[]) => toStyleWorkout({ id, userId: student, createdAt: date, level, goal, user: { gender }, exercises: rows })!;

const w1 = W('W1', 'S1', '2026-02-01', 'Feminino', 'Intermediário', 'Hipertrofia', [r('sup', 'A', 0, pyr([15, 12, 10, 8])), r('inc', 'A', 1, pyr([12, 10, 8])), r('tri', 'A', 2, pyr([12, 10, 8], 'DROPSET')), r('esteira', 'A', 3, plain(20, '200')), r('agach', 'B', 0, plain(4, '12')), r('leg', 'B', 1, plain(3, '12')), r('ext', 'B', 2, plain(3, '15'))]);
const w2 = W('W2', 'S1', '2026-03-01', 'Feminino', 'Intermediário', 'Hipertrofia', [r('sup', 'A', 0, pyr([15, 12, 10, 8])), r('cru', 'A', 1, pyr([12, 10, 8])), r('fra', 'A', 2, pyr([12, 10, 8], 'DROPSET')), r('agach', 'B', 0, plain(4, '12')), r('leg', 'B', 1, plain(3, '12')), r('ext', 'B', 2, plain(3, '15'))]);
const abc = (a: string, b: string, c: string) => [r('sup', 'A', 0, plain(3, '12')), r(a, 'A', 1, plain(3, '12')), r(b, 'A', 2, plain(3, '12'))].map((x, i) => (i === 1 ? { ...x, exerciseId: a } : i === 2 ? { ...x, exerciseId: b } : x));
const w3 = W('W3', 'S2', '2026-04-01', 'Masculino', 'Iniciante', 'Emagrecimento', abc('inc', 'tri', ''));
const w4 = W('W4', 'S2', '2026-05-01', 'Masculino', 'Iniciante', 'Emagrecimento', abc('cru', 'fra', ''));
const w5 = W('W5', 'S3', '2026-06-01', 'Masculino', 'Avançado', 'Hipertrofia', abc('inc', 'tri', ''));
const w6 = W('W6', 'S3', '2026-07-01', 'Masculino', 'Avançado', 'Hipertrofia', abc('cru', 'fra', ''));
// S4: uma técnica que NÃO está no último exercício do grupo (supino com drop-set) e uma troca que só acontece uma vez (inclinado -> pec deck)
const w7 = W('W7', 'S4', '2026-01-15', 'Feminino', 'Intermediário', 'Hipertrofia', [r('sup', 'A', 0, pyr([12, 10, 8], 'DROPSET')), r('inc', 'A', 1, plain(3, '12')), r('tri', 'A', 2, plain(3, '12'))]);
const w8 = W('W8', 'S4', '2026-02-20', 'Feminino', 'Intermediário', 'Hipertrofia', [r('sup', 'A', 0, plain(3, '12')), r('pec', 'A', 1, plain(3, '12')), r('tri', 'A', 2, normalT())]);
// rotina "alternada": criada 2 dias depois da w7, do MESMO aluno = mesmo ciclo (não é uma troca de ciclo)
const w9 = W('W9', 'S4', '2026-01-17', 'Feminino', 'Intermediário', 'Hipertrofia', [r('sup', 'A', 0, plain(3, '12')), r('cru', 'A', 1, plain(3, '12')), r('fra', 'A', 2, plain(3, '12'))]);
const ALL = [w6, w3, w1, w5, w2, w4, w8, w7, w9];   // fora de ordem de propósito

t('toStyleWorkout: nome e grupo vêm do exercício ("Geral" cai para a categoria), pequeno demais ou só cardio = ignorado', () => {
  assert.equal(w1.plan.A[0].g, 'Peito — Medial'); assert.equal(w1.plan.B[0].n, 'Agachamento'); assert.equal(w1.plan.B[0].g, 'Pernas — Multiarticular'); assert.equal(w1.plan.A[2].g, 'Tríceps', 'subcategoria "Geral" = só o músculo');
  assert.equal(w1.plan.A[0].s, 4); assert.equal(w1.plan.A[0].r, '15/12/10/8'); assert.equal(w1.plan.A[2].t, 'DROPSET');
  assert.equal(toStyleWorkout({ id: 'x', userId: 'u', createdAt: '2026-01-01', exercises: [r('sup', 'A', 0, plain(3, '10'))] }), null, 'menos de 3 linhas');
  assert.equal(toStyleWorkout({ id: 'x', userId: 'u', createdAt: '2026-01-01', exercises: [r('esteira', 'A', 0, plain(20, '200')), r('esteira', 'A', 1, plain(20, '200')), r('esteira', 'A', 2, plain(20, '200'))] }), null, 'só cardio não ensina musculação');
  assert.equal(w1.gender, 'Feminino'); assert.equal(w1.studentId, 'S1');
});

t('perfil: amostra, dias por rotina, dia mais comum, séries e repetições', () => {
  const p = buildStyleProfile(ALL);
  assert.deepEqual(p.sample, { workouts: 9, students: 4, from: '2026-01-15', to: '2026-07-01', days: 11 });
  assert.deepEqual(p.split.daysPerWorkout, [{ n: 1, pct: 78 }, { n: 2, pct: 22 }]);
  assert.deepEqual(p.split.dayPatterns[0], { groups: ['Peito', 'Tríceps'], count: 9 }); assert.equal(p.volume.exercisesPerDay, 3);
  assert.ok(p.reps.sequences.some((s) => s.seq === '15/12/10/8' && s.sets === 4), 'a pirâmide 15/12/10/8 aparece'); assert.ok(p.volume.setsPerExercise.some((s) => s.n === 4));
  assert.equal(p.cardio.typical, '20 min'); assert.equal(p.cardio.dayPct, 8, '1 dia com cardio em 12');
});

t('técnicas: quantos treinos usam e se ficam no último exercício do grupo', () => {
  const p = buildStyleProfile(ALL); const d = p.techniques.find((x) => x.t === 'DROPSET')!;
  assert.ok(!p.techniques.some((x) => x.t === 'NORMAL'), 'NORMAL não é técnica'); assert.equal(d.exercises, 3); assert.equal(d.workoutsPct, 33); assert.equal(d.lastOfGroupPct, 67, 'em 2 dos 3 era o último do grupo (o supino do S4 abre o grupo)');
});

t('exercícios de sempre: por grupo, contando alunos diferentes; grupo com poucos dias fica de fora', () => {
  const p = buildStyleProfile(ALL); const peito = p.favorites.find((f) => f.g === 'Peito — Medial')!;
  assert.equal(peito.items[0].n, 'Supino reto'); assert.equal(peito.items[0].students, 4);
  assert.ok(!p.favorites.some((f) => f.g.startsWith('Pernas')), 'só 2 dias: pouco para afirmar');
});

t('variação entre ciclos: o mesmo aluno, treino a treino — o que mantém e as trocas que repete', () => {
  const p = buildStyleProfile(ALL);
  assert.equal(p.rotation.pairs, 4, 'a rotina alternada do S4 não conta como ciclo novo'); assert.equal(p.rotation.keepRate, 47, '8 de 17 exercícios mantidos (o ciclo do S4 tem as duas rotinas)'); assert.equal(p.rotation.setsChangedPct, 0);
  assert.ok(!p.rotation.topSwaps.some((x) => x.to === 'Pec deck'), 'troca que só aconteceu uma vez não vira regra');
  assert.deepEqual(p.rotation.topSwaps.map((s) => [s.from, s.to, s.count]).sort(), [['Supino inclinado', 'Crucifixo', 3], ['Tríceps corda', 'Tríceps francês', 3]]);
  assert.equal(buildStyleProfile([w1]).rotation.pairs, 0, 'um treino só = nada a comparar');
});

t('texto para a IA: cita a amostra, os dias, as repetições, a técnica, as âncoras e as trocas; respeita o limite; sem treino = vazio', () => {
  const tx = styleProfileText(buildStyleProfile(ALL), 'Paulo');
  for (const s of ['ESTILO DE PAULO', '9 treinos reais de 4 alunos', '1 dias (78%)', 'Peito + Tríceps', '4x 15/12/10/8', 'DROPSET em 33% dos treinos', 'último exercício do grupo', 'Peito — Medial: Supino reto', 'Supino inclinado → Crucifixo', 'Cardio']) assert.ok(tx.includes(s), 'faltou: ' + s + '\n' + tx);
  assert.ok(styleProfileText(buildStyleProfile(ALL), 'Paulo', 300).length <= 300); assert.equal(styleProfileText(buildStyleProfile([])), '');
});

t('exemplos parecidos: mesmo sexo/nível/objetivo/dias primeiro, um por aluno, nunca o do próprio aluno', () => {
  const tgt = { gender: 'Feminino', level: 'Intermediário', goal: 'Hipertrofia', days: 2, studentId: 'NOVO' };
  const pick = pickSimilarExamples(ALL, tgt, 3);
  assert.equal(pick[0].id, 'W2', 'a mais parecida e mais recente da S1'); assert.equal(new Set(pick.map((x) => x.studentId)).size, pick.length, 'um treino por aluno'); assert.equal(pick.length, 3);
  const semS1 = pickSimilarExamples(ALL, { ...tgt, studentId: 'S1' }, 3); assert.ok(!semS1.some((x) => x.studentId === 'S1'), 'não copia o treino do próprio aluno');
  const homem = pickSimilarExamples(ALL, { gender: 'Masculino', level: 'Iniciante', goal: 'Emagrecimento', days: 1 }, 1); assert.equal(homem[0].studentId, 'S2');
  const soSexo = pickSimilarExamples(ALL, { gender: 'Feminino', days: 1 }, 1); assert.equal(soSexo[0].studentId, 'S4', 'só o sexo e os dias: a mulher de 1 dia ganha dos homens de 1 dia, mesmo sendo mais antiga');
  assert.deepEqual(pickSimilarExamples([], tgt), []);
});

t('texto do exemplo e contexto completo', () => {
  const ex = exampleText(w1); assert.ok(ex.includes('Supino reto 4x15/12/10/8') && ex.includes('Tríceps corda 3x12/10/8 [DROPSET]') && ex.includes('Esteira'), ex);
  const ctx = buildStyleContext(ALL, { gender: 'Feminino', level: 'Intermediário', goal: 'Hipertrofia', days: 2 }, { coachName: 'Paulo' });
  assert.ok(ctx.startsWith('ESTILO DE PAULO') && ctx.includes('TREINOS REAIS PARECIDOS') && ctx.includes('Exemplo real'), ctx); assert.equal(buildStyleContext([], {}), '');
});

console.log(`\n${ok} ok, ${bad} falhas`); if (bad) process.exit(1);
