const G = (globalThis.__N ??= { perm: 'granted', asked: 0, token: 'ExponentPushToken[abc123]', channel: 0 });
exports.getPermissionsAsync = async () => ({ status: G.perm });
exports.requestPermissionsAsync = async () => { G.asked++; return { status: G.permAfterAsk || G.perm }; };
exports.getExpoPushTokenAsync = async () => { if (G.tokenError) throw new Error('No projectId found'); return { data: G.token }; };
exports.setNotificationChannelAsync = async () => { G.channel++; };
exports.AndroidImportance = { MAX: 5 };
exports.isDevice = true;
