// lib/coachFeatures.ts
// 🔑 (12 out 2026) Chaves por coach dos recursos especiais (ver prisma/schema/coach-features.prisma).
//
// Quem tem o recurso (nessa ordem):
//   1. time master (Paulo/Adri): sempre;
//   2. chave GERAL ligada (FeatureGlobal.enabled): todos os coaches;
//   3. concessão do coach (CoachFeature sem revokedAt) E coach com acesso em dia (conta aprovada e mensalidade fora de atraso/cancelada).
//      Concessão de coach sem acesso em dia é REVOGADA na hora (e fica revogada: renovar a mensalidade não religa, só o master).
// Sem carência. Os ganchos de revogação também ficam no webhook do Asaas e no bloqueio do master; a checagem aqui é a rede de segurança.
//
// Recebe o `db` (Prisma) por parâmetro para testar sem banco. Se as tabelas ainda não existem (antes do `npx prisma db push`), tudo responde "sem recurso" em vez de quebrar.
export const FEATURE_KEYS = ['execVideo', 'notasVoz', 'perguntasVoz'] as const;
export type FeatureKey = (typeof FEATURE_KEYS)[number];
export const FEATURE_LABELS: Record<FeatureKey, string> = { execVideo: 'Vídeo de execução', notasVoz: 'Notas por voz', perguntasVoz: 'Perguntas livres por voz (IA)' };
/** Recursos que o Fundador recebe sozinho ao pagar. `perguntasVoz` (gasta IA a cada pergunta) fica de fora: só o master libera, coach a coach. */
export const FOUNDER_KEYS: readonly FeatureKey[] = ['execVideo', 'notasVoz'];

export type FeatureSource = 'MASTER' | 'GLOBAL' | 'GRANT' | null;
export type FeatureState = { on: boolean; source: FeatureSource };
export type FeatureMap = Record<FeatureKey, FeatureState>;

export const isFeatureKey = (v: any): v is FeatureKey => (FEATURE_KEYS as readonly string[]).includes(String(v));

const missing = (e: any) => /does not exist|P2021|P2022/i.test(String(e?.code || '') + String(e?.message || ''));
const build = (f: () => FeatureState): FeatureMap => { const m: any = {}; for (const k of FEATURE_KEYS) m[k] = f(); return m as FeatureMap; };
const none = (): FeatureMap => build(() => ({ on: false, source: null }));
const all = (state: FeatureState): FeatureMap => build(() => ({ ...state }));

/** Coach com acesso em dia? Conta aprovada e mensalidade fora de atraso/cancelada (mesma regra que bloqueia o app dele). */
export function coachInGoodStanding(c: { accountStatus?: string | null; coachBillingStatus?: string | null } | null | undefined): boolean {
  if (!c) return false;
  if (['REJECTED', 'PENDING_APPROVAL'].includes(String(c.accountStatus || ''))) return false;
  if (['OVERDUE', 'CANCELLED'].includes(String(c.coachBillingStatus || ''))) return false;
  return true;
}

export async function loadGlobal(db: any): Promise<Record<FeatureKey, boolean>> {
  const out = {} as Record<FeatureKey, boolean>;
  for (const k of FEATURE_KEYS) out[k] = false;
  try {
    const rows: any[] = await db.featureGlobal.findMany({});
    for (const r of rows) { const k = r.feature; if (isFeatureKey(k)) out[k] = !!r.enabled; }
  } catch (e) { if (!missing(e)) throw e; }
  return out;
}

/** Revoga os recursos do coach (todos, ou os listados). Idempotente: só mexe no que ainda está ligado. Devolve quantos foram revogados. */
export async function revokeCoachFeatures(db: any, coachId: string, reason: 'ACESSO_BLOQUEADO' | 'MASTER', features: readonly FeatureKey[] = FEATURE_KEYS, now: Date = new Date()): Promise<number> {
  if (!coachId) return 0;
  try {
    const r = await db.coachFeature.updateMany({ where: { coachId, feature: { in: [...features] }, revokedAt: null }, data: { revokedAt: now, revokedReason: reason } });
    return r?.count || 0;
  } catch (e) { if (missing(e)) return 0; throw e; }
}

/** Gancho "nunca derruba a ação principal" (webhook, bloqueio): revoga e engole qualquer erro, só registrando. */
export async function revokeCoachFeaturesSafe(db: any, coachId: string, reason: 'ACESSO_BLOQUEADO' | 'MASTER'): Promise<void> {
  try { await revokeCoachFeatures(db, coachId, reason); } catch (e: any) { console.error('[coachFeatures] revogar:', e?.message || e); }
}

