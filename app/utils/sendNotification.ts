import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

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

export async function sendNotificationToAll(title: string, body: string, data: any = {}) {
  try {
    // 1. Busca todos os usuários que têm Push Token salvo
    const users = await prisma.user.findMany({
      where: {
        pushToken: { not: null }
      },
      select: { pushToken: true }
    });

    if (users.length === 0) return;

    // 2. Prepara as mensagens
    const messages = [];
    for (const user of users) {
      // Validação básica do token da Expo
      if (user.pushToken && user.pushToken.startsWith('ExponentPushToken')) {
        messages.push({
          to: user.pushToken,
          sound: 'default',
          title: title,
          body: body,
          data: data, // Dados extras para abrir a tela certa
        });
      }
    }

    // 3. Envia em lotes de 100 (Limite da Expo)
    const chunks = chunkArray(messages, 100);
    
    for (const chunk of chunks) {
        await fetch('https://exp.host/--/api/v2/push/send', {
            method: 'POST',
            headers: {
                'Accept': 'application/json',
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(chunk)
        });
    }

    console.log(`📢 Notificação enviada para ${messages.length} alunos.`);

  } catch (error) {
    console.error("Erro ao enviar notificações:", error);
  }
}