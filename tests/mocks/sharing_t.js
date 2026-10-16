const st = () => (globalThis.__share = globalThis.__share || { available: true, calls: [] });
exports.isAvailableAsync = async () => st().available;
exports.shareAsync = async (uri, opts) => { st().calls.push({ uri, opts }); };
