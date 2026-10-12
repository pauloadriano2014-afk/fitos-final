// lib/coachNotes.ts
// 🎙️ (12 out 2026) Regras puras das NOTAS DO COACH por voz (ver prisma/schema/coach-notes.prisma): limpeza do que o app manda, escolha do aluno pelo nome falado, datas ("amanhã",
// "sexta", "em novembro") e o rascunho por REGRAS quando a IA falha ou não está configurada (o coach sempre consegue salvar: a conferência é manual). Sem banco e sem IA aqui.
import { addDaysKey, dateKeyBrt, isDateKey, weekdayOfKey } from '@/lib/agenda';

export const KINDS = ['NOTA', 'TAREFA'] as const;
export type NoteKind = (typeof KINDS)[number];
export const TAGS = ['DOR', 'APARELHO', 'TREINO', 'DIETA', 'PEDIDO', 'OUTRO'] as const;
export type NoteTag = (typeof TAGS)[number];
export const TAG_LABEL: Record<NoteTag, string> = { DOR: 'Dor / lesão', APARELHO: 'Aparelho', TREINO: 'Treino', DIETA: 'Dieta', PEDIDO: 'Pedido', OUTRO: 'Outro' };
export const STATUSES = ['INFO', 'OPEN', 'DONE'] as const;
export const MAX_BODY = 600;
export const MAX_RAW = 2000;
export const MAX_SPOKEN_TEXT = 3000;
export const MAX_NAME = 120;

const cut = (v: any, n: number) => String(v ?? '').replace(/\r\n/g, '\n').trim().slice(0, n);
/** minúsculas, sem acento, só letras e espaços. */
export const norm = (s: any) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
export const isKind = (v: any): v is NoteKind => (KINDS as readonly string[]).includes(String(v));
export const isTag = (v: any): v is NoteTag => (TAGS as readonly string[]).includes(String(v));

export type StudentRef = { id: string; name: string };
export type Candidate = { id: string; name: string; score: number };

// ───────────────────────── aluno pelo nome falado ─────────────────────────
function lev(a: string, b: string): number {
  const m = a.length, n = b.length; if (!m) return n; if (!n) return m;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) { const cur = [i]; for (let j = 1; j <= n; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)); prev = cur; }
  return prev[n];
}
const STOP = new Set(['do', 'da', 'de', 'dos', 'das', 'o', 'a', 'e']);
const tokens = (s: string) => norm(s).split(' ').filter((t) => t && !STOP.has(t));

/** Pontua cada aluno contra o nome falado. 100 = nome inteiro igual; 90 = tudo o que foi dito está no nome dele ("Samuel" em "Samuel Silva"); ~60 = erro de uma letra no 1º nome; 40 = só o 1º nome bate mas o sobrenome dito não. */
export function matchStudents(spoken: string | null | undefined, students: StudentRef[]): Candidate[] {
  const st = tokens(String(spoken || ''));
  if (!st.length) return [];
  const out: Candidate[] = [];
  for (const s of students) {
    const nt = tokens(s.name);
    if (!nt.length) continue;
    let score = 0;
    if (st.join(' ') === nt.join(' ')) score = 100;
    else if (st.every((t) => nt.includes(t))) score = 90;
    else if (st.length > 1 && st[0] === nt[0]) score = 40;
    else if (st.length === 1 && st[0].length >= 4 && nt.some((t) => t.length >= 4 && lev(t, st[0]) === 1 && t[0] === st[0][0])) score = 60;
    else if (st[0].length >= 3 && nt[0].startsWith(st[0]) && st.length === 1) score = 55;
    if (score >= 40) out.push({ id: s.id, name: s.name, score });
  }
  return out.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
}

/** O aluno escolhido sozinho: só quando o melhor é claro (≥ 85) e ninguém chega perto dele. Dois "Samuel" = ninguém escolhido, o coach decide. */
export function pickStudent(cands: Candidate[]): Candidate | null {
  if (!cands.length || cands[0].score < 85) return null;
  if (cands[1] && cands[1].score > cands[0].score - 10) return null;   // 100 x 90 (nome inteiro x só o 1º nome) escolhe; 90 x 90 (dois Samuel) não
  return cands[0];
}

