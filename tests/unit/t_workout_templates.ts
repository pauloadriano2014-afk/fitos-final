import assert from 'assert';
import * as T from '/home/user/fitos-final/lib/workoutTemplates';

(async () => {
  // ═════ 1) marcas no nome ═════
  assert.equal(T.norm('Glúteos · ÁCIDO'), 'gluteos · acido'); assert.equal(T.norm(null), '');
  const tg = (name: string, level: any = null) => T.parseTags({ name, level });
  assert.deepEqual(tg('Feminino | Academia | Fase 1'), { gender: 'Feminino', env: 'ACADEMIA_PADRAO', level: null, phase: 1, focus: null, objective: null });
  assert.deepEqual(tg('Glúteos Fem Casa F2', 'Intermediário'), { gender: 'Feminino', env: 'EM_CASA', level: 'INTERMEDIARIO', phase: 2, focus: 'Glúteos', objective: null });
  assert.deepEqual(tg('Perder peso Masc', 'Avançado'), { gender: 'Masculino', env: null, level: 'AVANCADO', phase: null, focus: null, objective: 'FAT' });
  assert.deepEqual(tg('Treino A'), { gender: null, env: null, level: null, phase: null, focus: null, objective: null });
  for (const [n, g] of [['MULHER', 'Feminino'], ['mulheres', 'Feminino'], ['Feminina', 'Feminino'], ['FEM', 'Feminino'], ['homem', 'Masculino'], ['Homens', 'Masculino'], ['MASC', 'Masculino'], ['masculina', 'Masculino']] as const) assert.equal(tg(n).gender, g, n);
  for (const n of ['Femur', 'Mascara', 'infemina']) assert.equal(tg(n).gender, null, n + ' não é gênero');
  assert.equal(tg('Treino em casa').env, 'EM_CASA'); assert.equal(tg('Condomínio').env, 'CONDOMINIO'); assert.equal(tg('ACADEMIA completa').env, 'ACADEMIA_PADRAO'); assert.equal(tg('Casamento').env, null, '"casa" só como palavra');
  assert.equal(tg('Fase 2').phase, 2); assert.equal(tg('F1').phase, 1); assert.equal(tg('fase1').phase, 1); assert.equal(tg('Fase 3').phase, null); assert.equal(tg('Fase 12').phase, null); assert.equal(tg('F3').phase, null);
  for (const [n, f] of [['Glúteos', 'Glúteos'], ['gluteo', 'Glúteos'], ['Pernas', 'Pernas'], ['costas', 'Costas'], ['Peito', 'Peito'], ['Peitoral', 'Peito'], ['ombros', 'Ombros'], ['Braços', 'Braços'], ['bracos', 'Braços'], ['Abdômen', 'Abdômen'], ['abdomen', 'Abdômen'], ['Equilibrado', T.FOCUS_EQUILIBRADO], ['corpo todo', T.FOCUS_EQUILIBRADO], ['Full Body', T.FOCUS_EQUILIBRADO], ['fullbody', T.FOCUS_EQUILIBRADO]] as const) assert.equal(tg(n).focus, f, n);
  for (const [n, o] of [['Emagrecer', 'FAT'], ['perder peso', 'FAT'], ['Queima total', 'FAT'], ['Hipertrofia', null], ['Foco glúteos', null]] as const) assert.equal(tg(n).objective, o, n);
  assert.equal(tg('x', 'Iniciante').level, 'INICIANTE'); assert.equal(tg('x', 'INTERMEDIÁRIO').level, 'INTERMEDIARIO'); assert.equal(tg('x', 'avançado').level, 'AVANCADO'); assert.equal(tg('x', 'Todos').level, null); assert.equal(tg('x', undefined).level, null);
  // as palavras de foco batem com as áreas que o aluno escolhe no app (FOCUS_GROUPS do servidor)
  const AP = await import('/home/user/fitos-final/lib/autoPlan'); for (const area of AP.FOCUS_OPTIONS) assert.equal(tg(area).focus, area, 'o nome da área "' + area + '" é reconhecido');
  assert.equal(T.FOCUS_EQUILIBRADO, AP.FOCUS_NONE);
  for (const [k, re] of Object.entries(T.COLLECTION_PATTERNS)) assert.ok(re instanceof RegExp, k);
  for (const n of ['DESAFIO 21 DIAS', 'Desafio de 21 dias', '21 dias', 'Desafio 21']) assert.ok(T.COLLECTION_PATTERNS.CHALLENGE_21.test(T.norm(n)), n);
  for (const n of ['FICHA 8 SEMANAS', 'Ficha de 8 semanas', '8 semanas', 'ficha 8 sem']) assert.ok(T.COLLECTION_PATTERNS.FICHA_8S.test(T.norm(n)), n);
  for (const n of ['21 - desafio']) assert.ok(T.COLLECTION_PATTERNS.CHALLENGE_21.test(T.norm(n)), n);
  for (const n of ['Ficha 8', '8 primeiras semanas', '8sem', '8 semana']) assert.ok(T.COLLECTION_PATTERNS.FICHA_8S.test(T.norm(n)), n);
  for (const n of ['Treinos de peito', 'Ficha 12 semanas', 'Desafio 30 dias']) assert.ok(!T.COLLECTION_PATTERNS.CHALLENGE_21.test(T.norm(n)) && !T.COLLECTION_PATTERNS.FICHA_8S.test(T.norm(n)), n + ' não é pasta de nenhum dos dois planos');
  assert.ok(!T.COLLECTION_PATTERNS.FICHA_8S.test(T.norm('Desafio 21 dias')) && !T.COLLECTION_PATTERNS.CHALLENGE_21.test(T.norm('Ficha 8 semanas')), 'uma pasta não vale para o outro plano');

  // ═════ 2) nota do modelo para o aluno ═════
  const S: T.TemplateStudent = { gender: 'Feminino', level: 'INTERMEDIARIO', env: 'ACADEMIA_PADRAO', fatLoss: false, focus: 'Glúteos', phase: 1, phases: 2 };
  const none = { gender: null, env: null, level: null, phase: null, focus: null, objective: null } as T.TemplateTags;
  const sc = (tags: Partial<T.TemplateTags>, kind: any = 'FICHA_8S', st: Partial<T.TemplateStudent> = {}) => T.scoreTemplate({ ...none, ...tags }, kind, { ...S, ...st });
  assert.equal(sc({}), 0, 'sem marca nenhuma serve (ficha com foco: 0)'); assert.equal(sc({}, 'FICHA_8S', { focus: null }), 1, 'sem marca para quem não tem foco: +1');
  assert.equal(sc({ gender: 'Feminino' }), 2); assert.equal(sc({ gender: 'Masculino' }), null, 'gênero errado nunca serve'); assert.equal(sc({ gender: 'Masculino' }, 'FICHA_8S', { gender: null }), 0, 'aluno sem gênero informado: não exclui');
  assert.equal(sc({ env: 'ACADEMIA_PADRAO' }), 1); assert.equal(sc({ env: 'EM_CASA' }), 0, 'treino de casa serve para quem tem academia'); assert.equal(sc({ env: 'CONDOMINIO' }), 0);
  assert.equal(sc({ env: 'ACADEMIA_PADRAO' }, 'FICHA_8S', { env: 'EM_CASA' }), null, 'treino de academia não serve para quem treina em casa'); assert.equal(sc({ env: 'CONDOMINIO' }, 'FICHA_8S', { env: 'EM_CASA' }), null); assert.equal(sc({ env: 'ACADEMIA_PADRAO' }, 'FICHA_8S', { env: 'CONDOMINIO' }), null); assert.equal(sc({ env: 'EM_CASA' }, 'FICHA_8S', { env: 'EM_CASA' }), 1);
  assert.equal(sc({ level: 'INTERMEDIARIO' }), 3); assert.equal(sc({ level: 'INICIANTE' }), 0, 'um degrau de diferença: serve, sem pontos'); assert.equal(sc({ level: 'AVANCADO' }), 0); assert.equal(sc({ level: 'AVANCADO' }, 'FICHA_8S', { level: 'INICIANTE' }), null, 'dois degraus: não serve'); assert.equal(sc({ level: 'INICIANTE' }, 'FICHA_8S', { level: 'AVANCADO' }), null);
  assert.equal(sc({ phase: 1 }), 3); assert.equal(sc({ phase: 2 }), null, 'fase errada'); assert.equal(sc({ phase: 2 }, 'FICHA_8S', { phase: 2 }), 3); assert.equal(sc({ phase: 2 }, 'CHALLENGE_21', { phases: 1 }), 0, 'desafio tem uma fase só: a marca de fase é ignorada');
  assert.equal(sc({ focus: 'Glúteos' }), 4); assert.equal(sc({ focus: 'Costas' }), null, 'foco de outra área'); assert.equal(sc({ focus: T.FOCUS_EQUILIBRADO }), null, 'equilibrado não serve para quem escolheu uma área'); assert.equal(sc({ focus: T.FOCUS_EQUILIBRADO }, 'FICHA_8S', { focus: null }), 2); assert.equal(sc({ focus: 'Glúteos' }, 'FICHA_8S', { focus: null }), null, 'modelo de foco não serve para quem não tem foco');
  assert.equal(sc({ focus: 'Glúteos' }, 'FICHA_8S', { fatLoss: true, focus: null }), null, 'perder peso não usa modelo de foco'); assert.equal(sc({ focus: 'Costas' }, 'CHALLENGE_21', { focus: null }), 0, 'desafio ignora o foco do modelo');
  assert.equal(sc({ objective: 'FAT' }, 'FICHA_8S', { fatLoss: true, focus: null }), 3, 'modelo de emagrecer para quem quer perder peso'); assert.equal(sc({ objective: 'FAT' }), null, 'modelo de emagrecer não serve para quem quer músculo'); assert.equal(sc({ objective: 'FAT' }, 'CHALLENGE_21', { fatLoss: false }), 0, 'desafio ignora o objetivo do modelo');
  assert.equal(sc({ gender: 'Feminino', env: 'ACADEMIA_PADRAO', level: 'INTERMEDIARIO', phase: 1, focus: 'Glúteos' }), 2 + 1 + 3 + 3 + 4, 'as notas somam');

  // ═════ 3) ordem dos modelos ═════
  const row = (id: string, name: string, level: string | null = null, data = '{}') => ({ id, name, level, goal: 'Hipertrofia', data } as T.TemplateRow);
  const ranked = T.rankTemplates([row('1', 'Zeta fem fase 1'), row('2', 'Alfa'), row('3', 'Beta fem fase 1'), row('4', 'Masc fase 1'), row('5', 'Costas fase 1'), row('6', 'Glúteos fem fase 1')], 'FICHA_8S', S);
  assert.deepEqual(ranked.map((x) => x.id), ['6', '3', '1', '2'], 'melhor nota primeiro, empate por ordem alfabética; os que não servem saem (masc, costas)');
  assert.deepEqual(T.rankTemplates([], 'FICHA_8S', S), []); const input = [row('1', 'B'), row('2', 'A')]; T.rankTemplates(input, 'FICHA_8S', S); assert.deepEqual(input.map((x) => x.id), ['1', '2'], 'não reordena o original');

  // ═════ 4) conteúdo do modelo ═════
  assert.equal(T.parseTemplateData('lixo'), null); assert.equal(T.parseTemplateData('[]'), null); assert.equal(T.parseTemplateData('null'), null); assert.equal(T.parseTemplateData('{}'), null); assert.equal(T.parseTemplateData('{"A":[]}'), null); assert.equal(T.parseTemplateData('{"A":"x"}'), null); assert.equal(T.parseTemplateData('[[{"exerciseId":"1"}]]'), null, 'lista de listas não é modelo'); assert.equal(T.parseTemplateData('"abc"'), null); assert.equal(T.parseTemplateData('5'), null);
  assert.deepEqual(Object.keys(T.parseTemplateData('{"A":[{"exerciseId":"1"}],"B":[],"C":[{"exerciseId":"2"}]}')!), ['A', 'C'], 'aba vazia não conta');
  assert.deepEqual(T.templateExerciseIds('{"A":[{"exerciseId":"1"},{"exerciseId":"2"}],"B":[{"exerciseId":"1"},{"x":1}]}').sort(), ['1', '2']); assert.deepEqual(T.templateExerciseIds('lixo'), []);
  const lib = new Map<string, T.LibraryExercise>([
    ['e1', { id: 'e1', category: 'Peito', tags: {}, environments: ['UNIVERSAL'] }], ['e2', { id: 'e2', category: 'Costas', tags: { jointRisk: ['lombar'] }, environments: ['ACADEMIA_PADRAO'] }],
    ['e3', { id: 'e3', category: 'Cardio', tags: { jointRisk: [] }, environments: [] }], ['e4', { id: 'e4', category: 'Pernas', tags: { jointRisk: ['JOELHO', 'LOMBAR'] }, environments: ['EM_CASA', 'CONDOMINIO'] }], ['e5', { id: 'e5', category: 'Ombro', tags: null, environments: null }],
  ]);
  const ex = (id: string, extra: any = {}) => ({ exerciseId: id, title: id.toUpperCase(), blocks: [{ sets: '1', reps: '12', load: '10kg', restTime: '60', technique: '' }], ...extra });
  const data = (o: any) => JSON.stringify(o);
  const home = { env: 'EM_CASA' as T.Env, risks: [] as string[], careful: false }, gym = { env: 'ACADEMIA_PADRAO' as T.Env, risks: [] as string[], careful: false };
  let ins = T.inspectTemplate(data({ A: [ex('e1'), ex('e3')], B: [ex('e5')] }), lib, gym); assert.equal(ins.ok, true); assert.deepEqual(ins.tabs, ['A', 'B']); assert.deepEqual(ins.byDay.A.map((e: any) => e.exerciseId), ['e1', 'e3']); assert.equal(ins.byDay.A[1].category, 'Cardio', 'a categoria vem da biblioteca quando o modelo não traz'); assert.deepEqual(ins.notes, []);
  assert.equal(T.inspectTemplate(data({ A: [ex('e1', { category: 'Meu' })] }), lib, gym).byDay.A[0].category, 'Meu', 'a categoria do modelo vale quando existe');
  ins = T.inspectTemplate(data({ A: [{ exerciseId: 'e1' }, { exerciseId: 'e1', blocks: [] }] }), lib, gym); assert.deepEqual(ins.byDay.A[0].blocks, [{ sets: '3', reps: '10', load: '', restTime: '60', technique: '' }], 'sem blocos: série padrão'); assert.equal(ins.byDay.A[1].blocks.length, 1);
  // motivo cita o exercício pelo título, depois pelo nome, depois pelo id
  const why = (e: any, st: any) => T.inspectTemplate(data({ A: [e] }), lib, st).reason!;
  assert.ok(why({ exerciseId: 'e2', title: 'Remada' }, home).includes('"Remada"')); assert.ok(why({ exerciseId: 'e2', name: 'Puxada' }, home).includes('"Puxada"')); assert.ok(why({ exerciseId: 'e2' }, home).includes('"e2"'));
  assert.ok(why({ exerciseId: 'e2', title: 'T1', name: 'N1' }, home).includes('"T1"') && !why({ exerciseId: 'e2', title: 'T1', name: 'N1' }, home).includes('N1'));
  const lombar = { ...gym, risks: ['LOMBAR'] };
  assert.ok(why({ exerciseId: 'e4', title: 'Terra' }, lombar).includes('"Terra"') && why({ exerciseId: 'e4', title: 'Terra' }, lombar).includes('LOMBAR')); assert.ok(why({ exerciseId: 'e4', name: 'Stiff' }, lombar).includes('"Stiff"')); assert.ok(why({ exerciseId: 'e4' }, lombar).includes('"e4"'));
  assert.ok(why({ exerciseId: 'e4', title: 'T1', name: 'N1' }, lombar).includes('"T1"') && !why({ exerciseId: 'e4', title: 'T1', name: 'N1' }, lombar).includes('N1'));
  assert.ok(why({ exerciseId: 'e4', title: 'Terra' }, { ...gym, risks: ['JOELHO', 'LOMBAR'] }).includes('JOELHO/LOMBAR'), 'lista as articulações do aluno');
  // exercício que não existe mais
  ins = T.inspectTemplate(data({ A: [ex('e1'), ex('e3'), ex('e5'), ex('e5b'), ex('e2'), ex('e1b'), ex('e3b'), ex('zz')] }), lib, gym); assert.equal(ins.ok, false); assert.ok(ins.reason!.includes('4 de 8'), ins.reason);
  ins = T.inspectTemplate(data({ A: [ex('e1'), ex('e3'), ex('e5'), ex('x')] }), lib, gym); assert.equal(ins.ok, true, '1 de 4 (25%) ainda passa'); assert.equal(ins.byDay.A.length, 3); assert.deepEqual(ins.notes, ['1 exercício(s) do modelo não existem mais na biblioteca e ficaram de fora']);
  ins = T.inspectTemplate(data({ A: [ex('e1'), ex('x'), ex('y')] }), lib, gym); assert.equal(ins.ok, false); assert.ok(ins.reason!.includes('2 de 3'));
  ins = T.inspectTemplate(data({ A: [ex('x')] }), lib, gym); assert.equal(ins.ok, false); assert.equal(ins.reason, 'nenhum exercício do modelo existe mais na biblioteca'); assert.equal(T.inspectTemplate(data({ A: [{ nome: 'sem id' }] }), lib, gym).ok, false);
  ins = T.inspectTemplate(data({ A: [ex('e1'), ex('x')], B: [ex('y')] }), lib, gym); assert.equal(ins.ok, false, 'aba inteira sumiu e 2 de 3 faltam');
  assert.equal(T.inspectTemplate('lixo', lib, gym).ok, false); assert.equal(T.inspectTemplate('lixo', lib, gym).reason, 'modelo vazio ou ilegível');
  // ambiente
  ins = T.inspectTemplate(data({ A: [ex('e2')] }), lib, home); assert.equal(ins.ok, false); assert.ok(ins.reason!.includes('equipamento'), ins.reason); assert.equal(T.inspectTemplate(data({ A: [ex('e2')] }), lib, gym).ok, true, 'academia aceita tudo');
  assert.equal(T.inspectTemplate(data({ A: [ex('e1'), ex('e3'), ex('e4'), ex('e5')] }), lib, home).ok, true, 'UNIVERSAL, sem ambiente cadastrado e o próprio ambiente servem'); assert.equal(T.inspectTemplate(data({ A: [ex('e4')] }), lib, { env: 'CONDOMINIO', risks: [], careful: false }).ok, true); assert.equal(T.inspectTemplate(data({ A: [ex('e4')] }), lib, { env: 'ACADEMIA_PADRAO', risks: [], careful: false }).ok, true);
  assert.equal(T.inspectTemplate(data({ A: [ex('e2')] }), lib, { env: 'CONDOMINIO', risks: [], careful: false }).ok, false, 'academia padrão não serve para condomínio');
  // articulação
  ins = T.inspectTemplate(data({ A: [ex('e1'), ex('e4')] }), lib, { ...gym, risks: ['JOELHO'] }); assert.equal(ins.ok, false); assert.ok(ins.reason!.includes('JOELHO'), ins.reason); assert.equal(T.inspectTemplate(data({ A: [ex('e1'), ex('e4')] }), lib, { ...gym, risks: ['OMBRO'] }).ok, true, 'risco de outra articulação não conta');
  assert.equal(T.inspectTemplate(data({ A: [ex('e2')] }), lib, { ...gym, risks: ['LOMBAR'] }).ok, false, 'a etiqueta da biblioteca em minúsculas também vale'); assert.equal(T.inspectTemplate(data({ A: [ex('e5')] }), lib, { ...gym, risks: ['JOELHO'] }).ok, true, 'sem etiqueta: segue');
  // modo seguro
  const tech = (t: string) => data({ A: [ex('e1', { blocks: [{ sets: '1', reps: '10', load: '', restTime: '60', technique: t }, { sets: '1', reps: '10', load: '', restTime: '60', technique: t }] })] });
  for (const t of ['GVT', '21', 'CLUSTERSET', 'gvt']) { const r = T.inspectTemplate(tech(t), lib, { ...gym, careful: true }); assert.equal(r.ok, false, t); assert.ok(r.reason!.includes('modo seguro')); assert.equal(T.inspectTemplate(tech(t), lib, gym).ok, true, t + ' normal passa'); }
  for (const t of ['DROPSET', 'RESTPAUSE', 'TRISET', '1_5_REPS', 'TUT', 'dropset']) { const r = T.inspectTemplate(tech(t), lib, { ...gym, careful: true }); assert.equal(r.ok, true, t); assert.deepEqual(r.byDay.A[0].blocks.map((b: any) => b.technique), ['', ''], t + ' vira série normal'); assert.deepEqual(T.inspectTemplate(tech(t), lib, gym).byDay.A[0].blocks.map((b: any) => b.technique), [t, t], t + ': sem modo seguro, intacto'); }
  assert.deepEqual(T.inspectTemplate(tech('BISET'), lib, { ...gym, careful: true }).byDay.A[0].blocks.map((b: any) => b.technique), ['BISET', 'BISET'], 'BISET fica'); assert.deepEqual(T.inspectTemplate(tech(''), lib, { ...gym, careful: true }).byDay.A[0].blocks.map((b: any) => b.technique), ['', '']);
  const orig = JSON.parse(tech('DROPSET')); const origStr = JSON.stringify(orig); T.inspectTemplate(JSON.stringify(orig), lib, { ...gym, careful: true }); assert.equal(JSON.stringify(orig), origStr);

  // ═════ 5) busca nas pastas do coach ═════
  const tables = { cols: [{ id: 'c1', coachId: 'P', name: 'DESAFIO 21 DIAS' }, { id: 'c2', coachId: 'P', name: 'Ficha 8 semanas' }, { id: 'c3', coachId: 'P', name: 'Outros' }, { id: 'c4', coachId: 'A', name: 'desafio 21' }, { id: 'c5', coachId: 'Z', name: 'Desafio 21 dias' }, { id: 'c6', coachId: 'E', name: 'Desafio 21 dias' }],
    tpls: [{ id: 't1', collectionId: 'c1', name: 'P-desafio' }, { id: 't2', collectionId: 'c2', name: 'P-ficha' }, { id: 't3', collectionId: 'c3', name: 'P-outros' }, { id: 't4', collectionId: 'c4', name: 'A-desafio' }, { id: 't5', collectionId: 'c5', name: 'Z-desafio' }] };
  const fakeDb = { templateCollection: { findMany: async ({ where }: any) => tables.cols.filter((c) => c.coachId === where.coachId) }, workoutTemplate: { findMany: async ({ where }: any) => tables.tpls.filter((x) => where.collectionId.in.includes(x.collectionId)) } };
  assert.deepEqual((await T.loadTemplates(fakeDb, ['P'], 'CHALLENGE_21')).map((x: any) => x.id), ['t1'], 'só a pasta do desafio'); assert.deepEqual((await T.loadTemplates(fakeDb, ['P'], 'FICHA_8S')).map((x: any) => x.id), ['t2']);
  assert.deepEqual((await T.loadTemplates(fakeDb, ['A', 'P'], 'CHALLENGE_21')).map((x: any) => x.id), ['t4'], 'o primeiro coach que tem modelos vale (não mistura)'); assert.deepEqual((await T.loadTemplates(fakeDb, ['A', 'P'], 'FICHA_8S')).map((x: any) => x.id), ['t2'], 'sem modelo do 1º coach, usa o seguinte');
  assert.deepEqual((await T.loadTemplates(fakeDb, ['E', 'P'], 'CHALLENGE_21')).map((x: any) => x.id), ['t1'], 'pasta do 1º coach sem nenhum modelo: segue para o próximo coach');
  assert.deepEqual((await T.loadTemplates(fakeDb, ['P', 'P', '', 'A'], 'CHALLENGE_21')).map((x: any) => x.id), ['t1']); assert.deepEqual(await T.loadTemplates(fakeDb, ['Q'], 'CHALLENGE_21'), []); assert.deepEqual(await T.loadTemplates(fakeDb, [], 'CHALLENGE_21'), []);
  assert.deepEqual((await T.loadTemplates({ ...fakeDb, templateCollection: { findMany: async () => [{ id: 'c9', name: 'Desafio 21 dias' }] }, workoutTemplate: { findMany: async () => [] } }, ['P'], 'CHALLENGE_21')), [], 'pasta vazia = sem modelos');
  console.log('OK  treinos prontos: marcas no nome, nota, ordem, conferência do conteúdo (biblioteca, ambiente, articulação, modo seguro) e busca nas pastas do coach');
})().catch((e) => { console.log('FALHOU', e && e.stack ? e.stack.split('\n').slice(0, 6).join('\n') : e); process.exit(1); });
