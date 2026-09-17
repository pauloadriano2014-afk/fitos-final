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
  webPushSubscription?: any;
};

// 🔥 Limpa uma assinatura de Web Push expirada/revogada do banco. `as any`
// de propósito — o tipo gerado pelo Prisma pra campo Json? nulo varia entre
// exigir `Prisma.DbNull` explícito ou aceitar `null` direto dependendo da
// versão; isso funciona nos dois casos sem precisar importar o símbolo certo.
async function clearExpiredWebPush(userId: string) {
  await prisma.user.update({ where: { id: userId }, data: { webPushSubscription: null } as any }).catch(() => {});
}

// 🔥 Envia pra UM usuário, tentando os dois canais que ele tiver cadastrado:
// Expo (app nativo/Expo Go) e Web Push (PWA no navegador). Um usuário pode
// ter os dois — por exemplo se já testou no navegador e depois instalou o
// app nativo — e nesse caso recebe nos dois até um dos dois expirar.
// Nunca lança erro: notificação é "best effort", uma falha aqui não pode
// derrubar o fluxo principal (pagamento, checkin, etc.) que chamou isso.
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

  if (user?.webPushSubscription) {
    jobs.push(
      sendWebPush(user.webPushSubscription, title, body, data).then((result) => {
        if (result.expired && user.id) return clearExpiredWebPush(user.id);
      })
    );
  }

  await Promise.allSettled(jobs);
}

// 🔥 Broadcast pra uma LISTA já buscada de usuários (usado pelo aviso do
// coach em /api/notices, que já sabe filtrar quais alunos — "todos" ou uma
// seleção — antes de chegar aqui). Canal Expo em lotes de 100 (limite da
// API deles); Web Push não tem lote, 1 request por assinatura, em paralelo.
// Nunca lança erro — notificação em massa é best effort.
export async function sendPushToUsers(users: PushableUser[], title: string, body: string, data: any = {}) {
  try {
    const expoMessages = users
      .filter((u) => u.pushToken && u.pushToken.startsWith('ExponentPushToken'))
      .map((u) => ({ to: u.pushToken, sound: 'default', title, body, data }));

    const webUsers = users.filter((u) => !!u.webPushSubscription);

    if (expoMessages.length === 0 && webUsers.length === 0) return;

    const chunks = chunkArray(expoMessages, 100);
    for (const chunk of chunks) {
      await fetch('https://exp.host/--/api/v2/push/send', {
        method: 'POST',
        headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify(chunk),
      }).catch((e) => console.error('[sendPushToUsers] Erro Expo:', e?.message || e));
    }

    await Promise.allSettled(
      webUsers.map(async (u) => {
        const result = await sendWebPush(u.webPushSubscription, title, body, data);
        if (result.expired && u.id) await clearExpiredWebPush(u.id);
      })
    );

    console.log(`📢 Notificação enviada — ${expoMessages.length} via app nativo, ${webUsers.length} via navegador.`);
  } catch (error) {
    console.error('Erro ao enviar notificações:', error);
  }
}

// 🔥 Broadcast pra TODOS os usuários do banco (usado por /api/contents).
// Busca sem filtrar o campo Json no SQL (filtro de "não nulo" em coluna Json
// tem sintaxe própria no Prisma que varia por versão) — filtra em JS depois
// de trazer id/pushToken/assinatura, leve mesmo pra base inteira.
export async function sendNotificationToAll(title: string, body: string, data: any = {}) {
  const users = await prisma.user.findMany({
    select: { id: true, pushToken: true, webPushSubscription: true },
  });
  await sendPushToUsers(users, title, body, data);
}
