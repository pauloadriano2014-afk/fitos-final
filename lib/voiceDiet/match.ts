// lib/voiceDiet/match.ts
// 🎙️ (30 set 2026) Dieta por voz -- casa o alimento FALADO ("ovos", "frango",
// "pão integral") com um alimento do catálogo (TACO + os cadastrados pelo coach).
// Determinístico, roda no servidor: a IA só extrai o que foi dito.
//
// Regras de preferência, nesta ordem de força:
//  1. O que o coach FALOU vence: nome igual ao do catálogo = certeza.
//  2. Alimentos que o ALUNO marcou na anamnese ("Do Aluno") vêm primeiro; se o
//     coach citou um alimento que não está lá, o catálogo inteiro continua valendo.
//  3. Favoritos e alimentos do próprio coach depois.
//  4. Preparo: por padrão COZIDO (regra do coach). Cru/frito só se falado.
import { norm, tokenize, tokSim } from '../voiceWorkout/match';

export type FoodRow = {
  id: string;
  source: string;                 // 'TACO' | 'CUSTOM'
  name: string;
  category: string;
  subcategory?: string | null;
  baseUnit?: string | null;
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber?: number | null;
  isLactoseFree?: boolean | null;
  conversionFactor?: number | null;
  isFavorite?: boolean | null;
};

/** Mesmo formato que GET /api/food/search devolve -- o app usa direto, sem converter. */
export type FoodCandidate = {
  id: string;
  source: string;
  name: string;
  category: string;
  subcategory: string;
  base_unit: string;
  calories_per_100: number;
  p: number;
  c: number;
  f: number;
  fiber: number;
  isLactoseFree: boolean;
  conversionFactor: number;
  isFavorite: boolean;
  score: number;                  // 0..1, só do texto (sem os bônus de preferência)
  studentFavorite: boolean;
};

export type MatchStatus = 'SURE' | 'CHOOSE' | 'NONE';
export type MatchResult = { status: MatchStatus; best: FoodCandidate | null; candidates: FoodCandidate[] };

export type Prep = 'cooked' | 'prepared' | 'grilled' | 'roasted' | 'raw' | 'fried' | 'other';

type Entry = { row: FoodRow; tokens: string[]; key: string; own: boolean; prep: Prep; student: boolean };
export type FoodIndex = { entries: Entry[]; df: Map<string, number>; n: number; favorites: Set<string> };

// ─── preparo ──────────────────────────────────────────────────────────────────
export function prepOfName(name: string): Prep {
  const n = norm(name);
  if (/\bcozid|\bcozinh/.test(n)) return 'cooked';
  if (/\bmexid|\brefogad|\bsaute/.test(n)) return 'prepared';   // já é comida pronta, mas não é "cozido" literal
  if (/\bgrelhad/.test(n)) return 'grilled';
  if (/\bassad/.test(n)) return 'roasted';
  if (/\bfrit/.test(n)) return 'fried';
  if (/\bcru\b|\bcrua\b|\bcrus\b|\bcruas\b/.test(n)) return 'raw';
  return 'other';
}

/** Preparo FALADO -> classe. Modo de preparo que o catálogo não tem (mexido, refogado...) = null (usa o padrão cozido). */
export function prepFromSpoken(v: unknown): Prep | null {
  if (typeof v !== 'string' || !v.trim()) return null;
  const n = norm(v);
  if (/\bcozid|\bcozinh|\bferv/.test(n)) return 'cooked';
  if (/\bgrelhad/.test(n)) return 'grilled';
  if (/\bassad/.test(n)) return 'roasted';
  if (/\bfrit/.test(n)) return 'fried';
  if (/\bcru\b|\bcrua\b|\bcrus\b|\bcruas\b/.test(n)) return 'raw';
  return null;
}

// Palavras de modo de preparo que quase nunca estão no nome do catálogo: se a IA
// deixar uma delas no nome do alimento, ela é descartada em vez de derrubar a nota.
const PREP_WORDS = new Set([
  'mexido', 'mexida', 'mexidos', 'mexidas', 'refogado', 'refogada', 'refogados', 'refogadas',
  'desfiado', 'desfiada', 'desfiados', 'desfiadas', 'picado', 'picada', 'ralado', 'ralada',
  'amassado', 'amassada', 'poche', 'ao', 'ponto', 'temperado', 'temperada',
]);

