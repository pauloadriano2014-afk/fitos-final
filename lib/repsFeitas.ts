// lib/repsFeitas.ts
// 🔢 (29 out 2026) CHAVE das REPETIÇÕES FEITAS (o aluno anotar quantas repetições fez). DESLIGADA por padrão, para todo mundo (inclusive alunos do Paulo e da Adri). Quem liga, nessa ordem:
//   1. a chave DO ALUNO (`User.repsMode`): 'ON' liga só para ele, 'OFF' desliga só para ele; vazio (nulo) = segue as regras abaixo;
//   2. a chave do COACH do aluno (lib/coachFeatures.ts, recurso `repsFeitas`): concessão do master a um coach específico, ou a chave GERAL (FeatureGlobal) = todos os alunos de todos os coaches.
//      (Aqui o time master NÃO ganha o recurso sozinho: ele tem que ser concedido, senão o recurso nasceria ligado para os alunos do Paulo e da Adri.)
// Sem nada disso o aluno não vê as caixas de repetição e o servidor não grava `repsDone` dele. Se a consulta falhar (tabela ainda não criada, banco fora do ar) responde "desligado".
import { resolveCoachFeatures } from '@/lib/coachFeatures';

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
  const coachId = student.coachId || null;
  if (!coachId) return { on: false, source: null };   // sem coach vinculado não há a quem conceder: só a chave do próprio aluno liga
  try {
    // isMaster: false de propósito: o time master não recebe o recurso "de graça" (nasce desligado); vale concessão ou chave geral
    const f = await resolveCoachFeatures(db, coachId, { isMaster: false });
    const s = f.repsFeitas;
    return s && s.on ? { on: true, source: s.source } : { on: false, source: null };
  } catch (e: any) {
    console.error('[repsFeitas] chave:', e?.message || e);
    return { on: false, source: null, error: true };
  }
}
