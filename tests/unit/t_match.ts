import { buildIndex, matchExercise } from '/home/user/fitos-final/lib/voiceWorkout/match';
const lib = require('/home/user/fitos-final/Exercise.json');
const idx = buildIndex(lib.map((e:any)=>({id:e.id,name:e.name,category:e.category,videoUrl:e.videoUrl,coachId:e.coachId})), '3c82f763-66b4-48da-836e-16817d4f57c0');
console.log('biblioteca indexada:', idx.length, 'de', lib.length);
const phrases = ['agachamento livre','leg press 45','búlgaro no Smith','cadeira extensora','cadeira adutora','cadeira abdutora','cadeira extensor','stiff','supino reto com halteres','rosca direta','puxada frontal','mesa flexora','elevação pélvica','panturrilha em pé','abdominal','agachamento','leg press','extensora','glúteo na polia','hack','remada curvada','desenvolvimento','esteira','exercício que não existe xyz'];
for (const p of phrases) {
  const r = matchExercise(p, idx);
  console.log(`\n"${p}" -> ${r.status}`);
  r.candidates.slice(0,3).forEach(c=>console.log(`   ${c.score.toFixed(2)}  ${c.name}  [${c.category}]`));
}