// apelidos de quem fala -> como aparece no catálogo (só para a BUSCA; o nome do
// catálogo não muda). Tenta-se a fala original e cada variante; vale a melhor nota.
const QUERY_ALIASES: Array<[RegExp, string]> = [
  [/\barroz branco\b/, 'arroz tipo 1'],
  [/\bbatata doce\b/, 'batata doce'],
  [/\bpeito de frango\b/, 'frango peito'],
  [/\bfile de frango\b/, 'frango file'],
  [/\bclara de ovo\b|\bclaras\b/, 'ovo clara'],
  [/\bpasta de amendoim\b|\bpasta de amendoas\b/, 'pasta de amendoim'],
];

export function queryVariants(spoken: string): string[] {
  const base = norm(spoken);
  const out = [base];
  for (const [re, rep] of QUERY_ALIASES) {
    if (re.test(base)) {
      const v = base.replace(re, rep);
      if (!out.includes(v)) out.push(v);
    }
  }
  return out;
}

// ─── índice ───────────────────────────────────────────────────────────────────
export function buildFoodIndex(rows: FoodRow[], studentFavoriteIds: string[] = []): FoodIndex {
  // Nomes equivalentes (ex.: "Batata Doce Cozida" custom e "Batata, doce, cozida" TACO)
  // viram um só -- fica o do próprio coach.
  const favorites = new Set(studentFavoriteIds);
  const byKey = new Map<string, Entry>();
  for (const row of rows) {
    const tokens = tokenize(row.name);
    if (!tokens.length) continue;
    const key = tokens.join(' ');
    const own = row.source === 'CUSTOM';
    const prev = byKey.get(key);
    // se qualquer uma das duas versões do mesmo nome é favorita do aluno, o alimento é "Do Aluno"
    const student = favorites.has(row.id) || (prev ? prev.student : false);
    if (!prev || (own && !prev.own)) byKey.set(key, { row, tokens, key, own, prep: prepOfName(row.name), student });
    else prev.student = student;
  }
  const entries = Array.from(byKey.values());
  const df = new Map<string, number>();
  for (const e of entries) for (const t of new Set(e.tokens)) df.set(t, (df.get(t) || 0) + 1);
  return { entries, df, n: entries.length, favorites };
}

const weight = (ix: FoodIndex, t: string) => Math.log(1 + ix.n / (1 + (ix.df.get(t) || 0)));

function textScore(ix: FoodIndex, q: string[], c: string[]): { score: number; coverage: number } {
  let qTotal = 0, cTotal = 0, qHit = 0, cHit = 0;
  for (const t of q) qTotal += weight(ix, t);
  for (const t of c) cTotal += weight(ix, t);
  if (!qTotal || !cTotal) return { score: 0, coverage: 0 };
  const used = new Set<number>();
  for (const t of q) {
    let bi = -1, bs = 0;
    for (let i = 0; i < c.length; i++) {
      if (used.has(i)) continue;
      const s = tokSim(t, c[i]);
      if (s > bs) { bs = s; bi = i; }
    }
    if (bi >= 0) { used.add(bi); qHit += weight(ix, t) * bs; cHit += weight(ix, c[bi]) * bs; }
  }
  const coverage = qHit / qTotal;
  const precision = cHit / cTotal;
  return { score: 0.65 * coverage + 0.35 * precision, coverage };
}

// ─── bônus só de ORDEM (não mexem na nota de texto) ───────────────────────────
const B_STUDENT = 0.15;
const B_FAVORITE = 0.04;
const B_OWN = 0.05;
const B_HEAD = 0.05;
const B_WORD = 0.10;   // o nome do catálogo tem o preparo falado ("Ovos Mexidos", "Frango Desfiado")

const COOKED_LIKE: Prep[] = ['cooked', 'prepared', 'grilled', 'roasted'];

/**
 * Regra do coach: SEMPRE cozido. "Cozido" aqui vale para qualquer preparo pronto
 * (cozido, grelhado, assado); cru e frito só entram se o coach falar. Se ele
 * falou um preparo que o catálogo tem (grelhado, cru...), esse é o preferido.
 */
