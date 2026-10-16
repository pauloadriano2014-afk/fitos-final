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
