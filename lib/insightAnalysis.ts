// lib/insightAnalysis.ts
// 🧠 (18 out 2026) ANÁLISE COM IA do treino de UM aluno, comparado com os alunos parecidos (lib/similarStudents.ts), COM MEMÓRIA (lib/insightMemory.ts).
// O que a IA recebe: o perfil do aluno de destino (objetivo, nível, frequência, limitações, local; SEM nome, contato ou foto) e um resumo compacto das (até 3) rotinas parecidas, já com o que não
// serve para ele marcado (sem o aparelho, limitação, local). Os alunos-referência viram "Referência 1/2/3" (o nome volta na resposta, no servidor). Ela devolve: como as referências estão
// estruturadas, o que aproveitar, o que mudar, a metodologia sugerida para a próxima rotina e alertas.
// MEMÓRIA (a economia): a resposta é guardada com um "fingerprint" dos dados usados.
//   • mesmo fingerprint            → devolve a análise guardada, SEM chamar a IA (custo zero);
//   • só as referências mudaram    → manda a análise anterior + só as rotinas novas/alteradas e pede para ATUALIZAR (incremental, bem mais barato);
//   • o perfil do aluno mudou      → análise completa de novo.
// `refresh` força completa. `onlyCached` nunca chama a IA (mostra a última análise, dizendo se já está desatualizada).
import Anthropic from '@anthropic-ai/sdk';
import { findSimilar, loadComparison, type SimilarItem } from '@/lib/similarStudents';
import { digestRoutine, diffSources, hashOf, sanitizeAnalysis, type Analysis, type Digest } from '@/lib/insightDigest';
import { readMemory, saveMemory, countHit } from '@/lib/insightMemory';
import { unavailableExerciseIds } from '@/lib/equipment';
import { callTool } from '@/lib/aiTool';

export const ANALYSIS_MODEL = 'claude-sonnet-5-5';
export const MAX_SOURCES = 3;
const TOOL_NAME = 'registrar_analise';

export const SYSTEM_PROMPT = `Você é o assistente de um coach (personal trainer) e analisa treinos de musculação em português do Brasil, de forma curta e prática. Chame a ferramenta ${TOOL_NAME}.

O QUE VOCÊ RECEBE: o perfil de um aluno (o DESTINO) e o resumo das rotinas de alunos parecidos (REFERÊNCIAS), do mesmo gênero e na mesma fase de treino. Em cada exercício, entre colchetes, está o que NÃO serve para o aluno destino: [SEM APARELHO] (ele disse que não tem), [LIMITAÇÃO] (pesa numa articulação com dor dele) e [OUTRO LOCAL] (não combina com o local onde ele treina).

REGRAS
1. Use SÓ o que está nos resumos. Não invente exercício, carga, nome de aluno nem dado que não foi enviado. Chame os alunos-referência de "Referência 1", "Referência 2"...
2. "resumo": 2 a 3 frases que o coach possa ouvir em voz alta (o que as referências têm em comum e o principal a fazer pelo aluno destino).
3. "estrutura": como as rotinas de referência estão montadas (quantos dias, divisão por músculo, séries, técnicas).
4. "aproveitar": o que dá para copiar como está (cite os exercícios).
5. "mudar": o que precisa de troca ou ajuste para ESTE aluno, SEMPRE explicando o motivo (aparelho que ele não tem, limitação, local, nível). Nunca sugira o que está marcado entre colchetes.
6. "metodologia": UMA metodologia/estratégia de treino adequada ao nível e objetivo do aluno (ex.: divisão ABC, full body, bi-sets, progressão de carga...), com o porquê e como aplicar na próxima rotina.
7. "proxima_rotina": uma ideia objetiva para a próxima rotina dele (dias, foco, volume).
8. "alertas": cuidados com as limitações do aluno ou dados que faltam. Pode ser vazio.
9. Seja honesto: se as referências forem poucas ou muito diferentes do aluno, diga no resumo.
10. Você NÃO recebe cargas (quilos) nem histórico de treino feito: não diga que faltam dados de carga e não comente cargas; fale só de estrutura, exercícios, séries, técnicas e adequação ao nível.`;

export const TOOL: any = {
  name: TOOL_NAME,
  description: 'Registra a análise do treino do aluno comparado com os alunos parecidos.',
  input_schema: {
    type: 'object',
    properties: {
      resumo: { type: 'string', description: '2 a 3 frases para ouvir em voz alta.' },
      estrutura: { type: 'array', items: { type: 'string' }, description: 'Até 4 itens: como as referências estão montadas.' },
      aproveitar: { type: 'array', items: { type: 'string' }, description: 'Até 5 itens: o que dá para aproveitar.' },
      mudar: { type: 'array', items: { type: 'string' }, description: 'Até 5 itens: o que mudar para este aluno e por quê.' },
      metodologia: { type: 'object', properties: { nome: { type: 'string' }, porque: { type: 'string' }, como_aplicar: { type: 'string' } }, required: ['nome', 'porque', 'como_aplicar'] },
      proxima_rotina: { type: 'string', description: 'Ideia objetiva para a próxima rotina.' },
      alertas: { type: 'array', items: { type: 'string' }, description: 'Até 3 cuidados. Pode ser vazio.' },
    },
    required: ['resumo', 'estrutura', 'aproveitar', 'mudar', 'metodologia', 'proxima_rotina', 'alertas'],
  },
};

