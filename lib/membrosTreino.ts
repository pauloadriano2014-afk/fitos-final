// lib/membrosTreino.ts
// 🏋️ (out 2026) TREINO DA ÁREA DE MEMBROS. O treino de um produto é um TREINO AVULSO (QuickWorkout), montado na mesma tela "Montar treino" que o coach já usa
// (biblioteca de exercícios com vídeo, blocos de séries, técnicas, bi-set, alongamento e mobilidade, cardio). Aqui ele vira exatamente o que a página pública
// /t mostra (lib/workoutShare.ts: buildPublicWorkout), mais o que a Área de Membros acrescenta: as semanas, a carga de cada exercício e o que a pessoa marcou.
// Quase tudo recebe o `db` por parâmetro (testável sem banco).
import { buildPublicWorkout, quickRows, quickExerciseIds, quickSubstituteNames, parseQuickData, exerciseKey, dayLabel, MASTER_TEAM_ID } from './workoutShare';
import { MASTER_IDS } from './masterIds';

export const CARGA_MAX = 1000;
const MS_SEMANA = 7 * 24 * 60 * 60 * 1000;

export interface ItemChave { dia: string; comCarga: boolean }
export interface TreinoMembro {
  nome: string;
  days: { day: string; label: string; sections: any[] }[];
  techniques: Record<string, any>;
  chaves: Record<string, ItemChave>;     // código do exercício -> dia e se aceita carga
  dias: Record<string, string[]>;        // dia -> códigos dos exercícios dele (para "desmarcar tudo")
}

/** Semana em que a pessoa está, contada da data da compra: 1 na primeira semana, no máximo `semanas`. */
export function semanaAtual(comprouEm: Date | string, semanas: number, agora: Date = new Date()): number {
  const t = new Date(comprouEm).getTime();
  if (!Number.isFinite(t)) return 1;
  return Math.min(semanas, Math.max(1, Math.floor((agora.getTime() - t) / MS_SEMANA) + 1));
}

/** Código de compartilhamento "fictício" do produto: entra no cálculo do código de cada exercício (mesma regra da página /t). */
export const codigoDoProduto = (produtoId: string) => `m:${produtoId}`;

/** Monta o treino do produto a partir do Treino Avulso ligado a ele. null = o produto não tem treino (ou o treino foi apagado ou ficou ilegível). */
export async function carregarTreino(db: any, produto: { id: string; treinoAvulsoId?: string | null }): Promise<TreinoMembro | null> {
  if (!produto?.treinoAvulsoId) return null;
  const quick = await db.quickWorkout.findUnique({ where: { id: produto.treinoAvulsoId } });
  if (!quick) return null;
  const parsed = parseQuickData(quick.data);
  if (!parsed.ok) return null;
  const days = parsed.days;

  const exs: any[] = await db.exercise.findMany({ where: { id: { in: quickExerciseIds(days) } }, select: { id: true, name: true, category: true, videoUrl: true } });
  const catalog: Record<string, any> = {};
  exs.forEach((e) => { catalog[e.id] = e; });
  const rows = quickRows(days, catalog);
  const substituteNames: Record<string, string> = quickSubstituteNames(days);
  const substituteVideos: Record<string, string | null> = {};
  exs.forEach((e) => { substituteNames[e.id] = e.name; substituteVideos[e.id] = e.videoUrl || null; });

  // técnicas personalizadas citadas nos blocos (o editor guarda o id dentro do JSON da coluna `technique`) e vídeos das técnicas do sistema (time do coach, com herança do master)
  const customIds = new Set<string>();
  rows.forEach((r: any) => {
    if (typeof r.technique === 'string' && r.technique.trim().startsWith('{')) {
      try { const p = JSON.parse(r.technique); (Array.isArray(p?.b) ? p.b : []).forEach((b: any) => { if (b?.customTechniqueId) customIds.add(String(b.customTechniqueId)); }); } catch { /* ignora */ }
    }
  });
  const customTechniques: any[] = customIds.size ? await db.technique.findMany({ where: { id: { in: Array.from(customIds) } }, select: { id: true, name: true, description: true, steps: true, videoUrl: true } }) : [];
  const teamId = quick.coachId && !MASTER_IDS.includes(quick.coachId) ? quick.coachId : MASTER_TEAM_ID;
  const sysRows: any[] = await db.systemTechniqueVideo.findMany({ where: { teamId: { in: [MASTER_TEAM_ID, teamId] } } });
  const systemVideos: Record<string, string> = {};
  sysRows.filter((r) => r.teamId === MASTER_TEAM_ID).forEach((r) => { systemVideos[r.key] = r.videoUrl; });
  sysRows.filter((r) => r.teamId !== MASTER_TEAM_ID).forEach((r) => { systemVideos[r.key] = r.videoUrl; });

  const codigo = codigoDoProduto(produto.id);
  const pub = buildPublicWorkout({
    workoutName: quick.name, rows, substituteNames, substituteVideos,
    share: { code: codigo, showName: false, displayName: null, days: [], expiresAt: null, notifyDone: false },
    customTechniques, systemVideos,
  });

  // categoria de cada exercício, pelo mesmo código que a página usa (dia + exercício + ocorrência dentro do dia): serve para saber quais são de perna
  const categoriaDe: Record<string, string> = {};
  const vistos: Record<string, number> = {};
  rows.forEach((r: any) => {
    const dia = String(r.day == null ? '' : r.day);
    const id = String(r.exerciseId);
    const k = `${dia}|${id}`;
    vistos[k] = (vistos[k] || 0) + 1;
    categoriaDe[exerciseKey(codigo, dia, id, vistos[k])] = String(r.exercise?.category || '');
  });

  const chaves: Record<string, ItemChave> = Object.create(null);           // sem protótipo: um dia chamado "constructor" ou "__proto__" não vira problema
  const dias: Record<string, string[]> = Object.create(null);
  const out = pub.days.map((d: any) => {
    dias[d.day] = [];
    d.sections.forEach((sec: any) => sec.items.forEach((it: any) => {
      it.comCarga = !it.cardio && sec.key === 'MUSCULACAO';
      it.inferior = (categoriaDe[it.key] || '').toLowerCase() === 'pernas';
      chaves[it.key] = { dia: d.day, comCarga: it.comCarga };
      dias[d.day].push(it.key);
    }));
    return { day: d.day, label: dayLabel(d.day), sections: d.sections };
  });
  return { nome: pub.workout.name, days: out, techniques: pub.techniques, chaves, dias };
}

