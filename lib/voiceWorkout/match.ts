// lib/voiceWorkout/match.ts
// 🎙️ (30 set 2026) Casa o nome FALADO ("búlgaro no smith") com um exercício
// da biblioteca do coach. Tudo aqui é determinístico e roda no SERVIDOR -- a IA
// só extrai o que foi dito, quem escolhe o exercício é este código, então:
//  - a IA nunca "inventa" um exercício que não existe no banco;
//  - o resultado é reproduzível e testável;
//  - quando não há certeza, devolvemos as melhores opções pro coach escolher
//    na tela de revisão, em vez de adivinhar.
//
// Palavras raras na biblioteca ("panturrilha", "búlgaro") pesam mais que as
// comuns ("máquina", "reto", "pé"): é o peso IDF calculado sobre a própria
// biblioteca do coach, então funciona com qualquer nomenclatura.

export type LibItem = {
  id: string;
  name: string;
  category: string;
  subCategory?: string | null;
  videoUrl?: string | null;
  coachId?: string | null;
};

export type Candidate = {
  exerciseId: string;
  name: string;
  category: string;
  subCategory: string | null;
  videoUrl: string | null;
  score: number; // 0..1
};

export type MatchStatus = 'SURE' | 'CHOOSE' | 'NONE';

export type MatchResult = {
  status: MatchStatus;
  best: Candidate | null;        // preenchido em SURE e CHOOSE
  candidates: Candidate[];       // até 4, melhor primeiro (no NONE são só sugestões fracas)
};

type Entry = {
  item: LibItem;
  tokens: string[];
  key: string;     // tokens.join(' ') -- identidade do nome, ignorando "com/c/de/no..."
  own: boolean;
};

export type LibraryIndex = {
  entries: Entry[];
  df: Map<string, number>; // em quantos exercícios cada palavra aparece
  n: number;
};

const STOP = new Set([
  'de', 'da', 'do', 'das', 'dos', 'no', 'na', 'nos', 'nas', 'com', 'c', 'em', 'o', 'a', 'os', 'as',
  'e', 'ao', 'pra', 'para', 'um', 'uma', 'por', 'pelo', 'pela', 'tipo', 'exercicio',
]);

// Comece pequeno: só o que a transcrição de voz costuma escrever diferente do
// nome cadastrado. O resto o casamento por palavras já resolve.
const PHRASE_SYN: Array<[RegExp, string]> = [
  [/\bleg ?press ?45\b|\bleg 45\b|\bleg45\b/g, 'leg press 45'],
  [/\blegpress\b/g, 'leg press'],
  [/\bmulti ?power\b|\bbarra guiada\b/g, 'smith'],
];

export function norm(s: string): string {
  return String(s || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[°º]/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function canon(s: string): string {
  let n = norm(s);
  for (const [re, rep] of PHRASE_SYN) n = n.replace(re, rep);
  return n.replace(/\s+/g, ' ').trim();
}

function stem(w: string): string {
  if (/^\d+$/.test(w)) return w;
  if (w.length > 5 && w.endsWith('es')) return w.slice(0, -2);
  if (w.length > 3 && w.endsWith('s') && !w.endsWith('ss')) return w.slice(0, -1);
  return w;
}

function tokenize(s: string): string[] {
  return canon(s).split(' ').filter((w) => w && !STOP.has(w)).map(stem);
}

// distância de edição <= 1 (typo simples de transcrição)
function lev1(a: string, b: string): boolean {
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0, j = 0, edits = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) { i++; j++; continue; }
    if (++edits > 1) return false;
    if (a.length > b.length) i++;
    else if (a.length < b.length) j++;
    else { i++; j++; }
  }
  return edits + (a.length - i) + (b.length - j) <= 1;
}

function tokEq(a: string, b: string): boolean {
  if (a === b) return true;
  if (/^\d+$/.test(a) || /^\d+$/.test(b)) return false; // números só casam exatos (45 != 30)
  if (a.length >= 5 && b.length >= 5 && (a.startsWith(b) || b.startsWith(a))) return true; // extensor/extensora
  if (a.length >= 6 && b.length >= 6 && lev1(a, b)) return true;
  return false;
}