function prepBonus(entry: Prep, want: Prep | null): number {
  if (want === null) {
    if (COOKED_LIKE.includes(entry)) return 0.06;
    if (entry === 'raw' || entry === 'fried') return -0.06;
    return 0;
  }
  if (entry === want) return 0.08;
  if (want === 'cooked' && COOKED_LIKE.includes(entry)) return 0.03;   // pediu cozido: grelhado/assado/mexido também servem, um pouco menos
  if (entry === 'raw' && want !== 'raw') return -0.06;
  if (entry === 'fried' && want !== 'fried') return -0.06;
  return 0;
}

function toCandidate(e: Entry, score: number, studentFav: boolean): FoodCandidate {
  const r = e.row;
  return {
    id: r.id,
    source: r.source,
    name: r.name,
    category: r.category,
    subcategory: r.subcategory ?? r.category,
    base_unit: r.baseUnit || 'g',
    calories_per_100: r.kcal,
    p: r.protein,
    c: r.carbs,
    f: r.fat,
    fiber: r.fiber ?? 0,
    isLactoseFree: r.isLactoseFree ?? false,
    conversionFactor: r.conversionFactor ?? 1,
    isFavorite: r.isFavorite ?? false,
    score: Math.round(score * 1000) / 1000,
    studentFavorite: studentFav,
  };
}

export type FoodMatch = MatchResult & {
  /** preparo pedido pelo coach que o catálogo não tem (ex.: "mexido") -- usamos o padrão cozido */
  unknownPrep: string | null;
};

const q2 = (n: number) => Math.round(n * 100) / 100;

const PREP_TOKEN = /^(cozid|cozinh|grelhad|assad|cru$|crua$|frit|saute|refogad|10minuto)/;
/** nome sem as palavras de preparo: "Batata Doce Cozida" e "Batata Doce Assada" têm a mesma base. */
const baseKeyOf = (tokens: string[]) => tokens.filter((t) => !PREP_TOKEN.test(t)).join(' ');

