// lib/membrosMedidas.ts
// 📏 (out 2026) FICHA DE MEDIDAS E FOTOS DE EVOLUÇÃO. As medidas são números por campo (cintura, quadril...) em cada momento (início, semana 4, semana 8...).
// As fotos são PRIVADAS: o navegador reduz a imagem (JPEG) e o servidor só aceita JPEG de verdade (confere os primeiros bytes), até FOTO_MAX_BYTES.
// Nada aqui fala com o banco.
import { numero } from './membrosTexto';

export const FOTO_MAX_BYTES = 900_000;
export const FOTO_MAX_CHARS = 1_300_000;     // tamanho do texto base64 (900 KB em bytes viram ~1,2 milhão de caracteres)
const DATA_RE = /^\d{4}-\d{2}-\d{2}$/;

interface ConfigMedidas { campos: { id: string }[]; momentos: { id: string }[]; poses: { id: string }[] }

export interface MedidaEntrada { momento: string; data?: string | null; valores: Record<string, number | null> }
export type MedidaValidada = ({ ok: true } & MedidaEntrada) | { ok: false };

const dataValida = (s: unknown): s is string => {
  if (typeof s !== 'string' || !DATA_RE.test(s)) return false;
  const t = Date.parse(`${s}T00:00:00.000Z`);
  return Number.isFinite(t) && new Date(t).toISOString().slice(0, 10) === s;      // 2026-02-30 vira 2026-03-02 e é recusada
};

/** Confere uma anotação de medidas: momento da lista, campos da lista, números razoáveis (null apaga a medida). A data é opcional (AAAA-MM-DD). */
export function validarMedida(body: any, config: ConfigMedidas): MedidaValidada {
  if (!body || typeof body !== 'object') return { ok: false };
  if (typeof body.momento !== 'string' || !config.momentos.some((m) => m.id === body.momento)) return { ok: false };
  const out: MedidaValidada = { ok: true, momento: body.momento, valores: Object.create(null) };
  if (body.data !== undefined && body.data !== null) { if (!dataValida(body.data)) return { ok: false }; out.data = body.data; }
  else if (body.data === null) out.data = null;
  if (body.valores !== undefined) {
    if (!body.valores || typeof body.valores !== 'object' || Array.isArray(body.valores)) return { ok: false };
    for (const k of Object.keys(body.valores)) {
      if (!config.campos.some((c) => c.id === k)) return { ok: false };
      const v = body.valores[k];
      if (v === null || v === '') { out.valores[k] = null; continue; }
      const n = numero(v, 0.01, 1000);
      if (n === null) return { ok: false };
      out.valores[k] = Math.round(n * 100) / 100;
    }
  }
  if (out.data === undefined && !Object.keys(out.valores).length) return { ok: false };
  return out;
}

/** Junta o que já estava gravado com a anotação nova (null apaga). */
export function mesclarValores(atual: unknown, novo: Record<string, number | null>): Record<string, number> {
  const out: Record<string, number> = {};
  if (atual && typeof atual === 'object' && !Array.isArray(atual)) Object.keys(atual as any).forEach((k) => { const v = (atual as any)[k]; if (typeof v === 'number' && Number.isFinite(v)) out[k] = v; });
  Object.keys(novo).forEach((k) => { if (novo[k] === null) delete out[k]; else out[k] = novo[k] as number; });
  return out;
}

export interface FotoEntrada { momento: string; pose: string; bytes: Buffer }
export type FotoValidada = ({ ok: true } & FotoEntrada) | { ok: false; motivo: 'invalida' | 'grande' };

/** Confere uma foto: momento e pose da lista; imagem como "data:image/jpeg;base64,..." que de fato seja um JPEG e caiba no limite. */
export function validarFoto(body: any, config: ConfigMedidas): FotoValidada {
  if (!body || typeof body !== 'object') return { ok: false, motivo: 'invalida' };
  if (typeof body.momento !== 'string' || !config.momentos.some((m) => m.id === body.momento)) return { ok: false, motivo: 'invalida' };
  if (typeof body.pose !== 'string' || !config.poses.some((p) => p.id === body.pose)) return { ok: false, motivo: 'invalida' };
  const img = body.imagem;
  if (typeof img !== 'string') return { ok: false, motivo: 'invalida' };
  if (img.length > FOTO_MAX_CHARS) return { ok: false, motivo: 'grande' };
  const m = /^data:image\/jpeg;base64,([A-Za-z0-9+/]+={0,2})$/.exec(img);
  if (!m) return { ok: false, motivo: 'invalida' };
  const bytes = Buffer.from(m[1], 'base64');
  if (bytes.length > FOTO_MAX_BYTES) return { ok: false, motivo: 'grande' };
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8 || bytes[2] !== 0xff) return { ok: false, motivo: 'invalida' };       // todo JPEG começa com FF D8 FF
  return { ok: true, momento: body.momento, pose: body.pose, bytes };
}