// ─── o que a pessoa grava ────────────────────────────────────────────────────
export interface RegistroEntrada { semana: number; chave?: string; dia?: string; feito?: boolean; carga?: number | null; desmarcarTudo?: boolean }
export type RegistroValidado = ({ ok: true } & RegistroEntrada) | { ok: false };

const inteiro = (v: unknown): number | null => (typeof v === 'number' && Number.isInteger(v) ? v : (typeof v === 'string' && /^\d{1,4}$/.test(v.trim()) ? Number(v.trim()) : null));

export const cargaDe = (v: unknown): number | null | undefined => {
  if (v === null) return null;
  const n = typeof v === 'number' ? v : (typeof v === 'string' && /^\d{1,4}([.,]\d{1,2})?$/.test(v.trim()) ? Number(v.trim().replace(',', '.')) : NaN);
  if (!Number.isFinite(n) || n <= 0 || n > CARGA_MAX) return undefined;
  return Math.round(n * 100) / 100;
};

/** Confere o que a página mandou contra o treino do produto: semana, exercício (ou dia) precisam existir e a carga precisa ser um peso razoável. */
export function validarRegistro(body: any, treino: TreinoMembro, semanas: number): RegistroValidado {
  if (!body || typeof body !== 'object') return { ok: false };
  const semana = inteiro(body.semana);
  if (semana === null || semana < 1 || semana > semanas) return { ok: false };
  if (body.desmarcarTudo === true) {
    const dia = body.dia;
    if (typeof dia !== 'string' || !Object.prototype.hasOwnProperty.call(treino.dias, dia)) return { ok: false };
    return { ok: true, semana, dia, desmarcarTudo: true };
  }
  const chave = body.chave;
  if (typeof chave !== 'string' || !Object.prototype.hasOwnProperty.call(treino.chaves, chave)) return { ok: false };
  const out: RegistroValidado = { ok: true, semana, chave };
  if (body.feito !== undefined) { if (typeof body.feito !== 'boolean') return { ok: false }; out.feito = body.feito; }
  if (body.carga !== undefined) {
    if (!treino.chaves[chave].comCarga) return { ok: false };          // cardio e mobilidade não têm carga
    const c = cargaDe(body.carga);
    if (c === undefined) return { ok: false };
    out.carga = c;
  }
  if (out.feito === undefined && out.carga === undefined) return { ok: false };
  return out;
}
