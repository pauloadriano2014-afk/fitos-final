// lib/checkoutTracking.ts
// 🛒 (out 2026) CHECKOUT PRÓPRIO (membros.pauloadrianoteam.com.br/comprar): o que a venda guarda sobre o navegador de quem comprou
// (ProdutoVenda.tracking), o login automático logo depois do pagamento ("retirada") e o aviso de compra ao Meta pelo servidor
// (API de Conversões). Tudo recebe o que precisa por parâmetro — sem banco aqui — para ser testável.
import crypto from 'crypto';
import { gerarToken, hashRetirada, iguais } from './membros';

export const RETIRADA_TTL_MS = 48 * 60 * 60 * 1000;   // a pessoa só "retira" o acesso na própria página até 48 h depois do pagamento; depois, e-mail ou código

export interface TrackingVenda {
  fbp?: string;
  fbc?: string;
  url?: string;
  utm?: Record<string, string>;
  ip?: string;
  ua?: string;
  retiradaHash?: string;
  retiradaUsada?: string;   // ISO de quando o acesso foi retirado (uso único)
}

const UTM_PERMITIDOS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'utm_id', 'fbclid', 'gclid', 'ttclid'];
const FBP_RE = /^fb\.\d{1,2}\.\d{10,13}\.\d{4,20}$/;
const FBC_RE = /^fb\.\d{1,2}\.\d{10,13}\.[\w-]{1,300}$/;

const limpo = (v: unknown, max: number): string => String(v ?? '').replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, max);