export function buildIndex(items: LibItem[], adminId: string): LibraryIndex {
  // Nomes equivalentes ("c/halteres" e "com halteres", ou o do coach e um
  // global) viram um só -- fica o do próprio coach.
  const byKey = new Map<string, Entry>();
  for (const item of items) {
    const tokens = tokenize(item.name);
    if (!tokens.length) continue;
    const key = tokens.join(' ');
    const own = item.coachId === adminId;
    const prev = byKey.get(key);
    if (!prev || (own && !prev.own)) byKey.set(key, { item, tokens, key, own });
  }
  const entries = Array.from(byKey.values());
  const df = new Map<string, number>();
  for (const e of entries) {
    for (const t of new Set(e.tokens)) df.set(t, (df.get(t) || 0) + 1);
  }
  return { entries, df, n: entries.length };
}

function weight(index: LibraryIndex, t: string): number {
  return Math.log(1 + index.n / (1 + (index.df.get(t) || 0)));
}

function score(index: LibraryIndex, qTokens: string[], cTokens: string[]): { score: number; coverage: number } {
  let qTotal = 0, cTotal = 0, qHit = 0, cHit = 0;
  for (const q of qTokens) qTotal += weight(index, q);
  for (const c of cTokens) cTotal += weight(index, c);
  if (!qTotal || !cTotal) return { score: 0, coverage: 0 };

  const used = new Set<number>();
  for (const q of qTokens) {
    for (let i = 0; i < cTokens.length; i++) {
      if (!used.has(i) && tokEq(q, cTokens[i])) {
        used.add(i);
        qHit += weight(index, q);
        cHit += weight(index, cTokens[i]);
        break;
      }
    }
  }
  const coverage = qHit / qTotal;   // quanto do que o coach disse aparece no nome
  const precision = cHit / cTotal;  // quanto do nome da biblioteca foi dito (penaliza nomes com muito "extra")
  return { score: 0.65 * coverage + 0.35 * precision, coverage };
}

function toCandidate(e: Entry, s: number): Candidate {
  return {
    exerciseId: e.item.id,
    name: e.item.name,
    category: e.item.category,
    subCategory: e.item.subCategory ?? null,
    videoUrl: e.item.videoUrl ?? null,
    score: Math.round(s * 1000) / 1000,
  };
}

export function matchExercise(spoken: string, index: LibraryIndex): MatchResult {
  const qTokens = tokenize(spoken);
  if (!qTokens.length) return { status: 'NONE', best: null, candidates: [] };
  const qKey = qTokens.join(' ');

  const scored = index.entries
    .map((e) => {
      const exact = e.key === qKey;
      const { score: s, coverage } = score(index, qTokens, e.tokens);
      return { e, s: exact ? 1 : s, coverage, exact };
    })
    .filter((r) => r.s >= 0.3)
    .sort((a, b) => (b.s - a.s) || (Number(b.e.own) - Number(a.e.own)) || a.e.item.name.localeCompare(b.e.item.name));

  if (!scored.length) return { status: 'NONE', best: null, candidates: [] };

  const candidates = scored.slice(0, 4).map((r) => toCandidate(r.e, r.s));
  const top = scored[0];
  const second = scored[1];

  // SURE: nome idêntico, ou o coach disse tudo que está no nome e há folga
  // clara pro segundo colocado. Na dúvida, o coach escolhe na revisão.
  const margin = second ? top.s - second.s : 1;
  if (top.exact || (top.coverage === 1 && top.s >= 0.85 && margin >= 0.12)) {
    return { status: 'SURE', best: candidates[0], candidates };
  }
  if (top.s >= 0.55) return { status: 'CHOOSE', best: candidates[0], candidates };
  return { status: 'NONE', best: null, candidates };
}
