import fs from 'fs';
import { buildFoodIndex, matchFood } from '/home/user/fitos-final/lib/voiceDiet/match';
const rows = JSON.parse(fs.readFileSync('/tmp/claude-0/-home-user/86513411-0da9-5f81-8d5c-a48e2b800aa5/scratchpad/vt/food_catalog.json', 'utf8'));
const byName = (n: string) => rows.find((r: any) => r.name === n)?.id;
const noStudent = buildFoodIndex(rows, []);
const student = buildFoodIndex(rows, ['Arroz, tipo 1, cozido', 'Feijão, carioca, cozido', 'Frango, peito, sem pele, grelhado', 'Queijo, minas, frescal', 'Banana, prata, crua', 'Batata, doce, cozida'].map(byName).filter(Boolean));
const show = (label: string, ix: any, q: string, prep?: string) => {
  const r = matchFood(q, prep, ix);
  console.log(`${label.padEnd(9)} ${(q + (prep ? ` [${prep}]` : '')).padEnd(26)} ${r.status.padEnd(6)} ${r.unknownPrep ? '⚠prep ' : ''}→ ${r.best?.name ?? '—'}   | ${r.candidates.slice(0, 4).map((c: any) => `${c.name} (${c.score}${c.studentFavorite ? '★' : ''})`).join(' ; ')}`);
};
const Q: Array<[string, string?]> = [['pão integral'], ['ovos', 'mexidos'], ['ovos'], ['ovos', 'poché'], ['ovos', 'fritos'], ['ovos', 'cozidos'], ['queijo'], ['arroz'], ['feijão'], ['frango'], ['banana'], ['aveia'], ['batata doce'], ['whey'], ['azeite'], ['leite'], ['iogurte'], ['clara de ovo'], ['patinho'], ['tapioca'], ['brócolis'], ['arroz branco'], ['frango', 'grelhado'], ['carne moída'], ['atum'], ['pasta de amendoim'], ['coisa esquisita']];
console.log('---- SEM favoritos do aluno ----'); for (const [q, p] of Q) show('', noStudent, q, p);
console.log('\n---- COM favoritos do aluno (arroz tipo 1, feijão carioca, frango peito grelhado, queijo minas frescal, banana prata, batata doce) ----'); for (const [q, p] of Q) show('', student, q, p);
