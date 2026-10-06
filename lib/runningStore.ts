// lib/runningStore.ts
// 🏃 (6 out 2026) Leitura/gravação do andamento do protocolo de corrida (lib/runningProgress.ts faz as contas; aqui só conversa com o banco).
import { resolveProgress, type Persisted, type ProgressView } from './runningProgress';

export const persistData = (n: Persisted) => ({ currentWeek: n.currentWeek, weekOpenedAt: n.weekOpenedAt, completedAt: n.completedAt, lastRepeatWeek: n.lastRepeatWeek, progressNote: n.progressNote });

/** Os registros de corrida do aluno (todos os protocolos + corridas avulsas), do mais novo para o mais antigo. */
export async function loadUserLogs(db: any, userId: string, take = 500): Promise<any[]> {
  return db.runningLog.findMany({ where: { userId }, orderBy: { createdAt: 'desc' }, take });
}

/** Resolve o andamento do protocolo ativo e grava se algo mudou (semana que fechou, repetiu, voltou, concluiu ou protocolo antigo migrando). */
export async function syncProgress(db: any, protocol: any, userLogs: any[], now: Date = new Date()): Promise<{ view: ProgressView; protocol: any; logs: any[] }> {
  const logs = userLogs.filter((l) => l.protocolId === protocol.id);
  const r = resolveProgress(protocol, logs, now);
  let current = protocol;
  if (r.changed) {
    current = { ...protocol, ...persistData(r.next) };
    try { await db.runningProtocol.update({ where: { id: protocol.id }, data: persistData(r.next) }); }
    catch (e) { console.error('[running-progress-persist]', e); }   // a tela ainda mostra o estado certo; grava na próxima
  }
  return { view: r.view, protocol: current, logs };
}
