// lib/observationHabits.ts
// 📝 (30 out 2026) "O sistema aprende as suas observações": para cada exercício, quais recados (observações) o coach MAIS repete nos treinos que montou para os alunos dele.
// Serve para o Montar treino já preencher o recado quando o hábito é forte (ex.: serrote sempre com "Execute com os 2 braços e depois descanse") e sugerir os outros mais usados.
// Só LEITURA e só dos alunos do próprio coach (um coach nunca vê o hábito do outro). Sem tabela nova: a "memória" é o próprio histórico de treinos, então aprende sozinho a cada treino novo.
//
// Contagem por ALUNO (não por treino): o mesmo recado repetido todo mês para a mesma pessoa é uma anotação dela ("cuidado com o ombro"), não um hábito do coach.
//   - sugerir: o recado aparece em 2 alunos diferentes ou mais;
//   - preencher sozinho (`auto`): 3 alunos ou mais E pelo menos 60% dos alunos que fizeram esse exercício.
import prisma from '@/lib/prisma';

export const OBS_HABIT_MIN_STUDENTS = 2;
export const OBS_HABIT_AUTO_MIN_STUDENTS = 3;
export const OBS_HABIT_AUTO_SHARE = 0.6;
export const OBS_HABIT_MAX_TOP = 3;
export const OBS_HABIT_MAX_WORKOUTS = 800;
export const OBS_HABIT_CACHE_MS = 5 * 60 * 1000;
const TEXT_MAX = 500, TEXT_MIN = 3;

export type ObsHabit = { total: number; auto: boolean; top: { text: string; count: number }[] };
export type ObsHabits = Record<string, ObsHabit>;
type Row = { exerciseId?: any; observation?: any; technique?: any };
export type HabitWorkout = { userId?: any; exercises?: Row[] | null };

/** O recado de um exercício: a coluna `observation`; o app também guarda uma cópia dentro do JSON da técnica (`o`) e treinos antigos só têm essa. */
export function obsOf(ex: Row | null | undefined): string {
  if (!ex) return '';
  let t = typeof ex.observation === 'string' ? ex.observation : '';
  if (!t.trim() && typeof ex.technique === 'string' && ex.technique.trim().startsWith('{')) {
    try { const p = JSON.parse(ex.technique); if (p && typeof p.o === 'string') t = p.o; } catch { /* técnica em texto simples */ }
  }
  return t.replace(/\r/g, '').trim().slice(0, TEXT_MAX);
}

/** Chave para juntar recados "iguais": sem maiúsculas, sem acento, sem espaço sobrando e sem pontuação no fim. */
export const normObs = (s: string): string => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').replace(/[\s.,;:!\-–—]+$/g, '').trim();

/** Os treinos devem vir do MAIS NOVO para o mais velho (o texto mostrado é a grafia da versão mais recente). Só entram exercícios com recado preenchido em 2 alunos ou mais. */
export function buildObservationHabits(workouts: HabitWorkout[] | null | undefined): ObsHabits {
  const students = new Map<string, Set<string>>();                 // exerciseId -> alunos que têm o exercício
  const texts = new Map<string, Map<string, { text: string; who: Set<string>; first: number }>>();   // exerciseId -> chave -> recado
  let seq = 0;
  (workouts || []).forEach((w) => {
    const who = String(w && w.userId ? w.userId : '');
    if (!who) return;
    ((w && w.exercises) || []).forEach((ex) => {
      const id = String(ex && ex.exerciseId ? ex.exerciseId : '');
      if (!id) return;
      if (!students.has(id)) students.set(id, new Set());
      students.get(id)!.add(who);
      const text = obsOf(ex); const key = normObs(text);
      if (key.length < TEXT_MIN) return;
      if (!texts.has(id)) texts.set(id, new Map());
      const m = texts.get(id)!; const cur = m.get(key);
      if (cur) cur.who.add(who); else m.set(key, { text, who: new Set([who]), first: seq++ });
    });
  });
  const out: ObsHabits = {};
  texts.forEach((m, id) => {
    const top = [...m.values()].map((v) => ({ text: v.text, count: v.who.size, first: v.first })).filter((v) => v.count >= OBS_HABIT_MIN_STUDENTS)
      .sort((a, b) => b.count - a.count || a.first - b.first).slice(0, OBS_HABIT_MAX_TOP);
    if (!top.length) return;
    const total = students.get(id)!.size;
    out[id] = { total, auto: top[0].count >= OBS_HABIT_AUTO_MIN_STUDENTS && top[0].count / total >= OBS_HABIT_AUTO_SHARE, top: top.map(({ text, count }) => ({ text, count })) };
  });
  return out;
}

const cache = new Map<string, { at: number; value: ObsHabits }>();
export const clearObservationHabitsCache = () => cache.clear();
/** Só para teste: coloca hábitos já prontos na memória (sem ir ao banco). */
export const primeObservationHabits = (coachId: string, value: ObsHabits, at: number = Date.now()) => { cache.set(coachId, { at, value }); };

/** Lê do banco os treinos dos alunos do coach e calcula os hábitos (guarda 5 min na memória do servidor: a conta não precisa rodar a cada abertura do Montar treino). */
export async function loadObservationHabits(coachId: string, opts: { db?: any; now?: () => number; fresh?: boolean } = {}): Promise<ObsHabits> {
  const db = opts.db || (prisma as any); const now = (opts.now || Date.now)();
  const hit = cache.get(coachId);
  if (!opts.fresh && hit && now - hit.at < OBS_HABIT_CACHE_MS) return hit.value;
  const rows = await db.workout.findMany({
    where: { user: { coachId } },
    orderBy: { createdAt: 'desc' },
    take: OBS_HABIT_MAX_WORKOUTS,
    select: { userId: true, exercises: { select: { exerciseId: true, observation: true, technique: true } } },
  });
  const value = buildObservationHabits(rows);
  cache.set(coachId, { at: now, value });
  return value;
}
