// lib/repsFeitas.ts
// 🔢 (29 out 2026) CHAVE das REPETIÇÕES FEITAS (o aluno anotar quantas repetições fez). Quem decide, nessa ordem:
//   1. a chave DO ALUNO (`User.repsMode`): 'ON' liga só para ele, 'OFF' desliga só para ele; vazio (nulo) = segue as regras abaixo;
//   2. o próprio aluno é do time master (Paulo/Adri treinando pelo app): ligado;
//      (aluno sem coach vinculado conta como do time master);
//   3. a chave do COACH do aluno (lib/coachFeatures.ts, recurso `repsFeitas`): time master (Paulo/Adri) = sempre ligada, então os alunos deles já nascem com o recurso;
//      chave GERAL (FeatureGlobal) ligada = todos os alunos de todos os coaches; ou concessão do master a um coach específico.
// Sem nada disso o aluno não vê as caixas de repetição e o servidor não grava `repsDone` dele. Se a consulta falhar (tabela ainda não criada, banco fora do ar) responde "desligado".
import { resolveCoachFeatures } from '@/lib/coachFeatures';
import { MASTER_IDS } from '@/lib/masterIds';

export type RepsMode = 'ON' | 'OFF';
export type RepsSource = 'STUDENT' | 'MASTER' | 'GLOBAL' | 'GRANT' | null;
export type RepsAccess = { on: boolean; source: RepsSource; error?: boolean };   // error = a consulta falhou (quem grava dados prefere não perder o que o aluno anotou)

/** O que o app mandou -> 'ON' / 'OFF' / null (qualquer outra coisa = sem chave própria, segue a regra geral). */
export function cleanRepsMode(v: unknown): RepsMode | null {
  const s = String(v ?? '').trim().toUpperCase();
  return s === 'ON' || s === 'OFF' ? s : null;
}

export async function repsAccessFor(db: any, student: { id?: string | null; coachId?: string | null; repsMode?: string | null } | null | undefined): Promise<RepsAccess> {
  if (!student) return { on: false, source: null };
  const mode = cleanRepsMode(student.repsMode);
  if (mode) return { on: mode === 'ON', source: 'STUDENT' };
  if (student.id && MASTER_IDS.includes(student.id)) return { on: true, source: 'MASTER' };
  // aluno sem coach vinculado é aluno do time master (mesma regra da agenda: `coachId` nulo ou do Paulo/Adri)
  const coachId = student.coachId || null;
  if (!coachId) return { on: true, source: 'MASTER' };
  try {
    const f = await resolveCoachFeatures(db, coachId, { isMaster: MASTER_IDS.includes(coachId) });
    const s = f.repsFeitas;
    return s && s.on ? { on: true, source: s.source } : { on: false, source: null };
  } catch (e: any) {
    console.error('[repsFeitas] chave:', e?.message || e);
    return { on: false, source: null, error: true };
  }
}
