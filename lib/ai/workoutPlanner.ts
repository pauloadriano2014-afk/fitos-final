// lib/ai/workoutPlanner.ts
// 🧠 (19 out 2026) MONTAGEM DE TREINO MAIS INTELIGENTE: tudo o que o servidor decide ANTES e DEPOIS da IA, em funções puras (sem banco, sem IA).
// Antes a IA recebia a biblioteca inteira (~38 mil tokens de códigos) e decidia tudo sozinha; a "variação" era só "troque 40%". Agora:
//   1) NÍVEL        — técnicas e exercícios que o nível do aluno aguenta, faixa de repetições da fase (levelPolicy, repRange);
//   2) PROGRESSÃO   — para cada exercício da rotina anterior: estágio (evoluindo/estagnado/pesado/fácil), carga-alvo e o que fazer (MANTER a âncora
//                     para progredir, TROCAR o acessório para variar) — buildFacts;
//   3) CANDIDATOS   — em vez da biblioteca inteira, ~10–24 exercícios por grupo já filtrados (nível, sem duplicados, novidade, aparelho), com a âncora
//                     marcada para repetir — buildCandidates; códigos curtos (E001) no lugar de UUIDs — CodeBook;
//   4) REVISÃO      — depois da IA: completa o que faltou, tira o que passou, acerta séries/técnica/repetições pelo nível, troca o que repetiu do ciclo
//                     anterior (ou apareceu em dois dias) por outro do mesmo músculo, e só deixa carga onde há histórico — refineWorkout.
// Nada aqui grava no banco.
import { MUSCLE_GROUPS } from '@/lib/ai/splitPresets';
import { aliasesOf } from '@/lib/autoPlanQuality';
import { levelFix, levelIssues, advancedTechsFor, techNorm } from '@/lib/similarStudents';
import { looksLikeMachine, nameKey, pickSwap, type LibEx } from '@/lib/exerciseSwap';
import { LEVEL_LABEL, type LevelKey } from '@/lib/studentLevel';
import { sessionsOf, suggestLoad } from '@/lib/loadSuggest';
import { sideValue } from '@/lib/exerciseLoad';
import { shapeReps, type RepChoice } from '@/lib/ai/repSchemes';
import { muscleTarget } from '@/lib/ai/muscleTarget';
import { areLinked, linkedToAny, linkedIds, type SubLinks } from '@/lib/ai/subFamily';   // 🔗 substituto = opção de troca, nunca 2 exercícios no mesmo dia

export interface PlanGroup { id: string; qty: number; sets?: number; rest?: number }
export interface PlanDay { name: string; groups: PlanGroup[] }
export interface PrevEx { exerciseId: string; name: string; target: string; mechanic: string; category: string }
/** Uma rotina anterior do aluno (a mais nova primeiro, na lista que o gerador monta). */
export interface PrevRoutine { name: string; days: Record<string, PrevEx[]> }
export interface GenBlock { sets: string; reps: string; load: string; restTime: string; technique: string }
export interface GenEx { exerciseId: string; title: string; videoUrl: string; category: string; subCategory: any; observation: string; substitute: any; blocks: GenBlock[] }

export const ANCHOR_MAX_CYCLES = 3;    // uma âncora (composto) fica no máximo 3 rotinas seguidas; depois vira uma variação
export const MAX_ANCHORS_PER_DAY = 2;  // e só as 2 primeiras de cada dia seguram (o resto gira), senão biblioteca cheia de compostos nunca varia

const targetOf = (e: { tags?: any; category?: any; subCategory?: any }) => muscleTarget(e);   // o músculo já corrigido pela categoria (ver muscleTarget.ts)
const mechOf = (e: { tags?: any }) => String(e.tags?.mechanic || '').toUpperCase();
const equipOf = (e: { tags?: any }) => String(e.tags?.equipment || '').toUpperCase();
const isCardioLib = (e: { tags?: any; category?: any }) => String(e.category || '').toUpperCase() === 'CARDIO' || String(e.tags?.target || '').toUpperCase() === 'CARDIO';
const num = (v: any): number | null => { const n = parseFloat(String(v ?? '').replace(',', '.')); return Number.isFinite(n) ? n : null; };
const fmtKg = (n: number) => String(Math.round(n * 100) / 100).replace(',', '.');
const groupInfo = (id: string): any => (MUSCLE_GROUPS as any[]).find((g) => g.id === id);
const LIGHT_EQ = ['HALTER', 'LIVRE', 'PESO_CORPORAL', 'CANELEIRA', 'BARRA', 'OUTROS'];   // em casa/condomínio: o que dá para fazer sem aparelho (Smith conta como aparelho, abaixo)
// A biblioteca real marca TODO exercício de glúteo como isolado (hip thrust incluso) e usa rótulos genéricos (PERNAS, COSTAS, OMBROS) ao lado dos específicos.
// Músculos grandes: o 1º exercício do dia daquele músculo é o "levantamento principal" e vira âncora mesmo sem a etiqueta de composto.
const BIG_TARGETS = new Set(['PEITO', 'PEITO_SUPERIOR', 'PEITO_MEDIAL', 'PEITO_INFERIOR', 'COSTAS', 'COSTAS_PUXADA', 'COSTAS_REMADA', 'PERNAS_MULTI', 'QUADRICEPS', 'POSTERIORES', 'POSTERIOR', 'GLUTEOS', 'PERNAS', 'OMBRO_MULTI', 'OMBRO_FRONTAL', 'OMBROS']);
const GENERIC_TARGETS = new Set(['PERNAS', 'COSTAS', 'OMBROS']);
/** rótulo genérico para o grupo pedido: PERNAS/COSTAS/OMBROS soltos, ou multiarticular de perna etiquetado só PERNAS caindo em Quadríceps/Glúteos/... (o etiquetado do próprio músculo vale) */
const isGenericFor = (e: LibEx, gid: string) => {
  const t = targetOf(e);
  if (GENERIC_TARGETS.has(t)) return true;
  if (t !== 'PERNAS_MULTI' || gid === 'PERNAS_MULTI') return false;
  const raw = String((e.tags as any)?.target ?? '').trim().toUpperCase();
  return !(raw === gid || raw === 'QUADRICEPS' && gid === 'QUADRICEPS');
};

