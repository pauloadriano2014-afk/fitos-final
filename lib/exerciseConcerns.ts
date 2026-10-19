// lib/exerciseConcerns.ts
// 🩺 (19 out 2026) OBSERVAÇÕES DA ALUNA SOBRE OS EXERCÍCIOS → ALERTA PARA O COACH na hora de montar o treino novo.
// A aluna escreve uma observação num exercício ao treinar (ExerciseHistory.note): "tive dor no joelho", "não senti o músculo", "muito difícil"... Hoje isso chega ao coach como comentário,
// mas quem monta a rotina nova não via nada disso. Aqui o texto é lido por regras simples (sem IA, sem custo), agrupado por exercício e usado em dois lugares:
//   • tela do Protocolo ELITE: cartão "Observações da aluna" (GET /api/gen-prefs/concerns), com BLOQUEAR na geração / POUPAR a articulação;
//   • depois da geração: se um exercício com observação voltou no treino novo, entra em "Para você conferir" (nunca troca nada sozinho; quem decide é o coach).
// Funções puras (sem banco): quem lê o banco é a rota e a geração.
export type ConcernKind = 'DOR' | 'SEM_ALVO' | 'DIFICIL';
export const KIND_LABEL: Record<ConcernKind, string> = { DOR: 'dor ou desconforto', SEM_ALVO: 'não sentiu o músculo', DIFICIL: 'achou difícil' };
const SEVERITY: Record<ConcernKind, number> = { DOR: 3, SEM_ALVO: 2, DIFICIL: 1 };

const fold = (s: any) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();

// "sem dor", "não senti dor", "não doeu": é elogio, não problema
const NO_PAIN = /\b(sem|nenhum[a]?|nao (senti|tive|sinto|tenho|teve|doeu|dói|doi))\s+(\w+\s+){0,2}(dor|desconforto|incomodo)\b|\bnao (doeu|doi|incomodou)\b/;
const PAIN = /\b(dor|dores|doeu|doendo|doi|dolorid[ao]|machuc\w*|lesao|lesionei|incomod\w*|desconforto|fisgada|pontada|estalo|estalou|travou|inflam\w*|queimando|ardendo)\b/;
const NO_TARGET = /\bnao (senti|sinto|consigo sentir|consegui sentir|sentia)( bem| nada| direito)?( o| a| os| as| no| na)?\b|\bnao (pega|trabalha|ativa|funciona)\b|\b(senti|sinto) (mais|so) (no|na|nas|nos|em)\b/;
const HARD = /\b(muito|super|bem) (dificil|pesado|complicado)\b|\bnao (consigo|consegui|dou conta)\b|\bpesado demais\b|\bimpossivel\b|\bnao gostei\b|\bodeio\b|\bruim\b/;

const JOINTS: Array<{ re: RegExp; label: string; rule: 'JOELHO' | 'LOMBAR' | 'OMBRO' | null }> = [
  { re: /\bjoelh\w*/, label: 'joelho', rule: 'JOELHO' }, { re: /\b(lombar|coluna|costas baixa|lombo)\b/, label: 'lombar', rule: 'LOMBAR' }, { re: /\bombro\w*/, label: 'ombro', rule: 'OMBRO' },
  { re: /\b(punho|pulso)\w*/, label: 'punho', rule: null }, { re: /\bcotovel\w*/, label: 'cotovelo', rule: null }, { re: /\b(quadril|virilha)\b/, label: 'quadril', rule: null }, { re: /\b(pescoco|cervical)\b/, label: 'pescoço', rule: null },
];

export interface NoteClass { kind: ConcernKind; joint: string | null; jointRule: 'JOELHO' | 'LOMBAR' | 'OMBRO' | null }

