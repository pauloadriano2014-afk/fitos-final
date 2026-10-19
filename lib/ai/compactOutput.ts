// lib/ai/compactOutput.ts
// 📉 (19 out 2026) FORMATO COMPACTO DA RESPOSTA DA IA (modo inteligente). Cada geração custava ~US$ 0,08 no Argon e 82% disso era a SAÍDA: a IA escrevia, por exercício, título, categoria, subcategoria,
// observação e 4 blocos repetindo série/repetição/carga/descanso/técnica (~200 tokens por exercício), e o servidor já descartava ou recalculava quase tudo. Agora a IA escreve só o essencial:
//     { "id": "E001", "reps": [15, 12, 10, 8] }                       ← uma entrada por série
//     { "id": "E014", "reps": [12, 10, 8], "t": "DROPSET" }           ← técnica (dropset/rest-pause valem só para a ÚLTIMA série, como nos treinos reais do Paulo e da Adri)
//     { "id": "E077", "blocks": [{ "sets": "20", "reps": "200", "technique": "Moderada" }] }   ← cardio (minutos/kcal) segue com "blocks"
// e o servidor completa: nome, categoria, descanso do grupo, carga-alvo (só quem já treinou o exercício) e substituto. Resposta no formato antigo (com "blocks") continua valendo, então
// qualquer motor/resposta antiga passa sem erro. Funções puras.
export interface CompactCtx {
  /** descanso (segundos) do grupo a que o exercício pertence */
  rest: string;
  /** séries que o grupo pede (usado quando a IA esqueceu as repetições) */
  sets: number | null;
  /** exercício de cardio: sem "blocks" vira o bloco padrão de cardio */
  isCardio: boolean;
}

const LAST_ONLY = new Set(['DROPSET', 'RESTPAUSE']);

/** Lista de repetições a partir do que a IA mandou: [15,12,10,8], "15-12-10-8", "15,12,10,8", 12. */
export function parseReps(v: any): string[] {
  const one = (x: any) => { const s = String(x ?? '').trim(); return /^\d+(\s*-\s*\d+)?$/.test(s) ? s.replace(/\s+/g, '') : (s.replace(/[^\d]/g, '') || ''); };
  if (Array.isArray(v)) return v.map(one).filter(Boolean);
  if (typeof v === 'number') return [one(v)].filter(Boolean);
  const s = String(v ?? '').trim(); if (!s) return [];
  if (/[,;/|\s]/.test(s)) return s.split(/[,;/|\s]+/).map(one).filter(Boolean);
  const dash = s.split('-'); if (dash.length >= 3) return dash.map(one).filter(Boolean);   // "15-12-10" = lista; "10-12" = faixa de uma série
  return [one(s)].filter(Boolean);
}

/** Técnica como o resto do servidor entende: maiúscula, sem acento/símbolo; "normal"/vazio = sem técnica. */
const techOf = (v: any): string => { const t = String(v ?? '').trim().toUpperCase().replace(/[^A-Z0-9_]/g, ''); return t === 'NORMAL' ? '' : t; };

/** Exercício no formato compacto → exercício com "blocks" completos (o que o resto do código espera). O que já vem com "blocks" não é mexido. */
export function compactToFull(ex: any, ctx: CompactCtx): any {
  if (!ex || typeof ex !== 'object') return ex;
  const exerciseId = ex.exerciseId ?? ex.id;
  if (Array.isArray(ex.blocks) && ex.blocks.length) return { ...ex, exerciseId };
  const rawTech = String(ex.t ?? ex.tech ?? ex.technique ?? '').trim(); const tech = techOf(rawTech);
  if (ctx.isCardio) {
    const r = parseReps(ex.reps);
    return { ...ex, exerciseId, blocks: [{ sets: r[1] ? r[0] : '20', reps: r[1] || r[0] || '200', load: '', restTime: '0', technique: rawTech && tech !== 'NORMAL' ? rawTech : 'Moderada' }] };
  }
  let reps = parseReps(ex.reps ?? ex.r);
  if (!reps.length) reps = Array.from({ length: Math.max(1, ctx.sets || 3) }, () => '12');   // a IA esqueceu: série reta; a revisão põe a pirâmide
  const n = reps.length;
  const blocks = reps.map((r, i) => ({ sets: '1', reps: r, load: '', restTime: String(ctx.rest || '60'), technique: tech && (!LAST_ONLY.has(tech) || i === n - 1) ? tech : '' }));
  return { ...ex, exerciseId, blocks };
}