export type Usage = { model: string; inputTokens: number; outputTokens: number; ms: number };
export interface AnalysisSource { studentId: string; name: string; score: number; ordinal: number; routineId: string; flagged: number }
export interface AnalysisResult {
  ok: boolean; reason?: 'NAO_ENCONTRADO' | 'SEM_GENERO' | 'SEM_PARECIDOS' | 'SEM_MEMORIA';
  cached: boolean; incremental: boolean; stale: boolean; memory: boolean;
  analysis: Analysis | null; sources: AnalysisSource[]; updatedAt: Date | null; usage?: Usage;
  stats?: { runs: number; hits: number };
}
type Db = any;
const NONE = (reason: AnalysisResult['reason'], extra: Partial<AnalysisResult> = {}): AnalysisResult => ({ ok: false, reason, cached: false, incremental: false, stale: false, memory: true, analysis: null, sources: [], updatedAt: null, ...extra });

/** O texto do perfil do aluno de destino que vai para a IA (sem nome nem contato). */
export function targetText(t: { gender: string; level: string; objective: string; freq: number | null; limits: string[]; places: string[]; nextOrdinal: number; window: [number, number] }, current: string): string {
  return [
    `Gênero: ${t.gender}. Nível: ${t.level}. Objetivo: ${t.objective || 'não informado'}. Frequência: ${t.freq ?? 'não informada'}x por semana. Local de treino: ${t.places.join(', ') || 'não informado'}.`,
    `Limitações: ${t.limits.length ? t.limits.join(', ') : 'nenhuma'}.`,
    `Fase: está entrando na rotina nº ${t.nextOrdinal} (compara com as rotinas ${t.window[0]} a ${t.window[1]} dos outros).`,
    `Rotina atual dele: ${current || 'ainda não tem'}.`,
  ].join('\n');
}

async function callAI(client: any, user: string): Promise<{ input: any; usage: Usage }> {
  const t0 = Date.now();
  // o claude-sonnet-5-5 não aceita forçar a ferramenta (400): ver lib/aiTool.ts
  const r = await callTool(client, { model: ANALYSIS_MODEL, system: SYSTEM_PROMPT, tool: TOOL, user, maxTokens: 6000, refusalMsg: 'A IA recusou fazer essa análise.', missingMsg: 'A IA não devolveu a análise.' });
  return { input: r.input, usage: { model: ANALYSIS_MODEL, inputTokens: r.usage.inputTokens, outputTokens: r.usage.outputTokens, ms: Date.now() - t0 } };
}

