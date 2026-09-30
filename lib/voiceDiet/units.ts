// lib/voiceDiet/units.ts
// 🎙️ (30 set 2026) Dieta por voz -- converte "quantidade + unidade FALADAS" nas
// unidades que o app de dieta entende: g, ml, unid, colher, fatia, xícara
// (UNITS em src/utils/dietUtils.js). O que o app não tem vira gramas/ml com uma
// nota, pra o coach ver de onde veio o número ("1 scoop ≈ 30 g").

export const SPOKEN_UNITS = [
  'g', 'ml', 'unidade', 'fatia', 'colher_sopa', 'colher_cha', 'xicara', 'copo', 'scoop', 'punhado', 'concha', 'porcao',
] as const;
export type SpokenUnit = (typeof SPOKEN_UNITS)[number];
export type AppUnit = 'g' | 'ml' | 'unid' | 'colher' | 'fatia' | 'xícara';
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

// unidades que o app NÃO tem: viram g/ml (fator, unidade final, nome pra nota)
const CONVERTED: Record<string, { factor: number; unit: AppUnit; label: string }> = {
  colher_cha: { factor: 5,   unit: 'g',  label: 'colher de chá' },
  copo:       { factor: 200, unit: 'ml', label: 'copo' },
  scoop:      { factor: 30,  unit: 'g',  label: 'scoop' },
  punhado:    { factor: 30,  unit: 'g',  label: 'punhado' },
  concha:     { factor: 100, unit: 'g',  label: 'concha' },
};

export function toAmount(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = typeof v === 'number' ? v : parseFloat(String(v).replace(',', '.').replace(/[^\d.]/g, ''));
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.min(5000, Math.round(n * 100) / 100);
}

const round1 = (n: number) => Math.round(n * 10) / 10;
const fmt = (n: number) => String(round1(n)).replace('.', ',');

export function normalizeQuantity(amountRaw: unknown, unitRaw: unknown): Quantity {
  const amount = toAmount(amountRaw);
  const unit = typeof unitRaw === 'string' ? unitRaw.trim().toLowerCase() : '';

  // "uma porção" / sem número: quem completa é o app (porção padrão do alimento)
  if (unit === 'porcao' || amount === null) {
    return { amount: null, unit: null, assumed: ['amount'], note: '' };
  }

  if (DIRECT[unit]) {
    return { amount, unit: DIRECT[unit], assumed: [], note: '' };
  }

  const conv = CONVERTED[unit];
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
