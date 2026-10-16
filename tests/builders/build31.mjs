import { build } from 'esbuild';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const BACKEND = path.resolve(process.env.BACKEND_DIR || path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..'));
const [,, entry, out] = process.argv;
const M = new URL('../mocks/', import.meta.url).pathname;
await build({ entryPoints:[entry], bundle:true, platform:'node', format:'cjs', outfile:out, logLevel:'warning',
  nodePaths:[BACKEND+'/node_modules', new URL('../node_modules', import.meta.url).pathname],
  alias:{ 'next/server': M+'next-server.js', '@/lib/prisma': M+'prisma-billing.js', '@/app/utils/sendNotification': M+'sendnotif-stub.js', '@/lib':BACKEND+'/lib', '@/config':BACKEND+'/config', '@':BACKEND } });