/** Pega do corpo do pedido só o que é seguro guardar (formato fixo e tamanho limitado) e cria a "retirada" desta compra. */
export function montarTracking(corpo: any, origem: { ip?: string | null; ua?: string | null }): { tracking: TrackingVenda; retirada: string } {
  const bruto = corpo && typeof corpo === 'object' ? corpo : {};
  const tracking: TrackingVenda = {};

  const fbp = limpo(bruto.fbp, 80);
  if (FBP_RE.test(fbp)) tracking.fbp = fbp;
  const fbc = limpo(bruto.fbc, 400);
  if (FBC_RE.test(fbc)) tracking.fbc = fbc;
  const url = limpo(bruto.url, 500);
  if (/^https?:\/\//i.test(url)) tracking.url = url;

  const utm: Record<string, string> = {};
  const brutoUtm = bruto.utm && typeof bruto.utm === 'object' ? bruto.utm : {};
  for (const k of UTM_PERMITIDOS) {
    const v = limpo(brutoUtm[k], 200);
    if (v) utm[k] = v;
  }
  if (Object.keys(utm).length) tracking.utm = utm;

  const ip = limpo(origem.ip, 64);
  if (ip && ip !== 'unknown') tracking.ip = ip;
  const ua = limpo(origem.ua, 300);
  if (ua) tracking.ua = ua;

  const retirada = gerarToken();
  tracking.retiradaHash = hashRetirada(retirada);
  return { tracking, retirada };
}

export function lerTracking(texto: unknown): TrackingVenda {
  if (typeof texto !== 'string' || !texto) return {};
  try {
    const o = JSON.parse(texto);
    return o && typeof o === 'object' && !Array.isArray(o) ? o : {};
  } catch {
    return {};
  }
}

export type Retirada = { ok: true; marcado: string } | { ok: false };

/**
 * A pessoa que acabou de pagar prova que é a dona da compra com o segredo que só o navegador dela recebeu ao iniciar o pedido.
 * Vale uma vez, só com a venda PAGA e até 48 h depois do pagamento. `marcado` é o novo texto de tracking (com a retirada gasta):
 * quem chama grava trocando o texto antigo pelo novo na mesma operação, para que dois toques ao mesmo tempo não passem.
 */
export function conferirRetirada(venda: { status?: string; paymentDate?: Date | string | null; tracking?: string | null }, tokenBruto: unknown, agora = new Date()): Retirada {
  if (typeof tokenBruto !== 'string') return { ok: false };
  const token = tokenBruto.trim();
  if (!/^[0-9a-f]{64}$/.test(token)) return { ok: false };
  if (venda.status !== 'PAGO' || !venda.paymentDate) return { ok: false };
  const pagoEm = new Date(venda.paymentDate).getTime();
  if (!Number.isFinite(pagoEm) || agora.getTime() - pagoEm > RETIRADA_TTL_MS) return { ok: false };
  const t = lerTracking(venda.tracking);
  if (!t.retiradaHash || t.retiradaUsada) return { ok: false };
  if (!iguais(t.retiradaHash, hashRetirada(token))) return { ok: false };
  return { ok: true, marcado: JSON.stringify({ ...t, retiradaUsada: agora.toISOString() }) };
}

// ─── Meta: API de Conversões ─────────────────────────────────────────────────
const sha = (v: string) => crypto.createHash('sha256').update(v).digest('hex');
const soDigitos = (v: unknown) => String(v ?? '').replace(/\D/g, '');

export const metaConfigurado = (): boolean => !!(process.env.META_PIXEL_ID && process.env.META_CAPI_TOKEN);

/** Corpo do evento "Purchase" (sem o token). O mesmo `event_id` do pixel no navegador faz o Meta contar a compra uma vez só. */
export function montarEventoCompra(venda: { id: string; nomeCliente: string; emailCliente: string; telefoneCliente: string; valorTotal: number; tracking?: string | null },
  produtoNome: string, produtoIds: string[], agora = new Date()) {
  const t = lerTracking(venda.tracking);
  const partes = String(venda.nomeCliente || '').trim().toLowerCase().split(/\s+/).filter(Boolean);
  let fone = soDigitos(venda.telefoneCliente);
  if (fone.length === 10 || fone.length === 11) fone = '55' + fone;

  const user: Record<string, unknown> = { country: [sha('br')] };
  const email = String(venda.emailCliente || '').trim().toLowerCase();
  if (email) user.em = [sha(email)];
  if (fone.length >= 12) user.ph = [sha(fone)];
  if (partes[0]) user.fn = [sha(partes[0])];
  if (partes.length > 1) user.ln = [sha(partes[partes.length - 1])];
  if (t.fbp) user.fbp = t.fbp;
  if (t.fbc) user.fbc = t.fbc;
  if (t.ip) user.client_ip_address = t.ip;
  if (t.ua) user.client_user_agent = t.ua;

  return {
    event_name: 'Purchase',
    event_time: Math.floor(agora.getTime() / 1000),
    event_id: venda.id,
    action_source: 'website',
    event_source_url: t.url || undefined,
    user_data: user,
    custom_data: {
      currency: 'BRL',
      value: Number(venda.valorTotal.toFixed(2)),
      content_name: produtoNome,
      content_type: 'product',
      content_ids: produtoIds,
      num_items: produtoIds.length,
    },
  };
}

/** Avisa o Meta da compra paga. Nunca lança erro: o pagamento já foi confirmado e a entrega não depende disso. */
export async function enviarCompraMeta(venda: Parameters<typeof montarEventoCompra>[0], produtoNome: string, produtoIds: string[]): Promise<boolean> {
  if (!metaConfigurado()) return false;
  try {
    const pedida = String(process.env.META_GRAPH_VERSION || '').trim();
    const versao = /^v\d{1,2}\.\d$/.test(pedida) ? pedida : 'v23.0';
    const corpo: Record<string, unknown> = {
      data: [montarEventoCompra(venda, produtoNome, produtoIds)],
      access_token: process.env.META_CAPI_TOKEN,   // no corpo (e não na URL) para não aparecer em registros de erro
    };
    if (process.env.META_TEST_EVENT_CODE) corpo.test_event_code = process.env.META_TEST_EVENT_CODE;
    const res = await fetch(`https://graph.facebook.com/${versao}/${encodeURIComponent(String(process.env.META_PIXEL_ID))}/events`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(corpo),
      signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) {
      const erro: any = await res.json().catch(() => ({}));
      console.error('[meta-capi] O Meta recusou o evento:', res.status, erro?.error?.message || '');
      return false;
    }
    return true;
  } catch (e: any) {
    console.error('[meta-capi] Falha ao avisar o Meta:', e?.message || e);
    return false;
  }
}
