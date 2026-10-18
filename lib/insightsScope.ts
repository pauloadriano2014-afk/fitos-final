// lib/insightsScope.ts
// 🧠 (18 out 2026) QUEM ENTRA NAS ANÁLISES do assistente (alunos parecidos, comparação de treinos, "como estão os treinos dos meus alunos").
// Só entram como REFERÊNCIA alunos da carteira do próprio coach (mesma "muralha" da central HOJE) e que tenham treino de verdade feito.
// Regra automática (o coach pode mudar aluno a aluno com `User.insightsMode`):
//   • conta de teste (`isTestAccount`)            → fora;
//   • sem gênero preenchido                        → fora (a comparação é sempre do mesmo gênero);
//   • inativado                                    → fora, a menos que o coach ligue "incluir inativos" E o aluno tenha muitos treinos (INACTIVE_MIN_SESSIONS);
//   • menos de MIN_SESSIONS treinos executados     → fora (rascunho/treino montado e nunca feito não conta: só o que foi EXECUTADO, WorkoutHistory);
//   • 'EXCLUDE' manual                             → fora SEMPRE; 'INCLUDE' manual → dentro, mesmo com poucos treinos/teste/inativo (mas sem gênero não dá para comparar).
// Tudo aqui é função pura, menos `loadInsightsPool` (só LÊ). Antes do `npx prisma db push` das 2 colunas novas, as leituras caem na regra automática (nada quebra).
import { ownStudentScope } from '@/lib/agendaStore';
import { loadStudentLevels, LevelKey, StudentLevelRow } from '@/lib/studentLevel';

export const MIN_SESSIONS = 6;
export const INACTIVE_MIN_SESSIONS = 20;
export type InsightsMode = 'INCLUDE' | 'EXCLUDE';
export type Gender = 'Feminino' | 'Masculino';
export type ScopeReason = 'OK' | 'MANUAL_DENTRO' | 'MANUAL_FORA' | 'TESTE' | 'SEM_GENERO' | 'INATIVO' | 'INATIVO_POUCOS_TREINOS' | 'POUCOS_TREINOS';
export const REASON_LABEL: Record<ScopeReason, string> = {
  OK: 'Entra nas análises',
  MANUAL_DENTRO: 'Entra (escolha sua)',
  MANUAL_FORA: 'Fora (escolha sua)',
  TESTE: 'Fora: parece conta de teste',
  SEM_GENERO: 'Fora: sem gênero no cadastro',
  INATIVO: 'Fora: aluno inativado',
  INATIVO_POUCOS_TREINOS: 'Fora: inativado com poucos treinos',
  POUCOS_TREINOS: `Fora: menos de ${MIN_SESSIONS} treinos feitos`,
};

export const parseInsightsMode = (v: any): InsightsMode | null => (v === 'INCLUDE' || v === 'EXCLUDE' ? v : null);
const norm = (s: any) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
/** 'feminino' / 'Masculino' / 'F' / 'mulher'… → valor guardado; outro texto → null */
export function parseGender(v: any): Gender | null {
  const s = norm(v);
  if (!s) return null;
  if (s === 'f' || s.startsWith('fem') || s.startsWith('mulher')) return 'Feminino';
  if (s === 'm' || s.startsWith('masc') || s.startsWith('homem')) return 'Masculino';
  return null;
}
const isInactive = (s: { active?: boolean | null; accountStatus?: string | null }) => s.active === false || (!!s.accountStatus && String(s.accountStatus).toUpperCase() !== 'ACTIVE');

export interface ScopeStudent { active?: boolean | null; accountStatus?: string | null; isTestAccount?: boolean | null; gender?: string | null; insightsMode?: string | null; sessions: number }
export interface ScopeOptions { includeInactive?: boolean }
export interface ScopeVerdict { included: boolean; reason: ScopeReason; label: string }

export function evaluateStudent(s: ScopeStudent, opts: ScopeOptions = {}): ScopeVerdict {
  const v = (included: boolean, reason: ScopeReason): ScopeVerdict => ({ included, reason, label: REASON_LABEL[reason] });
  const mode = parseInsightsMode(s.insightsMode);
  if (mode === 'EXCLUDE') return v(false, 'MANUAL_FORA');
  if (!parseGender(s.gender)) return v(false, 'SEM_GENERO');
  if (mode === 'INCLUDE') return v(true, 'MANUAL_DENTRO');
  if (s.isTestAccount) return v(false, 'TESTE');
  const sessions = Math.max(0, Math.floor(Number(s.sessions) || 0));
  if (isInactive(s)) {
    if (!opts.includeInactive) return v(false, 'INATIVO');
    return sessions >= INACTIVE_MIN_SESSIONS ? v(true, 'OK') : v(false, 'INATIVO_POUCOS_TREINOS');
  }
  return sessions >= MIN_SESSIONS ? v(true, 'OK') : v(false, 'POUCOS_TREINOS');
}

