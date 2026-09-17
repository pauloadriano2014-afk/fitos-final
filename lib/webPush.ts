// lib/webPush.ts
// 🔥 Web Push (17 set 2026) — cobre os usuários que acessam pelo PWA
// (navegador / "adicionar à tela inicial"), onde expo-notifications não
// funciona (não existe token da Expo em web — Platform.OS === 'web' sempre
// retornou null no app). Notificação nativa (Expo) continua intacta, essa é
// um canal PARALELO, não uma substituição.
//
// Exige 3 env vars no Render (e no .env local): VAPID_PUBLIC_KEY,
// VAPID_PRIVATE_KEY, VAPID_SUBJECT (um "mailto:" ou URL de contato — a spec
// do Web Push exige isso, é só identificação, os navegadores não enviam
// e-mail nenhum). As chaves são geradas 1 vez só e não mudam depois —
// trocar invalida TODAS as assinaturas já salvas, cada usuário precisaria
// re-autorizar notificação.
import webpush from 'web-push';

const VAPID_PUBLIC_KEY  = process.env.VAPID_PUBLIC_KEY  || '';
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY || '';
const VAPID_SUBJECT      = process.env.VAPID_SUBJECT      || 'mailto:elitefit_app@outlook.com';

let configured = false;
function ensureConfigured() {
  if (configured) return true;
  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
    console.error('[webPush] VAPID_PUBLIC_KEY/VAPID_PRIVATE_KEY não configuradas no ambiente — Web Push desativado até isso ser resolvido.');
    return false;
  }
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
  configured = true;
  return true;
}

export type WebPushSubscription = {
  endpoint: string;
  keys: { p256dh: string; auth: string };
};

// Envia pra UMA assinatura. Retorna false (sem lançar) em qualquer falha —
// quem chama decide se quer limpar a assinatura inválida do banco.
export async function sendWebPush(
  subscription: WebPushSubscription | null | undefined,
  title: string,
  body: string,
  data: any = {}
): Promise<{ ok: boolean; expired: boolean }> {
  if (!subscription?.endpoint) return { ok: false, expired: false };
  if (!ensureConfigured()) return { ok: false, expired: false };

  try {
    await webpush.sendNotification(
      subscription as any,
      JSON.stringify({ title, body, data })
    );
    return { ok: true, expired: false };
  } catch (error: any) {
    // 404/410 = assinatura expirada/revogada (usuário desinstalou, limpou
    // dados do navegador, etc.) — não é uma falha transitória, vale limpar.
    const expired = error?.statusCode === 404 || error?.statusCode === 410;
    if (!expired) console.error('[webPush] Erro ao enviar:', error?.body || error?.message || error);
    return { ok: false, expired };
  }
}