/** Lê uma observação: dor/desconforto > não sentiu o músculo > achou difícil. Elogio ("sem dor") e texto vazio não contam. */
export function classifyNote(text: any): NoteClass | null {
  const n = fold(text);
  if (n.length < 3) return null;
  const painTxt = n.replace(new RegExp(NO_PAIN.source, 'g'), ' ');
  let kind: ConcernKind | null = null;
  if (PAIN.test(painTxt)) kind = 'DOR';
  else if (NO_TARGET.test(painTxt)) kind = 'SEM_ALVO';   // (sem o elogio "não senti dor", que também começa com "não senti")
  else if (HARD.test(n)) kind = 'DIFICIL';
  if (!kind) return null;
  const j = JOINTS.find((x) => x.re.test(n));
  return { kind, joint: j ? j.label : null, jointRule: j ? j.rule : null };
}

export interface Concern {
  exerciseId: string; name: string; kind: ConcernKind; joint: string | null; jointRule: 'JOELHO' | 'LOMBAR' | 'OMBRO' | null;
  count: number; handled: boolean; last: { date: string; text: string }; texts: string[];
}
type HistoryRow = { date: Date | string; details?: Array<{ exerciseId: string; exerciseName?: string | null; note?: string | null; resolvedAt?: any; coachReplyAt?: any }> };

/**
 * Agrupa por exercício o que a aluna escreveu nos últimos `sinceDays` dias (padrão 120). O tipo vale o da observação mais grave; `handled` = a mais recente já foi resolvida/respondida pelo coach.
 * Ordem: mais grave primeiro, depois as ainda não tratadas, depois as mais recentes.
 */
export function buildConcerns(history: HistoryRow[], opts: { sinceDays?: number; now?: Date } = {}): Concern[] {
  const now = (opts.now || new Date()).getTime(); const since = now - (opts.sinceDays ?? 120) * 86400000;
  const by = new Map<string, { c: Concern; ts: number; handledLast: boolean }>();
  for (const h of history || []) {
    const ts = new Date(h.date).getTime(); if (!Number.isFinite(ts) || ts < since) continue;
    for (const d of h.details || []) {
      const text = String(d.note || '').trim(); const cls = classifyNote(text); if (!cls || !d.exerciseId) continue;
      const id = String(d.exerciseId); const handled = !!(d.resolvedAt || d.coachReplyAt);
      const cur = by.get(id);
      if (!cur) { by.set(id, { c: { exerciseId: id, name: String(d.exerciseName || 'Exercício'), kind: cls.kind, joint: cls.joint, jointRule: cls.jointRule, count: 1, handled, last: { date: new Date(ts).toISOString(), text }, texts: [text] }, ts, handledLast: handled }); continue; }
      cur.c.count++; if (!cur.c.texts.includes(text) && cur.c.texts.length < 3) cur.c.texts.push(text);
      if (SEVERITY[cls.kind] > SEVERITY[cur.c.kind]) { cur.c.kind = cls.kind; }
      if (cls.joint && !cur.c.joint) { cur.c.joint = cls.joint; cur.c.jointRule = cls.jointRule; }
      if (ts > cur.ts) { cur.ts = ts; cur.c.last = { date: new Date(ts).toISOString(), text }; cur.c.handled = handled; }
    }
  }
  return [...by.values()].sort((a, b) => SEVERITY[b.c.kind] - SEVERITY[a.c.kind] || Number(a.c.handled) - Number(b.c.handled) || b.ts - a.ts).map((x) => x.c);
}

const dd = (iso: string) => { const d = new Date(iso); return `${String(d.getUTCDate()).padStart(2, '0')}/${String(d.getUTCMonth() + 1).padStart(2, '0')}`; };
const clip = (s: string, n = 90) => (s.length > n ? s.slice(0, n - 1).trimEnd() + '…' : s);

/** Frases para o "Para você conferir" depois da geração: exercício com observação da aluna que VOLTOU no treino novo. */
export function concernIssues(concerns: Concern[], inPlan: Set<string>): string[] {
  return concerns.filter((c) => inPlan.has(c.exerciseId)).map((c) => `"${c.name}" voltou no treino, mas a aluna anotou em ${dd(c.last.date)} (${KIND_LABEL[c.kind]}${c.joint ? `, ${c.joint}` : ''}): "${clip(c.last.text)}"${c.handled ? ' — você já respondeu' : ''}. Vale trocar?`);
}