/**
 * Contas que PARECEM de teste pelo nome/e-mail ("ELITE", "Teste", "Demonstração", "Fulano"...). É só uma SUGESTÃO para o coach confirmar:
 * nunca tira ninguém sozinha. Palavras inteiras, para "Contestado" ou "Atestado" não virarem teste.
 */
const TEST_WORDS = ['teste', 'testes', 'test', 'demo', 'demonstracao', 'exemplo', 'fake', 'admin', 'elite', 'fulano', 'ciclano', 'beltrano', 'qa', 'sandbox', 'apple', 'review', 'revisao'];
const TEST_EMAIL_PARTS = ['teste', 'test', 'demo', 'fake', 'sandbox', 'exemplo', 'review'];
const GENERIC_NAMES = ['aluno', 'aluna', 'usuario', 'user', 'cliente'];
export function looksLikeTestAccount(name: any, email?: any): boolean {
  const words = norm(name).split(/[^a-z0-9]+/).filter(Boolean);
  if (words.length === 1 && GENERIC_NAMES.includes(words[0])) return true;   // só "Aluno" / "Usuário": cadastro de teste
  if (words.some((w) => TEST_WORDS.includes(w))) return true;
  const parts = (norm(email).split('@')[0] || '').split(/[^a-z0-9]+/).filter(Boolean);
  return parts.some((p) => TEST_EMAIL_PARTS.includes(p) || /^(teste|test|demo)\d+$/.test(p));
}

// ─────────────────────────── leitura do banco ───────────────────────────
type Db = any;
const missingColumn = (e: any) => /does not exist|P2022|Unknown (field|argument)|Unknown field/i.test(String(e?.code || '') + ' ' + String(e?.message || ''));

export interface PoolStudent {
  id: string; name: string; gender: Gender | null; sessions: number; lastSession: Date | null;
  level: StudentLevelRow | null; mode: InsightsMode | null; suspectTest: boolean;
  verdict: ScopeVerdict;
}
export interface Pool { includeInactive: boolean; students: PoolStudent[]; included: PoolStudent[] }

/** Lê a carteira do coach e diz quem entra nas análises. Aceita o filtro de gênero (comparação sempre do mesmo gênero) via `forGender` no `included`. Só lê. */
export async function loadInsightsPool(db: Db, coachId: string, now: Date = new Date()): Promise<Pool> {
  const base = { id: true, name: true, email: true, gender: true, active: true, accountStatus: true, isTestAccount: true };
  const where = { role: 'USER', AND: [ownStudentScope(coachId)] };
  let rows: any[]; let includeInactive = false;
  try {
    rows = await db.user.findMany({ where, select: { ...base, insightsMode: true }, orderBy: { name: 'asc' }, take: 1000 });
    const me = await db.user.findUnique({ where: { id: coachId }, select: { insightsIncludeInactive: true } });
    includeInactive = !!(me && me.insightsIncludeInactive);
  } catch (e) {
    if (!missingColumn(e)) throw e;
    rows = await db.user.findMany({ where, select: base, orderBy: { name: 'asc' }, take: 1000 });   // colunas ainda não criadas: regra automática
  }
  const ids = rows.map((r) => r.id);
  const hist: any[] = ids.length ? await db.workoutHistory.groupBy({ by: ['userId'], where: { userId: { in: ids } }, _count: { _all: true }, _max: { date: true } }) : [];
  const sess = new Map<string, { n: number; last: Date | null }>(hist.map((h) => [h.userId, { n: Number(h._count && (h._count._all ?? h._count)) || 0, last: h._max && h._max.date ? new Date(h._max.date) : null }]));
  const levels = await loadStudentLevels(db, ids, now);
  const students: PoolStudent[] = rows.map((r) => {
    const s = sess.get(r.id) || { n: 0, last: null };
    const verdict = evaluateStudent({ active: r.active, accountStatus: r.accountStatus, isTestAccount: r.isTestAccount, gender: r.gender, insightsMode: r.insightsMode, sessions: s.n }, { includeInactive });
    return { id: r.id, name: r.name || 'Aluno', gender: parseGender(r.gender), sessions: s.n, lastSession: s.last, level: levels.get(r.id) || null, mode: parseInsightsMode(r.insightsMode), suspectTest: !r.isTestAccount && looksLikeTestAccount(r.name, r.email), verdict };
  });
  return { includeInactive, students, included: students.filter((s) => s.verdict.included) };
}

export type { LevelKey };
