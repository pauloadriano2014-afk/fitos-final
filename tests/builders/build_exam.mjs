import { build } from 'esbuild';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const BACKEND = path.resolve(process.env.BACKEND_DIR || path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..'));
const [,, entry, out] = process.argv;
const M = new URL('../mocks/', import.meta.url).pathname;
await build({ entryPoints:[entry], bundle:true, platform:'node', format:'cjs', outfile:out, logLevel:'warning',
  nodePaths:[BACKEND+'/node_modules', new URL('../node_modules', import.meta.url).pathname],
  alias:{ '@anthropic-ai/sdk': M+'anthropic.js', 'openai': M+'openai.js',  'next/server': M+'next-server2.js', '@/lib/prisma': M+'prisma-exam.js', '@/app/utils/sendNotification': M+'sendnotif-count.js', '@/lib':BACKEND+'/lib', '@':BACKEND } });
