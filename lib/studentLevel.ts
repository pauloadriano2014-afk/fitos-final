// lib/studentLevel.ts
// 🏅 (18 out 2026) NÍVEL DO ALUNO que evolui sozinho: Iniciante → Intermediário → Avançado.
// Regra do Paulo: quem entra como iniciante continua iniciante até ~3 meses; a partir do 4º mês é intermediário; a partir do 8º mês é avançado.
// E não só pelo calendário: conta também os treinos EXECUTADOS (WorkoutHistory). O nível só sobe quando as DUAS coisas foram atingidas
// (tempo E treinos), para quem some por semanas não "evoluir" só porque o tempo passou, e quem treina muito não pular de nível em 2 semanas.
// Quem já entra intermediário/avançado (pelo que preencheu na anamnese) começa "adiantado" nesse nível: ganha de saída o tempo e os treinos desse nível.
// Tudo aqui é função pura, menos `loadStudentLevels` (só LÊ; nada é gravado, então não precisa de mudança de banco).
// ⚠️ Os números abaixo são a PROPOSTA inicial: se o Paulo quiser mudar, é só mexer em LEVEL_RULES (os testes seguem as constantes).

export type LevelKey = 'INICIANTE' | 'INTERMEDIARIO' | 'AVANCADO';
export const LEVEL_ORDER: LevelKey[] = ['INICIANTE', 'INTERMEDIARIO', 'AVANCADO'];
export const LEVEL_LABEL: Record<LevelKey, string> = { INICIANTE: 'Iniciante', INTERMEDIARIO: 'Intermediário', AVANCADO: 'Avançado' };

/** Para estar em cada nível (posição 0 = iniciante): meses completos de treino E treinos executados. Intermediário: a partir do 4º mês (3 meses completos); Avançado: a partir do 8º mês (7 completos). */
export const LEVEL_RULES = {
  months: [0, 3, 7],
  sessions: [0, 24, 60],
} as const;

const DAY_MS = 86400000;
const DAYS_PER_MONTH = 30.4375;

const stripAccents = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** "Intermediário", "intermediario", "INTERMEDIARIO", "Iniciante (menos de 6 meses)" → chave; qualquer outra coisa → null */
export function parseLevel(raw: any): LevelKey | null {
  if (raw == null) return null;
  const s = stripAccents(String(raw));
  if (s.includes('inic') || s.includes('begin')) return 'INICIANTE';
  if (s.includes('interm')) return 'INTERMEDIARIO';
  if (s.includes('avanc') || s.includes('advanc')) return 'AVANCADO';
  return null;
}

export interface LevelInput {
  /** nível com que o aluno chegou (cadastro/anamnese); sem informação = iniciante */
  entry?: LevelKey | null;
  /** quando começou a treinar com o coach; sem data = 0 meses */
  startDate?: Date | string | null;
  /** quantos treinos já executou (WorkoutHistory) */
  sessions?: number | null;
  now?: Date;
}
export interface LevelInfo {
  level: LevelKey;
  label: string;
  rank: number;                      // 0, 1 ou 2
  months: number;                    // meses de treino (com 1 casa), já contando o "adiantamento" de quem entrou intermediário/avançado
  sessions: number;                  // treinos executados (idem)
  next: LevelKey | null;             // null = já está no topo
  nextLabel: string | null;
  /** 0–100: quanto falta para o próximo nível (o menor entre tempo e treinos). null no topo */
  progressPct: number | null;
  /** o que falta para o próximo nível: dias de calendário e treinos (0 = esse lado já foi atingido) */
  missing: { days: number; sessions: number } | null;
}

const num = (v: any) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
const toDate = (v: any): Date | null => { if (v == null || v === '') return null; const d = v instanceof Date ? v : new Date(v); return Number.isNaN(d.getTime()) ? null : d; };
const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

