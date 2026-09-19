import prisma from '@/lib/prisma';
import { sendWebPush } from '@/lib/webPush';

// Função para dividir o array em lotes (A Expo aceita max 100 por vez)
function chunkArray(myArray: any[], chunk_size: number){
    var index = 0;
    var arrayLength = myArray.length;
    var tempArray = [];

    for (index = 0; index < arrayLength; index += chunk_size) {
        let myChunk = myArray.slice(index, index+chunk_size);
        tempArray.push(myChunk);
    }
    return tempArray;
}

type PushableUser = {
  id?: string;
  pushToken?: string | null;
  // 🔥 (19 set 2026) Campo antigo — não é mais lido daqui (ver webPushSubscriptions
  // no schema), mas o tipo aceita `any` extra sem problema; deixado só pra não
  // quebrar chamadores que ainda selecionam esse campo por engano.
  webPushSubscription?: any;
};

// 🔥 (19 set 2026) Limpa UMA assinatura específica (por id da linha), não o
// usuário inteiro — com várias assinaturas por usuário, expirar uma (ex: o
// PC desinstalou o PWA) não pode apagar as outras (ex: o celular continua
// válido).
async function clearExpiredWebPushSubscription(subscriptionId: string) {
  await prisma.webPushSubscription.delete({ where: { id: subscriptionId } }).catch(() => {});
}

// 🔥 (19 set 2026) Busca TODAS as assinaturas de Web Push de um usuário —
// antes disso vinha de um único campo Json no User (`webPushSubscription`),
// que só guardava a ÚLTIMA assinatura registrada; ativar notificação num
// segundo navegador sobrescrevia a do primeiro e ele parava de receber
// silenciosamente. Agora é uma tabela própria (uma linha por navegador/
// dispositivo), então todo mundo que o usuário autorizou recebe.
async function getWebPushSubscriptions(userId?: string) {
  if (!userId) return [];
  return prisma.webPushSubscription.findMany({ where: { userId } });
}

// 🔥 Envia pra UM usuário, tentando todos os canais que ele tiver
// cadastrado: Expo (app nativo/Expo Go) e Web Push — em TODOS os
// navegadores/dispositivos em que ele autorizou notificação (celular E PC,
// por exemplo). Nunca lança erro: notificação é "best effort", uma falha
// aqui não pode derrubar o fluxo principal (pagamento, checkin, etc.) que
// chamou isso.
export async function sendPushToUser(user: PushableUser, title: string, body: string, data: any = {}) {
  const jobs: Promise<any>[] = [];

  if (user?.pushToken && user.pushToken.startsWith('ExponentPushToken')) {
    jobs.push(
      fetch('https://exp.host/--/api/v2/push/send', {
        method: 'POST',
        headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify({ to: user.pushToken, sound: 'default', title, body, data }),
      }).catch((e) => console.error('[sendPushToUser] Erro Expo:', e?.message || e))
    );
  }

  const subscriptions = await getWebPushSubscriptions(user?.id);
  for (const sub of subscriptions) {
    jobs.push(
      sendWebPush({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, title, body, data).then((result) => {
        if (result.expired) return clearExpiredWebPushSubscription(sub.id);
      })
    );
  }

  await Promise.allSettled(jobs);
}

// 🔥 Broadcast pra uma LISTA já buscada de usuários (usado pelo aviso do
// coach em /api/notices, que já sabe filtrar quais alunos — "todos" ou uma
// seleção — antes de chegar aqui). Canal Expo em lotes de 100 (limite da
// API deles); Web Push não tem lote, 1 request por assinatura (podem ser
// várias por usuário — ver getWebPushSubscriptions acima), em paralelo.
// Nunca lança erro — notificação em massa é best effort.
export async function sendPushToUsers(users: PushableUser[], title: string, body: string, data: any = {}) {
  try {
    const expoMessages = users
      .filter((u) => u.pushToken && u.pushToken.startsWith('ExponentPushToken'))
      .map((u) => ({ to: u.pushToken, sound: 'default', title, body, data }));

    // 🔥 (19 set 2026) Busca todas as assinaturas de Web Push dos usuários da
    // lista de UMA vez só (em vez de um campo já vindo no objeto `user`) —
    // é o mesmo motivo do sendPushToUser: um usuário pode ter mais de uma
    // agora (celular + PC, por exemplo).
    const userIds = users.map((u) => u.id).filter((id): id is string => !!id);
    const allSubscriptions = userIds.length > 0
      ? await prisma.webPushSubscription.findMany({ where: { userId: { in: userIds } } })
      : [];

    if (expoMessages.length === 0 && allSubscriptions.length === 0) return;

    const chunks = chunkArray(expoMessages, 100);
    for (const chunk of chunks) {
      await fetch('https://exp.host/--/api/v2/push/send', {
        method: 'POST',
        headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify(chunk),
      }).catch((e) => console.error('[sendPushToUsers] Erro Expo:', e?.message || e));
    }

    await Promise.allSettled(
      allSubscriptions.map(async (sub) => {
        const result = await sendWebPush({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, title, body, data);
        if (result.expired) await clearExpiredWebPushSubscription(sub.id);
      })
    );

    console.log(`📢 Notificação enviada — ${expoMessages.length} via app nativo, ${allSubscriptions.length} via navegador.`);
  } catch (error) {
    console.error('Erro ao enviar notificações:', error);
  }
}

// 🔥 Broadcast pra TODOS os usuários do banco (usado por /api/contents).
export async function sendNotificationToAll(title: string, body: string, data: any = {}) {
  const users = await prisma.user.findMany({
    select: { id: true, pushToken: true },
  });
  await sendPushToUsers(users, title, body, data);
}