// ───────────────────────────── 1) NÍVEL ─────────────────────────────
const LEVEL_TEXT: Record<LevelKey, string> = {
  INICIANTE: 'movimentos simples e guiados (máquinas, polias, halteres leves, peso do corpo). NADA de exercício técnico ou complexo (terra, agachamento livre/frontal/búlgaro, barra fixa sem ajuda, paralelas, desenvolvimento militar em pé). Sem técnicas avançadas. Foco em aprender o movimento e criar base.',
  INTERMEDIARIO: 'base de compostos livres + isolados. Pode usar BISET, DROPSET e RESTPAUSE com moderação (no máximo 1 a 2 exercícios por dia). Sem GVT, 21 e CLUSTERSET.',
  AVANCADO: 'pode usar qualquer técnica, compostos pesados, mais volume e variações unilaterais. Técnica avançada nos exercícios-chave do dia, não em todos.',
};
const PHASE_REPS: Record<string, [number, number]> = { HIPERTROFIA: [8, 15], FORCA: [3, 6], CHOQUE: [6, 12], DELOAD: [15, 20], EMAGRECIMENTO: [12, 20], DEFINICAO: [12, 15] };

/** Faixa de repetições da fase, ajustada ao nível (iniciante não faz série de 3 a 5 repetições no primeiro mês). */
export const REP_CAP = 15;         // 🔒 (24 out 2026) teto de repetições por série: os alunos do Paulo fazem 15/12/10/8, nunca 18 ou 20 (a faixa da fase chegava a 20 e a IA usava)
export const CALF_REP_CAP = 20;    // panturrilha é a exceção (20/18/15/15 é normal nela) quando o coach não escolheu um teto próprio
const capOf = (v: any): number => { const n = Math.round(Number(v)); return Number.isFinite(n) && n >= 6 && n <= 40 ? n : REP_CAP; };
export function repRange(phase: string | null | undefined, level: LevelKey | null | undefined, cap?: number | null): [number, number] {
  const base = PHASE_REPS[String(phase || '').toUpperCase()] || [8, 15];
  const r: [number, number] = level === 'INICIANTE' ? [Math.max(base[0], base[1] <= 6 ? 6 : 8), Math.max(base[1], 10)] : [base[0], base[1]];
  const hi = Math.min(r[1], capOf(cap));
  return [Math.min(r[0], hi), hi];
}

export interface LevelPolicy { level: LevelKey; label: string; banned: string[]; reps: [number, number]; text: string }
export function levelPolicy(level: LevelKey, phase: string | null | undefined, cap?: number | null): LevelPolicy {
  const reps = repRange(phase, level, cap);
  const banned = advancedTechsFor(level);
  const text = `NÍVEL DO ALUNO: ${LEVEL_LABEL[level]} — ${LEVEL_TEXT[level]}\nFaixa de repetições desta fase para este nível: ${reps[0]} a ${reps[1]} (cardio e técnicas com repetição própria ficam de fora).${banned.length ? `\nTécnicas PROIBIDAS para este nível: ${banned.join(', ')}.` : ''}`;
  return { level, label: LEVEL_LABEL[level], banned, reps, text };
}

/** As técnicas que o coach marcou, sem as que o nível não aguenta (devolve também as que saíram, para avisar). */
export function techniquesForLevel(techniques: string[], level: LevelKey | null | undefined): { kept: string[]; removed: string[] } {
  if (!level) return { kept: techniques, removed: [] };
  const banned = advancedTechsFor(level);
  const kept: string[] = [], removed: string[] = [];
  for (const t of techniques) (banned.includes(techNorm(String(t))) ? removed : kept).push(t);
  return { kept, removed };
}

// ───────────────────────────── 2) PROGRESSÃO ─────────────────────────────
export type Status = 'PROGREDINDO' | 'ESTAGNADO' | 'PESADO' | 'FACIL' | 'SEM_DADOS' | 'NAO_FEZ';
const STATUS_TXT: Record<Status, string> = { PROGREDINDO: 'evoluindo', ESTAGNADO: 'estagnado', PESADO: 'ficou pesado', FACIL: 'ficou fácil', SEM_DADOS: 'pouco histórico', NAO_FEZ: 'sem registro' };

export interface ExFact {
  exerciseId: string; name: string; target: string; day: string; pos: number; cardio: boolean;
  /** em quantas rotinas seguidas (contando a anterior) o exercício apareceu */
  age: number; role: 'ANCORA' | 'ACESSORIO'; status: Status; sessions: number;
  /** carga TOTAL (kg) por série no último treino, e a carga-alvo para o próximo (por série) */
  loads: number[]; targetLoads: number[]; perSide: boolean; action: 'UP' | 'HOLD' | 'DOWN' | null;
  plan: 'MANTER' | 'TROCAR'; why: string;
}

/**
 * Para cada exercício da rotina mais recente: o que aconteceu com ele (histórico + "como foi") e o que fazer agora.
 * `prev` = rotinas anteriores, a mais nova primeiro. `history` = treinos executados (WorkoutHistory + details), do mais novo para o mais velho.
 */
