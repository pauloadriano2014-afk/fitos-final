import assert from 'assert';
import {
  repRange, levelPolicy, techniquesForLevel, buildFacts, CodeBook, buildCandidates, candidatesText, rotationText, refineWorkout, recentNames,
  ANCHOR_MAX_CYCLES, MAX_ANCHORS_PER_DAY, type ExFact, type GenEx, type RefineCtx, type PlanDay, type PrevRoutine,
} from '/home/user/fitos-final/lib/ai/workoutPlanner';
import { nameKey } from '/home/user/fitos-final/lib/exerciseSwap';
import { buildSubLinks, areLinked, linkedToAny, linkedIds } from '/home/user/fitos-final/lib/ai/subFamily';

let ok = 0; const t = async (name: string, fn: () => Promise<void> | void) => { try { await fn(); ok++; console.log('  ok  ' + name); } catch (e: any) { console.log('FALHOU  ' + name + '\n' + String(e?.stack || e).split('\n').slice(0, 6).join('\n')); process.exitCode = 1; } };

const lib = (id: string, name: string, target: string, mech = 'COMPOSTO', eq = 'MAQUINA', o: any = {}): any => ({ id, name, category: target === 'CARDIO' ? 'Cardio' : 'Musculação', subCategory: target, videoUrl: o.video === undefined ? 'v' : o.video, tags: { target, mechanic: mech, equipment: eq, jointRisk: o.risk || [] }, environments: ['UNIVERSAL'] });
const gx = (e: any, n = 3, tech = '', load = '', reps = '10'): GenEx => ({ exerciseId: e.id, title: e.name, videoUrl: '', category: e.category, subCategory: e.subCategory, observation: '', substitute: null, blocks: Array.from({ length: n }, () => ({ sets: '1', reps, load, restTime: '60', technique: tech })) });
const makeEx = (e: any, blocks: any[]): GenEx => ({ exerciseId: e.id, title: e.name, videoUrl: '', category: e.category, subCategory: e.subCategory, observation: '', substitute: null, blocks });

// biblioteca de teste
const PEITO = [1, 2, 3, 4, 5, 6].map((n) => lib(`p${n}`, `Peito ${n}`, 'PEITO', n > 4 ? 'ISOLADO' : 'COMPOSTO'));
const BICEPS = [1, 2, 3, 4, 5].map((n) => lib(`b${n}`, `Biceps ${n}`, 'BICEPS', 'ISOLADO', n % 2 ? 'HALTER' : 'POLIA'));
const COSTAS = [1, 2, 3, 4].map((n) => lib(`c${n}`, `Costas ${n}`, 'COSTAS_REMADA', 'COMPOSTO'));
const QUAD = [lib('q1', 'Agachamento livre', 'QUADRICEPS', 'COMPOSTO', 'LIVRE'), lib('q2', 'Leg press 45', 'QUADRICEPS', 'COMPOSTO', 'MAQUINA'), lib('q3', 'Cadeira extensora', 'QUADRICEPS', 'ISOLADO', 'MAQUINA'), lib('q4', 'Afundo com halteres', 'QUADRICEPS', 'COMPOSTO', 'HALTER')];
const CARD = [lib('k1', 'Esteira', 'CARDIO', 'ISOLADO', 'MAQUINA'), lib('k2', 'Bike', 'CARDIO', 'ISOLADO', 'MAQUINA')];
const ABS = [lib('a1', 'Prancha', 'ABDOMEN', 'ISOLADO', 'PESO_CORPORAL'), lib('a2', 'Abdominal supra', 'ABDOMEN', 'ISOLADO', 'PESO_CORPORAL')];
const LIB: any[] = [...PEITO, ...BICEPS, ...COSTAS, ...QUAD, ...CARD, ...ABS];
const libMap = new Map(LIB.map((e) => [e.id, e]));
const DAYS: PlanDay[] = [{ name: 'A', groups: [{ id: 'PEITO', qty: 2, sets: 3, rest: 60 }, { id: 'BICEPS', qty: 2, sets: 3, rest: 30 }] }, { name: 'B', groups: [{ id: 'COSTAS_REMADA', qty: 2, sets: 4, rest: 60 }, { id: 'BICEPS', qty: 1, sets: 3, rest: 30 }] }];

const prevEx = (e: any) => ({ exerciseId: e.id, name: e.name, target: e.tags.target, mechanic: e.tags.mechanic, category: e.category });
const hist = (rows: Array<{ id: string; sets: number[]; effort?: string; perSide?: boolean; daysAgo?: number }>[]) => rows.map((sessionRows, i) => ({ date: new Date(Date.now() - (i + 1) * 3 * 86400000), loadPhase: null, details: sessionRows.flatMap((r) => r.sets.map((w, k) => ({ exerciseId: r.id, setNumber: k + 1, weight: w, perSide: !!r.perSide, effort: r.effort || null }))) }));

