import { build } from 'esbuild';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const BACKEND = path.resolve(process.env.BACKEND_DIR || path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..'));
const [,, entry, out] = process.argv;
const M = new URL('../mocks/', import.meta.url).pathname;
// a rota de conteúdos importa o aviso por caminho RELATIVO (../../utils/sendNotification): o plugin troca por um contador
const notifPlugin = { name: 'notif', setup(b) { b.onResolve({ filter: /utils\/sendNotification$/ }, () => ({ path: M + 'sendnotif-count.js' })); } };
await build({ entryPoints:[entry], bundle:true, platform:'node', format:'cjs', outfile:out, logLevel:'warning', plugins:[notifPlugin],
  nodePaths:[BACKEND+'/node_modules', new URL('../node_modules', import.meta.url).pathname],
  alias:{ 'next/server': M+'next-server2.js', '@/lib/prisma': M+'prisma-exam.js', '@/lib':BACKEND+'/lib', '@':BACKEND } });
