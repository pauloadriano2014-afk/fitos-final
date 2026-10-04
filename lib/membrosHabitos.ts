// lib/membrosHabitos.ts
// ✅ (out 2026) CHECKLIST DE HÁBITOS: um quadradinho por hábito, por dia, em todas as semanas do programa. A semana 1 começa no dia do pagamento e cada semana
// tem 7 dias seguidos (dia 0 = o dia do pagamento). As datas são sempre as do Brasil (horário de Brasília, sem horário de verão desde 2019).
// Dois hábitos podem marcar sozinhos a partir do treino: `auto: "treino"` (a pessoa marcou algum exercício como feito nesse dia) e `auto: "carga"` (anotou alguma carga nesse dia).
// Nada aqui fala com o banco.
const OFFSET_BRASIL_MS = -3 * 60 * 60 * 1000;
const DIA_MS = 24 * 60 * 60 * 1000;

/** Data (AAAA-MM-DD) de um instante, no horário de Brasília. */
export const dataBrasil = (instante: Date | string | number): string => new Date(new Date(instante).getTime() + OFFSET_BRASIL_MS).toISOString().slice(0, 10);

/** Soma dias a uma data AAAA-MM-DD. */
export const somarDias = (data: string, dias: number): string => new Date(Date.parse(`${data}T00:00:00.000Z`) + dias * DIA_MS).toISOString().slice(0, 10);

/** Data de cada quadradinho: semana 1..N, dia 0..6 (0 = dia do pagamento). */
export const dataDoDia = (comprouEm: Date | string, semana: number, dia: number): string => somarDias(dataBrasil(comprouEm), (semana - 1) * 7 + dia);

const inteiro = (v: unknown): number | null => (typeof v === 'number' && Number.isInteger(v) ? v : (typeof v === 'string' && /^\d{1,3}$/.test(v.trim()) ? Number(v.trim()) : null));

export interface HabitoEntrada { semana: number; dia: number; habito: string; feito: boolean }
export type HabitoValidado = ({ ok: true } & HabitoEntrada) | { ok: false; motivo: 'invalido' | 'futuro' | 'automatico' };

/** Confere um quadradinho: semana e dia existentes, hábito da lista (e não automático), e dia que já chegou. */
export function validarHabito(body: any, config: { habitos: { id: string; auto?: string }[] }, semanas: number, comprouEm: Date | string, agora: Date = new Date()): HabitoValidado {
  if (!body || typeof body !== 'object') return { ok: false, motivo: 'invalido' };
  const semana = inteiro(body.semana), dia = inteiro(body.dia);
  if (semana === null || semana < 1 || semana > semanas || dia === null || dia < 0 || dia > 6) return { ok: false, motivo: 'invalido' };
  if (typeof body.habito !== 'string' || typeof body.feito !== 'boolean') return { ok: false, motivo: 'invalido' };
  const h = config.habitos.find((x) => x.id === body.habito);
  if (!h) return { ok: false, motivo: 'invalido' };
  if (h.auto) return { ok: false, motivo: 'automatico' };
  if (dataDoDia(comprouEm, semana, dia) > dataBrasil(agora)) return { ok: false, motivo: 'futuro' };
  return { ok: true, semana, dia, habito: body.habito, feito: body.feito };
}

/** Dias (semana e dia) em que a pessoa treinou / anotou carga, a partir dos registros do treino. Devolve pares [semana, dia] nas semanas do programa. */
export function diasAutomaticos(registros: { feito?: boolean | null; carga?: number | null; feitoEm?: Date | string | null; cargaEm?: Date | string | null }[], comprouEm: Date | string, semanas: number): { treino: [number, number][]; carga: [number, number][] } {
  const inicio = dataBrasil(comprouEm);
  const indice = (data: string): [number, number] | null => {
    const n = Math.round((Date.parse(`${data}T00:00:00.000Z`) - Date.parse(`${inicio}T00:00:00.000Z`)) / DIA_MS);
    if (n < 0 || n >= semanas * 7) return null;
    return [Math.floor(n / 7) + 1, n % 7];
  };
  const treino = new Set<string>(), carga = new Set<string>();
  const par = new Map<string, [number, number]>();
  const poe = (conj: Set<string>, instante: Date | string | null | undefined) => {
    if (!instante) return;
    const ix = indice(dataBrasil(instante));
    if (!ix) return;
    const k = `${ix[0]}-${ix[1]}`;
    conj.add(k); par.set(k, ix);
  };
  registros.forEach((r) => {
    if (r.feito) poe(treino, r.feitoEm);
    if (typeof r.carga === 'number') poe(carga, r.cargaEm);
  });
  const ordena = (conj: Set<string>) => Array.from(conj).map((k) => par.get(k)!).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  return { treino: ordena(treino), carga: ordena(carga) };
}