/** Sem o nome vindo da IA: procura no texto inteiro um nome de aluno (1º nome ou nome completo). */
export function findMentions(text: string, students: StudentRef[]): Candidate[] {
  const words = tokens(text);
  const set = new Set(words);
  const out: Candidate[] = [];
  for (const s of students) {
    const nt = tokens(s.name);
    if (!nt.length) continue;
    const full = nt.every((t) => set.has(t));
    const first = nt[0].length >= 3 && set.has(nt[0]);
    if (full && nt.length > 1) out.push({ id: s.id, name: s.name, score: 100 });
    else if (first) out.push({ id: s.id, name: s.name, score: 90 });
  }
  return out.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
}

// ───────────────────────── datas ─────────────────────────
const WEEKDAYS: Record<string, number> = { domingo: 0, segunda: 1, terca: 2, quarta: 3, quinta: 4, sexta: 5, sabado: 6 };
const MONTHS: Record<string, number> = { janeiro: 1, fevereiro: 2, marco: 3, abril: 4, maio: 5, junho: 6, julho: 7, agosto: 8, setembro: 9, outubro: 10, novembro: 11, dezembro: 12 };

/** Data pedida pela IA (AAAA-MM-DD): vale se for uma data de verdade, de hoje em diante (passado vira hoje) e em até 2 anos. */
export function cleanDue(v: any, todayKey: string): string | null {
  const s = typeof v === 'string' ? v.trim() : '';
  if (!isDateKey(s)) return null;
  if (s < todayKey) return todayKey;
  if (s > addDaysKey(todayKey, 730)) return null;
  return s;
}

/** Prazo dito em português, por regras: hoje, amanhã, depois de amanhã, dia da semana, "dia 15", "em novembro" (dia 1º), "semana que vem", "daqui a N dias". */
export function parseDueFromText(text: string, todayKey: string): string | null {
  const t = norm(text);
  if (/\bdepois de amanha\b/.test(t)) return addDaysKey(todayKey, 2);
  if (/\bamanha\b/.test(t)) return addDaysKey(todayKey, 1);
  if (/\bhoje\b/.test(t)) return todayKey;
  const dias = t.match(/\bdaqui a (\d{1,3}) dias?\b/); if (dias) return addDaysKey(todayKey, Math.min(365, Number(dias[1])));
  if (/\b(semana que vem|proxima semana)\b/.test(t)) return addDaysKey(todayKey, 7);
  for (const [name, wd] of Object.entries(WEEKDAYS)) {
    if (new RegExp(`\\b${name}( feira)?\\b`).test(t)) { const cur = weekdayOfKey(todayKey); const add = (wd - cur + 7) % 7 || 7; return addDaysKey(todayKey, add); }
  }
  const dia = t.match(/\bdia (\d{1,2})\b/);
  if (dia) {
    const d = Number(dia[1]);
    if (d >= 1 && d <= 31) {
      let y = Number(todayKey.slice(0, 4)), m = Number(todayKey.slice(5, 7));
      for (let i = 0; i < 14; i++) {
        const key = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
        if (isDateKey(key) && key >= todayKey) return key;
        m++; if (m > 12) { m = 1; y++; }
      }
    }
  }
  for (const [name, mo] of Object.entries(MONTHS)) {
    if (new RegExp(`\\b(em |no mes de |mes de )?${name}\\b`).test(t) && /\b(em|no|mes)\b/.test(t)) {
      const y = Number(todayKey.slice(0, 4));
      const key = `${y}-${String(mo).padStart(2, '0')}-01`;
      return key >= todayKey ? key : `${y + 1}-${String(mo).padStart(2, '0')}-01`;
    }
  }
  return null;
}

// ───────────────────────── rascunho por regras (sem IA) ─────────────────────────
const RE_DOR = /\b(dor|dores|doeu|doendo|doi|dolorid[oa]|lesao|machucou|machucad[oa]|estalo|travou|formigamento|desconforto|incomod\w*|senti\w* (as |a |o |os )?(costas|joelho|ombro|lombar|coluna|cotovelo|punho|quadril|tornozelo))\b/;
const RE_APARELHO = /\b(aparelho|maquina|quebrad[oa]|nao tem o|nao tem a|equipamento)\b/;
const RE_DIETA = /\b(dieta|refeicao|alimentacao|cafe da manha|almoco|jantar|suplemento|whey|remedio|roacutan|medicamento)\b/;
const RE_TREINO = /\b(treino|ficha|dias de treino|series|carga|exercicio|agachamento|supino|leg press)\b/;
const RE_ACAO = /\b(pediu|quer|queria|precisa|preciso|vou|tenho que|lembrar|avisar|ver |checar|trocar|mudar|ajustar|passar de|retornar|ligar|mandar|enviar|responder)\b/;

