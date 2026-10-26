exports.sendPushToUser = async (user, title, body, data) => { if (globalThis.__pushFail) throw new Error('push fora do ar'); (globalThis.__pushes = globalThis.__pushes || []).push({ to: user && user.id, title, body, data }); };
exports.sendNotificationToAll = async (title, body, data) => { (globalThis.__broadcasts = globalThis.__broadcasts || []).push({ title, body, data }); };
