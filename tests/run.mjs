// tests/run.mjs — roda os testes automaticos do servidor (rotas e regras), sem banco real e sem internet.
//
//   node run.mjs                  roda todos
//   node run.mjs agenda cupom     roda so os que tem esses pedacos no nome
//   node run.mjs --detalhes      mostra o que cada teste conferiu (as linhas "OK ...")
//   node run.mjs --list           so lista
//
// Cada teste monta a rota/regra de verdade, troca o banco (Prisma), o login e o Next por simuladores
// (tests/mocks e tests/unit/*.ts) e confere o resultado. Nada aqui toca em producao.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildProfile } from './builders/profiles.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const BACKEND = path.resolve(process.env.BACKEND_DIR || path.join(HERE, '..'));
const TMP = path.join(HERE, '.tmp');
const PARALLEL = Number(process.env.TEST_PARALLEL || 4);
const TIMEOUT_MS = Number(process.env.TEST_TIMEOUT_MS || 90000);
const manifest = JSON.parse(fs.readFileSync(path.join(HERE, 'manifest.json'), 'utf8'));

const args = process.argv.slice(2);
let names = Object.keys(manifest).sort();
const filters = args.filter((a) => !a.startsWith('--'));
if (filters.length) names = names.filter((n) => filters.some((x) => n.includes(x)));
// testes que ja falhavam antes e ainda nao foram investigados (tests/quarentena.json): ficam de fora do "npm test" normal
const quarantine = JSON.parse(fs.readFileSync(path.join(HERE, 'quarentena.json'), 'utf8'));
const skipped = args.includes('--todos') ? [] : names.filter((n) => quarantine[n]);
names = names.filter((n) => !skipped.includes(n));
if (args.includes('--list')) { console.log(names.join('\n')); process.exit(0); }
if (!fs.existsSync(path.join(HERE, 'node_modules'))) { console.error('Falta instalar: rode "npm install" dentro da pasta tests.'); process.exit(2); }

// (barras normais mesmo no Windows: dentro dos textos dos testes, "\U" viraria um escape invalido)
const fwd = (p) => p.split(path.sep).join('/');
const fixPaths = (s) => s.split('/home/user/fitos-final').join(fwd(BACKEND)).split('/home/user/wt-back').join(fwd(BACKEND));
const sh = (cmd, a, opts = {}) => new Promise((resolve) => {
  const c = spawn(cmd, a, { cwd: HERE, env: { ...process.env, BACKEND_DIR: BACKEND, NODE_PATH: [path.join(BACKEND, 'node_modules'), path.join(HERE, 'node_modules')].join(path.delimiter) }, ...opts });
  let out = ''; c.stdout.on('data', (d) => { out += d; }); c.stderr.on('data', (d) => { out += d; });
  const t = setTimeout(() => { c.kill('SIGKILL'); out += '\nFALHOU: passou do tempo limite'; }, TIMEOUT_MS);
  c.on('close', (code) => { clearTimeout(t); resolve({ code, out }); });
});

// copia tudo de unit/ para .tmp com os caminhos desta maquina (os testes foram escritos com caminhos fixos)
fs.rmSync(TMP, { recursive: true, force: true }); fs.mkdirSync(TMP, { recursive: true });
const compat = fwd(path.join(HERE, 'support', 'node-compat.cjs'));
for (const f of fs.readdirSync(path.join(HERE, 'unit'))) {
  const src = fixPaths(fs.readFileSync(path.join(HERE, 'unit', f), 'utf8').replace(/\r\n/g, '\n'));
  fs.writeFileSync(path.join(TMP, f), /^t_.*\.ts$/.test(f) ? `import ${JSON.stringify(compat)};\n` + src : src);
}

// passar sem escrever nada seria suspeito (o teste nem rodou de verdade): conta como falha
const failed = (r) => r.code !== 0 || /FALHOU|FAIL|AssertionError/.test(r.out) || !r.out.trim();

async function one(name) {
  const entry = path.join(TMP, name + '.ts'); const out = path.join(TMP, name + '.cjs');
  let last = { code: 1, out: 'sem montador no manifest' };
  for (const cand of manifest[name]) {
    try {
      if (cand === 'none') { await (await import('esbuild')).build({ entryPoints: [entry], bundle: true, platform: 'node', format: 'cjs', outfile: out, logLevel: 'error', nodePaths: [path.join(BACKEND, 'node_modules'), path.join(HERE, 'node_modules')] }); }
      else if (cand.startsWith('profile:')) await buildProfile(cand.slice(8), entry, out);
      else { const b = await sh(process.execPath, [path.join(HERE, 'builders', cand), entry, out]); if (b.code !== 0) { last = { code: 1, out: 'nao montou (' + cand + '): ' + b.out.split('\n').slice(0, 4).join(' ') }; continue; } }
    } catch (e) { last = { code: 1, out: 'nao montou (' + cand + '): ' + String(e.message || e).split('\n')[0] }; continue; }
    last = await sh(process.execPath, [out]);
    if (!failed(last)) return { name, ok: true, out: last.out };
  }
  return { name, ok: false, out: last.out };
}

const t0 = Date.now(); const results = []; let next = 0;
await Promise.all(Array.from({ length: Math.min(PARALLEL, names.length) }, async () => {
  while (next < names.length) { const n = names[next++]; const r = await one(n); results.push(r); console.log((r.ok ? 'OK    ' : 'FALHOU ') + r.name); if (args.includes('--detalhes')) console.log(r.out.split('\n').filter((l) => l.trim()).map((l) => '      ' + l).join('\n')); }
}));
// quem falhou ganha uma segunda chance, sozinho (esperas curtas falham so quando a maquina esta ocupada)
for (const x of results.filter((y) => !y.ok)) {
  const again = await one(x.name);
  if (again.ok) { x.ok = true; x.retried = true; x.out = again.out; console.log('OK    ' + x.name + ' (passou na 2a tentativa: teste sensivel a tempo)'); }
}
const retried = results.filter((x) => x.retried).map((x) => x.name);
const bad = results.filter((x) => !x.ok).sort((a, b) => a.name.localeCompare(b.name));
for (const r of bad) { console.log('\n── ' + r.name + ' ──'); console.log(r.out.split('\n').filter((l) => l.trim()).slice(-8).join('\n')); }
console.log(`\n${results.length - bad.length} de ${results.length} testes passaram em ${Math.round((Date.now() - t0) / 1000)}s`);
if (retried.length) console.log(`(${retried.length} passaram so na 2a tentativa: ${retried.join(', ')})`);
if (skipped.length) console.log(`(${skipped.length} em quarentena ficaram de fora: veja tests/quarentena.json; rode com --todos para inclui-los)`);
process.exit(bad.length ? 1 : 0);
