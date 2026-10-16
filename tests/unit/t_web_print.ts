const assert = require('assert');
const fs = require('fs');
const { JSDOM } = require('/tmp/claude-0/-home-user/86513411-0da9-5f81-8d5c-a48e2b800aa5/scratchpad/vt/node_modules/jsdom');
import * as WP from '/home/user/FIT-OS-FRONTEND/src/utils/webPrint';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// ambiente de navegador novo para cada cenário: { standalone, coarse, ua, mmThrows }
const env = ({ standalone = false, nav = false, coarse = false, ua = 'Mozilla/5.0 (X11; Linux x86_64) Chrome/120', mmThrows = false, noMatchMedia = false, width = 1024 } = {}) => {
  const dom = new JSDOM('<!doctype html><html><head></head><body></body></html>', { url: 'https://elitefitapp.com.br/admin', pretendToBeVisual: true });
  const w = dom.window; w.innerWidth = width; Object.defineProperty(w.navigator, 'userAgent', { value: ua, configurable: true });
  if (!noMatchMedia) w.matchMedia = (q) => { if (mmThrows) throw new Error('boom'); return { matches: (/display-mode: standalone/.test(q) && standalone) || (/pointer: coarse/.test(q) && coarse), media: q }; };
  if (nav) Object.defineProperty(w.navigator, 'standalone', { value: true, configurable: true });
  globalThis.window = w; globalThis.document = w.document;
  w.__opens = []; w.__printed = 0;
  w.open = (...a) => { w.__opens.push(a); return w.__popup === undefined ? null : w.__popup; };
  w.print = () => { w.__printed++; };
  return w;
};
const fakePopup = () => { const p = { wrote: [], closed: 0, printed: 0, focused: 0, document: { write(h) { p.wrote.push(h); }, close() { p.docClosed = true; } }, print() { p.printed++; }, close() { p.closed++; }, focus() { p.focused++; } }; return p; };
const q = (id) => document.querySelector(`[data-testid="${id}"]`);
const click = (el) => el.dispatchEvent(new window.Event('click', { bubbles: true }));