export function buildFacts(prev: PrevRoutine[], history: any[], now: Date = new Date()): ExFact[] {
  const latest = prev[0]; if (!latest) return [];
  const names = prev.map((r) => new Set(Object.values(r.days).flat().map((e) => nameKey(e.name))));
  const facts: ExFact[] = [];
  for (const [day, list] of Object.entries(latest.days)) {
    let anchors = 0; const seenTarget = new Set<string>();
    list.forEach((e, pos) => {
      const key = nameKey(e.name);
      let age = 0; for (const s of names) { if (s.has(key)) age++; else break; }
      const cardio = String(e.category || '').toUpperCase() === 'CARDIO' || String(e.target || '').toUpperCase() === 'CARDIO';
      const sess = cardio ? [] : sessionsOf(history, e.exerciseId);
      const sug = suggestLoad(sess, { now });
      const n = sess.length; const tops = sess.map((s) => Math.max(...s.sets.map((x) => x.weight)));
      let status: Status = n === 0 ? 'NAO_FEZ' : n < 2 ? 'SEM_DADOS' : 'ESTAGNADO';
      if (n >= 2) { const ref = tops[Math.min(n, 3) - 1]; if (tops[0] > ref + 0.01) status = 'PROGREDINDO'; else if (n < 3) status = 'SEM_DADOS'; }
      const eff = sess[0]?.effort;
      if (eff === 'PESADO') status = 'PESADO'; else if (eff === 'FACIL' && status !== 'PROGREDINDO') status = 'FACIL';
      const last = sess[0]; const loads = last ? last.sets.map((s) => s.weight) : [];
      const targetLoads = sug ? last!.sets.map((s) => sug.loads[s.setNumber] ?? s.weight) : loads;
      const perSide = !!last && last.sets.every((s) => s.perSide);
      const tgt = String(e.target || '').toUpperCase(); const firstOfTarget = !seenTarget.has(tgt); seenTarget.add(tgt);
      const role: 'ANCORA' | 'ACESSORIO' = !cardio && (String(e.mechanic || '').toUpperCase() === 'COMPOSTO' || (BIG_TARGETS.has(tgt) && firstOfTarget)) ? 'ANCORA' : 'ACESSORIO';
      let plan: 'MANTER' | 'TROCAR' = 'TROCAR'; let why = 'acessório: gira a cada ciclo';
      if (cardio) { plan = 'MANTER'; why = 'cardio não entra na rotação'; }
      else if (role === 'ANCORA') {
        if (age >= ANCHOR_MAX_CYCLES) why = `âncora há ${age} rotinas seguidas: trocar por uma variação`;
        else if (status === 'ESTAGNADO' && age >= 2) why = 'estagnou: variar o estímulo';
        else if (anchors >= MAX_ANCHORS_PER_DAY) why = 'já há âncoras suficientes neste dia';
        else { plan = 'MANTER'; anchors++; why = status === 'PROGREDINDO' ? 'evoluindo: manter e subir a carga' : status === 'PESADO' ? 'segurar a carga e consolidar' : 'âncora: repetir para progredir'; }
      }
      facts.push({ exerciseId: e.exerciseId, name: e.name, target: String(e.target || ''), day, pos, cardio, age, role, status, sessions: n, loads, targetLoads, perSide, action: sug ? sug.action : null, plan, why });
    });
  }
  return facts;
}

const fmtLoads = (loads: number[], perSide: boolean) => {
  const v = loads.map((l) => fmtKg(perSide ? sideValue(l) : l));
  return `${v.join('/')} kg${perSide ? ' cada lado' : ''}`;
};

// ───────────────────────────── códigos curtos ─────────────────────────────
/** E001, E002... no lugar de UUIDs: prompt bem menor e a IA erra menos ao copiar. `resolve` devolve o id verdadeiro (ou o próprio texto, se já for um id). */
export class CodeBook {
  private toC = new Map<string, string>(); private fromC = new Map<string, string>();
  code(id: string): string {
    let c = this.toC.get(id);
    if (!c) { c = 'E' + String(this.toC.size + 1).padStart(3, '0'); this.toC.set(id, c); this.fromC.set(c, id); }
    return c;
  }
  resolve(raw: any): string { const s = String(raw ?? '').trim(); return this.fromC.get(s.toUpperCase()) || s; }
  get size() { return this.toC.size; }
}

// ───────────────────────────── 3) CANDIDATOS ─────────────────────────────
export interface CandCtx { days: PlanDay[]; library: LibEx[]; facts: ExFact[]; prev: PrevRoutine[]; level: LevelKey | null; env: string; levelRules: boolean; /** exercícios que o coach fixou: sempre no topo da lista do grupo */ pins?: Set<string>; /** 🔗 quem é substituto de quem (lib/ai/subFamily.ts): só um da dupla aparece no cardápio do grupo */ subLinks?: SubLinks }
export interface Candidates { byGroup: Map<string, LibEx[]>; notes: string[]; latestNames: Set<string>; olderNames: Set<string> }

export function recentNames(prev: PrevRoutine[]): { latestNames: Set<string>; olderNames: Set<string> } {
  const of = (r?: PrevRoutine) => new Set(r ? Object.values(r.days).flat().map((e) => nameKey(e.name)) : []);
  const latestNames = of(prev[0]); const olderNames = new Set<string>();
  for (const r of prev.slice(1)) for (const k of of(r)) olderNames.add(k);
  return { latestNames, olderNames };
}

