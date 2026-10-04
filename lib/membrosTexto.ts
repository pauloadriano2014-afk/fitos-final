// lib/membrosTexto.ts
// 🧼 Limpeza de texto para tudo que a Área de Membros mostra: o que vem do banco (treino, guias, receitas) entra na página como TEXTO, nunca como HTML,
// mas mesmo assim tiramos caracteres de controle e limitamos o tamanho para um conteúdo mal formado nunca quebrar a tela.

/** Texto de uma linha: sem caracteres de controle, espaços aparados e tamanho limitado. */
export const linha = (v: unknown, max: number): string => String(v ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);

/** Texto com quebras de linha (até uma linha em branco entre parágrafos). */
export const paragrafo = (v: unknown, max: number): string => String(v ?? '').replace(/[\u0000-\u0009\u000b-\u001f\u007f]/g, ' ').replace(/[ \t]+/g, ' ').replace(/ ?\n ?/g, '\n').replace(/\n{3,}/g, '\n\n').trim().slice(0, max);

/** Lista de textos de uma linha, sem os vazios. */
export const lista = (v: unknown, maxItens: number, maxTexto: number): string[] => (Array.isArray(v) ? v : []).map((x) => linha(x, maxTexto)).filter(Boolean).slice(0, maxItens);

/** Número finito dentro de [min, max], ou null (aceita "72,5"). */
export function numero(v: unknown, min: number, max: number): number | null {
  const n = typeof v === 'number' ? v : (typeof v === 'string' && /^\d{1,6}([.,]\d{1,2})?$/.test(v.trim()) ? Number(v.trim().replace(',', '.')) : NaN);
  return Number.isFinite(n) && n >= min && n <= max ? n : null;
}

/** Minutos de um texto de tempo: "15 min" -> 15, "4 h (geladeira)" -> 240, "5 min + repouso" -> 5, "2 h" -> 120; sem número -> null. */
export function minutosDe(texto: unknown): number | null {
  const t = String(texto ?? '').toLowerCase();
  const m = /(?<![\d.,])(\d{1,3})\s*(h|hora|horas|min|minuto|minutos)\b/.exec(t);
  if (!m) return null;
  const n = Number(m[1]);
  return /^h/.test(m[2]) ? n * 60 : n;
}