export async function analyzeStudent(db: Db, coachId: string, targetId: string, o: { client?: any; now?: Date; refresh?: boolean; onlyCached?: boolean } = {}): Promise<AnalysisResult> {
  const now = o.now || new Date();
  const sim = await findSimilar(db, coachId, targetId, now);
  if (!sim.ok || !sim.target) return NONE(sim.reason === 'SEM_GENERO' ? 'SEM_GENERO' : 'NAO_ENCONTRADO');
  const { row, available } = await readMemory(db, coachId, 'ANALYSIS', targetId);
  const picked: SimilarItem[] = sim.similar.slice(0, MAX_SOURCES);
  if (!picked.length) return NONE('SEM_PARECIDOS', { memory: available, analysis: row ? (row.result as Analysis) : null, updatedAt: row ? row.updatedAt : null });

  // 1) o que a IA veria: resumo de cada rotina parecida, já com os avisos para ESTE aluno
  const digests: { item: SimilarItem; digest: Digest; label: string }[] = []; let current = '';
  for (let i = 0; i < picked.length; i++) {
    const it = picked[i];
    const cmp = await loadComparison(db, coachId, targetId, it.studentId, it.routine.id);
    if (!cmp.ok || !cmp.comparison) continue;
    digests.push({ item: it, digest: digestRoutine(cmp.comparison.days, { withFlags: true }), label: `Referência ${digests.length + 1}` });
    if (!current && cmp.target) current = digestRoutine(cmp.target.current || []).text.replace(/\n/g, ' | ');
  }
  if (!digests.length) return NONE('SEM_PARECIDOS', { memory: available });
  const t = sim.target;
  const profile = { gender: t.gender, level: t.level.label, objective: t.objective, freq: null as number | null, limits: t.limits, places: t.places, nextOrdinal: t.nextOrdinal, window: t.window };
  // a frequência semanal não vem em findSimilar: lida aqui da anamnese mais nova, só para o texto
  try { const a: any[] = await db.anamnese.findMany({ where: { userId: targetId }, select: { createdAt: true, frequencia: true } }); a.sort((x, y) => new Date(y.createdAt).getTime() - new Date(x.createdAt).getTime()); profile.freq = a[0] && Number(a[0].frequencia) > 0 ? Number(a[0].frequencia) : null; } catch (e) { /* sem anamnese */ }
  // o que ele disse que NÃO tem também é do perfil: mudou, a análise é refeita por inteiro (as marcações de todas as referências mudam)
  const targetHash = hashOf({ profile, current, unavailable: (await unavailableExerciseIds(targetId, db)).sort() });
  const sources: Record<string, string> = { __target: targetHash };
  for (const d of digests) sources[d.item.routine.id] = d.digest.hash;
  const fingerprint = hashOf(sources);
  const meta: AnalysisSource[] = digests.map((d) => ({ studentId: d.item.studentId, name: d.item.name, score: d.item.score, ordinal: d.item.routine.ordinal, routineId: d.item.routine.id, flagged: d.digest.stats.flagged }));
  const labels: Record<string, string> = {}; digests.forEach((d, i) => { labels[String(i + 1)] = `${String(d.item.name || 'Aluno')} (rotina ${d.item.routine.ordinal})`; });
  const base = { sources: meta, memory: available };

  // 2) memória
  if (row && !o.refresh && row.fingerprint === fingerprint) {
    await countHit(db, row);
    return { ok: true, cached: true, incremental: false, stale: false, analysis: row.result as Analysis, updatedAt: row.updatedAt, stats: { runs: row.runs, hits: (row.hits || 0) + 1 }, ...base };
  }
  if (o.onlyCached) {
    if (!row) return NONE('SEM_MEMORIA', { ...base, ok: true });
    return { ok: true, cached: true, incremental: false, stale: true, analysis: row.result as Analysis, updatedAt: row.updatedAt, stats: { runs: row.runs, hits: row.hits || 0 }, ...base };
  }

  // 3) IA (completa ou só o que mudou)
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!o.client && !apiKey) throw new Error('ANTHROPIC_API_KEY não configurada no servidor.');
  const client = o.client || new Anthropic({ apiKey, timeout: 60_000, maxRetries: 0 });
  const prevSources = row && row.sources && typeof row.sources === 'object' ? (row.sources as Record<string, string>) : null;
  const diff = diffSources(prevSources, sources);
  const incremental = !!row && !o.refresh && !!prevSources && prevSources.__target === targetHash && !!row.result;
  const block = (d: (typeof digests)[number]) => `### ${d.label} (parecido ${d.item.score}%, rotina nº ${d.item.routine.ordinal}, ${d.item.routine.sessions} treinos feitos)\n${d.digest.text}`;
  let user: string;
  if (incremental) {
    const changedIds = new Set([...diff.added, ...diff.changed]);
    const fresh = digests.filter((d) => changedIds.has(d.item.routine.id));
    const keep = digests.filter((d) => !changedIds.has(d.item.routine.id)).map((d) => d.label);
    user = `ATUALIZE a análise anterior. O aluno destino NÃO mudou; só as referências abaixo são novas ou foram alteradas. Mantenha o que continua valendo e ajuste o resto.\n\nPERFIL DO ALUNO DESTINO\n${targetText(profile as any, current)}\n\nANÁLISE ANTERIOR (JSON)\n${JSON.stringify(row!.result)}\n\nREFERÊNCIAS NOVAS OU ALTERADAS\n${fresh.map(block).join('\n\n') || '(nenhuma: apenas saiu alguma referência)'}\n\nREFERÊNCIAS QUE CONTINUAM IGUAIS (já consideradas): ${keep.join(', ') || 'nenhuma'}\nREFERÊNCIAS QUE SAÍRAM: ${diff.removed.length}`;
  } else {
    user = `PERFIL DO ALUNO DESTINO\n${targetText(profile as any, current)}\n\nREFERÊNCIAS (alunos parecidos, mesmo gênero)\n${digests.map(block).join('\n\n')}`;
  }
  const r = await callAI(client, user);
  const analysis = sanitizeAnalysis(r.input, labels);
  const saved = await saveMemory(db, coachId, 'ANALYSIS', targetId, { fingerprint, result: analysis, sources, model: r.usage.model, inputTokens: r.usage.inputTokens, outputTokens: r.usage.outputTokens }, row);
  try { await db.aiLog?.create?.({ data: { userId: coachId, question: `insight-analysis:${targetId}:${incremental ? 'inc' : 'full'}`, answer: JSON.stringify({ usage: r.usage, sources: digests.length }).slice(0, 2000) } }); } catch (e) { /* só registro de uso */ }
  return { ok: true, cached: false, incremental, stale: false, analysis, updatedAt: now, usage: r.usage, stats: { runs: (row?.runs || 0) + 1, hits: row?.hits || 0 }, sources: meta, memory: saved || available };
}