export function buildCandidates(c: CandCtx): Candidates {
  const notes: string[] = []; const byGroup = new Map<string, LibEx[]>();
  const { latestNames, olderNames } = recentNames(c.prev);
  const keep = new Set(c.facts.filter((f) => f.plan === 'MANTER' && !f.cardio).map((f) => f.exerciseId));
  const pins = c.pins || new Set<string>();
  const light = c.env === 'CONDOMINIO' || c.env === 'EM_CASA';
  const groups = new Map<string, { total: number; maxDay: number }>();
  for (const d of c.days) for (const g of d.groups) {
    if (g.id === 'MOBILIDADE') continue;
    const cur = groups.get(g.id) || { total: 0, maxDay: 0 }; cur.total += Number(g.qty) || 0; cur.maxDay = Math.max(cur.maxDay, Number(g.qty) || 0); groups.set(g.id, cur);
  }
  for (const [gid, q] of groups) {
    const aliases = aliasesOf(gid);
    const seen = new Set<string>();
    // 🦵🫁 se o plano tem o grupo ESPECÍFICO (Pernas — Multi., Peito — Superior...), o exercício dele fica só nesse grupo e não duplica no mais geral (Quadríceps, Peito...)
    const specificElsewhere = (e: LibEx) => { const t = targetOf(e); return t !== gid && groups.has(t) && aliases.includes(t); };
    let pool = c.library.filter((e) => (aliases.includes(targetOf(e)) || (gid === 'CARDIO' && isCardioLib(e))) && !specificElsewhere(e)).filter((e) => {
      const k = nameKey(e.name); if (!k) return false;
      if (seen.has(k)) return false; seen.add(k); return true;
    });
    // 🔁 nome repetido na biblioteca: fica o que tem vídeo (a ordem original decide o resto)
    const withVideo = new Map<string, LibEx>(); for (const e of c.library) { const k = nameKey(e.name); if (e.videoUrl && !withVideo.has(k)) withVideo.set(k, e); }
    pool = pool.map((e) => withVideo.get(nameKey(e.name)) && !e.videoUrl && aliases.includes(targetOf(withVideo.get(nameKey(e.name))!)) ? withVideo.get(nameKey(e.name))! : e);
    if (c.levelRules && c.level && gid !== 'CARDIO') {
      const ok = pool.filter((e) => !levelIssues(e.name, null, c.level).length);
      if (ok.length >= Math.min(pool.length, Math.max(2, q.maxDay + 1))) { if (ok.length < pool.length) notes.push(`${gid}: ${pool.length - ok.length} exercício(s) complexo(s) demais para o nível ficaram de fora`); pool = ok; }
      else if (ok.length < pool.length) notes.push(`${gid}: poucos exercícios simples na biblioteca, mantidos também os complexos`);
    }
    const restType = groupInfo(gid)?.restType;
    const score = (e: LibEx) => {
      const k = nameKey(e.name); let s = 0;
      if (pins.has(e.id)) s += 20; else if (keep.has(e.id)) s += 10; else if (latestNames.has(k)) s -= 6;
      if ((e.tags as any)?.favorite === true) s += 2;   // favorito do coach
      if (olderNames.has(k)) s -= 2;
      if (!isGenericFor(e, gid)) s += 4;   // exercício do músculo certo antes do rótulo genérico (PERNAS no lugar de glúteo)
      if (e.videoUrl) s += 1;
      const m = mechOf(e); if (restType === 'MULTI') s += m === 'COMPOSTO' ? 2 : 0; else if (restType === 'ISOLADO') s += m === 'ISOLADO' ? 1 : 0;
      const eq = equipOf(e);
      if (light) { if (eq === 'MAQUINA' || eq === 'SMITH' || looksLikeMachine(e.name)) s -= 3; else if (LIGHT_EQ.includes(eq)) s += 2; else if (eq === 'POLIA') s += 1; }
      else if (c.level === 'INICIANTE' && restType === 'MULTI' && (eq === 'MAQUINA' || eq === 'POLIA')) s += 1;
      return s;
    };
    const cap = Math.min(24, Math.max(10, q.total * 5));
    const ranked = pool.map((e) => ({ e, s: score(e) })).sort((a, b) => b.s - a.s || nameKey(a.e.name).localeCompare(nameKey(b.e.name)));
    const picked: LibEx[] = []; const eqCount: Record<string, number> = {}; const sibs: LibEx[] = [];   // sibs = substitutos deixados de fora do cardápio
    while (picked.length < cap && ranked.length) {
      let bi = 0, bv = -Infinity;
      for (let i = 0; i < ranked.length; i++) { const v = ranked[i].s - 0.5 * (eqCount[equipOf(ranked[i].e)] || 0); if (v > bv) { bv = v; bi = i; } }
      const [it] = ranked.splice(bi, 1); picked.push(it.e); const eq = equipOf(it.e); eqCount[eq] = (eqCount[eq] || 0) + 1;
      if (c.subLinks && gid !== 'CARDIO') for (let i = ranked.length - 1; i >= 0; i--) if (areLinked(c.subLinks, it.e.id, ranked[i].e.id) && !pins.has(ranked[i].e.id)) sibs.unshift(...ranked.splice(i, 1).map((x) => x.e));   // 🔗 o substituto dele sai do cardápio (continua como opção de troca para o aluno)
    }
    // 🔗 regra suave: se, sem os substitutos, não sobram exercícios para o maior dia do grupo, eles voltam (melhor um substituto do que dia incompleto)
    if (sibs.length && picked.length < q.maxDay) { while (picked.length < q.maxDay && sibs.length) picked.push(sibs.shift()!); notes.push(`${gid}: a biblioteca tem poucos movimentos diferentes, substitutos voltaram ao cardápio`); }
    byGroup.set(gid, picked);
  }
  return { byGroup, notes, latestNames, olderNames };
}

// ───────────────────────────── texto para a IA ─────────────────────────────
const dayQty = (days: PlanDay[], gid: string) => days.map((d) => { const g = d.groups.find((x) => x.id === gid); return g ? `${d.name}:${g.qty}` : null; }).filter(Boolean).join(', ');

export function candidatesText(c: Candidates, days: PlanDay[], facts: ExFact[], book: CodeBook, env: string, pins: Set<string> = new Set()): string {
  const keep = new Set(facts.filter((f) => f.plan === 'MANTER' && !f.cardio).map((f) => f.exerciseId));
  const lines: string[] = [`BANCO DE CANDIDATOS (ambiente ${env}) — código | nome | tipo/equipamento | aviso`];
  for (const [gid, list] of c.byGroup) {
    lines.push(`## ${gid} — vagas por dia (${dayQty(days, gid)})`);
    for (const e of list) {
      const tag = pins.has(e.id) ? 'FIXADO pelo coach (obrigatório)' : keep.has(e.id) ? 'MANTER' : c.latestNames.has(nameKey(e.name)) ? 'REPETIDO do ciclo anterior (evite)' : '';
      lines.push(`${book.code(e.id)} | ${e.name} | ${mechOf(e) || '?'}/${equipOf(e) || '?'}${tag ? ` | ${tag}` : ''}`);
    }
  }
  return lines.join('\n');
}