(async () => {
  // ═════ 1) nível ═════
  await t('repRange: faixa da fase, e o iniciante não faz série de 3 a 5 repetições', () => {
    assert.deepEqual(repRange('HIPERTROFIA', 'INTERMEDIARIO'), [8, 15]); assert.deepEqual(repRange('FORCA', 'AVANCADO'), [3, 6]); assert.deepEqual(repRange('FORCA', 'INICIANTE'), [6, 10]);
    assert.deepEqual(repRange('DELOAD', 'INICIANTE'), [15, 15], 'teto de 15: nunca 18 nem 20'); assert.deepEqual(repRange('DELOAD', 'INICIANTE', 20), [15, 20], 'o coach pode subir o teto'); assert.deepEqual(repRange('CHOQUE', 'INICIANTE'), [8, 12]); assert.deepEqual(repRange('HIPERTROFIA', 'INICIANTE'), [8, 15]);
    assert.deepEqual(repRange('NADA', null), [8, 15], 'fase desconhecida: hipertrofia'); assert.deepEqual(repRange(undefined, undefined), [8, 15]); assert.deepEqual(repRange('emagrecimento', 'INTERMEDIARIO'), [12, 15], 'não liga para maiúscula; teto 15'); assert.deepEqual(repRange('EMAGRECIMENTO', null, 12), [12, 12], 'teto menor que a faixa'); assert.deepEqual(repRange('EMAGRECIMENTO', null, 99), [12, 15], 'teto absurdo volta ao padrão'); assert.deepEqual(repRange('HIPERTROFIA', null, 10), [8, 10]);
  });
  await t('levelPolicy + techniquesForLevel: o que o nível aguenta', () => {
    const p = levelPolicy('INICIANTE', 'HIPERTROFIA'); assert.equal(p.label, 'Iniciante'); assert.ok(p.banned.includes('DROPSET') && p.banned.includes('TRISET') && !p.banned.includes('BISET')); assert.ok(p.text.includes('PROIBIDAS') && p.text.includes('DROPSET') && p.text.includes('8 a 15') && /NADA de exercício técnico/.test(p.text));
    const a = levelPolicy('AVANCADO', 'FORCA'); assert.deepEqual(a.banned, []); assert.ok(!a.text.includes('PROIBIDAS') && a.text.includes('3 a 6'));
    assert.ok(levelPolicy('INTERMEDIARIO', 'CHOQUE').text.includes('GVT'));
    assert.deepEqual(techniquesForLevel(['BISET', 'DROPSET', '21', 'GVT'], 'INICIANTE'), { kept: ['BISET'], removed: ['DROPSET', '21', 'GVT'] });
    assert.deepEqual(techniquesForLevel(['BISET', 'DROPSET', '21', 'GVT', 'CLUSTERSET'], 'INTERMEDIARIO'), { kept: ['BISET', 'DROPSET'], removed: ['21', 'GVT', 'CLUSTERSET'] });
    assert.deepEqual(techniquesForLevel(['DROPSET', 'GVT'], 'AVANCADO'), { kept: ['DROPSET', 'GVT'], removed: [] }); assert.deepEqual(techniquesForLevel(['GVT'], null), { kept: ['GVT'], removed: [] });
    assert.deepEqual(techniquesForLevel(['1_5_REPS', 'rest-pause', 'TUT'], 'INICIANTE').removed, ['1_5_REPS', 'rest-pause', 'TUT'], 'nomes com "_" e "-" também são reconhecidos');
  });

  // ═════ 2) códigos curtos ═════
  await t('CodeBook: E001, E002... estáveis, aceita minúscula e devolve o id verdadeiro; o que não conhece passa direto', () => {
    const b = new CodeBook(); assert.equal(b.code('uuid-1'), 'E001'); assert.equal(b.code('uuid-2'), 'E002'); assert.equal(b.code('uuid-1'), 'E001', 'mesmo id, mesmo código'); assert.equal(b.size, 2);
    assert.equal(b.resolve('E002'), 'uuid-2'); assert.equal(b.resolve(' e001 '), 'uuid-1'); assert.equal(b.resolve('uuid-2'), 'uuid-2', 'a IA devolveu o id verdadeiro: serve'); assert.equal(b.resolve('E999'), 'E999', 'código desconhecido segue como veio (vira fantasma na validação)'); assert.equal(b.resolve(null), ''); assert.equal(b.resolve(undefined), '');
    assert.equal(new CodeBook().code('x'), 'E001', 'cada livro começa do zero');
  });

  // ═════ 3) progressão: o que fazer com cada exercício da rotina anterior ═════
  const sup = lib('s1', 'Supino reto', 'PEITO', 'COMPOSTO', 'BARRA'), rem = lib('s2', 'Remada curvada', 'COSTAS_REMADA', 'COMPOSTO', 'BARRA'), agach = lib('s3', 'Agachamento', 'QUADRICEPS', 'COMPOSTO', 'BARRA'), terra = lib('s4', 'Terra romeno', 'POSTERIORES', 'COMPOSTO', 'BARRA'), legp = lib('s5', 'Leg press', 'QUADRICEPS', 'COMPOSTO', 'MAQUINA'), rosca = lib('s6', 'Rosca direta', 'BICEPS', 'ISOLADO', 'BARRA'), esteira = lib('s7', 'Esteira', 'CARDIO', 'ISOLADO', 'MAQUINA');
  const r0: PrevRoutine = { name: 'Ficha 3', days: { A: [sup, rem, agach, terra, legp, rosca, esteira].map(prevEx) } };
  const r1: PrevRoutine = { name: 'Ficha 2', days: { A: [sup, rem, rosca].map(prevEx) } };
  const r2: PrevRoutine = { name: 'Ficha 1', days: { A: [sup].map(prevEx) } };
  const H = hist([
    [{ id: 's3', sets: [60, 60] }, { id: 's4', sets: [100], effort: 'FACIL' }, { id: 's2', sets: [40, 40] }, { id: 's1', sets: [50] }],
    [{ id: 's3', sets: [55, 55] }, { id: 's2', sets: [40, 40] }],
    [{ id: 's3', sets: [50, 50] }, { id: 's2', sets: [40, 40] }],
  ]);
  await t('buildFacts: âncora evolui = MANTER; acessório gira; âncora velha, estagnada ou 3ª do dia troca; cardio fica', () => {
    const f = buildFacts([r0, r1, r2], H); const by = (id: string) => f.find((x) => x.exerciseId === id)!;
    assert.equal(f.length, 7); assert.equal(ANCHOR_MAX_CYCLES, 3); assert.equal(MAX_ANCHORS_PER_DAY, 2);
    assert.equal(by('s1').age, 3); assert.equal(by('s1').plan, 'TROCAR'); assert.ok(by('s1').why.includes('âncora há 3 rotinas'), by('s1').why);
    assert.equal(by('s2').age, 2); assert.equal(by('s2').status, 'ESTAGNADO'); assert.equal(by('s2').plan, 'TROCAR'); assert.ok(by('s2').why.includes('estagnou'));
    assert.equal(by('s3').age, 1); assert.equal(by('s3').status, 'PROGREDINDO'); assert.equal(by('s3').plan, 'MANTER'); assert.ok(by('s3').why.includes('evoluindo')); assert.deepEqual(by('s3').loads, [60, 60]);
    assert.equal(by('s4').status, 'FACIL'); assert.equal(by('s4').plan, 'MANTER'); assert.equal(by('s4').action, 'UP'); assert.ok(by('s4').targetLoads[0] > by('s4').loads[0], 'ficou fácil: alvo sobe');
    assert.equal(by('s5').role, 'ANCORA'); assert.equal(by('s5').status, 'NAO_FEZ'); assert.equal(by('s5').plan, 'TROCAR'); assert.ok(by('s5').why.includes('âncoras suficientes'), 'só 2 âncoras seguram por dia');
    assert.equal(by('s6').role, 'ACESSORIO'); assert.equal(by('s6').plan, 'TROCAR'); assert.ok(by('s6').why.includes('acessório'));
    assert.equal(by('s7').cardio, true); assert.equal(by('s7').plan, 'MANTER'); assert.equal(by('s7').sessions, 0);
    assert.deepEqual(buildFacts([], H), [], 'sem rotina anterior, sem fatos');
  });
  await t('buildFacts: a biblioteca real marca glúteo como isolado — o 1º exercício do dia de um músculo grande ainda é âncora; o resto do glúteo e os músculos pequenos giram', () => {
    const hip = lib('g1', 'Hip thrust', 'GLUTEOS', 'ISOLADO', 'BARRA'), g2 = lib('g2', 'Abdução na polia', 'GLUTEOS', 'ISOLADO', 'POLIA'), g3 = lib('g3', 'Glúteo 4 apoios', 'GLUTEOS', 'ISOLADO', 'PESO_CORPORAL'), tri = lib('g4', 'Tríceps corda', 'TRICEPS', 'ISOLADO', 'POLIA'), tri2 = lib('g5', 'Tríceps testa', 'TRICEPS', 'ISOLADO', 'BARRA');
    const f = buildFacts([{ name: 'F', days: { A: [hip, g2, g3, tri, tri2].map(prevEx) } }], []); const by = (id: string) => f.find((x) => x.exerciseId === id)!;
    assert.equal(by('g1').role, 'ANCORA'); assert.equal(by('g1').plan, 'MANTER', 'hip thrust continua para o aluno subir a carga'); assert.equal(by('g2').role, 'ACESSORIO'); assert.equal(by('g2').plan, 'TROCAR'); assert.equal(by('g3').plan, 'TROCAR');
    assert.equal(by('g4').role, 'ACESSORIO', 'tríceps é músculo pequeno: gira'); assert.equal(by('g5').plan, 'TROCAR');
  });
  await t('buildCandidates: o músculo certo vem antes do rótulo genérico (PERNAS não invade a lista de glúteos)', () => {
    const glute = [lib('h1', 'Elevação pélvica', 'GLUTEOS', 'ISOLADO', 'BARRA'), lib('h2', 'Coice na polia', 'GLUTEOS', 'ISOLADO', 'POLIA')]; const pernas = [lib('h3', 'Leg press horizontal', 'PERNAS', 'COMPOSTO', 'MAQUINA'), lib('h4', 'Afundo', 'PERNAS', 'COMPOSTO', 'HALTER')];
    const ids = buildCandidates({ days: [{ name: 'A', groups: [{ id: 'GLUTEOS', qty: 2 }] }], library: [...pernas, ...glute], facts: [], prev: [], level: null, env: 'X', levelRules: false }).byGroup.get('GLUTEOS')!.map((e) => e.id);
    assert.deepEqual(ids.slice(0, 2).sort(), ['h1', 'h2'], 'glúteo de verdade primeiro: ' + ids.join()); assert.equal(ids.length, 4, 'os genéricos ainda servem de reserva');
  });
  await t('buildFacts: "pesado" segura a carga; 2 treinos iguais ainda é pouco histórico; cada lado vira o valor de um lado só no texto', () => {
    const one: PrevRoutine = { name: 'F', days: { A: [sup, rem].map(prevEx) } };
    const heavy = buildFacts([one], hist([[{ id: 's1', sets: [80, 80], effort: 'PESADO' }], [{ id: 's1', sets: [80, 80] }]]));
    assert.equal(heavy[0].status, 'PESADO'); assert.equal(heavy[0].plan, 'MANTER'); assert.ok(heavy[0].why.includes('segurar')); assert.equal(heavy[0].action, 'HOLD');
    const two = buildFacts([one], hist([[{ id: 's2', sets: [40] }], [{ id: 's2', sets: [40] }]])); assert.equal(two[1].status, 'SEM_DADOS', '2 treinos iguais não provam estagnação');
    const side = buildFacts([one], hist([[{ id: 's1', sets: [44, 44], perSide: true, effort: 'FACIL' }]]));
    assert.equal(side[0].perSide, true); const txt = rotationText([one], side, new CodeBook()); assert.ok(txt.includes('22/22 kg cada lado'), txt); assert.ok(txt.includes('alvo') && txt.includes('cada lado') && txt.includes('(subir)'), txt);
  });
  await t('buildFacts: o histórico de semana de deload/choque não conta (mesma regra da sugestão de carga)', () => {
    const one: PrevRoutine = { name: 'F', days: { A: [sup].map(prevEx) } };
    const h = hist([[{ id: 's1', sets: [20] }], [{ id: 's1', sets: [50] }]]); (h[0] as any).loadPhase = 'DELOAD';
    const f = buildFacts([one], h)[0]; assert.deepEqual(f.loads, [50], 'a carga de deload não vira "última carga"');
  });

  // ═════ 4) candidatos ═════
  await t('buildCandidates: sem duplicado, âncora fixada no topo, repetido do ciclo anterior no fim, limite por grupo', () => {
    const dup = [...PEITO, lib('p1b', 'peito 1', 'PEITO', 'COMPOSTO', 'MAQUINA', { video: '' })];   // mesmo nome (sem acento/maiúscula): um só
    const prev: PrevRoutine = { name: 'F', days: { A: [PEITO[0], PEITO[1], PEITO[5], BICEPS[0]].map(prevEx) } };
    const facts = buildFacts([prev], []);   // p1, p2 = âncoras (MANTER), p6 = acessório (TROCAR)
    const c = buildCandidates({ days: DAYS, library: [...dup, ...BICEPS, ...COSTAS], facts, prev: [prev], level: 'INTERMEDIARIO', env: 'ACADEMIA_PADRAO', levelRules: true });
    const peito = c.byGroup.get('PEITO')!.map((e) => e.id);
    assert.equal(new Set(peito.map((id) => nameKey(libMap.get(id)?.name || 'peito 1'))).size, peito.length, 'nenhum nome repetido'); assert.ok(!(peito.includes('p1') && peito.includes('p1b')));
    assert.deepEqual(peito.slice(0, 2).sort(), ['p1', 'p2'], 'as âncoras (MANTER) vêm primeiro'); assert.equal(peito[peito.length - 1], 'p6', 'o acessório que repetiria vai para o fim da lista');
    assert.ok(c.byGroup.has('BICEPS') && c.byGroup.has('COSTAS_REMADA') && !c.byGroup.has('QUADRICEPS'), 'só os grupos do plano');
    const many = Array.from({ length: 60 }, (_, i) => lib('m' + i, 'Mult ' + i, 'PEITO')); const big = buildCandidates({ days: DAYS, library: many, facts: [], prev: [], level: null, env: 'X', levelRules: false });
    assert.equal(big.byGroup.get('PEITO')!.length, 10, 'qty total 2 → mínimo de 10 candidatos'); assert.deepEqual(recentNames([prev]).latestNames.size, 4);
    const wide = buildCandidates({ days: [{ name: 'A', groups: [{ id: 'PEITO', qty: 6 }] }, { name: 'B', groups: [{ id: 'PEITO', qty: 6 }] }], library: many, facts: [], prev: [], level: null, env: 'X', levelRules: false });
    assert.equal(wide.byGroup.get('PEITO')!.length, 24, 'teto de 24 por grupo');
  });
  await t('buildCandidates: o que só apareceu em rotinas mais antigas também desce na lista (menos que o da rotina anterior)', () => {
    const antigo = lib('o1', 'Aaa antigo', 'PEITO'); const recente = lib('o2', 'Aab recente', 'PEITO'); const novo = lib('o3', 'Zzz novo', 'PEITO');
    const prev: PrevRoutine[] = [{ name: 'F2', days: { A: [prevEx(recente)] } }, { name: 'F1', days: { A: [prevEx(antigo)] } }];
    const ids = buildCandidates({ days: [{ name: 'A', groups: [{ id: 'PEITO', qty: 2 }] }], library: [antigo, recente, novo], facts: [], prev, level: null, env: 'X', levelRules: false }).byGroup.get('PEITO')!.map((e) => e.id);
    assert.deepEqual(ids, ['o3', 'o1', 'o2'], 'novo, depois o de duas rotinas atrás, por último o da rotina anterior');
  });
  await t('buildCandidates: iniciante sem exercício complexo (se sobrar opção); sem opção, mantém e avisa', () => {
    const q = (days: PlanDay[], library: any[], level: any) => buildCandidates({ days, library, facts: [], prev: [], level, env: 'ACADEMIA_PADRAO', levelRules: true });
    const day: PlanDay[] = [{ name: 'A', groups: [{ id: 'QUADRICEPS', qty: 2 }] }];
    const ini = q(day, QUAD, 'INICIANTE'); assert.ok(!ini.byGroup.get('QUADRICEPS')!.some((e) => e.id === 'q1'), 'agachamento livre fora para iniciante'); assert.equal(ini.byGroup.get('QUADRICEPS')!.length, 3); assert.ok(ini.notes[0].includes('complexo'), ini.notes.join());
    assert.ok(q(day, QUAD, 'AVANCADO').byGroup.get('QUADRICEPS')!.some((e) => e.id === 'q1'), 'avançado pode');
    const poor = q(day, [QUAD[0], QUAD[2]], 'INICIANTE'); assert.equal(poor.byGroup.get('QUADRICEPS')!.length, 2, 'biblioteca pobre: mantém os dois'); assert.ok(poor.notes[0].includes('poucos exercícios simples'), poor.notes.join());
    const off = buildCandidates({ days: day, library: QUAD, facts: [], prev: [], level: 'INICIANTE', env: 'X', levelRules: false }); assert.equal(off.byGroup.get('QUADRICEPS')!.length, 4, 'regras de nível desligadas');
  });
  await t('buildCandidates: condomínio/casa joga máquina para o fim; composto antes em grupo grande; equipamentos variados', () => {
    const day: PlanDay[] = [{ name: 'A', groups: [{ id: 'QUADRICEPS', qty: 2 }, { id: 'BICEPS', qty: 1 }] }];
    const lightC = buildCandidates({ days: day, library: [...QUAD, ...BICEPS], facts: [], prev: [], level: 'AVANCADO', env: 'CONDOMINIO', levelRules: true }).byGroup.get('QUADRICEPS')!.map((e) => e.id);
    assert.deepEqual(lightC.slice(0, 2).sort(), ['q1', 'q4'], 'livre e halter primeiro em condomínio'); assert.ok(lightC.indexOf('q2') > lightC.indexOf('q4') && lightC.indexOf('q3') > lightC.indexOf('q4'), 'máquina (leg press, extensora) depois do halter: ' + lightC.join());
    const gym = buildCandidates({ days: day, library: [...QUAD, ...BICEPS], facts: [], prev: [], level: 'AVANCADO', env: 'ACADEMIA_PADRAO', levelRules: true });
    assert.equal(gym.byGroup.get('QUADRICEPS')![gym.byGroup.get('QUADRICEPS')!.length - 1].tags.mechanic, 'ISOLADO', 'em grupo grande o isolado fica por último');
    const bi = gym.byGroup.get('BICEPS')!.map((e) => e.tags.equipment); assert.ok(bi.slice(0, 2).includes('HALTER') && bi.slice(0, 2).includes('POLIA'), 'os 2 primeiros já são de equipamentos diferentes: ' + bi.join());
    const iniMach = buildCandidates({ days: [{ name: 'A', groups: [{ id: 'COSTAS_REMADA', qty: 1 }] }], library: [lib('x1', 'Remada livre', 'COSTAS_REMADA', 'COMPOSTO', 'LIVRE'), lib('x2', 'Remada máquina', 'COSTAS_REMADA', 'COMPOSTO', 'MAQUINA')], facts: [], prev: [], level: 'INICIANTE', env: 'ACADEMIA_PADRAO', levelRules: true }).byGroup.get('COSTAS_REMADA')!.map((e) => e.id);
    assert.deepEqual(iniMach, ['x2', 'x1'], 'iniciante: guiado primeiro');
  });
  await t('textos para a IA: candidatos por grupo com códigos, avisos e vagas por dia; rotina anterior com MANTER/TROCAR e alvo', () => {
    const prev: PrevRoutine = { name: 'Ficha 3', days: { A: [PEITO[0], PEITO[5], BICEPS[0]].map(prevEx), B: [COSTAS[0]].map(prevEx) } };
    const facts = buildFacts([prev], hist([[{ id: 'p1', sets: [40, 40, 35] }], [{ id: 'p1', sets: [40, 40, 35] }], [{ id: 'p1', sets: [40, 40, 35] }]]));
    const book = new CodeBook(); const cands = buildCandidates({ days: DAYS, library: LIB, facts, prev: [prev], level: 'INTERMEDIARIO', env: 'ACADEMIA_PADRAO', levelRules: true });
    const txt = candidatesText(cands, DAYS, facts, book, 'ACADEMIA_PADRAO'); const lines = txt.split('\n');
    assert.ok(lines[0].startsWith('BANCO DE CANDIDATOS (ambiente ACADEMIA_PADRAO)')); assert.ok(lines.includes('## PEITO — vagas por dia (A:2)')); assert.ok(lines.includes('## BICEPS — vagas por dia (A:2, B:1)'), 'o mesmo grupo em dois dias mostra as vagas de cada um'); assert.ok(!txt.includes('QUADRICEPS'));
    assert.ok(lines.some((l) => /^E\d{3} \| Peito 1 \| COMPOSTO\/MAQUINA \| MANTER$/.test(l)), txt); assert.ok(lines.some((l) => /^E\d{3} \| Peito 6 \| ISOLADO\/MAQUINA \| REPETIDO do ciclo anterior \(evite\)$/.test(l)), txt);
    assert.ok(!/p1|uuid/.test(txt.replace(/Peito|Biceps/g, '')), 'nenhum id verdadeiro vaza para o prompt');
    const rot = rotationText([prev], facts, book); assert.ok(rot.startsWith('ROTINA ANTERIOR "Ficha 3"')); assert.ok(rot.includes('Dia A:') && rot.includes('Dia B:'));
    assert.ok(/E\d{3} Peito 1 · \[âncora, 1 rotina seguidas\] · ESTAGNADO|E\d{3} Peito 1 · \[âncora, 1 rotina seguidas\] · pouco histórico|E\d{3} Peito 1 · \[âncora, 1 rotina seguidas\] · estagnado/.test(rot) || rot.includes('Peito 1'), rot);
    assert.ok(rot.includes('→ MANTER') && rot.includes('→ TROCAR') && rot.includes('última carga 40/40/35 kg') && rot.includes('alvo '), rot);
    assert.ok(rotationText([], [], new CodeBook()).includes('nenhuma') && rotationText([], [], new CodeBook()).includes('cargas em branco'));
    assert.equal(book.resolve(book.code('p1')), 'p1', 'os mesmos códigos valem nos dois textos');
  });

  // ═════ 5) revisão depois da IA ═════
  const noFacts: ExFact[] = [];
  const mk = (over: Partial<RefineCtx> = {}, days: PlanDay[] = DAYS, library: any[] = LIB, prev: PrevRoutine[] = [], facts: ExFact[] = noFacts): RefineCtx => {
    const cands = buildCandidates({ days, library, facts, prev, level: (over.level as any) ?? 'INTERMEDIARIO', env: 'ACADEMIA_PADRAO', levelRules: true });
    return { days, phase: 'HIPERTROFIA', level: 'INTERMEDIARIO', levelRules: true, lib: new Map(library.map((e) => [e.id, e])), pool: library, cands, facts, hasPrev: prev.length > 0, env: 'ACADEMIA_PADRAO', jointRisks: [], unavailable: new Set(), loaded: new Set(), makeEx, ...over };
  };
  const tg = (ex: GenEx, m = libMap) => (m.get(ex.exerciseId) as any).tags.target as string;
  const count = (list: GenEx[], target: string) => list.filter((e) => tg(e) === target).length;

  await t('refineWorkout: completa o grupo que a IA deixou incompleto (série e descanso do plano, repetição no meio da faixa) e avisa', () => {
    const r = refineWorkout({ A: [gx(PEITO[0], 3)] }, mk()); const A = r.byDay.A;
    assert.equal(A.length, 4); assert.equal(count(A, 'PEITO'), 2); assert.equal(count(A, 'BICEPS'), 2);
    const filled = A.filter((e) => e.exerciseId !== 'p1'); assert.ok(filled.every((e) => e.blocks.length === 3 && e.blocks.every((b) => b.load === '' && b.technique === '' && b.sets === '1')));
    assert.deepEqual(A.filter((e) => tg(e) === 'BICEPS').map((e) => e.blocks[0].restTime), ['30', '30'], 'descanso do grupo'); assert.equal(filled[0].blocks[0].reps, '12', 'meio de 8–15');
    assert.equal(r.quality.stats.filled, 3); assert.ok(r.quality.fixes.some((f) => f.startsWith('Dia A: a IA deixou PEITO incompleto')), r.quality.fixes.join()); assert.equal(r.byDay.B, undefined, 'dia que a IA nem mandou não é inventado');
  });
  await t('Pernas — Multi.: multiarticular de perna (qualquer etiqueta) é do grupo próprio, não duplica em Quadríceps/Glúteos e só ocupa a vaga dele', () => {
    const leg = (id: string, name: string, target: string, sub: string, mech = 'COMPOSTO'): any => ({ id, name, category: 'Pernas', subCategory: sub, videoUrl: 'v', tags: { target, mechanic: mech, equipment: 'LIVRE', jointRisk: [] }, environments: ['UNIVERSAL'] });
    const L = [leg('m1', 'Passada sem peso', 'PERNAS', 'Multiarticular'), leg('m2', 'Agachamento livre', 'QUADRICEPS', 'Multiarticular'), leg('m3', 'Leg press 45', 'QUADRICEPS', 'Multiarticular'), leg('i1', 'Cadeira extensora', 'QUADRICEPS', 'Quadríceps', 'ISOLADO'), leg('i2', 'Mesa flexora', 'POSTERIOR', 'Posteriores', 'ISOLADO'), leg('g1', 'Elevação pélvica', 'GLUTEOS', 'Glúteos', 'ISOLADO')];
    const days: PlanDay[] = [{ name: 'A', groups: [{ id: 'PERNAS_MULTI', qty: 2, sets: 4, rest: 60 }, { id: 'QUADRICEPS', qty: 1, sets: 3, rest: 60 }] }];
    const c = buildCandidates({ days, library: L, facts: [], prev: [], level: null, env: 'X', levelRules: false });
    assert.deepEqual((c.byGroup.get('PERNAS_MULTI') || []).map((e) => e.id).sort(), ['m1', 'm2', 'm3'], 'a passada (etiqueta PERNAS) aparece em Pernas — Multi.');
    assert.deepEqual((c.byGroup.get('QUADRICEPS') || []).map((e) => e.id), ['i1'], 'o multi não duplica em Quadríceps');
    // sem o grupo no plano, o multi ainda serve de Quadríceps (o etiquetado QUADRICEPS vem antes do genérico PERNAS)
    const solo = buildCandidates({ days: [{ name: 'A', groups: [{ id: 'QUADRICEPS', qty: 2 }] }], library: L, facts: [], prev: [], level: null, env: 'X', levelRules: false }).byGroup.get('QUADRICEPS')!.map((e) => e.id);
    assert.ok(solo.includes('m1') && solo.includes('m2') && solo.includes('i1'), solo.join()); assert.ok(solo.indexOf('m1') > solo.indexOf('m2'), 'genérico PERNAS depois do etiquetado: ' + solo.join());
    // refine: a IA mandou 3 multis e 1 extensora; o dia tem 2 vagas de multi e 1 de quadríceps
    const libMap2 = new Map(L.map((e: any) => [e.id, e]));
    const r = refineWorkout({ A: [gx(L[0], 3), gx(L[1], 3), gx(L[2], 3), gx(L[3], 3)] }, { ...mk({}, days, L), lib: libMap2 } as any);
    const ids = r.byDay.A.map((e) => e.exerciseId);
    assert.equal(ids.filter((i) => ['m1', 'm2', 'm3'].includes(i)).length, 2, 'só 2 multis: ' + ids.join()); assert.ok(ids.includes('i1'), 'a extensora fica na vaga de Quadríceps: ' + ids.join());
    assert.ok(r.quality.fixes.some((f) => f.includes('tirou 1 exercício')), r.quality.fixes.join());
    // a IA mandou 3 multis e nenhum isolado: o 3º multi não pode ocupar a vaga de Quadríceps; ela é completada com a extensora
    const r2 = refineWorkout({ A: [gx(L[0], 3), gx(L[1], 3), gx(L[2], 3)] }, { ...mk({}, days, L), lib: libMap2 } as any); const ids2 = r2.byDay.A.map((e) => e.exerciseId);
    assert.equal(ids2.filter((i) => ['m1', 'm2', 'm3'].includes(i)).length, 2, ids2.join()); assert.ok(ids2.includes('i1'), 'vaga de Quadríceps completada com o isolado: ' + ids2.join());
  });
  await t('refineWorkout: tira o que passou do plano, o repetido no dia e o dia fantasma; ordem dos grupos; composto antes do isolado; entrada intacta', () => {
    const input = { A: [gx(BICEPS[0]), gx(PEITO[5]), gx(PEITO[0]), gx(PEITO[0]), gx(PEITO[1]), gx(PEITO[2]), gx(BICEPS[1]), gx(BICEPS[2])], Z: [gx(PEITO[0])] }; const snap = JSON.stringify(input);
    const r = refineWorkout(input, mk()); const A = r.byDay.A;
    assert.equal(JSON.stringify(input), snap, 'não mexe na entrada'); assert.deepEqual(A.map((e) => e.exerciseId), ['p1', 'p6', 'b1', 'b2'], 'peito (os 2 primeiros que a IA mandou, composto antes do isolado) e depois bíceps, só o que o plano pede');
    assert.ok(r.quality.fixes.some((f) => f.includes('repetido(s) no mesmo dia')) && r.quality.fixes.some((f) => f.includes('além do que o plano pediu')), r.quality.fixes.join()); assert.deepEqual(r.byDay.Z, input.Z, 'dia que o plano não tem passa direto (quem corta é a conferência do plano)');
    const comp = refineWorkout({ A: [gx(PEITO[5]), gx(PEITO[0]), gx(BICEPS[0]), gx(BICEPS[1])] }, mk()); assert.deepEqual(comp.byDay.A.map((e) => e.exerciseId), ['p1', 'p6', 'b1', 'b2'], 'composto vem antes do isolado dentro do grupo');
  });
  await t('refineWorkout: bi-set/tri-set dependem da ordem: o dia com técnica agrupada mantém a ordem da IA', () => {
    const r = refineWorkout({ A: [gx(PEITO[5], 3, 'BISET'), gx(PEITO[0], 3, 'BISET'), gx(BICEPS[0]), gx(BICEPS[1])] }, mk()); assert.deepEqual(r.byDay.A.map((e) => e.exerciseId), ['p6', 'p1', 'b1', 'b2']);
    const r2 = refineWorkout({ A: [gx(PEITO[5], 3, 'BISET'), gx(PEITO[0], 3, 'BISET'), gx(BICEPS[0])] }, mk()); assert.equal(r2.byDay.A.length, 4); assert.equal(r2.byDay.A[3].blocks[0].technique, '', 'o que entra para completar vai no fim, sem técnica');
  });
  await t('refineWorkout: séries pelo grupo (menos e mais), GVT/drop/21 mantêm a contagem própria, repetições dentro da faixa da fase', () => {
    const r = refineWorkout({ A: [gx(PEITO[0], 5, '', '', '5'), gx(PEITO[1], 1, '', '', '20'), gx(BICEPS[0], 3, 'DROPSET', '', '10'), gx(BICEPS[1], 3, '', '', '10-12')] }, mk()); const A = r.byDay.A;
    // (19 out 2026) séries que chegam todas com a mesma repetição viram pirâmide da fase (lib/ai/repSchemes.ts); a faixa continua mandando (nenhuma série fora de 8–15)
    const rp = (ex: GenEx) => ex.blocks.map((b) => Number(b.reps));
    assert.equal(A[0].blocks.length, 3); assert.ok(rp(A[0]).every((n) => n >= 8 && n <= 15) && new Set(rp(A[0])).size > 1 && rp(A[0])[0] >= rp(A[0])[2], '5 repetições nas 3 séries: sobe para a faixa e vira pirâmide ' + rp(A[0])); assert.equal(A[1].blocks.length, 3, '1 bloco vira 3 (repete o último)'); assert.ok(rp(A[1]).every((n) => n >= 8 && n <= 15) && new Set(rp(A[1])).size > 1, '20 desce para a faixa e vira pirâmide ' + rp(A[1]));
    assert.equal(A[2].blocks[0].technique, 'DROPSET'); assert.equal(A[3].blocks[0].reps, '10-12', 'faixa já dentro: intacta');
    assert.ok(r.quality.fixes.some((f) => f.includes('"Peito 1" tinha 5 séries, ajustado para 3')), r.quality.fixes.join());
    const g = refineWorkout({ A: [gx(PEITO[0], 10, 'GVT', '', '10'), gx(PEITO[1], 3, '21', '', '21'), gx(BICEPS[0]), gx(BICEPS[1])] }, mk({ phase: 'FORCA', level: 'AVANCADO' })); assert.equal(g.byDay.A[0].blocks.length, 10, 'GVT segue com 10 (nível avançado pode)'); assert.equal(g.byDay.A[1].blocks[0].reps, '21', '21 segue 21');
    assert.equal(g.byDay.A[2].blocks[0].reps, '6', 'FORCA: faixa 3–6 → 8 desce para 6'); const ini = refineWorkout({ A: [gx(PEITO[0], 3, '', '', '4'), gx(PEITO[1]), gx(BICEPS[0]), gx(BICEPS[1])] }, mk({ phase: 'FORCA', level: 'INICIANTE' })); assert.equal(ini.byDay.A[0].blocks[0].reps, '6', 'iniciante em força: piso 6, não 3–5');
  });
  await t('refineWorkout: técnica avançada demais para o nível sai (e o bi-set que ficou sozinho será desfeito pelo reparo existente); sem carga externa não tem drop/rest-pause', () => {
    const r = refineWorkout({ A: [gx(PEITO[0], 3, 'DROPSET'), gx(PEITO[1], 3, 'BISET'), gx(BICEPS[0], 3, 'TRISET'), gx(BICEPS[1])] }, mk({ level: 'INICIANTE' })); const A = r.byDay.A;
    assert.equal(A[0].blocks[0].technique, ''); assert.equal(A[1].blocks[0].technique, 'BISET', 'bi-set é permitido a iniciante'); assert.equal(A[2].blocks[0].technique, ''); assert.equal(r.quality.stats.techStripped, 6, '2 exercícios × 3 blocos');
    assert.ok(r.quality.fixes.some((f) => f.includes('tirou DROPSET de "Peito 1" (avançado para Iniciante)')), r.quality.fixes.join());
    const abs = [lib('w1', 'Flexão', 'PEITO', 'COMPOSTO', 'PESO_CORPORAL'), lib('w2', 'Flexão aberta', 'PEITO', 'COMPOSTO', 'PESO_CORPORAL'), ...BICEPS]; const dd: PlanDay[] = [{ name: 'A', groups: [{ id: 'PEITO', qty: 2, sets: 3 }, { id: 'BICEPS', qty: 1, sets: 3 }] }];
    const bw = refineWorkout({ A: [gx(abs[0], 3, 'DROPSET'), gx(abs[1], 3, 'BISET'), gx(BICEPS[0], 3, 'DROPSET')] }, mk({}, dd, abs)); assert.equal(bw.byDay.A[0].blocks[0].technique, '', 'peso do corpo: sem drop-set'); assert.equal(bw.byDay.A[1].blocks[0].technique, 'BISET'); assert.equal(bw.byDay.A[2].blocks[0].technique, 'DROPSET', 'com carga externa e nível ok: fica');
    const off = refineWorkout({ A: [gx(PEITO[0], 3, 'DROPSET'), gx(PEITO[1]), gx(BICEPS[0]), gx(BICEPS[1])] }, mk({ level: 'INICIANTE', levelRules: false })); assert.equal(off.byDay.A[0].blocks[0].technique, 'DROPSET', 'regras de nível desligadas: nada é tirado');
  });
  await t('refineWorkout: o que o aluno disse não ter (indisponível) nunca entra para completar nem como troca', () => {
    const un = new Set(['p2', 'p3', 'p4']); const r = refineWorkout({ A: [gx(PEITO[0]), gx(BICEPS[0]), gx(BICEPS[1])] }, mk({ unavailable: un }));
    const peito = r.byDay.A.filter((e) => tg(e) === 'PEITO').map((e) => e.exerciseId); assert.equal(peito.length, 2); assert.ok(!peito.some((id) => un.has(id)), 'completou com ' + peito.join());
    const prev: PrevRoutine = { name: 'F', days: { A: [PEITO[0], PEITO[5]].map(prevEx) } }; const facts = buildFacts([prev], []);
    const run = (u: string[]) => refineWorkout({ A: [gx(PEITO[5]), gx(PEITO[0]), gx(BICEPS[0]), gx(BICEPS[1])] }, mk({ hasPrev: true, unavailable: new Set(u) }, DAYS, LIB, [prev], facts)).byDay.A.map((e) => e.exerciseId);
    assert.deepEqual(run(['p2', 'p3', 'p4']).slice(0, 2).sort(), ['p1', 'p5'], 'a troca do p6 só pôde ser o p5 (p2–p4 indisponíveis)'); assert.ok(run(['p2', 'p3', 'p4', 'p5']).includes('p6'), 'sem nenhuma opção disponível, o p6 fica');
  });
  await t('refineWorkout: GVT/21 num aluno intermediário saem (nível) e o exercício volta às séries do grupo', () => {
    const r = refineWorkout({ A: [gx(PEITO[0], 10, 'GVT', '', '10'), gx(PEITO[1], 3, '21', '', '21'), gx(BICEPS[0]), gx(BICEPS[1])] }, mk()); const A = r.byDay.A;
    assert.ok(A[0].blocks.length === 3 && A[0].blocks.every((b) => b.technique === ''), JSON.stringify(A[0].blocks.length)); assert.ok(A[1].blocks.every((b) => b.technique === '' && b.reps !== '21'), 'sem o 21, a repetição volta para a faixa: ' + A[1].blocks[0].reps);
  });
  await t('refineWorkout: exercício complexo para iniciante é trocado por um simples do mesmo músculo', () => {
    const day: PlanDay[] = [{ name: 'A', groups: [{ id: 'QUADRICEPS', qty: 2, sets: 3 }] }];
    const r = refineWorkout({ A: [gx(QUAD[0], 3, '', '', '10'), gx(QUAD[1], 3, '', '', '10')] }, mk({ level: 'INICIANTE' }, day, QUAD)); const A = r.byDay.A;
    assert.ok(!A.some((e) => e.exerciseId === 'q1'), 'agachamento livre saiu'); assert.equal(A.length, 2); assert.ok(A.every((e) => tg(e) === 'QUADRICEPS')); assert.equal(r.quality.stats.swapped, 1); assert.ok(r.quality.fixes.some((f) => f.includes('"Agachamento livre" →') && f.includes('complexo demais para Iniciante')), r.quality.fixes.join());
    assert.equal(A.find((e) => e.exerciseId !== 'q2')!.blocks.length, 3, 'a troca herda séries e repetições');
    const av = refineWorkout({ A: [gx(QUAD[0]), gx(QUAD[1])] }, mk({ level: 'AVANCADO' }, day, QUAD)); assert.ok(av.byDay.A.some((e) => e.exerciseId === 'q1'), 'avançado mantém');
  });
  await t('refineWorkout: FIXADOS — entram no lugar do acessório (só tira âncora se não sobrar acessório; nunca tira outro fixado), a rotação e a regra de nível não mexem neles, sem vaga vira aviso', () => {
    const prev: PrevRoutine = { name: 'F', days: { A: [PEITO[0], PEITO[5]].map(prevEx) } }; const facts = buildFacts([prev], []);   // p1 = âncora (MANTER), p6 = acessório (TROCAR)
    const base = (pins: string[], input = [gx(PEITO[0]), gx(PEITO[1]), gx(BICEPS[0]), gx(BICEPS[1])]) => refineWorkout({ A: input }, mk({ hasPrev: true, pins: new Set(pins) }, DAYS, LIB, [prev], facts));
    let r = base(['p3'], [gx(PEITO[0]), gx(PEITO[5]), gx(BICEPS[0]), gx(BICEPS[1])]); assert.deepEqual(r.byDay.A.filter((e) => tg(e) === 'PEITO').map((e) => e.exerciseId).sort(), ['p1', 'p3'], 'entrou no lugar do acessório p6, a âncora p1 ficou'); assert.equal(r.quality.stats.pinned, 1); assert.ok(r.quality.fixes.some((f) => f.includes('"Peito 3" (fixado por você) entrou no lugar de "Peito 6"')), r.quality.fixes.join());
    assert.ok(r.byDay.A.find((e) => e.exerciseId === 'p3')!.blocks.every((b) => b.load === ''), 'o fixado novo começa com a carga em branco');
    r = base(['p3', 'p4'], [gx(PEITO[0]), gx(PEITO[5]), gx(BICEPS[0]), gx(BICEPS[1])]); assert.deepEqual(r.byDay.A.filter((e) => tg(e) === 'PEITO').map((e) => e.exerciseId).sort(), ['p3', 'p4'], 'dois fixados para duas vagas: sem acessório sobrando, o fixado vale mais que a âncora automática'); assert.equal(r.quality.stats.pinned, 2);
    r = base(['p3', 'p4', 'p5'], [gx(PEITO[0]), gx(PEITO[5]), gx(BICEPS[0]), gx(BICEPS[1])]); assert.equal(r.byDay.A.filter((e) => tg(e) === 'PEITO').length, 2, 'a vaga é do plano'); assert.ok(r.quality.issues.some((i) => i.includes('fixado não coube')), 'o terceiro fixado não cabe em 2 vagas: ' + r.quality.issues.join());
    r = base(['p3'], [gx(PEITO[2]), gx(PEITO[5]), gx(BICEPS[0]), gx(BICEPS[1])]); assert.ok(r.byDay.A.some((e) => e.exerciseId === 'p3') && !r.byDay.A.some((e) => e.exerciseId === 'p6' && false), 'já estava na rotina: nada a fazer'); assert.equal(r.quality.stats.pinned, 0);
    const day: PlanDay[] = [{ name: 'A', groups: [{ id: 'QUADRICEPS', qty: 2, sets: 3 }] }];
    const mkq = (pins: string[]) => mk({ level: 'INICIANTE', pins: new Set(pins) }, day, QUAD);
    assert.ok(refineWorkout({ A: [gx(QUAD[0]), gx(QUAD[1])] }, mkq(['q1'])).byDay.A.some((e) => e.exerciseId === 'q1'), 'fixado pelo coach vale mais que "complexo para iniciante"');
    assert.ok(!refineWorkout({ A: [gx(QUAD[0]), gx(QUAD[1])] }, mkq([])).byDay.A.some((e) => e.exerciseId === 'q1'), 'sem fixar, sai');
    const c = buildCandidates({ days: DAYS, library: LIB, facts: [], prev: [], level: null, env: 'X', levelRules: false, pins: new Set(['p6']) }); assert.equal(c.byGroup.get('PEITO')![0].id, 'p6', 'fixado no topo da lista do grupo');
    assert.ok(candidatesText(c, DAYS, [], new CodeBook(), 'X', new Set(['p6'])).includes('| FIXADO pelo coach (obrigatório)'));
    const fav = buildCandidates({ days: DAYS, library: [lib('f1', 'Aaa comum', 'BICEPS', 'ISOLADO', 'HALTER'), (() => { const x = lib('f2', 'Zzz favorito', 'BICEPS', 'ISOLADO', 'HALTER'); x.tags.favorite = true; return x; })()], facts: [], prev: [], level: null, env: 'X', levelRules: false }).byGroup.get('BICEPS')!.map((e) => e.id); assert.deepEqual(fav, ['f2', 'f1'], 'favorito do coach sobe');
  });
  await t('refineWorkout: ROTAÇÃO — o acessório que repetiu da rotina anterior vira outro; a âncora MANTER fica; carga do novo em branco', () => {
    const prev: PrevRoutine = { name: 'F', days: { A: [PEITO[0], PEITO[5], BICEPS[0], BICEPS[1]].map(prevEx) } };
    const facts = buildFacts([prev], hist([[{ id: 'p1', sets: [40, 40, 40] }], [{ id: 'p1', sets: [35, 35, 35] }]]));
    const ctx = mk({ loaded: new Set(['p1', 'b1']), hasPrev: true }, DAYS, LIB, [prev], facts);
    const r = refineWorkout({ A: [gx(PEITO[0], 3, '', '40kg'), gx(PEITO[5], 3, '', '15kg'), gx(BICEPS[0], 3, '', '10kg'), gx(BICEPS[1], 3, '', '10kg')] }, ctx); const A = r.byDay.A; const ids = A.map((e) => e.exerciseId);
    assert.ok(ids.includes('p1'), 'âncora que evolui continua'); assert.ok(!ids.includes('p6') && !ids.includes('b1') && !ids.includes('b2'), 'acessórios repetidos saíram: ' + ids.join());
    const novos = A.filter((e) => !['p1'].includes(e.exerciseId)); assert.equal(novos.length, 3); assert.ok(novos.every((e) => !['Peito 6', 'Biceps 1', 'Biceps 2'].includes(e.title) && e.blocks.every((b) => b.load === '')), 'carga do exercício novo em branco');
    assert.equal(r.quality.stats.swapped, 3); assert.equal(r.quality.stats.kept, 1); assert.equal(r.quality.stats.newPct, 75); assert.ok(r.quality.fixes.some((f) => f.includes('"Peito 6" →') && f.includes('repetido da rotina anterior — acessório')), r.quality.fixes.join());
    for (const e of A.filter((x) => tg(x) === 'BICEPS')) assert.equal(tg(e), 'BICEPS', 'a troca é do mesmo músculo');
    const sem = refineWorkout({ A: [gx(PEITO[0]), gx(PEITO[5]), gx(BICEPS[0]), gx(BICEPS[1])] }, mk()); assert.equal(sem.quality.stats.swapped, 0, 'sem rotina anterior não gira nada'); assert.equal(sem.quality.stats.newPct, null);
  });
  await t('refineWorkout: exercício repetido em outro dia da mesma rotina é trocado; cardio não gira', () => {
    const cardioDays: PlanDay[] = [{ name: 'A', groups: [{ id: 'PEITO', qty: 1, sets: 3 }, { id: 'CARDIO', qty: 1 }] }, { name: 'B', groups: [{ id: 'PEITO', qty: 1, sets: 3 }, { id: 'CARDIO', qty: 1 }] }];
    const cardio = (e: any): GenEx => ({ ...gx(e, 1), blocks: [{ sets: '30', reps: '300', load: '', restTime: '0', technique: 'Moderada' }] });
    const r = refineWorkout({ A: [gx(PEITO[0]), cardio(CARD[0])], B: [gx(PEITO[0]), cardio(CARD[0])] }, mk({}, cardioDays, LIB));
    assert.equal(r.byDay.A[0].exerciseId, 'p1'); assert.notEqual(r.byDay.B[0].exerciseId, 'p1'); assert.equal(tg(r.byDay.B[0]), 'PEITO'); assert.ok(r.quality.fixes.some((f) => f.includes('já aparece em outro dia')), r.quality.fixes.join());
    assert.equal(r.byDay.A[1].exerciseId, 'k1'); assert.equal(r.byDay.B[1].exerciseId, 'k1', 'cardio igual nos dois dias é normal'); assert.deepEqual(r.byDay.B[1].blocks, [{ sets: '30', reps: '300', load: '', restTime: '0', technique: 'Moderada' }], 'cardio nunca é mexido');
    const noCardio = refineWorkout({ A: [gx(PEITO[0])] }, mk({}, cardioDays, LIB)); assert.ok(noCardio.quality.issues.includes('Dia A: faltou cardio'), 'cardio que faltou não é inventado: vira aviso'); assert.equal(noCardio.byDay.A.length, 1);
  });
  await t('refineWorkout: sem alternativa na biblioteca o exercício fica e o aviso diz isso', () => {
    const tiny = [lib('t1', 'Único', 'PEITO'), ...BICEPS, ...COSTAS]; const day: PlanDay[] = [{ name: 'A', groups: [{ id: 'PEITO', qty: 2, sets: 3 }] }];
    const prev: PrevRoutine = { name: 'F', days: { A: [prevEx(tiny[0])] } }; const facts = buildFacts([prev], []);
    const r = refineWorkout({ A: [gx(tiny[0])] }, mk({ hasPrev: true }, day, tiny, [prev], facts));
    assert.equal(r.byDay.A.length, 1); assert.ok(r.quality.issues.some((i) => i.includes('faltou 1 exercício de PEITO')), r.quality.issues.join()); assert.equal(r.quality.stats.filled, 0);
    const keep = refineWorkout({ A: [gx(tiny[0]), gx(tiny[0])] }, mk({ hasPrev: true }, day, tiny, [prev], facts)); assert.equal(keep.byDay.A.length, 1);
  });
  await t('refineWorkout: carga só onde o aluno já treinou; nos que mantêm, a carga-alvo manda se a da IA estiver longe (e cada lado vem com a unidade)', () => {
    const prev: PrevRoutine = { name: 'F', days: { A: [PEITO[0], PEITO[1]].map(prevEx), B: [COSTAS[0]].map(prevEx) } };
    const facts = buildFacts([prev], hist([[{ id: 'p1', sets: [40, 40, 40], effort: 'FACIL' }, { id: 'p2', sets: [24, 24, 24], perSide: true, effort: 'FACIL' }]]));
    const ctx = mk({ loaded: new Set(['p1', 'p2']), hasPrev: true }, DAYS, LIB, [prev], facts); const alvo1 = facts.find((f) => f.exerciseId === 'p1')!.targetLoads[0];
    const near = Math.round(alvo1 * 1.1); const r = refineWorkout({ A: [gx(PEITO[0], 3, '', '10kg'), gx(PEITO[1], 3, '', '2kg'), gx(BICEPS[0], 3, '', '12kg'), gx(BICEPS[1], 3, '', '12kg')], B: [gx(COSTAS[0], 3, '', '30kg'), gx(COSTAS[1], 3, '', '30kg'), gx(BICEPS[2], 3, '', '')] }, ctx);
    const a1 = r.byDay.A.find((e) => e.exerciseId === 'p1'); const a2 = r.byDay.A.find((e) => e.exerciseId === 'p2');
    assert.ok(a1 && a1.blocks.every((b) => b.load === `${alvo1}kg`), 'IA pôs 10kg, alvo é ' + alvo1 + ': vale o alvo: ' + JSON.stringify(a1?.blocks.map((b) => b.load)));
    assert.ok(a2 && a2.blocks.every((b) => /^\d+(\.\d+)?kg cada lado$/.test(b.load)), 'cada lado: ' + JSON.stringify(a2?.blocks.map((b) => b.load)));
    assert.ok(r.byDay.A.filter((e) => !['p1', 'p2'].includes(e.exerciseId)).every((e) => e.blocks.every((b) => b.load === '')), 'exercício que ele nunca fez: sem carga'); assert.ok(r.byDay.B.every((e) => e.blocks.every((b) => b.load === '')), 'costas nunca treinadas: em branco');
    const keepNear = refineWorkout({ A: [gx(PEITO[0], 3, '', `${near}kg`), gx(PEITO[1]), gx(BICEPS[0]), gx(BICEPS[1])] }, ctx); assert.ok(keepNear.byDay.A.find((e) => e.exerciseId === 'p1')!.blocks.every((b) => b.load === `${near}kg`), 'a carga da IA dentro de 25% do alvo passa');
    assert.ok(r.quality.stats.loadsFixed >= 3);
  });
  await t('refineWorkout: nota e avisos — mais empurrar que puxar, volume, pouca novidade; nota = 100 − 10 por aviso', () => {
    const push: PlanDay[] = [{ name: 'A', groups: [{ id: 'PEITO', qty: 4, sets: 4 }] }];
    const r = refineWorkout({ A: PEITO.slice(0, 4).map((e) => gx(e, 4)) }, mk({}, push));
    assert.equal(r.quality.stats.groupSets.PEITO, 16); assert.ok(r.quality.issues.some((i) => i.startsWith('Mais empurrar (16 séries) do que puxar (0)')), r.quality.issues.join());
    const low = refineWorkout({ A: [gx(PEITO[0], 3), gx(PEITO[1], 3)] }, mk({}, [{ name: 'A', groups: [{ id: 'PEITO', qty: 2, sets: 2 }] }])); assert.ok(low.quality.issues.some((i) => i === 'Volume baixo: PEITO com 4 séries na semana'), low.quality.issues.join());
    const bal = refineWorkout({ A: [gx(PEITO[0], 3), gx(PEITO[1], 3), gx(BICEPS[0]), gx(BICEPS[1])], B: [gx(COSTAS[0], 4), gx(COSTAS[1], 4), gx(BICEPS[2], 3)] }, mk()); assert.deepEqual(bal.quality.issues, [], 'equilibrado: sem avisos'); assert.equal(bal.quality.score, 100);
    assert.equal(r.quality.score, 100 - 10 * r.quality.issues.length);
    const prev: PrevRoutine = { name: 'F', days: { A: [PEITO[4], PEITO[5]].map(prevEx) } };
    const few = refineWorkout({ A: [gx(PEITO[4]), gx(PEITO[5])] }, mk({ hasPrev: true }, [{ name: 'A', groups: [{ id: 'PEITO', qty: 2, sets: 3 }] }], [PEITO[4], PEITO[5]], [prev], buildFacts([prev], []))); assert.ok(few.quality.issues.some((i) => i.startsWith('Só 0% dos exercícios são novos')), few.quality.issues.join());
  });
  await t('refineWorkout: dia que a IA nem mandou, ou mandou vazio, fica como está (a conferência do plano decide)', () => {
    const r = refineWorkout({ A: [], B: undefined as any }, mk()); assert.deepEqual(r.byDay.A, []); assert.equal(r.byDay.B, undefined); assert.equal(r.quality.stats.filled, 0);
    assert.equal(r.quality.stats.exercises, 0);
  });


  // ═════ 🔗 substituto = opção de troca, nunca 2 exercícios no mesmo dia (25 out 2026) ═════
  const calf = (id: string, name: string, subs: string[] = [], eq = 'MAQUINA') => ({ ...lib(id, name, 'PANTURRILHA', 'ISOLADO', eq), defaultSubstitutes: subs });
  const CALF = [calf('f1', 'Panturrilha máquina', ['f2']), calf('f2', 'Panturrilha no Smith', ['f1'], 'BARRA'), calf('f3', 'Panturrilha no banco', [], 'LIVRE')];
  const calfDays: PlanDay[] = [{ name: 'A', groups: [{ id: 'PANTURRILHA', qty: 2, sets: 4, rest: 30 }] }];
  await t('subFamily: ligação direta nos dois sentidos (só um lado listando já vale), sem "amigo do amigo", sem nada quando não há tag', () => {
    const l = buildSubLinks([{ id: 'a', defaultSubstitutes: ['b'] }, { id: 'b', defaultSubstitutes: ['c'] }, { id: 'c' }, { id: 'd', defaultSubstitutes: null }]);
    assert.ok(areLinked(l, 'a', 'b') && areLinked(l, 'b', 'a'), 'A lista B: B também enxerga A'); assert.ok(areLinked(l, 'b', 'c') && areLinked(l, 'c', 'b'));
    assert.ok(!areLinked(l, 'a', 'c'), 'a~b e b~c NÃO fazem a~c (a tag errada de um não junta movimentos diferentes)'); assert.ok(!areLinked(l, 'a', 'd') && !areLinked(l, 'a', 'a'));
    assert.ok(linkedToAny(l, 'a', ['x', 'b']) && !linkedToAny(l, 'a', ['c', 'd'])); assert.deepEqual([...linkedIds(l, ['a', 'c'])].sort(), ['b']);
    assert.equal(buildSubLinks(undefined).size, 0); assert.ok(!areLinked(undefined, 'a', 'b') && !linkedToAny(null, 'a', ['b'])); assert.equal(linkedIds(undefined, ['a']).size, 0);
  });
  await t('cardápio: de uma dupla de substitutos só um entra (o outro continua como opção de troca); sem ligações, tudo como antes', () => {
    const links = buildSubLinks(CALF);
    const ids = (sl?: any) => buildCandidates({ days: calfDays, library: CALF, facts: [], prev: [], level: null, env: 'X', levelRules: false, subLinks: sl }).byGroup.get('PANTURRILHA')!.map((e) => e.id).sort();
    assert.deepEqual(ids(), ['f1', 'f2', 'f3'], 'sem ligações: os 3'); const w = ids(links);
    assert.equal(w.length, 2); assert.ok(w.includes('f3'), 'o banco (outro movimento) fica'); assert.equal(w.filter((x) => x === 'f1' || x === 'f2').length, 1, 'um só da dupla máquina/Smith');
  });
  await t('refineWorkout: a IA põe máquina E Smith no mesmo dia → fica a máquina, e o 2º de panturrilha vira OUTRO movimento (banco), nunca o Smith', () => {
    const links = buildSubLinks(CALF);
    const r = refineWorkout({ A: [gx(CALF[0], 4), gx(CALF[1], 4)] }, mk({ subLinks: links }, calfDays, CALF));
    assert.deepEqual(r.byDay.A.map((e) => e.exerciseId).sort(), ['f1', 'f3'], r.byDay.A.map((e) => e.title).join());
    assert.ok(r.quality.fixes.some((f) => f.includes('substituto não entra como 2º exercício') && f.includes('Panturrilha no Smith')), r.quality.fixes.join('|'));
    const off = refineWorkout({ A: [gx(CALF[0], 4), gx(CALF[1], 4)] }, mk({}, calfDays, CALF)); assert.deepEqual(off.byDay.A.map((e) => e.exerciseId).sort(), ['f1', 'f2'], 'sem as ligações o comportamento antigo segue igual');
  });
  await t('refineWorkout: completar vaga nunca escolhe o substituto de quem já está no dia; só 1 de panturrilha pedido não muda nada', () => {
    const links = buildSubLinks(CALF);
    const r = refineWorkout({ A: [gx(CALF[0], 4)] }, mk({ subLinks: links }, calfDays, CALF)); assert.deepEqual(r.byDay.A.map((e) => e.exerciseId).sort(), ['f1', 'f3']);
    const one = refineWorkout({ A: [gx(CALF[1], 4)] }, mk({ subLinks: links }, [{ name: 'A', groups: [{ id: 'PANTURRILHA', qty: 1, sets: 4, rest: 30 }] }], CALF)); assert.deepEqual(one.byDay.A.map((e) => e.exerciseId), ['f2'], '1 vaga: o Smith que a IA escolheu fica');
    const only = [CALF[0], CALF[1]]; const r2 = refineWorkout({ A: [gx(CALF[0], 4)] }, mk({ subLinks: buildSubLinks(only) }, calfDays, only));
    assert.deepEqual(r2.byDay.A.map((e) => e.exerciseId).sort(), ['f1', 'f2'], 'sem outro movimento na biblioteca: melhor o substituto do que o dia incompleto'); assert.ok(r2.quality.issues.some((i) => i.includes('é substituto de outro exercício do dia')), r2.quality.issues.join());
    const ring = [1, 2, 3, 4, 5, 6].map((n) => ({ ...lib(`r${n}`, `Anel ${n}`, 'PANTURRILHA', 'ISOLADO'), defaultSubstitutes: [`r${n === 6 ? 1 : n + 1}`] })); const rr = refineWorkout({ A: [gx(ring[0], 4), gx(ring[1], 4)] }, mk({ subLinks: buildSubLinks(ring) }, calfDays, ring));
    assert.equal(rr.byDay.A.length, 2, 'biblioteca com tags em anel: o dia continua completo'); assert.ok(!areLinked(buildSubLinks(ring), rr.byDay.A[0].exerciseId, rr.byDay.A[1].exerciseId), 'e os dois não são substitutos um do outro');
  });
  await t('refineWorkout: dias diferentes podem usar versões diferentes (máquina no A, Smith no B); fixado pelo coach nunca é tirado', () => {
    const links = buildSubLinks(CALF);
    const days: PlanDay[] = [{ name: 'A', groups: [{ id: 'PANTURRILHA', qty: 1, sets: 4, rest: 30 }] }, { name: 'B', groups: [{ id: 'PANTURRILHA', qty: 1, sets: 4, rest: 30 }] }];
    const r = refineWorkout({ A: [gx(CALF[0], 4)], B: [gx(CALF[1], 4)] }, mk({ subLinks: links }, days, CALF)); assert.deepEqual([r.byDay.A[0].exerciseId, r.byDay.B[0].exerciseId], ['f1', 'f2'], 'a regra é por dia');
    const both = refineWorkout({ A: [gx(CALF[0], 4), gx(CALF[1], 4)] }, mk({ subLinks: links, pins: new Set(['f2']) }, calfDays, CALF)); assert.deepEqual(both.byDay.A.map((e) => e.exerciseId).sort(), ['f1', 'f2'], 'o Smith está fixado: não é tirado');
  });
  await t('cardio fica fora da regra: esteira e bicicleta ligadas como substitutas podem entrar juntas no mesmo dia', () => {
    const K = [{ ...lib('k1', 'Esteira', 'CARDIO', 'ISOLADO'), defaultSubstitutes: ['k2'] }, { ...lib('k2', 'Bike', 'CARDIO', 'ISOLADO'), defaultSubstitutes: ['k1'] }];
    const days: PlanDay[] = [{ name: 'A', groups: [{ id: 'CARDIO', qty: 2 }] }];
    const r = refineWorkout({ A: [gx(K[0], 1), gx(K[1], 1)] }, mk({ subLinks: buildSubLinks(K) }, days, K)); assert.deepEqual(r.byDay.A.map((e) => e.exerciseId).sort(), ['k1', 'k2']);
    const c = buildCandidates({ days, library: K, facts: [], prev: [], level: null, env: 'X', levelRules: false, subLinks: buildSubLinks(K) }).byGroup.get('CARDIO')!; assert.equal(c.length, 2);
  });
  await t('refineWorkout: a rotação (troca por repetir da rotina anterior) não cai no substituto de outro exercício do mesmo dia', () => {
    // bíceps: b1 repetido da rotina anterior vai ser trocado; b2 é o substituto de b3, que já está no dia → a troca tem que escolher b4 ou b5, nunca b2
    const B = [1, 2, 3, 4, 5].map((n) => ({ ...lib(`bb${n}`, `Rosca ${n}`, 'BICEPS', 'ISOLADO', 'HALTER'), defaultSubstitutes: n === 2 ? ['bb3'] : [] }));
    const prev: PrevRoutine = { name: 'Ant', days: { A: [B[0]].map(prevEx) } }; const days: PlanDay[] = [{ name: 'A', groups: [{ id: 'BICEPS', qty: 2, sets: 3, rest: 30 }] }];
    const facts = buildFacts([prev], [], new Date());
    const r = refineWorkout({ A: [gx(B[0], 3), gx(B[2], 3)] }, mk({ subLinks: buildSubLinks(B), hasPrev: true }, days, B, [prev], facts));
    const ids = r.byDay.A.map((e) => e.exerciseId); assert.ok(!ids.includes('bb2'), 'não pode vir o substituto de bb3: ' + ids.join()); assert.ok(ids.includes('bb3'));
  });

  console.log(`\n${ok} verificações do planejador de treino`);
})();
