// html2canvas de mentira: devolve um "canvas" cujo PNG é um Blob pequeno; guarda o que foi pedido em globalThis.__h2c
// opções: fail (lança), nullBlob (toBlob devolve null); blobTypes guarda o tipo pedido ao toBlob
module.exports = async (el, opts) => { const st = (globalThis.__h2c = globalThis.__h2c || { calls: [], fail: false }); st.calls.push({ el, opts }); if (st.fail) throw new Error('html2canvas falhou'); return { toBlob: (cb, type) => { (st.blobTypes = st.blobTypes || []).push(type); cb(st.nullBlob ? null : new Blob(['png'], { type: 'image/png' })); } }; };