export function rotationText(prev: PrevRoutine[], facts: ExFact[], book: CodeBook): string {
  if (!prev.length) return 'ROTINA ANTERIOR: nenhuma. Monte a primeira rotina do aluno: variada, com compostos básicos e cargas em branco.';
  const byDay = new Map<string, ExFact[]>(); for (const f of facts) { if (!byDay.has(f.day)) byDay.set(f.day, []); byDay.get(f.day)!.push(f); }
  const out: string[] = [`ROTINA ANTERIOR "${prev[0].name}" — o que fazer com cada exercício (MANTER = repita o mesmo código; TROCAR = escolha OUTRO do mesmo grupo):`];
  for (const [day, list] of byDay) {
    out.push(`Dia ${day}:`);
    for (const f of list) {
      const bits = [`${book.code(f.exerciseId)} ${f.name}`, f.cardio ? '[cardio]' : `[${f.role === 'ANCORA' ? 'âncora' : 'acessório'}, ${f.age} ${f.age === 1 ? 'rotina' : 'rotinas'} seguidas]`];
      if (!f.cardio && f.sessions) bits.push(`${STATUS_TXT[f.status]}; última carga ${fmtLoads(f.loads, f.perSide)}`);
      bits.push(`→ ${f.plan}`);
      if (f.plan === 'MANTER' && !f.cardio && f.targetLoads.length) bits.push(`alvo ${fmtLoads(f.targetLoads, f.perSide)}${f.action === 'UP' ? ' (subir)' : f.action === 'DOWN' ? ' (descer)' : ''}`);
      out.push(`  ${bits.join(' · ')}`);
    }
  }
  const { olderNames } = recentNames(prev);
  if (olderNames.size) out.push(`Usados antes dela (evite voltar tão cedo): ${[...olderNames].slice(0, 40).join(', ')}`);
  return out.join('\n');
}

// ───────────────────────────── 4) REVISÃO DEPOIS DA IA ─────────────────────────────
export interface RefineCtx {
  days: PlanDay[]; phase: string; level: LevelKey | null; levelRules: boolean;
  lib: Map<string, LibEx>; pool: LibEx[]; cands: Candidates; facts: ExFact[]; hasPrev: boolean;
  env: string; jointRisks: string[]; unavailable: Set<string>;
  /** exercícios que o aluno já fez com carga (só neles a carga escrita vale) */
  loaded: Set<string>;
  /** exercícios que o coach fixou: entram na rotina (no lugar de um acessório do mesmo músculo) e nunca são trocados pela rotação */
  pins?: Set<string>;
  /** 🔗 quem é substituto de quem (lib/ai/subFamily.ts): no mesmo dia nunca entram dois da mesma dupla (o fixado pelo coach não é tirado) */
  subLinks?: SubLinks;
  /** escolha de repetições do coach (quadradinho "Repetições" da tela); sem escolha = pirâmide automática pela fase */
  repChoice?: RepChoice;
  /** teto de repetições por série escolhido pelo coach (sem escolha = REP_CAP; panturrilha fica com CALF_REP_CAP) */
  repCap?: number | null;
  makeEx: (e: LibEx, blocks: GenBlock[]) => GenEx;
}
export interface Quality {
  score: number; fixes: string[]; issues: string[];
  stats: { pinned: number; repairs: number; exercises: number; newPct: number | null; kept: number; swapped: number; filled: number; trimmed: number; techStripped: number; loadsFixed: number; repsShaped: number; groupSets: Record<string, number> };
}

const OWN_BLOCKS = new Set(['GVT', '21', 'CLUSTERSET', 'DROPSET', 'RESTPAUSE']);
const NEEDS_LOAD = new Set(['DROPSET', 'RESTPAUSE', '21', 'CLUSTERSET', 'TUT']);
const SPECIAL_REPS = new Set(['21', 'CLUSTERSET', 'GVT']);
const CHAIN = new Set(['BISET', 'TRISET']);
const techOfBlock = (b: GenBlock) => techNorm(String(b.technique || ''));
const PUSH = ['PEITO', 'PEITO_SUPERIOR', 'PEITO_MEDIAL', 'PEITO_INFERIOR', 'OMBRO_MULTI', 'OMBRO_FRONTAL', 'OMBRO_LATERAL', 'TRICEPS'];
const PULL = ['COSTAS_PUXADA', 'COSTAS_REMADA', 'OMBRO_POST', 'BICEPS', 'TRAPEZIO'];

function clampReps(reps: string, [lo, hi]: [number, number]): string {
  const s = String(reps ?? '').trim();
  const m = s.match(/^(\d+)\s*[-–a]\s*(\d+)$/);
  if (m) { const a = Math.min(Math.max(+m[1], lo), hi), b = Math.min(Math.max(+m[2], lo), hi); return a === b ? String(a) : `${a}-${b}`; }
  if (/^\d+$/.test(s)) return String(Math.min(Math.max(+s, lo), hi));
  return s || String(Math.round((lo + hi) / 2));
}

