// Perfis de montagem dos testes do servidor que usam simuladores proprios (tests/unit/*.ts).
// Cada perfil diz: "no lugar do banco, do login e do Next, use este arquivo de mentirinha".
import { build } from 'esbuild';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const BACKEND = path.resolve(process.env.BACKEND_DIR || path.join(HERE, '..', '..'));

const PROFILES = {
  'cp-alt':         { prisma: 'mocks.ts', auth: 'auth_mock.ts', next: 'nextmock.ts', notif: 'notif.ts', stubs: 'stubs.ts' },
  'cp-limit':       { prisma: 'mocks.ts', auth: 'auth_mock.ts', next: 'nextmock.ts', config: true },
  'cp-subs':        { prisma: 'mocks.ts', auth: 'auth_mock.ts', next: 'nextmock.ts', notif: 'notif.ts', config: true },
  'partner-lib':    { config: true },
  'partner-routes': { prisma: 'routemocks.ts', auth: 'routemocks.ts', next: 'nextmock2.ts', notif: 'routemocks.ts', config: true },
  'partner-android': { prisma: 'mocks3.ts', auth: 'mocks3.ts', next: 'nextmock2.ts', notif: 'mocks3.ts', config: true },
};

// entry = arquivo ja copiado para tests/.tmp (os simuladores ficam ao lado dele)
export async function buildProfile(name, entry, out) {
  const p = PROFILES[name]; if (!p) throw new Error('perfil desconhecido: ' + name);
  const here = path.dirname(entry) + '/';
  await build({ entryPoints: [entry], bundle: true, platform: 'node', format: 'cjs', outfile: out, logLevel: 'error',
    nodePaths: [path.join(BACKEND, 'node_modules'), path.join(HERE, '..', 'node_modules')],
    plugins: [{ name: 'alias', setup(b) {
      if (p.prisma) b.onResolve({ filter: /^@\/lib\/prisma$/ }, () => ({ path: here + p.prisma }));
      if (p.auth) b.onResolve({ filter: /^@\/lib\/auth$/ }, () => ({ path: here + p.auth }));
      if (p.notif) b.onResolve({ filter: /^@\/app\/utils\/sendNotification$/ }, () => ({ path: here + p.notif }));
      if (p.next) b.onResolve({ filter: /^next\/server$/ }, () => ({ path: here + p.next }));
      if (p.stubs) b.onResolve({ filter: /^@\/lib\/(foodMeasures|dayScheme)$/ }, () => ({ path: here + p.stubs }));
      b.onResolve({ filter: /^@\/config\/(.*)$/ }, (a) => ({ path: BACKEND + '/config/' + a.path.slice(9) + '.ts' }));
      b.onResolve({ filter: /^@\/lib\/(.*)$/ }, (a) => ({ path: BACKEND + '/lib/' + a.path.slice(5) + '.ts' }));
    } }] });
}
