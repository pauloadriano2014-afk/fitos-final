// lib/perfLog.ts
// ⏱️ (27 out 2026) Régua de tempo das rotas pesadas do painel do coach. Só escreve no log do Render quando a rota demora (padrão: 1 s ou mais), para a gente
// ver QUAL rota está lenta sem encher o log. PERF_LOG_ALL=1 mostra todas; PERF_SLOW_MS muda o limite. Não muda a resposta nem engole erro.
const limit = () => { const n = Number(process.env.PERF_SLOW_MS); return Number.isFinite(n) && n >= 0 && process.env.PERF_SLOW_MS ? n : 1000; };

export function timed<A extends any[], R>(label: string, fn: (...args: A) => Promise<R>): (...args: A) => Promise<R> {
  return async (...args: A): Promise<R> => {
    const t0 = Date.now();
    try { return await fn(...args); }
    finally {
      const ms = Date.now() - t0;
      if (process.env.PERF_LOG_ALL === '1' || ms >= limit()) console.warn(`[lento] ${label} ${ms}ms`);
    }
  };
}