export function computeLevel(input: LevelInput): LevelInfo {
  const now = input.now || new Date();
  const entry = input.entry && LEVEL_ORDER.includes(input.entry) ? input.entry : 'INICIANTE';
  const entryRank = LEVEL_ORDER.indexOf(entry);
  const start = toDate(input.startDate);
  const rawDays = start ? Math.max(0, (now.getTime() - start.getTime()) / DAY_MS) : 0;   // data no futuro = 0
  const months = rawDays / DAYS_PER_MONTH + LEVEL_RULES.months[entryRank];
  const sessions = Math.max(0, Math.floor(num(input.sessions))) + LEVEL_RULES.sessions[entryRank];

  let rank = 0;
  for (let r = 1; r < LEVEL_ORDER.length; r++) if (months >= LEVEL_RULES.months[r] && sessions >= LEVEL_RULES.sessions[r]) rank = r;

  const level = LEVEL_ORDER[rank];
  const nextRank = rank + 1 < LEVEL_ORDER.length ? rank + 1 : null;
  let progressPct: number | null = null;
  let missing: LevelInfo['missing'] = null;
  if (nextRank != null) {
    const mSpan = LEVEL_RULES.months[nextRank] - LEVEL_RULES.months[rank];
    const sSpan = LEVEL_RULES.sessions[nextRank] - LEVEL_RULES.sessions[rank];
    const mDone = clamp01((months - LEVEL_RULES.months[rank]) / mSpan);
    const sDone = clamp01((sessions - LEVEL_RULES.sessions[rank]) / sSpan);
    progressPct = Math.min(99, Math.floor(Math.min(mDone, sDone) * 100));   // 100% só quando de fato mudou de nível
    missing = {
      days: Math.max(0, Math.ceil((LEVEL_RULES.months[nextRank] - months) * DAYS_PER_MONTH)),
      sessions: Math.max(0, LEVEL_RULES.sessions[nextRank] - sessions),
    };
  }
  return {
    level, label: LEVEL_LABEL[level], rank,
    months: Math.round(months * 10) / 10, sessions,
    next: nextRank != null ? LEVEL_ORDER[nextRank] : null, nextLabel: nextRank != null ? LEVEL_LABEL[LEVEL_ORDER[nextRank]] : null,
    progressPct, missing,
  };
}

/** Frase curta para o aluno ver ("Você está no nível Intermediário. Faltam 12 treinos e ~3 semanas para o Avançado.") */
export function levelMessage(info: LevelInfo): string {
  if (!info.next || !info.missing) return `Você está no nível ${info.label}, o mais alto. Seus treinos já são os mais desafiadores.`;
  const parts: string[] = [];
  if (info.missing.sessions > 0) parts.push(`${info.missing.sessions} ${info.missing.sessions === 1 ? 'treino' : 'treinos'}`);
  if (info.missing.days > 0) {
    const d = info.missing.days;
    parts.push(d >= 60 ? `${Math.round(d / 30.4375)} meses` : d >= 14 ? `${Math.round(d / 7)} semanas` : `${d} ${d === 1 ? 'dia' : 'dias'}`);
  }
  return `Você está no nível ${info.label}. Para o ${info.nextLabel}, faltam ${parts.join(' e ')}. Conforme você evolui, os treinos ficam mais desafiadores.`;
}

// ─────────────────────────── leitura do banco ───────────────────────────
type Db = any;
export interface StudentLevelRow extends LevelInfo { userId: string; entry: LevelKey }

/** Nível de vários alunos de uma vez (3 consultas, não importa quantos alunos). Só lê. */
export async function loadStudentLevels(db: Db, userIds: string[], now: Date = new Date()): Promise<Map<string, StudentLevelRow>> {
  const out = new Map<string, StudentLevelRow>();
  const ids = [...new Set(userIds.filter(Boolean))];
  if (!ids.length) return out;
  const [users, anams, hist] = await Promise.all([
    db.user.findMany({ where: { id: { in: ids } }, select: { id: true, level: true, startDate: true, createdAt: true } }),
    db.anamnese.findMany({ where: { userId: { in: ids } }, select: { userId: true, nivel: true, createdAt: true } }),
    db.workoutHistory.groupBy({ by: ['userId'], where: { userId: { in: ids } }, _count: { _all: true } }),
  ]);
  const lastAnam = new Map<string, { nivel: string; createdAt: any }>();
  for (const a of anams as any[]) { const cur = lastAnam.get(a.userId); if (!cur || new Date(a.createdAt).getTime() > new Date(cur.createdAt).getTime()) lastAnam.set(a.userId, a); }
  const sess = new Map<string, number>();
  for (const h of hist as any[]) sess.set(h.userId, num(h._count && (h._count._all ?? h._count)));
  for (const u of users as any[]) {
    const entry = parseLevel(u.level) || parseLevel(lastAnam.get(u.id)?.nivel) || 'INICIANTE';
    const info = computeLevel({ entry, startDate: u.startDate || u.createdAt, sessions: sess.get(u.id) || 0, now });
    out.set(u.id, { ...info, userId: u.id, entry });
  }
  return out;
}