export function matchFood(spoken: string, prepSpoken: unknown, ix: FoodIndex): FoodMatch {
  const prepClass = prepFromSpoken(prepSpoken);
  const prepText = typeof prepSpoken === 'string' ? prepSpoken.trim() : '';
  const prepTokens = prepText ? tokenize(prepText) : [];
  // Preparo fora das classes padrão (mexido, desfiado, refogado...) pode fazer parte do NOME do
  // alimento no catálogo ("Ovos Mexidos"): nesse caso ele vale como parte do que foi dito.
  const wordTokens = prepClass ? [] : prepTokens;

  // Palavra de preparo que sobrou no nome ("ovo mexido") não pode contar como parte do alimento.
  const variants = queryVariants(spoken)
    .map((v) => tokenize(v).filter((t) => !(PREP_WORDS.has(t) && !ix.df.has(t))))
    .filter((t) => t.length);
  if (!variants.length) return { status: 'NONE', best: null, candidates: [], unknownPrep: null };
  // "frango grelhado" / "ovos mexidos" inteiros, pra reconhecer o nome igual ao do catálogo
  const combined = prepTokens.length ? variants.map((q) => [...q, ...prepTokens]) : [];

  const scored = ix.entries.map((e) => {
    let best = { score: 0, coverage: 0 };
    let exact = false;
    let head = false;
    for (const q of variants) {
      const s = textScore(ix, q, e.tokens);
      if (s.score > best.score) best = s;
      if (q.join(' ') === e.key) exact = true;
      if (q[0] === e.tokens[0]) head = true;      // a palavra principal ("queijo", "ovo") abre o nome
    }
    for (const q of combined) if (q.join(' ') === e.key) exact = true;
    let withWord = false;
    if (wordTokens.length) {
      for (const q of variants) {
        if (textScore(ix, [...q, ...wordTokens], e.tokens).coverage >= 0.999) withWord = true;
      }
    }
    const student = e.student;
    const text = exact ? 1 : best.score;
    const rank = text
      + (student ? B_STUDENT : 0)
      + (e.row.isFavorite ? B_FAVORITE : 0)
      + (e.own ? B_OWN : 0)
      + (head ? B_HEAD : 0)
      + (withWord ? B_WORD : 0)
      + prepBonus(e.prep, prepClass);
    return { e, text, coverage: exact ? 1 : best.coverage, exact, head, withWord, student, rank };
  })
  .filter((r) => r.text >= 0.3)
  // notas iguais até a 2ª casa empatam -> ordem alfabética (estável e previsível)
  .sort((a, b) => (Number(b.exact) - Number(a.exact)) || (q2(b.rank) - q2(a.rank)) || a.e.row.name.localeCompare(b.e.row.name));

  // o preparo falado só é "desconhecido" se NENHUM alimento do catálogo o tem no nome
  const anyWord = wordTokens.length > 0 && scored.some((r) => r.withWord);
  const unknownPrep = wordTokens.length > 0 && !anyWord ? prepText : null;

  if (!scored.length) return { status: 'NONE', best: null, candidates: [], unknownPrep };

  const toCands = (rows: typeof scored) => rows.slice(0, 4).map((r) => toCandidate(r.e, r.text, r.student));
  const done = (status: MatchStatus, pick: (typeof scored)[number] | null): FoodMatch => {
    // o escolhido vai sempre em primeiro, mesmo que a ordem por nota seja outra
    const rest = scored.filter((r) => r !== pick);
    const ordered = pick ? [pick, ...rest] : scored;
    const candidates = toCands(ordered);
    return { status, best: status === 'NONE' ? null : candidates[0], candidates, unknownPrep };
  };

  const top = scored[0];

  // Só considera "certeza" quando o coach disse tudo que aparece no nome do alimento
  // (e, se disse um preparo que existe no nome de algum alimento, só entre esses).
  let pool = scored.filter((r) => r.coverage >= 0.999);
  if (anyWord) pool = pool.filter((r) => r.withWord);
  if (!pool.length) return done(top.text >= 0.55 ? 'CHOOSE' : 'NONE', top.text >= 0.55 ? top : null);

  // 1) "Do Aluno" vem primeiro: se o aluno marcou algo que bate com o que foi dito, é isso.
  //    (uma opção só = certeza; várias = o coach escolhe entre as do aluno)
  const fromStudent = pool.filter((r) => r.student);
  if (fromStudent.length) {
    const exactOne = fromStudent.find((r) => r.exact);
    if (exactOne || fromStudent.length === 1) return done('SURE', exactOne ?? fromStudent[0]);
    return done('CHOOSE', fromStudent[0]);
  }

  // 2) O coach falou o nome igual ao do catálogo.
  const exactRow = pool.find((r) => r.exact);
  if (exactRow) return done('SURE', exactRow);

  // 3) Cadastrados pelo coach > favoritos > o resto. Se a camada tem UMA opção clara, é ela;
  //    se o texto de outra opção fora dela casa bem melhor, o coach confere.
  const bestText = Math.max(...pool.map((r) => r.text));
  for (const rows of [pool.filter((r) => r.e.own), pool.filter((r) => r.e.row.isFavorite), pool]) {
    if (!rows.length) continue;
    // sem a palavra principal no começo do nome ("amendoim" -> "Pasta de Amendoim") não dá pra ter certeza
    const cand = rows.filter((r) => r.head);
    if (!cand.length) break;
    // "sempre cozido": se as opções são só VERSÕES do mesmo alimento (cozida/assada/crua) e só UMA é cozida,
    // e o coach não pediu outro preparo, ela decide.
    const sameFood = new Set(cand.map((r) => baseKeyOf(r.e.tokens))).size === 1;
    const cooked = prepClass === null && sameFood ? cand.filter((r) => r.e.prep === 'cooked') : [];
    const winners = cooked.length === 1 ? cooked : cand;
    if (winners.length === 1 && bestText - winners[0].text <= 0.04) return done('SURE', winners[0]);
    break; // a camada mais forte tem mais de uma opção (ou o texto discorda): o coach escolhe
  }

  return done(top.text >= 0.55 ? 'CHOOSE' : 'NONE', top.text >= 0.55 ? top : null);
}