(async () => {
  try {
    // ═════ 1) detecção: app instalado e aparelho de toque ═════
    env(); assert.equal(WP.isStandalonePwa(), false); assert.equal(WP.isTouchDevice(), false); assert.equal(WP.shouldUseInAppPreview(), false, 'computador, aba normal');
    env({ standalone: true }); assert.equal(WP.isStandalonePwa(), true, 'Android/Chrome: display-mode: standalone');
    env({ nav: true }); assert.equal(WP.isStandalonePwa(), true, 'iPhone: navigator.standalone');
    env({ mmThrows: true }); assert.equal(WP.isStandalonePwa(), false, 'matchMedia quebrado não derruba'); assert.equal(WP.isTouchDevice(), false);
    env({ noMatchMedia: true, ua: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)' }); assert.equal(WP.isTouchDevice(), true, 'sem matchMedia, o iPhone é reconhecido pelo navegador'); assert.equal(WP.isStandalonePwa(), false);
    env({ ua: 'Mozilla/5.0 (Linux; Android 14; Pixel 8)' }); assert.equal(WP.isTouchDevice(), true, 'Android'); env({ ua: 'Mozilla/5.0 (iPad; CPU OS 17_0)' }); assert.equal(WP.isTouchDevice(), true, 'iPad');
    env({ coarse: true }); assert.equal(WP.isTouchDevice(), true, 'ponteiro de toque');
    env({ standalone: true }); assert.equal(WP.shouldUseInAppPreview(), false, 'app instalado no COMPUTADOR segue com a janela'); env({ coarse: true }); assert.equal(WP.shouldUseInAppPreview(), false, 'celular em aba normal tem como voltar');
    env({ standalone: true, coarse: true }); assert.equal(WP.shouldUseInAppPreview(), true, 'app instalado no celular: aqui estava o problema');
    delete globalThis.window; assert.equal(WP.isStandalonePwa(), false); assert.equal(WP.isTouchDevice(), false);
    console.log('OK  detecção: app instalado (iPhone e Android) + toque = prévia; computador e aba de celular seguem iguais');

    // ═════ 2) computador: janela + imprimir, como sempre ═════
    let w = env(); const pop = fakePopup(); w.__popup = pop;
    let how = WP.printHtmlOnWeb('<html><head></head><body>OLÁ</body></html>', { title: 'Treino A', width: 800, height: 600, delay: 20 });
    assert.equal(how, 'popup'); assert.deepEqual(w.__opens, [['', '_blank', 'width=800,height=600']]); assert.deepEqual(pop.wrote, ['<html><head></head><body>OLÁ</body></html>']); assert.equal(pop.docClosed, true); assert.equal(pop.focused, 1);
    assert.equal(pop.printed, 0, 'imprime só depois do atraso'); await sleep(40); assert.equal(pop.printed, 1); assert.equal(pop.closed, 0, 'não fecha a janela (o coach salva o PDF nela)'); assert.equal(document.getElementById('elitefit-print-preview'), null, 'sem prévia no computador');
    w = env(); const pop2 = fakePopup(); w.__popup = pop2; WP.printHtmlOnWeb('<p>x</p>', { delay: 10, closePopup: true }); await sleep(30); assert.equal(pop2.printed, 1); assert.equal(pop2.closed, 1, 'relatórios de avaliação fecham a janela depois de imprimir');
    w = env(); const pop3 = fakePopup(); w.__popup = pop3; WP.printHtmlOnWeb('<p>x</p>'); assert.deepEqual(w.__opens[0], ['', '_blank', 'width=900,height=700'], 'tamanho padrão da janela'); await sleep(600); assert.equal(pop3.printed, 0, 'atraso padrão: ainda não imprimiu com 0,6 s'); await sleep(550); assert.equal(pop3.printed, 1, 'atraso padrão de 1 s');
    w = env(); const pop4 = fakePopup(); pop4.print = () => { throw new Error('janela fechada'); }; w.__popup = pop4; WP.printHtmlOnWeb('<p>x</p>', { delay: 5, closePopup: true }); await sleep(20);   // não pode estourar erro solto
    w = env(); w.open = () => { throw new Error('bloqueado'); }; how = WP.printHtmlOnWeb('<p>x</p>'); assert.equal(how, 'preview', 'window.open que lança erro cai na prévia'); closeAll();
    console.log('OK  computador: abre a janela, escreve, imprime depois do atraso (e fecha só quando pedido); erro na janela não estoura');

    // ═════ 3) janela bloqueada: prévia em vez de erro ═════
    w = env(); w.__popup = null; how = WP.printHtmlOnWeb('<html><head></head><body>X</body></html>', { title: 'Dieta' }); assert.equal(how, 'preview'); assert.ok(document.getElementById('elitefit-print-preview'), 'mostra dentro do app'); closeAll();

    // ═════ 4) app instalado no celular: prévia com VOLTAR ═════
    w = env({ standalone: true, coarse: true, width: 390 });
    how = WP.printHtmlOnWeb('<!doctype html><html><head><title>t</title></head><body><h1>TREINO A</h1></body></html>', { title: 'Treino de Peito' });
    assert.equal(how, 'preview'); assert.equal(w.__opens.length, 0, 'NÃO abre janela nova (era isso que prendia o usuário)');
    const root = document.getElementById('elitefit-print-preview'); assert.ok(root && root.getAttribute('role') === 'dialog'); assert.equal(root.style.position, 'fixed'); assert.equal(root.style.zIndex, '2147483000', 'por cima de tudo');
    assert.equal(q('print-preview-back').textContent, '← VOLTAR'); assert.equal(q('print-preview-print').textContent, 'SALVAR / IMPRIMIR PDF'); assert.ok(root.textContent.includes('Treino de Peito'), 'título na barra');
    const frame = q('print-preview-frame'); assert.ok(frame.srcdoc.includes('<h1>TREINO A</h1>') && frame.srcdoc.includes('<head><base target="_blank">'), 'links do documento abrem fora, sem trocar a prévia'); assert.equal(document.body.style.overflow, 'hidden', 'tela de trás não rola');
    assert.ok(/env\(safe-area-inset-top/.test(root.firstChild.style.padding), 'respeita o notch do iPhone');
    assert.equal(q('print-preview-title').style.display, 'none', 'celular estreito: sem título, sobra espaço para os botões'); assert.equal(q('print-preview-print').style.marginLeft, 'auto', 'SALVAR/IMPRIMIR fica na direita');
    w.innerWidth = 700; w.dispatchEvent(new w.Event('resize')); assert.equal(q('print-preview-title').style.display, 'block', 'tela larga (tablet): mostra o título'); w.innerWidth = 479; w.dispatchEvent(new w.Event('resize')); assert.equal(q('print-preview-title').style.display, 'none'); w.innerWidth = 480; w.dispatchEvent(new w.Event('resize')); assert.equal(q('print-preview-title').style.display, 'block', 'limite de 480px'); w.innerWidth = 390; w.dispatchEvent(new w.Event('resize'));
    click(q('print-preview-back')); assert.equal(document.getElementById('elitefit-print-preview'), null, 'VOLTAR fecha'); assert.equal(document.body.style.overflow, '', 'devolve a rolagem');
    // HTML sem <head>: base vai na frente; HTML com atributos no head
    WP.printHtmlOnWeb('<p>sem cabeçalho</p>', {}); assert.ok(q('print-preview-frame').srcdoc.startsWith('<base target="_blank">'), 'sem head: base na frente'); closeAll();
    WP.printHtmlOnWeb('<html><head lang="pt"><meta charset="utf-8"></head><body></body></html>', {}); assert.ok(q('print-preview-frame').srcdoc.includes('<head lang="pt"><base target="_blank"><meta charset="utf-8">'), 'head com atributos'); closeAll();
    // Esc fecha; abrir de novo não empilha; título padrão; ouvintes (Esc e redimensionar) sempre removidos
    const counts = { kAdd: 0, kRem: 0, rAdd: 0, rRem: 0 };
    const dAdd = document.addEventListener.bind(document), dRem = document.removeEventListener.bind(document), wAdd = w.addEventListener.bind(w), wRem = w.removeEventListener.bind(w);
    document.addEventListener = (t, ...a) => { if (t === 'keydown') counts.kAdd++; return dAdd(t, ...a); }; document.removeEventListener = (t, ...a) => { if (t === 'keydown') counts.kRem++; return dRem(t, ...a); };
    w.addEventListener = (t, ...a) => { if (t === 'resize') counts.rAdd++; return wAdd(t, ...a); }; w.removeEventListener = (t, ...a) => { if (t === 'resize') counts.rRem++; return wRem(t, ...a); };
    WP.printHtmlOnWeb('<p>1</p>', {}); WP.printHtmlOnWeb('<p>2</p>', {}); assert.equal(document.querySelectorAll('#elitefit-print-preview').length, 1, 'uma prévia por vez'); assert.ok(q('print-preview-frame').srcdoc.includes('<p>2</p>') && document.getElementById('elitefit-print-preview').textContent.includes('Documento'));
    document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Enter' })); assert.ok(document.getElementById('elitefit-print-preview'), 'outra tecla não fecha'); document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape' })); assert.equal(document.getElementById('elitefit-print-preview'), null, 'Esc fecha');
    assert.equal(document.body.style.overflow, '', 'abrir duas vezes e fechar devolve a rolagem da tela de trás');
    assert.deepEqual(counts, { kAdd: 2, kRem: 2, rAdd: 2, rRem: 2 }, 'cada prévia aberta remove os seus ouvintes ao fechar (a que foi substituída também)');
    document.addEventListener = dAdd; document.removeEventListener = dRem; w.addEventListener = wAdd; w.removeEventListener = wRem;
    document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape' }));   // depois de fechar, Esc não faz nada nem quebra
    console.log('OK  app instalado no celular: sem janela nova; tela cheia com VOLTAR e SALVAR/IMPRIMIR; links abrem fora; Esc; uma por vez; rolagem devolvida');

    // ═════ 5) imprimir, acompanhar altura e reduzir a folha ═════
    w = env({ standalone: true, coarse: true, width: 397 }); WP.openPrintPreview('<html><head></head><body>doc</body></html>', { title: 'T' });
    const fr = q('print-preview-frame'); let printedInFrame = 0; Object.defineProperty(fr, 'contentWindow', { value: { focus() {}, print() { printedInFrame++; } }, configurable: true });
    click(q('print-preview-print')); assert.equal(printedInFrame, 1, 'imprime o DOCUMENTO (não o app)'); assert.equal(w.__printed, 0);
    Object.defineProperty(fr, 'contentWindow', { value: { focus() {}, print() { throw new Error('sem acesso'); } }, configurable: true }); click(q('print-preview-print')); assert.equal(w.__printed, 1, 'se o iframe não deixa imprimir, tenta a janela');
    Object.defineProperty(fr, 'contentDocument', { value: { documentElement: { scrollHeight: 3000 }, body: { scrollHeight: 2800 } }, configurable: true });
    fr.dispatchEvent(new w.Event('load')); await sleep(5);
    assert.equal(fr.style.height, '3000px', 'altura real do documento'); assert.equal(fr.style.width, '794px', 'folha A4'); assert.equal(fr.style.transform, 'scale(0.5)', '397px de tela / 794px de folha = metade');
    const holder = fr.parentNode; assert.equal(holder.style.width, '397px'); assert.equal(holder.style.height, '1500px', 'a área rolável tem o tamanho da folha reduzida');
    w.innerWidth = 794; w.dispatchEvent(new w.Event('resize')); assert.equal(fr.style.transform, 'scale(1)', 'tela larga: sem reduzir'); assert.equal(holder.style.width, '794px');
    w.innerWidth = 1600; w.dispatchEvent(new w.Event('resize')); assert.equal(fr.style.transform, 'scale(1)', 'nunca amplia');
    w.innerWidth = 100; w.dispatchEvent(new w.Event('resize')); assert.equal(fr.style.transform, `scale(${240 / 794})`, 'tela minúscula: limite de 240px');
    Object.defineProperty(fr, 'contentDocument', { value: { documentElement: { scrollHeight: 100 }, body: { scrollHeight: 50 } }, configurable: true }); w.dispatchEvent(new w.Event('resize')); assert.equal(fr.style.height, '1123px', 'altura mínima = uma folha');
    closeAll(); w.innerWidth = 794; w.dispatchEvent(new w.Event('resize'));   // depois de fechar o resize não mexe em nada nem quebra
    console.log('OK  imprimir manda o documento para imprimir; folha reduzida à largura da tela (nunca ampliada), altura acompanha o conteúdo');

    // ═════ 5b) tamanho da folha e unidades vh/vw (a causa da prévia toda preta) ═════
    const SZ = (css) => WP.pageSizePx(`<style>${css}</style>`);
    assert.deepEqual(WP.pageSizePx('<p>sem @page</p>'), { width: 794, height: 1123 }, 'sem tamanho: A4 retrato'); assert.deepEqual(WP.pageSizePx(''), { width: 794, height: 1123 }); assert.deepEqual(WP.pageSizePx(undefined), { width: 794, height: 1123 }); assert.deepEqual(WP.pageSizePx(null), { width: 794, height: 1123 });
    assert.deepEqual(SZ('@page { size: A5 portrait; margin: 0; }'), { width: 559, height: 794 }, 'PDF do treino: A5'); assert.deepEqual(SZ('@page { margin: 0; size: A4; }'), { width: 794, height: 1123 }); assert.deepEqual(SZ('@page { margin: 0; size: A4 landscape; }'), { width: 1123, height: 794 }, 'certificado: A4 paisagem');
    assert.deepEqual(SZ('@page { size: a3 }'), { width: 1123, height: 1587 }); assert.deepEqual(SZ('@page{size:LETTER;}'), { width: 816, height: 1056 }); assert.deepEqual(SZ('@page { size: legal landscape }'), { width: 1344, height: 816 });
    assert.deepEqual(SZ('@page { size: 210mm 297mm }'), { width: 794, height: 1123 }, 'medidas em mm'); assert.deepEqual(SZ('@page { size: 8.5in 11in }'), { width: 816, height: 1056 }, 'polegadas'); assert.deepEqual(SZ('@page { size: 15cm 20cm }'), { width: 567, height: 756 }, 'cm'); assert.deepEqual(SZ('@page { size: 600px 900px }'), { width: 600, height: 900 }, 'px'); assert.deepEqual(SZ('@page { size: 100mm }'), { width: 378, height: 378 }, 'uma medida só = quadrado');
    assert.deepEqual(SZ('@page { size: 297mm 210mm portrait }'), { width: 794, height: 1123 }, 'portrait corrige'); assert.deepEqual(SZ('@page { size: 210mm 297mm landscape }'), { width: 1123, height: 794 }); assert.deepEqual(SZ('@page { size: A4 PORTRAIT }'), { width: 794, height: 1123 }, 'maiúsculas');
    assert.deepEqual(SZ('@page { size: auto }'), { width: 794, height: 1123 }, 'auto = A4'); assert.deepEqual(SZ('@page { size: banana }'), { width: 794, height: 1123 }, 'valor inválido = A4'); assert.deepEqual(SZ('@page { margin: 10mm }'), { width: 794, height: 1123 }, '@page sem size'); assert.deepEqual(SZ('body { size: A5 }'), { width: 794, height: 1123 }, 'só vale dentro de @page');
    assert.deepEqual(SZ('@page :first { size: A5 }'), { width: 559, height: 794 }, '@page com pseudo-classe'); assert.deepEqual(SZ('@page { margin: 0; size: A5 landscape }'), { width: 794, height: 559 });
    assert.deepEqual(SZ('@PAGE { SIZE: A5 }'), { width: 559, height: 794 }, 'maiúsculas no CSS'); assert.deepEqual(SZ('@page { xsize: A5 }'), { width: 794, height: 1123 }, 'só a propriedade size'); assert.deepEqual(SZ('@page { size: letterbox }'), { width: 794, height: 1123 }, 'nome de papel inteiro (não pedaço de palavra)');
    assert.deepEqual(SZ('@page { size: 297mm 210mm landscape }'), { width: 1123, height: 794 }, 'já em paisagem: não vira de novo');
    const P = { width: 559, height: 794 };
    assert.equal(WP.viewportUnitsToPx('height: 98vh;', P), 'height: 778.12px;'); assert.equal(WP.viewportUnitsToPx('max-height: 55vh; width:100vw', P), 'max-height: 436.7px; width:559px'); assert.equal(WP.viewportUnitsToPx('top: 12.5VH', P), 'top: 99.25px', 'maiúsculas e decimais'); assert.equal(WP.viewportUnitsToPx('height: calc(100vh - 20px)', P), 'height: calc(794px - 20px)'); assert.equal(WP.viewportUnitsToPx('margin: -5vh 0', P), 'margin: -39.7px 0', 'negativo'); assert.equal(WP.viewportUnitsToPx('x: 50 vw', P), 'x: 279.5px', 'com espaço');
    assert.equal(WP.viewportUnitsToPx('<p>10 vhs e 5vhx</p> <i>vh</i>', P), '<p>10 vhs e 5vhx</p> <i>vh</i>', 'só quando é número + vh/vw inteiro'); assert.equal(WP.viewportUnitsToPx('height: 98%;', P), 'height: 98%;'); assert.equal(WP.viewportUnitsToPx(undefined, P), ''); assert.equal(WP.viewportUnitsToPx('a: 1vh; b: 2vh', P), 'a: 7.94px; b: 15.88px', 'todas as ocorrências');
    const cert = '<style>@page { margin: 0; size: A4 landscape; } .c { width:100vw; height:100vh; }</style>'; assert.equal(WP.viewportUnitsToPx(cert, WP.pageSizePx(cert)).includes('width:1123px; height:794px;'), true, 'certificado ocupa exatamente uma folha paisagem');
    // o PDF de treino REAL (capa em 98vh): na prévia a capa tem o tamanho de UMA folha A5, não do documento inteiro
    const REAL = fs.readFileSync('/tmp/claude-0/-home-user/86513411-0da9-5f81-8d5c-a48e2b800aa5/scratchpad/vt/fixtures/pdf_treino_real.html', 'utf8');
    assert.ok(/height:\s*98vh/.test(REAL) && /max-height:\s*55vh/.test(REAL) && /size:\s*A5 portrait/.test(REAL), 'o documento real mesmo tem vh e A5'); assert.deepEqual(WP.pageSizePx(REAL), { width: 559, height: 794 });
    w = env({ standalone: true, coarse: true, width: 390 }); WP.openPrintPreview(REAL, { title: 'Treino' });
    let rf = q('print-preview-frame'); assert.ok(!/\d\s*(vh|vw)\b/i.test(rf.srcdoc), 'nenhum vh/vw sobra na prévia (era o que deixava tudo preto)'); assert.ok(rf.srcdoc.includes('height: 778.12px') && rf.srcdoc.includes('max-height: 436.7px'), 'capa = 98% de UMA folha A5');
    assert.equal(rf.style.width, '559px', 'monta na largura da folha A5 (e não 794)'); assert.equal(rf.style.height, '794px', 'começa com uma folha de altura'); assert.equal(rf.style.transform, `scale(${390 / 559})`, 'reduz 559 -> 390');
    // a altura vem da conferência periódica, MESMO sem o evento "load" (que atrasa quando as miniaturas demoram para baixar)
    Object.defineProperty(rf, 'contentDocument', { value: { documentElement: { scrollHeight: 2081 }, body: { scrollHeight: 2081 } }, configurable: true });
    await sleep(380); assert.equal(rf.style.height, '2081px', 'documento inteiro aparece sem esperar o "load"'); assert.equal(rf.parentNode.style.height, `${Math.round(2081 * 390 / 559)}px`);
    Object.defineProperty(rf, 'contentDocument', { value: { documentElement: { scrollHeight: 99999999 }, body: { scrollHeight: 1 } }, configurable: true }); await sleep(380); assert.equal(rf.style.height, `${794 * 80}px`, 'trava de 80 folhas: nunca cresce sem parar');
    Object.defineProperty(rf, 'contentDocument', { value: { documentElement: { scrollHeight: 2500 }, body: { scrollHeight: 2500 } }, configurable: true }); await sleep(380); assert.equal(rf.style.height, '2500px', 'continua acompanhando enquanto está aberta');
    closeAll(); Object.defineProperty(rf, 'contentDocument', { value: { documentElement: { scrollHeight: 3300 }, body: { scrollHeight: 3300 } }, configurable: true }); await sleep(380); assert.equal(rf.style.height, '2500px', 'fechou: a conferência periódica para (nada fica rodando)');
    // sem <head>: a base vai na frente e os vh também são convertidos
    w = env({ standalone: true, coarse: true, width: 390 }); WP.openPrintPreview('<p style="height:10vh">x</p>', {}); assert.equal(q('print-preview-frame').srcdoc, '<base target="_blank"><p style="height:112.3px">x</p>', 'sem head: base + conversão (A4: 10vh = 112.3px)'); closeAll();
    // a conferência periódica para sozinha depois de 20 s (sem fechar a prévia)
    { const realSI = globalThis.setInterval, realCI = globalThis.clearInterval, realST = globalThis.setTimeout; const intervals = []; const cleared = []; const stops = [];
      globalThis.setInterval = (fn, ms) => { const id = realSI(fn, ms); intervals.push({ id, ms }); return id; }; globalThis.clearInterval = (id) => { cleared.push(id); return realCI(id); }; globalThis.setTimeout = (fn, ms, ...a) => { if (ms === 20000) { stops.push(fn); return 0; } return realST(fn, ms, ...a); };
      w = env({ standalone: true, coarse: true, width: 390 }); WP.openPrintPreview('<html><head></head><body>x</body></html>', {});
      assert.equal(intervals.length, 1); assert.equal(intervals[0].ms, 300, 'a cada 0,3 s'); assert.equal(stops.length, 1, 'e desiste depois de 20 s'); assert.deepEqual(cleared, []); stops[0](); assert.deepEqual(cleared, [intervals[0].id], 'passou 20 s: a conferência para');
      globalThis.setInterval = realSI; globalThis.clearInterval = realCI; globalThis.setTimeout = realST; closeAll(); realCI(intervals[0].id); }
    // observador de tamanho (quando existe) é ligado uma vez só e desligado ao fechar
    { let made = 0, observed = 0, disc = 0; globalThis.ResizeObserver = class { constructor(cb) { made++; this.cb = cb; } observe() { observed++; } disconnect() { disc++; } };
      w = env({ standalone: true, coarse: true, width: 390 }); WP.openPrintPreview('<html><head></head><body>x</body></html>', {}); rf = q('print-preview-frame');
      Object.defineProperty(rf, 'contentDocument', { value: { documentElement: { scrollHeight: 900 }, body: { scrollHeight: 900 } }, configurable: true }); await sleep(700);
      assert.deepEqual([made, observed], [1, 1], 'um observador só, mesmo com várias conferências'); closeAll(); assert.equal(disc, 1, 'desligado ao fechar'); delete globalThis.ResizeObserver; }
    console.log('OK  prévia fiel: tamanho da folha (A5/A4/paisagem/medidas), vh/vw viram pixels da folha, PDF real com capa de uma folha, altura sem depender do "load", trava e parada ao fechar');

    // ═════ 6) fora do navegador e fiação nos PDFs ═════
    delete globalThis.window; delete globalThis.document; assert.equal(WP.printHtmlOnWeb('<p>x</p>'), null); assert.equal(WP.openPrintPreview('<p>x</p>'), null); WP.closePrintPreview();
    const SRC = (p) => fs.readFileSync('/home/user/FIT-OS-FRONTEND/src/' + p, 'utf8');
    for (const f of ['pdfGenerator', 'dietPdfUtils', 'treinoPdfUtils', 'financeReportPdfUtils', 'cursoCertificadoUtils', 'PdfSingleReport', 'PdfCompareReport']) {
      const s = SRC(`utils/${f}.js`); assert.ok(/import \{ printHtmlOnWeb \} from '\.\/webPrint';/.test(s), f + ': usa o ajudante'); assert.ok(/printHtmlOnWeb\(/.test(s), f); assert.ok(!/window\.open\(/.test(s.replace(/\/\/.*$/gm, '')), f + ': sem janela solta');
    }
    assert.ok(/printHtmlOnWeb\(htmlContent, \{ title: workoutName \|\| 'Treino', width: 800, height: 600, delay: 1500 \}\)/.test(SRC('utils/pdfGenerator.js')), 'PDF do treino: mesmo tamanho e atraso de antes');
    for (const f of ['PdfSingleReport', 'PdfCompareReport']) assert.ok(/delay: 500, closePopup: true/.test(SRC(`utils/${f}.js`)), f + ': imprime e fecha como antes');
    console.log('OK  os 7 geradores de PDF da web usam o ajudante (sem window.open solto), com os mesmos tamanhos/atrasos de antes');
    process.exit(0);
  } catch (e) { console.log('FALHOU:', e && e.stack ? e.stack.split('\n').slice(0, 6).join('\n') : e); process.exit(1); }
})();
function closeAll() { try { WP.closePrintPreview(); } catch (e) { /* ok */ } }
