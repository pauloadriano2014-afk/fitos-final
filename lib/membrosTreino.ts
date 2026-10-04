// lib/membrosTreino.ts
// 🏋️ (out 2026) FICHA INTERATIVA NA ÁREA DE MEMBROS: lê o programa de treino de um produto (ProdutoDigital.treinoPrograma), monta o que a página /treino/ mostra
// (mesmo formato de vídeo e de técnicas da página pública /t) e confere os registros que a pessoa grava (feito e carga por exercício e por semana).
// Nada aqui fala com o banco: tudo recebe o que precisa por parâmetro, para ser testável.
import { parseVideoRef, type VideoRef } from './workoutShare';
import { SYSTEM_TECHNIQUES } from './techniqueGuide';

export const SEMANAS_PADRAO = 8;
export const SEMANAS_MAX = 52;
export const MAX_TREINOS = 14;
export const MAX_EXERCICIOS = 40;
export const CARGA_MAX = 1000;
const MS_SEMANA = 7 * 24 * 60 * 60 * 1000;
const REST_MIN = 5;
const REST_MAX = 900;

export interface ExercicioProg {
  nome: string;
  prescricao: string;           // como está na ficha: "15/12/10 + DROP"
  orientacao: string;
  principal: string[];
  secundario: string[];
  video: VideoRef;
  metodos: string[];            // chaves de técnica (DROPSET, RESTPAUSE, BISET, TRISET, TUT, FALHA), na ordem em que aparecem
}
export interface TreinoProg { nome: string; foco: string; descanso: string; descansoSeg: number | null; exercicios: ExercicioProg[] }
export interface Programa { semanas: number; treinos: TreinoProg[] }

