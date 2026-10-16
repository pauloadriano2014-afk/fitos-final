// expo-image-picker controlável: globalThis.__picker = { perm, canceled, asset, throwMsg }
const st = () => (globalThis.__picker = globalThis.__picker || { perm: 'granted', canceled: false, asset: { uri: 'file:///photo.jpg', width: 1200, height: 1600 }, throwMsg: null, calls: [] });
const run = async (kind) => { const s = st(); s.calls.push(kind); if (s.throwMsg) throw new Error(s.throwMsg); if (s.canceled) return { canceled: true, assets: null }; globalThis.__dims = globalThis.__dims || {}; globalThis.__dims[s.asset.uri] = { width: s.asset.width, height: s.asset.height }; return { canceled: false, assets: [s.asset] }; };
exports.requestCameraPermissionsAsync = async () => { const s = st(); s.calls.push('perm'); return { status: s.perm }; };
exports.launchCameraAsync = () => run('camera');
exports.launchImageLibraryAsync = () => run('library');
