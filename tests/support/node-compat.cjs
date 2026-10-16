// Ajustes para os testes rodarem igual no Windows e em versoes novas do Node.
// 1) No Windows o Git costuma gravar os arquivos com fim de linha CRLF; varios testes leem o codigo-fonte
//    e procuram trechos com "\n". Aqui toda leitura de texto passa a devolver LF.
// 2) Do Node 24 em diante "navigator" e so de leitura; alguns testes trocam esse objeto. Aqui ele vira editavel.
const fs = require('fs');
const orig = fs.readFileSync;
fs.readFileSync = function (...args) {
  const r = orig.apply(this, args);
  return typeof r === 'string' && r.includes('\r\n') ? r.replace(/\r\n/g, '\n') : r;
};
try {
  const d = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  if (d && !d.writable) Object.defineProperty(globalThis, 'navigator', { value: globalThis.navigator, writable: true, configurable: true, enumerable: true });
} catch (e) { /* sem navigator, tudo bem */ }

// 3) No Windows um setTimeout(fn, 0) costuma levar ~15 ms (no Linux, ~1 ms). Os testes esperam "um instante" com varios
//    setTimeout(0) seguidos e acabam passando do prazo de esperas de 100 ms que o proprio teste montou.
//    Aqui, no Windows (ou com TEST_FAST_TIMERS=1), esperas de 0/1 ms viram setImmediate.
if (process.platform === 'win32' || process.env.TEST_FAST_TIMERS === '1') {
  const realSet = globalThis.setTimeout, realClear = globalThis.clearTimeout;
  globalThis.setTimeout = function (fn, ms, ...args) {
    if (typeof fn === 'function' && (ms === undefined || ms === null || Number(ms) <= 1)) { const im = setImmediate(() => fn(...args)); im.__imm = true; return im; }
    return realSet.call(this, fn, ms, ...args);
  };
  globalThis.clearTimeout = function (t) { return t && t.__imm ? clearImmediate(t) : realClear.call(this, t); };
}
