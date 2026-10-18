// lib/insightDigest.ts
// 🧠 (18 out 2026) RESUMOS COMPACTOS (digests) das rotinas para a análise com IA e as contas da MEMÓRIA. Tudo função pura, sem banco e sem IA.
// A IA nunca recebe o banco: recebe um texto curto por rotina (dias, exercícios, séries, técnicas, avisos) e o perfil do aluno SEM nome, telefone, e-mail ou foto.
// O `hash` de cada resumo é o que a memória compara para saber se algo mudou.
import { createHash } from 'crypto';
import type { CompareDay } from '@/lib/similarStudents';

/** JSON estável (chaves em ordem) para o mesmo conteúdo dar sempre o mesmo hash. */
export function stable(v: any): string {
  if (v === null || typeof v !== 'object') return JSON.stringify(v === undefined ? null : v);
  if (Array.isArray(v)) return '[' + v.map(stable).join(',') + ']';
  return '{' + Object.keys(v).sort().map((k) => JSON.stringify(k) + ':' + stable(v[k])).join(',') + '}';
}
export const hashOf = (v: any): string => createHash('sha1').update(stable(v)).digest('hex').slice(0, 16);

export const MAX_DIGEST_CHARS = 1800;
const FLAG_TXT: Record<string, string> = { SEM_APARELHO: 'SEM APARELHO', LIMITACAO: 'LIMITAÇÃO', AMBIENTE: 'OUTRO LOCAL', NIVEL: 'AVANÇADO P/ NÍVEL' };

export interface RoutineStats { days: number; exercises: number; avgSets: number; techniques: string[]; flagged: number }
export interface Digest { text: string; hash: string; stats: RoutineStats }

/** Texto compacto de uma rotina ("Dia A (PEITO 4): Supino 4x10 DROPSET; Crucifixo 3x12 [SEM APARELHO]"). `withFlags` marca o que não serve para o aluno de destino. */
export function digestRoutine(days: CompareDay[], o: { withFlags?: boolean } = {}): Digest {
  const lines: string[] = []; const tech = new Set<string>(); let ex = 0, sets = 0, flagged = 0;
  for (const d of days || []) {
    const cats = (d.byCategory || []).map((c) => `${String(c.category).toUpperCase()} ${c.count}`).join(', ');
    const items = (d.exercises || []).map((e) => {
      ex++; sets += Number(e.sets) || 0; if (e.technique) String(e.technique).split(' + ').forEach((t) => tech.add(t));
      const fl = o.withFlags && e.flags && e.flags.length ? ` [${e.flags.map((f) => FLAG_TXT[f] || f).join('+')}]` : '';
      if (fl) flagged++;
      // linha por série já traz a técnica de cada série; bi-set/tri-set (do exercício todo) entram à parte
      const grp = String(e.technique || '').split(' + ').filter((t) => /^(BISET|TRISET)$/i.test(t.replace(/[\s_-]/g, ''))).join(' + ');
      const body = e.series ? e.series : `${e.sets}x${e.reps}${e.technique ? ' ' + e.technique : ''}`;
      return `${e.name} ${body}${e.series && grp ? ' ' + grp : ''}${fl}`;
    });
    lines.push(`Dia ${d.day}${cats ? ' (' + cats + ')' : ''}: ${items.join('; ')}`);
  }
  let text = lines.join('\n');
  if (text.length > MAX_DIGEST_CHARS) text = text.slice(0, MAX_DIGEST_CHARS - 1) + '…';
  return { text, hash: hashOf(text), stats: { days: (days || []).length, exercises: ex, avgSets: ex ? Math.round((sets / ex) * 10) / 10 : 0, techniques: [...tech].sort(), flagged } };
}

/** O que mudou entre as fontes que a análise anterior viu e as de agora. */
export function diffSources(prev: Record<string, string> | null | undefined, next: Record<string, string>): { added: string[]; removed: string[]; changed: string[]; same: string[] } {
  const p = prev || {}; const out = { added: [] as string[], removed: [] as string[], changed: [] as string[], same: [] as string[] };
  for (const k of Object.keys(next)) { if (k === '__target') continue; if (!(k in p)) out.added.push(k); else if (p[k] !== next[k]) out.changed.push(k); else out.same.push(k); }
  for (const k of Object.keys(p)) if (k !== '__target' && !(k in next)) out.removed.push(k);
  return out;
}

const arr = (v: any, max: number, len: number): string[] => (Array.isArray(v) ? v : []).map((x) => String(x ?? '').replace(/\s+/g, ' ').trim()).filter(Boolean).slice(0, max).map((s) => (s.length > len ? s.slice(0, len - 1) + '…' : s));
const str = (v: any, len: number): string => { const s = String(v ?? '').replace(/\s+/g, ' ').trim(); return s.length > len ? s.slice(0, len - 1) + '…' : s; };

export interface Analysis { resumo: string; estrutura: string[]; aproveitar: string[]; mudar: string[]; cargas: string[]; metodologia: { nome: string; porque: string; como_aplicar: string }; proxima_rotina: string; alertas: string[] }
/** Limpa o que a IA devolveu: textos e listas com tamanho máximo, tipos certos, "Referência N" trocado pelo nome do aluno-referência. */
export function sanitizeAnalysis(raw: any, labels: Record<string, string> = {}): Analysis {
  const fix = (s: string) => s.replace(/Refer[eê]ncia\s*(\d)/gi, (m, n) => labels[n] || m);
  const f = (s: string) => fix(s);
  const m = raw && typeof raw.metodologia === 'object' && raw.metodologia ? raw.metodologia : {};
  return {
    resumo: f(str(raw?.resumo, 480)), estrutura: arr(raw?.estrutura, 4, 220).map(f), aproveitar: arr(raw?.aproveitar, 5, 220).map(f), mudar: arr(raw?.mudar, 5, 220).map(f), cargas: arr(raw?.cargas, 4, 220).map(f),
    metodologia: { nome: f(str(m.nome, 80)), porque: f(str(m.porque, 300)), como_aplicar: f(str(m.como_aplicar, 300)) },
    proxima_rotina: f(str(raw?.proxima_rotina, 320)), alertas: arr(raw?.alertas, 3, 200).map(f),
  };
}

/** O texto que o assistente LÊ em voz alta (resumo + metodologia + 2 pontos de cada lista). */
export function spokenAnalysis(a: Analysis): string {
  const parts = [a.resumo];
  if (a.metodologia.nome) parts.push(`Metodologia sugerida: ${a.metodologia.nome}. ${a.metodologia.porque}`);
  if (a.aproveitar.length) parts.push(`Dá para aproveitar: ${a.aproveitar.slice(0, 2).join('; ')}.`);
  if (a.mudar.length) parts.push(`Mudar: ${a.mudar.slice(0, 2).join('; ')}.`);
  if (a.cargas && a.cargas.length) parts.push(`Cargas: ${a.cargas.slice(0, 2).join('; ')}.`);
  return parts.filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
}
