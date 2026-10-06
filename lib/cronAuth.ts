// lib/cronAuth.ts
// ⏰ Confere o "Authorization: Bearer <CRON_SECRET>" (ou x-cron-secret) das rotas que um Cron Job do Render aciona. Sem CRON_SECRET no ambiente a rota fica DESLIGADA (503).
import { NextResponse } from 'next/server';
import { timingSafeEqual } from 'crypto';

export function checkCron(req: Request): NextResponse | null {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: 'Cron desligado: defina CRON_SECRET no ambiente.' }, { status: 503 });
  const got = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '') || req.headers.get('x-cron-secret') || '';
  const a = Buffer.from(got), b = Buffer.from(secret);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 });
  return null;
}
