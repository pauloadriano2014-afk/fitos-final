exports.SaveFormat = { JPEG: 'jpeg' };
exports.manipulateAsync = async (uri, actions) => {
  const m = (globalThis.__manip = globalThis.__manip || { fail: false, calls: [] }); m.calls.push({ uri, actions });
  if (m.fail) throw new Error('sem manipulador');
  const d = (globalThis.__dims || {})[uri] || { width: 1000, height: 1000 }; const rz = (actions || []).find((a) => a.resize);
  const width = rz ? rz.resize.width : d.width; const height = rz ? Math.round((d.height * width) / d.width) : d.height;
  const out = uri + '#m'; globalThis.__dims[out] = { width, height }; return { uri: out, width, height };
};
