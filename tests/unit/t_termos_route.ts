import assert from 'assert';
import { GET } from '/home/user/fitos-final/app/termos/route';

const page = async (qs = '') => { const r = await GET(new Request('https://api.exemplo.com/termos' + qs)); assert.equal(r.status, 200); return { r, html: await r.text() }; };
const PAYMENT_WORDS = [/PIX/i, /boleto/i, /cartão de crédito/i, /Asaas/i, /renovação/i, /cobran/i, /reembolso/i, /arrependimento/i, /inadimpl/i, /planos pagos/i, /Assinaturas, Pagamentos/i, /vencimento/i];
const sections = (html: string) => (html.match(/<h2>\d+\. [^<]+<\/h2>/g) || []).map((h) => h.replace(/<\/?h2>/g, ''));

(async () => {
  // versão completa (web, Android, builds antigas): continua com tudo, mais o aviso de que o iPhone não tem contratação
  const full = await page();
  assert.ok(/<h2>7\. Assinaturas, Pagamentos e Cancelamento<\/h2>/.test(full.html));
  for (const w of [/PIX/, /boleto/, /Asaas/, /renovação automática/, /art\. 49/, /inadimplência/]) assert.ok(w.test(full.html), 'a versão completa mantém ' + w);
  assert.ok(/Aplicativo para iPhone \(iOS\):<\/strong> não há contratação, assinatura nem pagamento/.test(full.html), 'aviso do iPhone na seção 7');
  assert.deepEqual(sections(full.html).length, 15);
  assert.ok(/WhatsApp \/ Suporte/.test(full.html) && /elitefit_app@outlook\.com/.test(full.html));
  assert.equal(full.r.headers.get('cache-control'), 'no-store');
  for (const qs of ['?plataforma=web', '?plataforma=android', '?plataforma=', '?outra=ios', '?plataforma=ios2']) { const o = await page(qs); assert.equal(o.html, full.html, 'qualquer outro valor devolve a versão completa: ' + qs); }
  console.log('OK  termos (sem parâmetro): texto completo da seção 7 + aviso de que o app do iPhone não tem contratação nem pagamento; sem cache');

  // versão do app de iPhone: sem nenhuma palavra de compra/pagamento
  for (const qs of ['?plataforma=ios', '?plataforma=IOS', '?foo=1&plataforma=ios']) {
    const ios = await page(qs);
    for (const w of PAYMENT_WORDS) assert.ok(!w.test(ios.html), `a versão iOS não pode conter ${w} (${qs})`);
    assert.ok(/<h2>7\. Acesso ao Serviço<\/h2>/.test(ios.html));
    assert.ok(/não oferece contratação, assinatura nem pagamento de planos ou serviços/.test(ios.html), 'diz o que o app do iPhone não faz');
    assert.ok(/liberado pelo seu coach/.test(ios.html));
    assert.ok(/em caso de uso indevido do conteúdo/.test(ios.html), 'suspensão sem "inadimplência"');
    const secs = sections(ios.html);
    assert.equal(secs.length, 15, 'continuam as 15 seções, na mesma ordem');
    assert.deepEqual(secs.map((x) => x.split('. ')[0]), Array.from({ length: 15 }, (_, i) => String(i + 1)));
  }
  const ios = (await page('?plataforma=ios')).html;
  // o resto do texto não muda: o iOS é a versão completa só sem a seção 7 e sem a palavra "inadimplência"
  const strip = (h: string) => h.replace(/<h2>7\.[\s\S]*?(?=<h2>8\.)/, '').replace('em caso de inadimplência, uso indevido', 'em caso de uso indevido');
  assert.equal(strip(ios), strip(full.html), 'fora da seção 7 e da inadimplência, as duas versões são iguais');
  for (const t of ['Responsabilidade Técnica', 'Uso de Inteligência Artificial', 'Excluir minha conta', 'Contato', 'CRN']) assert.ok(ios.includes(t), 'mantém ' + t);
  console.log('OK  termos (?plataforma=ios): seção 7 vira "Acesso ao Serviço", nada de PIX/boleto/cartão/Asaas/renovação/cobrança/reembolso; as outras 14 seções ficam iguais');

  // nunca quebra com endereço estranho
  const weird = await GET({ url: 'não é uma url' } as any); assert.equal(weird.status, 200); assert.equal(await weird.text(), full.html);
  console.log('OK  termos: endereço inválido cai na versão completa (não dá erro)');
  process.exit(0);
})().catch((e) => { console.log('FALHOU:', e && e.stack || e); process.exit(1); });