/** O master liga/desliga um recurso de UM coach. Ligar de novo apaga a revogação e renova a data. */
export async function setCoachFeature(db: any, o: { coachId: string; feature: FeatureKey; enabled: boolean; by: string; reason?: 'FUNDADOR' | 'MANUAL'; now?: Date }): Promise<void> {
  const now = o.now || new Date();
  if (o.enabled) {
    await db.coachFeature.upsert({
      where: { coachId_feature: { coachId: o.coachId, feature: o.feature } },
      create: { coachId: o.coachId, feature: o.feature, reason: o.reason || 'MANUAL', grantedBy: o.by, grantedAt: now },
      update: { reason: o.reason || 'MANUAL', grantedBy: o.by, grantedAt: now, revokedAt: null, revokedReason: null },
    });
  } else {
    await revokeCoachFeatures(db, o.coachId, 'MASTER', [o.feature], now);
  }
}

/**
 * Concessão automática de FUNDADOR (pagamento da promoção de lançamento confirmado). Só cria se o coach NUNCA teve linha desse recurso:
 * assim uma confirmação reenviada pelo Asaas, ou um coach que perdeu e voltou, não ganha o recurso de novo sozinho.
 */
export async function grantFounderFeatures(db: any, coachId: string, now: Date = new Date()): Promise<FeatureKey[]> {
  const granted: FeatureKey[] = [];
  if (!coachId) return granted;
  try {
    for (const feature of FOUNDER_KEYS) {
      const had = await db.coachFeature.findUnique({ where: { coachId_feature: { coachId, feature } } });
      if (had) continue;
      await db.coachFeature.create({ data: { coachId, feature, reason: 'FUNDADOR', grantedBy: 'system', grantedAt: now } });
      granted.push(feature);
    }
  } catch (e) { if (!missing(e)) throw e; }
  return granted;
}
export async function grantFounderFeaturesSafe(db: any, coachId: string): Promise<void> {
  try { await grantFounderFeatures(db, coachId); } catch (e: any) { console.error('[coachFeatures] fundador:', e?.message || e); }
}

/** Liga um recurso para todos os coaches que já são Fundadores (vaga de lançamento usada) e estão com acesso em dia e sem linha nenhuma desse recurso. */
export async function grantExistingFounders(db: any, by: string, now: Date = new Date()): Promise<{ coaches: number; grants: number }> {
  const founders: any[] = await db.user.findMany({ where: { role: 'COACH', isLaunchPromo: true }, select: { id: true, accountStatus: true, coachBillingStatus: true } });
  let coaches = 0, grants = 0;
  for (const f of founders) {
    if (!coachInGoodStanding(f)) continue;
    const g = await grantFounderFeatures(db, f.id, now);
    if (g.length) { coaches++; grants += g.length; }
  }
  void by;
  return { coaches, grants };
}

/** Os recursos do coach agora (aplica a revogação preguiçosa quando o acesso não está em dia). */
export async function resolveCoachFeatures(db: any, coachId: string | null | undefined, o: { isMaster?: boolean; now?: Date } = {}): Promise<FeatureMap> {
  if (o.isMaster) return all({ on: true, source: 'MASTER' });
  if (!coachId) return none();
  try {
    const global = await loadGlobal(db);
    const out = none();
    for (const k of FEATURE_KEYS) if (global[k]) out[k] = { on: true, source: 'GLOBAL' };
    const grants: any[] = await db.coachFeature.findMany({ where: { coachId, revokedAt: null } });
    if (!grants.length) return out;
    const coach = await db.user.findUnique({ where: { id: coachId }, select: { accountStatus: true, coachBillingStatus: true } });
    if (!coachInGoodStanding(coach)) {
      await revokeCoachFeaturesSafe(db, coachId, 'ACESSO_BLOQUEADO');
      return out;
    }
    for (const g of grants) { const k = g.feature; if (isFeatureKey(k) && !out[k].on) out[k] = { on: true, source: 'GRANT' }; }
    return out;
  } catch (e) {
    if (missing(e)) return none();
    throw e;
  }
}

export async function coachHasFeature(db: any, coachId: string | null | undefined, feature: FeatureKey, o: { isMaster?: boolean; now?: Date } = {}): Promise<boolean> {
  return (await resolveCoachFeatures(db, coachId, o))[feature].on;
}
