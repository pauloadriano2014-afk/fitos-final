// lib/rateLimit.ts
// 🔒 (26 set 2026 — auditoria de segurança) Rate limiting simples, em memória,
// pra rotas sensíveis a força bruta (login, esqueci-minha-senha). Sem Redis
// nem dependência nova de propósito — o processo do Render fica de pé entre
// requisições, então um Map em memória já resolve pro tamanho de tráfego
// atual do projeto. Limitação conhecida: zera se o processo reiniciar
// (deploy), e não é compartilhado se um dia rodar mais de uma instância —
// aceitável agora, e fácil de trocar por Redis/Upstash depois se precisar.
//
// Uso:
//   const rl = checkRateLimit(`login:${ip}:${email}`, { max: 8, windowMs: 15 * 60 * 1000 });
//   if (!rl.allowed) return NextResponse.json({ error: '...' }, { status: 429 });

type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();

// Limpeza oportunista pra não vazar memória indefinidamente — roda no máximo
// 1x por minuto, disparada por uma chamada normal (sem precisar de setInterval
// nem worker separado).
let lastCleanup = 0;
function cleanupIfNeeded(now: number) {
    if (now - lastCleanup < 60_000) return;
    lastCleanup = now;
    for (const [key, bucket] of buckets) {
        if (bucket.resetAt <= now) buckets.delete(key);
    }
}

export function checkRateLimit(
    key: string,
    { max, windowMs }: { max: number; windowMs: number }
): { allowed: boolean; remaining: number; retryAfterMs: number } {
    const now = Date.now();
    cleanupIfNeeded(now);

    const existing = buckets.get(key);
    if (!existing || existing.resetAt <= now) {
        buckets.set(key, { count: 1, resetAt: now + windowMs });
        return { allowed: true, remaining: max - 1, retryAfterMs: 0 };
    }

    if (existing.count >= max) {
        return { allowed: false, remaining: 0, retryAfterMs: existing.resetAt - now };
    }

    existing.count += 1;
    return { allowed: true, remaining: max - existing.count, retryAfterMs: 0 };
}

// Pega o IP do jeito que dá pra confiar num Render/Vercel atrás de proxy —
// eles preenchem x-forwarded-for com o IP real do cliente na primeira posição.
export function getClientIp(req: Request): string {
    const forwarded = req.headers.get('x-forwarded-for');
    if (forwarded) return forwarded.split(',')[0].trim();
    return req.headers.get('x-real-ip') || 'unknown';
}
