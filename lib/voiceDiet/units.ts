// lib/voiceDiet/units.ts
// 🎙️ (30 set 2026) Dieta por voz -- converte "quantidade + unidade FALADAS" nas
// unidades que o app de dieta entende.
//
// Dois modos (o app novo manda `measures: true`; o antigo não manda nada):
//   - nativo: colher de chá/sobremesa/café/servir, concha, escumadeira, bife P/M/G, pedaço, copo, scoop e
//     punhado passam COMO FALADOS (o app tem essas medidas; o peso vem do cadastro do alimento, ou de um
//     peso genérico avisado como "estimado");
//   - legado (app antigo): viram gramas/ml com uma nota ("1 scoop ≈ 30 g"), como sempre foi.

export const SPOKEN_UNITS = [
  'g', 'ml', 'unidade', 'fatia', 'colher_sopa', 'colher_sobremesa', 'colher_cha', 'colher_cafe', 'colher_servir',
  'xicara', 'copo', 'scoop', 'punhado', 'concha', 'escumadeira', 'bife', 'bife_p', 'bife_m', 'bife_g', 'pedaco', 'porcao',
] as const;
export type SpokenUnit = (typeof SPOKEN_UNITS)[number];
export type NativeUnit =
  | 'colher_sobremesa' | 'colher_cha' | 'colher_cafe' | 'colher_servir' | 'copo' | 'scoop' | 'punhado' | 'concha'
  | 'escumadeira' | 'bife_p' | 'bife_m' | 'bife_g' | 'pedaco';
export type AppUnit = 'g' | 'ml' | 'unid' | 'colher' | 'fatia' | 'xícara' | NativeUnit;
export type Assumed = 'amount' | 'unit' | 'prep' | 'name' | 'time';

export type Quantity = {
  amount: number | null;
  unit: AppUnit | null;
  assumed: Assumed[];   // 'amount' = não falou quantidade; 'unit' = unidade convertida/deduzida
  note: string;         // ex.: "1 scoop ≈ 30 g" (vazio se não houve conversão)
};

// unidades do app que o coach fala tal e qual
const DIRECT: Record<string, AppUnit> = {
  g: 'g', ml: 'ml', unidade: 'unid', fatia: 'fatia', colher_sopa: 'colher', xicara: 'xícara',
};

// unidades que o app ANTIGO não tem: viram g/ml (fator, unidade final, nome pra nota).
// Pesos genéricos: os mesmos de GENERIC_GRAMS do app; os de bife/pedaço/colher de servir/escumadeira vêm
// das medianas da tabela do IBGE (POF 2008-2009).
const CONVERTED: Record<string, { factor: number; unit: AppUnit; label: string }> = {
  colher_cha:       { factor: 5,   unit: 'g',  label: 'colher de chá' },
  colher_sobremesa: { factor: 10,  unit: 'g',  label: 'colher de sobremesa' },
  colher_cafe:      { factor: 2.5, unit: 'g',  label: 'colher de café' },
  colher_servir:    { factor: 50,  unit: 'g',  label: 'colher de servir' },
  copo:             { factor: 200, unit: 'ml', label: 'copo' },
  scoop:            { factor: 30,  unit: 'g',  label: 'scoop' },
  punhado:          { factor: 30,  unit: 'g',  label: 'punhado' },
  concha:           { factor: 100, unit: 'g',  label: 'concha' },
  escumadeira:      { factor: 70,  unit: 'g',  label: 'escumadeira' },
  bife_p:           { factor: 75,  unit: 'g',  label: 'bife pequeno' },
  bife_m:           { factor: 100, unit: 'g',  label: 'bife médio' },
  bife_g:           { factor: 150, unit: 'g',  label: 'bife grande' },
  pedaco:           { factor: 40,  unit: 'g',  label: 'pedaço' },
};

// medidas que o app NOVO entende como unidade (passam como faladas)
const NATIVE = new Set<string>([
  'colher_sobremesa', 'colher_cha', 'colher_cafe', 'colher_servir', 'copo', 'scoop', 'punhado', 'concha',
  'escumadeira', 'bife_p', 'bife_m', 'bife_g', 'pedaco',
]);

export function toAmount(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = typeof v === 'number' ? v : parseFloat(String(v).replace(',', '.').replace(/[^\d.]/g, ''));
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.min(5000, Math.round(n * 100) / 100);
}

const round1 = (n: number) => Math.round(n * 10) / 10;
const fmt = (n: number) => String(round1(n)).replace('.', ',');

export function normalizeQuantity(amountRaw: unknown, unitRaw: unknown, opts: { native?: boolean } = {}): Quantity {
  const amount = toAmount(amountRaw);
  const unit = typeof unitRaw === 'string' ? unitRaw.trim().toLowerCase() : '';

  // "uma porção" / sem número: quem completa é o app (porção padrão do alimento)
  if (unit === 'porcao' || amount === null) {
    return { amount: null, unit: null, assumed: ['amount'], note: '' };
  }

  if (DIRECT[unit]) {
    return { amount, unit: DIRECT[unit], assumed: [], note: '' };
  }

  // "um bife" sem tamanho: médio (o IBGE trata o bife médio como o padrão), avisando.
  const key = unit === 'bife' ? 'bife_m' : unit;
  if (opts.native && NATIVE.has(key)) {
    if (unit === 'bife') return { amount, unit: 'bife_m', assumed: ['unit'], note: 'bife sem tamanho → médio' };
    return { amount, unit: key as NativeUnit, assumed: [], note: '' };
  }

  const conv = CONVERTED[key];
  if (conv) {
    const total = round1(amount * conv.factor);
    return {
      amount: total,
      unit: conv.unit,
      assumed: ['unit'],
      note: `${fmt(amount)} ${conv.label} ≈ ${fmt(total)} ${conv.unit}`,
    };
  }

  // Falou número sem unidade ("100 de frango", "2 ovos"): deduz e avisa.
  if (amount >= 20) return { amount, unit: 'g', assumed: ['unit'], note: `${fmt(amount)} sem unidade → gramas` };
  return { amount, unit: 'unid', assumed: ['unit'], note: `${fmt(amount)} sem unidade → unidades` };
}
