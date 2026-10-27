import assert from 'assert';
import { timed } from '/home/user/fitos-final/lib/perfLog';

const warns: string[] = []; const orig = console.warn; console.warn = (...a: any[]) => { warns.push(a.join(' ')); };
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
let fails = 0, passed = 0;
const block = async (name: string, fn: () => Promise<void>) => { warns.length = 0; try { await fn(); passed++; orig('  ok  ' + name); } catch (e: any) { fails++; orig('  FALHOU  ' + name + '\n        ' + String((e && e.message) || e).split('\n').slice(0, 6).join('\n        ')); } };

(async () => {
  await block('rota rápida não escreve nada no log e devolve o mesmo valor, com os mesmos argumentos', async () => {
    delete process.env.PERF_SLOW_MS; delete process.env.PERF_LOG_ALL;
    const f = timed('GET /x', async (a: number, b: string) => ({ a, b })); assert.deepStrictEqual(await f(2, 'z'), { a: 2, b: 'z' }); assert.strictEqual(warns.length, 0);
  });
  await block('rota lenta (acima do limite) avisa com o nome e os milissegundos', async () => {
    process.env.PERF_SLOW_MS = '20'; const f = timed('GET /lenta', async () => { await sleep(40); return 1; }); assert.strictEqual(await f(), 1);
    assert.strictEqual(warns.length, 1); assert.match(warns[0], /^\[lento\] GET \/lenta (\d+)ms$/); assert.ok(Number(/(\d+)ms/.exec(warns[0])![1]) >= 35);
  });
  await block('o erro da rota passa adiante igualzinho (e mesmo assim registra o tempo se foi lenta)', async () => {
    process.env.PERF_SLOW_MS = '10'; const boom = new Error('quebrou'); const f = timed('GET /erro', async () => { await sleep(25); throw boom; });
    await assert.rejects(f(), (e: any) => e === boom); assert.strictEqual(warns.length, 1);
  });
  await block('PERF_LOG_ALL=1 registra todas; limite inválido volta para 1 segundo', async () => {
    process.env.PERF_LOG_ALL = '1'; await timed('GET /a', async () => 0)(); assert.strictEqual(warns.length, 1); delete process.env.PERF_LOG_ALL; warns.length = 0;
    for (const bad of ['abc', '-5', '']) { process.env.PERF_SLOW_MS = bad; await timed('GET /b', async () => { await sleep(15); })(); assert.strictEqual(warns.length, 0, 'limite ' + JSON.stringify(bad)); }
    process.env.PERF_SLOW_MS = '0'; await timed('GET /c', async () => 0)(); assert.strictEqual(warns.length, 1, '0 = registra tudo');
  });
  console.warn = orig; console.log(`\n${passed} ok, ${fails} falhou`); process.exit(fails ? 1 : 0);
})();