export function refineWorkout(byDay: Record<string, GenEx[]>, ctx: RefineCtx): { byDay: Record<string, GenEx[]>; groupIds: Record<string, Record<string, string>>; quality: Quality } {
  const fixes: string[] = [], issues: string[] = [];
  let repairs = 0;
  const fix = (msg: string) => { repairs++; fixes.push(msg); };
  const st = { swapped: 0, filled: 0, trimmed: 0, techStripped: 0, loadsFixed: 0, repsShaped: 0 };
  let pinnedIn = 0;
  const out: Record<string, GenEx[]> = { ...byDay };
  const lvl = ctx.levelRules ? ctx.level : null;
  const reps = repRange(ctx.phase, lvl, ctx.repCap);
  const calfReps = ctx.repCap == null ? repRange(ctx.phase, lvl, CALF_REP_CAP) : reps;   // panturrilha pode passar do teto geral, a menos que o coach tenha escolhido um teto
  const { latestNames, olderNames } = ctx.cands;
  const libOf = (ex: GenEx) => ctx.lib.get(ex.exerciseId);
  const exTarget = (ex: GenEx) => { const l = libOf(ex); return l ? targetOf(l) : String(ex.category || '').toUpperCase(); };
  const exCardio = (ex: GenEx) => { const l = libOf(ex); return String(ex.category || '').toUpperCase() === 'CARDIO' || (!!l && isCardioLib(l)); };
  const groupOf = new Map<GenEx, PlanGroup>();
  const routineNames = new Set<string>();

  // ── a) cada dia: encaixar nos grupos pedidos, tirar o que passou, completar o que faltou, ordenar ──
  for (const d of ctx.days) {
    const src = byDay[d.name]; if (!Array.isArray(src) || !src.length) continue;
    const list = src.slice();
    const groups = d.groups.filter((g) => g.id !== 'MOBILIDADE');
    // mesmo exercício duas vezes no dia (mesmo id ou mesmo nome): fica o primeiro
    { const ids = new Set<string>(), nm = new Set<string>(); const uniq = list.filter((ex) => { const k = nameKey(ex.title); if (ids.has(ex.exerciseId) || nm.has(k)) return false; ids.add(ex.exerciseId); nm.add(k); return true; });
      if (uniq.length !== list.length) { fix(`Dia ${d.name}: ${list.length - uniq.length} exercício(s) repetido(s) no mesmo dia removido(s)`); list.splice(0, list.length, ...uniq); } }
    // 🔗 substituto não é segundo exercício: se a IA pôs "Panturrilha máquina" e "Panturrilha no Smith" no mesmo dia, fica o primeiro (a vaga é completada abaixo com OUTRO movimento)
    if (ctx.subLinks) {
      const kept: GenEx[] = []; const dropped: string[] = [];
      for (const ex of list) {
        const twin = exCardio(ex) ? undefined : kept.find((k) => !exCardio(k) && areLinked(ctx.subLinks, k.exerciseId, ex.exerciseId));   // cardio fica de fora: esteira/bicicleta podem se alternar
        if (twin && !(ctx.pins || new Set<string>()).has(ex.exerciseId)) { dropped.push(`"${ex.title}" (mesmo movimento de "${twin.title}")`); continue; }
        kept.push(ex);
      }
      if (dropped.length) { fix(`Dia ${d.name}: substituto não entra como 2º exercício, tirou ${dropped.join(', ')}`); list.splice(0, list.length, ...kept); }
    }
    const cap = groups.map((g) => Math.max(0, Number(g.qty) || 0));
    const slot: GenEx[][] = groups.map(() => []); let left: GenEx[] = list.slice();
    const dayGroupIds = new Set(groups.map((g) => g.id));
    const place = (strict: boolean) => {
      left = left.filter((ex) => {
        const t = exTarget(ex);
        for (let i = 0; i < groups.length; i++) {
          if (slot[i].length >= cap[i]) continue;
          if (!strict && t !== groups[i].id && dayGroupIds.has(t)) continue;   // 🦵🫁 exercício de um grupo específico do dia (Pernas Multi., Peito Superior...) só ocupa a vaga dele
          const hit = strict ? t === groups[i].id : aliasesOf(groups[i].id).includes(t) || (groups[i].id === 'CARDIO' && exCardio(ex));
          if (hit) { slot[i].push(ex); return false; }
        }
        return true;
      });
    };
    place(true); place(false);
    if (left.length) { st.trimmed += left.length; fix(`Dia ${d.name}: tirou ${left.length} exercício(s) além do que o plano pediu (${left.map((e) => e.title).join(', ')})`); }
    const dayIds = new Set<string>(slot.flat().map((e) => e.exerciseId)); const dayNames = new Set<string>(slot.flat().map((e) => nameKey(e.title)));
    const filled: GenEx[] = [];
    groups.forEach((g, i) => {
      if (g.id === 'CARDIO') { if (slot[i].length < cap[i]) issues.push(`Dia ${d.name}: faltou cardio`); return; }
      while (slot[i].length < cap[i]) {
        const cands = ctx.cands.byGroup.get(g.id) || [];
        let usable = cands.filter((e) => !dayIds.has(e.id) && !dayNames.has(nameKey(e.name)) && !ctx.unavailable.has(e.id) && !linkedToAny(ctx.subLinks, e.id, dayIds));
        let relaxed = false;
        if (!usable.length && ctx.subLinks) { usable = cands.filter((e) => !dayIds.has(e.id) && !dayNames.has(nameKey(e.name)) && !ctx.unavailable.has(e.id)); relaxed = usable.length > 0; }   // 🔗 só sobraram substitutos: melhor um substituto do que o dia incompleto (e o coach é avisado)
        const pick = usable.find((e) => !latestNames.has(nameKey(e.name)) && !routineNames.has(nameKey(e.name))) || usable.find((e) => !latestNames.has(nameKey(e.name))) || usable[0];
        if (!pick) { issues.push(`Dia ${d.name}: faltou 1 exercício de ${g.id} (a biblioteca não tem outro disponível)`); break; }
        const sets = Number(g.sets) > 0 ? Number(g.sets) : Number(groupInfo(g.id)?.defaultSets) || 3;
        const rest = String(g.rest ?? groupInfo(g.id)?.defaultRest ?? 60);
        const r = String(Math.round((reps[0] + reps[1]) / 2));
        const ex = ctx.makeEx(pick, Array.from({ length: sets }, () => ({ sets: '1', reps: r, load: '', restTime: rest, technique: '' })));
        slot[i].push(ex); filled.push(ex); dayIds.add(pick.id); dayNames.add(nameKey(pick.name)); st.filled++;
        fix(`Dia ${d.name}: a IA deixou ${g.id} incompleto — entrou "${pick.name}"`);
        if (relaxed) issues.push(`Dia ${d.name}: "${pick.name}" é substituto de outro exercício do dia (a biblioteca não tem outro movimento de ${g.id} disponível)`);
      }
    });
    groups.forEach((g, i) => slot[i].forEach((ex) => groupOf.set(ex, g)));
    const hasChain = slot.flat().some((ex) => ex.blocks.some((b) => CHAIN.has(techOfBlock(b))));
    let ordered: GenEx[];
    if (hasChain) ordered = [...list.filter((ex) => groupOf.has(ex)), ...filled.filter((ex) => !list.includes(ex))];   // bi-set/tri-set dependem da ordem: não mexe
    else ordered = slot.flatMap((s, i) => (groups[i].id !== 'CARDIO' && groupInfo(groups[i].id)?.restType === 'MULTI' ? s.slice().sort((a, b) => Number(mechOf(libOf(b) || {}) === 'COMPOSTO') - Number(mechOf(libOf(a) || {}) === 'COMPOSTO')) : s));
    out[d.name] = ordered;
  }

  // ── b) série/repetição/técnica de cada exercício, pelo grupo e pelo nível ──
  for (const d of ctx.days) {
    if (!Array.isArray(out[d.name])) continue;
    out[d.name] = out[d.name].map((ex, exIdx) => {
      if (exCardio(ex)) return ex;
      const g = groupOf.get(ex); const lib = libOf(ex);
      let blocks = ex.blocks.map((b) => ({ ...b }));
      for (const b of blocks) {
        const t = String(b.technique || '');
        const bad = (lvl && levelFix(ex.title, t, lvl).techs.length > 0) || (lib && equipOf(lib) === 'PESO_CORPORAL' && NEEDS_LOAD.has(techNorm(t)));
        if (t && bad) { st.techStripped++; fix(`Dia ${d.name}: tirou ${t} de "${ex.title}" (${lvl && levelFix(ex.title, t, lvl).techs.length ? `avançado para ${LEVEL_LABEL[lvl]}` : 'exercício sem carga externa'})`); b.technique = ''; }
      }
      if (g && Number(g.sets) > 0 && !blocks.some((b) => OWN_BLOCKS.has(techOfBlock(b))) && blocks.length !== Number(g.sets)) {
        const want = Number(g.sets); fix(`Dia ${d.name}: "${ex.title}" tinha ${blocks.length} séries, ajustado para ${want}`);
        blocks = blocks.length > want ? blocks.slice(0, want) : [...blocks, ...Array.from({ length: want - blocks.length }, () => ({ ...blocks[blocks.length - 1] }))];
      }
      const rr = g?.id === 'PANTURRILHA' ? calfReps : reps;
      blocks = blocks.map((b) => (SPECIAL_REPS.has(techOfBlock(b)) ? b : { ...b, reps: clampReps(b.reps, rr) }));
      // 🔺 séries todas com a mesma repetição viram pirâmide da fase (15-12-10, 12-10-8...), como o Paulo e a Adri montam; quem já veio variando fica
      { const sh = shapeReps(blocks, { phase: ctx.phase, range: rr, compound: !!lib && mechOf(lib) === 'COMPOSTO', idx: exIdx, choice: ctx.repChoice }); if (sh !== blocks) { st.repsShaped++; blocks = sh; } }
      const nx = { ...ex, blocks }; if (g) groupOf.set(nx, g);   // objeto novo: o grupo vai junto
      return nx;
    });
  }
  for (const list of Object.values(out)) if (Array.isArray(list)) for (const ex of list) routineNames.add(nameKey(ex.title));

  const factOf = new Map(ctx.facts.map((f) => [f.exerciseId, f]));
  // ── b2) fixados pelo coach: se a IA não pôs, entra no lugar de um acessório do mesmo músculo (nunca no lugar de outro fixado) ──
  const pins = ctx.pins || new Set<string>();
  for (const id of pins) {
    const pl = ctx.lib.get(id); if (!pl) continue;
    if (Object.values(out).some((l) => Array.isArray(l) && l.some((e) => e.exerciseId === id))) continue;
    const t = targetOf(pl); let done = false;
    for (const d of ctx.days) {
      const list = out[d.name]; if (!Array.isArray(list) || !list.length) continue;
      const groups = d.groups.filter((g) => g.id !== 'MOBILIDADE' && g.id !== 'CARDIO');
      const g = groups.find((x) => x.id === t) || groups.find((x) => aliasesOf(x.id).includes(t)); if (!g) continue;
      const members = list.filter((e) => groupOf.get(e) === g && !pins.has(e.exerciseId));
      const victim = [...members].reverse().find((e) => factOf.get(e.exerciseId)?.plan !== 'MANTER') ?? members[members.length - 1]; if (!victim) continue;
      const novo = ctx.makeEx(pl, victim.blocks.map((b) => ({ ...b, load: '' }))); groupOf.set(novo, g);
      out[d.name] = list.map((e) => (e === victim ? novo : e)); routineNames.add(nameKey(pl.name)); pinnedIn++; done = true;
      fix(`Dia ${d.name}: "${pl.name}" (fixado por você) entrou no lugar de "${victim.title}"`); break;
    }
    if (!done) issues.push(`"${pl.name}" fixado não coube: o plano não tem vaga de ${t} sem tirar outro fixado`);
  }
  // ── c) rotação: o que a rotina anterior mandava TROCAR (e repetição entre dias) vira outro exercício do mesmo músculo ──
  const swapCtx = (used: Set<string>) => ({ unavailable: ctx.unavailable, jointRisks: ctx.jointRisks, env: ctx.env, level: lvl, usedNames: used, envOk: () => true, levelIssues });
  const addedByDay = new Map<string, Set<string>>();   // 🔗 o que a rotação já trouxe para cada dia nesta passada
  const swap = (ex: GenEx, why: string, day: string): GenEx | null => {
    const orig = libOf(ex); if (!orig) return null;
    const used = new Set<string>([...routineNames, ...latestNames]);
    // 🔗 a troca não pode cair num substituto de outro exercício que já está nesse dia
    if (ctx.subLinks) { const here = [...(out[day] || []).filter((e) => e !== ex).map((e) => e.exerciseId), ...(addedByDay.get(day) || [])]; for (const id of linkedIds(ctx.subLinks, here)) { const l = ctx.lib.get(id); if (l) used.add(nameKey(l.name)); } }
    const withOlder = new Set<string>([...used, ...olderNames]);
    const pick = pickSwap(orig, ctx.pool, swapCtx(withOlder)) || pickSwap(orig, ctx.pool, swapCtx(used));
    if (!pick) return null;
    const nl = ctx.lib.get(pick.id); if (!nl) return null;
    const novo = ctx.makeEx(nl, ex.blocks.map((b) => ({ ...b, load: '' })));
    routineNames.add(nameKey(nl.name)); st.swapped++; (addedByDay.get(day) || addedByDay.set(day, new Set()).get(day)!).add(nl.id);
    fix(`Dia ${day}: "${ex.title}" → "${nl.name}" (${why})`);
    return novo;
  };
  const seen = new Set<string>();
  for (const d of ctx.days) {
    const list = out[d.name]; if (!list) continue;
    out[d.name] = list.map((ex) => {
      if (exCardio(ex)) return ex;
      const k = nameKey(ex.title); const f = factOf.get(ex.exerciseId); const g = groupOf.get(ex);
      if (pins.has(ex.exerciseId) && !seen.has(k)) { seen.add(k); return ex; }   // fixado pelo coach: a rotação não mexe
      let why = '';
      if (seen.has(k)) why = 'já aparece em outro dia da rotina';
      else if (ctx.hasPrev && f && f.plan === 'TROCAR') why = `repetido da rotina anterior — ${f.why}`;
      else if (lvl && levelFix(ex.title, null, lvl).complex) why = `complexo demais para ${LEVEL_LABEL[lvl]}`;
      if (!why) { seen.add(k); return ex; }
      const novo = swap(ex, why, d.name);
      if (!novo) { issues.push(`Dia ${d.name}: "${ex.title}" ficou (${why}) — a biblioteca não tem outro igual disponível`); seen.add(k); return ex; }
      if (g) groupOf.set(novo, g);
      seen.add(nameKey(novo.title)); return novo;
    });
  }

  // ── d) cargas: só vale carga onde o aluno já treinou o exercício; nos que mantêm, a carga-alvo manda (a da IA só passa se estiver perto) ──
  for (const d of ctx.days) for (const ex of out[d.name] || []) {
    if (exCardio(ex)) continue;
    if (!ctx.loaded.has(ex.exerciseId)) { if (ex.blocks.some((b) => b.load)) { ex.blocks = ex.blocks.map((b) => ({ ...b, load: '' })); st.loadsFixed++; } continue; }
    const f = factOf.get(ex.exerciseId);
    if (!f || !f.targetLoads.length) continue;
    ex.blocks = ex.blocks.map((b, i) => {
      const want = f.targetLoads[Math.min(i, f.targetLoads.length - 1)]; const wantShown = f.perSide ? sideValue(want) : want;
      const got = num(b.load);
      if (got !== null && wantShown > 0 && Math.abs(got - wantShown) / wantShown <= 0.25) return b;
      st.loadsFixed++;
      return { ...b, load: `${fmtKg(wantShown)}kg${f.perSide ? ' cada lado' : ''}` };
    });
  }

  // ── e) o que ainda deu para medir ──
  const groupSets: Record<string, number> = {};
  let total = 0, novos = 0, kept = 0;
  for (const d of ctx.days) for (const ex of out[d.name] || []) {
    const g = groupOf.get(ex); if (g && !exCardio(ex)) groupSets[g.id] = (groupSets[g.id] || 0) + ex.blocks.reduce((s, b) => s + (Number(b.sets) || 1), 0);
    if (exCardio(ex)) continue;
    total++; if (!latestNames.has(nameKey(ex.title))) novos++; else if (factOf.get(ex.exerciseId)?.plan === 'MANTER') kept++;
  }
  const newPct = ctx.hasPrev && total ? Math.round((novos / total) * 100) : null;
  for (const [gid, n] of Object.entries(groupSets)) {
    if (groupInfo(gid)?.restType === 'MULTI' && n < 6) issues.push(`Volume baixo: ${gid} com ${n} séries na semana`);
    if (n > 26) issues.push(`Volume alto: ${gid} com ${n} séries na semana`);
  }
  const push = PUSH.reduce((s, g) => s + (groupSets[g] || 0), 0), pull = PULL.reduce((s, g) => s + (groupSets[g] || 0), 0);
  if (push >= 8 && pull < push * 0.7) issues.push(`Mais empurrar (${push} séries) do que puxar (${pull}): atenção aos ombros`);
  if (newPct !== null && newPct < 50) issues.push(`Só ${newPct}% dos exercícios são novos em relação à rotina anterior`);
  const score = Math.max(0, 100 - 10 * issues.length);
  // 🧩 em que grupo do dia cada exercício ficou (a ordem final usa isto: antes adivinhava pela lista de candidatos, e exercício genérico — Good morning, RDL — caía no grupo errado e o músculo voltava no meio do treino)
  const groupIds: Record<string, Record<string, string>> = {};
  for (const [day, list] of Object.entries(out)) { const m: Record<string, string> = {}; for (const ex of list || []) { const g = groupOf.get(ex); if (g) m[ex.exerciseId] = g.id; } groupIds[day] = m; }
  return { byDay: out, groupIds, quality: { score, fixes: fixes.slice(0, 30), issues: issues.slice(0, 12), stats: { pinned: pinnedIn, repairs, exercises: total, newPct, kept, ...st, groupSets } } };
}