// texto de uma linha: sem caracteres de controle e com tamanho limitado (tudo que vai para a página entra lá como texto, nunca como HTML)
const linha = (v: unknown, max: number): string => String(v ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
const paragrafo = (v: unknown, max: number): string => String(v ?? '').replace(/[\u0000-\u0009\u000b-\u001f\u007f]/g, ' ').replace(/[ \t]+/g, ' ').replace(/ ?\n ?/g, '\n').replace(/\n{3,}/g, '\n\n').trim().slice(0, max);
const lista = (v: unknown): string[] => (Array.isArray(v) ? v : []).map((x) => linha(x, 60)).filter(Boolean).slice(0, 6);

/** Técnicas citadas na prescrição ("15/12/10 + DROP", "3 x 12 REST-PAUSE", "4 x FALHA"). */
export function metodosDe(prescricao: unknown): string[] {
  const t = String(prescricao ?? '').toUpperCase();
  const achados: { key: string; pos: number }[] = [];
  const procura = (key: string, re: RegExp) => { const m = re.exec(t); if (m) achados.push({ key, pos: m.index }); };
  procura('DROPSET', /DROP/);
  procura('RESTPAUSE', /REST[\s_-]*PAUSE/);
  procura('TRISET', /TRI[\s_-]*SET/);
  procura('BISET', /BI[\s_-]*SET/);
  procura('TUT', /\bTUT\b|T\.U\.T/);
  procura('FALHA', /FALHA/);
  return achados.sort((a, b) => a.pos - b.pos).map((a) => a.key);
}

/** "60-90s" -> 90 (começa o cronômetro no tempo maior da faixa); "45s" -> 45; sem número -> null. */
export function descansoEmSegundos(texto: unknown): number | null {
  const t = String(texto ?? '');
  const faixa = /(\d{1,6})\s*(?:-|–|a|à)\s*(\d{1,6})/.exec(t);
  const unico = /(\d{1,6})/.exec(t);
  const n = faixa ? Number(faixa[2]) : (unico ? Number(unico[1]) : NaN);
  if (!Number.isFinite(n) || n < REST_MIN) return null;
  return Math.min(n, REST_MAX);
}

const inteiro = (v: unknown): number | null => (typeof v === 'number' && Number.isInteger(v) ? v : (typeof v === 'string' && /^\d{1,4}$/.test(v.trim()) ? Number(v.trim()) : null));

/** Lê o JSON do programa. As posições dos treinos e dos exercícios são as do JSON salvo (os registros da pessoa apontam para elas), então nada é descartado ou reordenado. */
export function lerPrograma(raw: unknown): Programa | null {
  if (typeof raw !== 'string' || !raw.trim()) return null;
  let o: any;
  try { o = JSON.parse(raw); } catch { return null; }
  if (!o || typeof o !== 'object' || !Array.isArray(o.treinos) || o.treinos.length === 0) return null;
  const n = inteiro(o.duracaoSemanas);
  const semanas = n !== null && n >= 1 && n <= SEMANAS_MAX ? n : SEMANAS_PADRAO;
  const treinos: TreinoProg[] = o.treinos.slice(0, MAX_TREINOS).map((t: any, i: number) => {
    const exs = Array.isArray(t?.exercicios) ? t.exercicios.slice(0, MAX_EXERCICIOS) : [];
    const descanso = linha(t?.descanso, 20);
    return {
      nome: linha(t?.nome, 60) || `Treino ${i + 1}`,
      foco: linha(t?.foco, 120),
      descanso,
      descansoSeg: descansoEmSegundos(descanso),
      exercicios: exs.map((e: any): ExercicioProg => ({
        nome: linha(e?.nome, 120) || 'Exercício',
        prescricao: linha(e?.seriesRepeticoes, 60),
        orientacao: paragrafo(e?.orientacao, 600),
        principal: lista(e?.muscPrincipal),
        secundario: lista(e?.muscSecundario),
        video: parseVideoRef(e?.videoUrl),
        metodos: metodosDe(e?.seriesRepeticoes),
      })),
    };
  });
  return { semanas, treinos };
}

/** Semana em que a pessoa está, contada da data da compra: 1 na primeira semana, no máximo `semanas`. */
export function semanaAtual(comprouEm: Date | string, semanas: number, agora: Date = new Date()): number {
  const t = new Date(comprouEm).getTime();
  if (!Number.isFinite(t)) return 1;
  return Math.min(semanas, Math.max(1, Math.floor((agora.getTime() - t) / MS_SEMANA) + 1));
}

export type TecnicaPublica = { title: string; desc: string; video: VideoRef };

const FALHA: { title: string; desc: string } = {
  title: 'TREINO ATÉ A FALHA',
  desc: 'COMO EXECUTAR:\nFaça as repetições até o ponto em que você não consegue completar mais nenhuma com boa técnica. Pare ali: não vale quebrar a postura nem roubar o movimento para conseguir mais uma.\n\nPOR QUE FAZER:\nLeva o músculo ao limite do estímulo naquela série, que é o que gera o resultado. Quanto mais controlada a execução, mais seguro e mais eficiente.',
};

/** Só as técnicas usadas pelo programa, com texto do guia do sistema e o vídeo cadastrado (chave -> endereço) quando houver. */
export function tecnicasDoPrograma(programa: Programa, videos: Record<string, string> = {}): Record<string, TecnicaPublica> {
  const usadas = new Set<string>();
  programa.treinos.forEach((t) => t.exercicios.forEach((e) => e.metodos.forEach((m) => usadas.add(m))));
  const out: Record<string, TecnicaPublica> = {};
  usadas.forEach((k) => {
    const base = k === 'FALHA' ? FALHA : SYSTEM_TECHNIQUES[k];
    if (base) out[k] = { title: base.title, desc: base.desc, video: parseVideoRef(videos[k]) };
  });
  return out;
}

export interface RegistroEntrada { semana: number; treino: number; exercicio: number; feito?: boolean; carga?: number | null; desmarcarTudo?: boolean }
export type RegistroValidado = ({ ok: true } & RegistroEntrada) | { ok: false };

const cargaDe = (v: unknown): number | null | undefined => {
  if (v === null) return null;
  const n = typeof v === 'number' ? v : (typeof v === 'string' && /^\d{1,4}([.,]\d{1,2})?$/.test(v.trim()) ? Number(v.trim().replace(',', '.')) : NaN);
  if (!Number.isFinite(n) || n <= 0 || n > CARGA_MAX) return undefined;
  return Math.round(n * 100) / 100;
};

/** Confere o que a página mandou contra o programa do produto: semana, treino e exercício precisam existir, e a carga precisa ser um peso razoável. */
export function validarRegistro(body: any, programa: Programa): RegistroValidado {
  if (!body || typeof body !== 'object') return { ok: false };
  const semana = inteiro(body.semana), treino = inteiro(body.treino);
  if (semana === null || semana < 1 || semana > programa.semanas) return { ok: false };
  if (treino === null || treino < 0 || treino >= programa.treinos.length) return { ok: false };
  if (body.desmarcarTudo === true) return { ok: true, semana, treino, exercicio: 0, desmarcarTudo: true };
  const exercicio = inteiro(body.exercicio);
  if (exercicio === null || exercicio < 0 || exercicio >= programa.treinos[treino].exercicios.length) return { ok: false };
  const out: RegistroValidado = { ok: true, semana, treino, exercicio };
  if (body.feito !== undefined) { if (typeof body.feito !== 'boolean') return { ok: false }; out.feito = body.feito; }
  if (body.carga !== undefined) { const c = cargaDe(body.carga); if (c === undefined) return { ok: false }; out.carga = c; }
  if (out.feito === undefined && out.carga === undefined) return { ok: false };
  return out;
}
