import { build } from 'esbuild';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const BACKEND = path.resolve(process.env.BACKEND_DIR || path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..'));
const [,, entry, out] = process.argv;
await build({ entryPoints:[entry], bundle:true, platform:'node', format:'cjs', outfile:out, logLevel:'error', external:['jsdom','*/node_modules/jsdom'], jsx:'automatic',
  nodePaths:[BACKEND+'/node_modules', new URL('../node_modules', import.meta.url).pathname] });
console.log('OK  resolve tudo:', entry);
