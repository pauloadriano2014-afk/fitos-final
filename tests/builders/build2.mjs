import { build } from 'esbuild';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const BACKEND = path.resolve(process.env.BACKEND_DIR || path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..'));
const [,, entry, out] = process.argv;
const M = new URL('../mocks/', import.meta.url).pathname;
await build({ entryPoints:[entry], bundle:true, platform:'node', format:'cjs', outfile:out, logLevel:'warning',
  nodePaths:[BACKEND+'/node_modules', new URL('../node_modules', import.meta.url).pathname],
  plugins:[{ name:'mocks', setup(b){
    b.onResolve({filter:/^next\/server$/},()=>({path:M+'next-server.js'}));
    b.onResolve({filter:/^@anthropic-ai\/sdk$/},()=>({path:M+'anthropic.js'}));
    b.onResolve({filter:/^openai$/},()=>({path:M+'openai.js'}));
    b.onResolve({filter:/^@\/lib\/prisma$/},()=>({path:M+'prisma.js'}));
    b.onResolve({filter:/^@\/lib\/(.*)$/},(a)=>({path:BACKEND+'/lib/'+a.path.slice(6)+'.ts'}));
  }}] });
