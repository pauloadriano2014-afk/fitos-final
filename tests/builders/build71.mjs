import { build } from 'esbuild';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const BACKEND = path.resolve(process.env.BACKEND_DIR || path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..'));
const [,, entry, out] = process.argv;
const M = new URL('../mocks/', import.meta.url).pathname;
await build({ entryPoints:[entry], bundle:true, platform:'node', format:'cjs', outfile:out, logLevel:'error', loader:{'.js':'jsx','.png':'dataurl','.jpg':'dataurl','.jpeg':'dataurl','.webp':'dataurl','.gif':'dataurl','.ttf':'dataurl','.mp4':'dataurl','.m4a':'dataurl','.mp3':'dataurl','.wav':'dataurl'}, jsx:'automatic',
  nodePaths:[BACKEND+'/node_modules', new URL('../node_modules', import.meta.url).pathname],
  plugins:[{ name:'catchall', setup(b){
    b.onResolve({filter:/^react-native$/},()=>({path:M+'rn_notes.js'}));
    b.onResolve({filter:/^react-native-shadow-2$/},()=>({path:M+'shadow-web.js'}));
    b.onResolve({filter:/^expo-speech$/},()=>({path:M+'run-speech.js'}));
    b.onResolve({filter:/^expo-av$/},()=>({path:M+'av_rec.js'}));
    b.onResolve({filter:/^react-native-svg$/},()=>({path:M+'svg.js'}));
    b.onResolve({filter:/^@expo\/vector-icons$/},()=>({path:M+'icons.js'}));
    // qualquer pacote de fora (expo-*, @react-navigation/*, etc.) vira módulo vazio: aqui só interessa se os imports ENTRE arquivos nossos existem
    b.onResolve({filter:/^html2canvas$/},()=>({path:M+"html2canvas-stub.js"}));
    b.onResolve({filter:/^expo-linear-gradient$/},()=>({path:M+"lineargradient.js"}));
    b.onResolve({filter:/adminDietService$/},()=>({path:M+'svcfull.js'}));
    b.onResolve({filter:/contexts\/ThemeContext$/},()=>({path:M+'themectx.js'}));
    b.onResolve({filter:/^@react-native-async-storage\/async-storage$/},()=>({path:M+'async3.js'}));
    b.onResolve({filter:/^expo-image$/},()=>({path:M+'expoimage.js'}));
    b.onResolve({filter:/^react-native-safe-area-context$/},()=>({path:M+'insets.js'}));
    b.onResolve({filter:/authToken$/},()=>({path:M+"authtoken.js"}));
    b.onResolve({filter:/^expo-print$/},()=>({path:M+"print.js"}));
    b.onResolve({filter:/^expo-sharing$/},()=>({path:M+"sharing_t.js"}));
    b.onResolve({filter:/^expo-notifications$/},()=>({path:M+"expo-notif-noop.js"}));
    b.onResolve({filter:/^expo-haptics$/},()=>({path:M+"run-haptics.js"}));
    b.onResolve({filter:/^@react-navigation\/native$/},()=>({path:M+'nav_route.js'}));
    b.onResolve({filter:/^expo-clipboard$/},()=>({path:M+"clipboard.js"}));
    b.onResolve({filter:/^expo-image-picker$/},()=>({path:M+'picker_t.js'}));
    b.onResolve({filter:/^expo-image-manipulator$/},()=>({path:M+'manip_t.js'}));
    b.onResolve({filter:/^react-native-view-shot$/},()=>({path:M+'viewshot_t.js'}));
    b.onResolve({filter:/^[^./]/},(a)=>{ if (['assert','fs','path','os','util','crypto'].includes(a.path) || a.path==='react-test-renderer'||a.path==='scheduler'||a.path==='react'||a.path.startsWith('react/')||a.path==='react-dom') return; return { path: M+'empty.js' }; });
  }}] });
console.log('OK  resolve tudo:', entry.split('/src/')[1]);