export function guessTag(text: string): NoteTag {
  const t = norm(text);
  if (RE_DOR.test(t)) return 'DOR';
  if (RE_APARELHO.test(t)) return 'APARELHO';
  if (RE_DIETA.test(t)) return 'DIETA';
  if (RE_TREINO.test(t)) return 'TREINO';
  if (RE_ACAO.test(t)) return 'PEDIDO';
  return 'OUTRO';
}

export interface Draft { studentId: string | null; studentName: string | null; candidates: { id: string; name: string }[]; kind: NoteKind; tag: NoteTag; body: string; dueDate: string | null; ai: boolean }

/** Quando a IA não ajuda: aluno por nome citado no texto, etiqueta e tipo por palavras-chave, prazo por regras. O coach confere de qualquer jeito. */
export function ruleDraft(text: string, students: StudentRef[], todayKey: string): Draft {
  const body = cut(text, MAX_BODY);
  const cands = findMentions(text, students);
  const chosen = pickStudent(cands);
  const tag = guessTag(text);
  const due = parseDueFromText(text, todayKey);
  const wantsTask = tag === 'DOR' || tag === 'PEDIDO' || (tag !== 'OUTRO' && RE_ACAO.test(norm(text))) || !!due;
  return {
    studentId: chosen ? chosen.id : null, studentName: chosen ? chosen.name : null, candidates: cands.slice(0, 5).map((c) => ({ id: c.id, name: c.name })),
    kind: wantsTask ? 'TAREFA' : 'NOTA', tag, body, dueDate: wantsTask ? (due || todayKey) : null, ai: false,
  };
}

/** Junta o que a IA extraiu com os alunos do coach: nome falado -> aluno (código, não IA), prazo validado, etiqueta/tipo válidos. */
export function draftFromExtraction(ex: any, text: string, students: StudentRef[], todayKey: string): Draft {
  const spoken = typeof ex?.aluno_falado === 'string' ? ex.aluno_falado : null;
  let cands = matchStudents(spoken, students);
  if (!cands.length) cands = findMentions(text, students);
  const chosen = pickStudent(cands);
  const tag: NoteTag = isTag(ex?.etiqueta) ? ex.etiqueta : guessTag(text);
  let kind: NoteKind = isKind(ex?.tipo) ? ex.tipo : 'NOTA';
  const body = cut(ex?.resumo, MAX_BODY) || cut(text, MAX_BODY);
  let due = kind === 'TAREFA' ? cleanDue(ex?.prazo, todayKey) || parseDueFromText(text, todayKey) : null;
  if (kind === 'TAREFA' && !due) due = todayKey;
  return { studentId: chosen ? chosen.id : null, studentName: chosen ? chosen.name : null, candidates: cands.slice(0, 5).map((c) => ({ id: c.id, name: c.name })), kind, tag, body, dueDate: due, ai: true };
}

// ───────────────────────── salvar ─────────────────────────
export interface CleanNote { studentId: string | null; kind: NoteKind; tag: NoteTag | null; body: string; rawText: string | null; source: 'VOZ' | 'TEXTO'; dueDate: string | null }
export function cleanNoteInput(b: any, todayKey: string): { ok: true; value: CleanNote } | { ok: false; error: string } {
  const body = cut(b?.body, MAX_BODY);
  if (!body) return { ok: false, error: 'Escreva a anotação.' };
  const kind: NoteKind = isKind(b?.kind) ? b.kind : 'NOTA';
  const tag = isTag(b?.tag) ? b.tag : null;
  let dueDate: string | null = null;
  if (kind === 'TAREFA') {
    if (b?.dueDate !== undefined && b?.dueDate !== null && b?.dueDate !== '') {
      const d = cleanDue(b.dueDate, todayKey);
      if (!d) return { ok: false, error: 'Data inválida.' };
      dueDate = d;
    } else dueDate = todayKey;
  }
  return { ok: true, value: { studentId: cut(b?.studentId, 80) || null, kind, tag, body, rawText: cut(b?.rawText, MAX_RAW) || null, source: b?.source === 'TEXTO' ? 'TEXTO' : 'VOZ', dueDate } };
}

export const statusFor = (kind: NoteKind) => (kind === 'TAREFA' ? 'OPEN' : 'INFO');
export const todayKeyBrt = (now: Date = new Date()) => dateKeyBrt(now);
export { cut as cleanText };
