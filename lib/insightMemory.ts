// lib/insightMemory.ts
// 🧠 (18 out 2026) Acesso à MEMÓRIA DAS ANÁLISES (prisma/schema/insights.prisma). Tudo tolera a tabela ainda não existir (antes do `npx prisma db push`): lê como "sem memória" e
// grava como "não gravou" — a análise continua funcionando, só sem economia. Só mexe nas linhas do PRÓPRIO coach.
export type MemoryKind = 'ANALYSIS' | 'GROUP';
export interface MemoryRow { id: string; coachId: string; kind: string; key: string; fingerprint: string; result: any; sources: any; model: string | null; inputTokens: number; outputTokens: number; runs: number; hits: number; createdAt: Date; updatedAt: Date }
type Db = any;
export const missingTable = (e: any) => /does not exist|P2021|P2022|Unknown (field|argument)|not a function|undefined \(reading/i.test(String(e?.code || '') + ' ' + String(e?.message || ''));

export async function readMemory(db: Db, coachId: string, kind: MemoryKind, key: string): Promise<{ row: MemoryRow | null; available: boolean }> {
  try { return { row: (await db.insightMemory.findFirst({ where: { coachId, kind, key } })) || null, available: true }; }
  catch (e) { if (missingTable(e)) return { row: null, available: false }; throw e; }
}

/** Grava (ou troca) a análise. Devolve false se a tabela ainda não existe. */
export async function saveMemory(db: Db, coachId: string, kind: MemoryKind, key: string, v: { fingerprint: string; result: any; sources?: any; model?: string | null; inputTokens?: number; outputTokens?: number }, prev: MemoryRow | null): Promise<boolean> {
  const data = { fingerprint: v.fingerprint, result: v.result, sources: v.sources ?? null, model: v.model ?? null, inputTokens: v.inputTokens ?? 0, outputTokens: v.outputTokens ?? 0 };
  try {
    if (prev) await db.insightMemory.update({ where: { id: prev.id }, data: { ...data, runs: (prev.runs || 0) + 1 } });
    else await db.insightMemory.create({ data: { coachId, kind, key, ...data, runs: 1, hits: 0 } });
    return true;
  } catch (e) { if (missingTable(e)) return false; throw e; }
}

/** Conta um uso da memória (resposta sem gastar IA). Erro aqui nunca derruba a resposta. */
export async function countHit(db: Db, row: MemoryRow): Promise<void> {
  try { await db.insightMemory.update({ where: { id: row.id }, data: { hits: (row.hits || 0) + 1 } }); } catch (e) { /* só estatística */ }
}

/** Esquece as análises de um aluno (ele foi excluído) ou de um coach inteiro (conta excluída). Melhor esforço. */
export async function dropMemory(db: Db, o: { coachId?: string; studentId?: string }): Promise<void> {
  try {
    if (o.coachId) await db.insightMemory.deleteMany({ where: { coachId: o.coachId } });
    if (o.studentId) await db.insightMemory.deleteMany({ where: { kind: 'ANALYSIS', key: o.studentId } });
  } catch (e) { /* tabela ainda não existe */ }
}
